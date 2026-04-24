import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { FiX, FiBell } from 'react-icons/fi';
import io from 'socket.io-client';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:5000';

const resolveAssetUrl = (url) => {
  if (!url) return '';
  if (url.startsWith('http')) return url;
  return `${API_BASE}${url.startsWith('/') ? '' : '/'}${url}`;
};

const formatTime = (timestamp) => {
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now - date;

  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return date.toLocaleDateString();
};

const buildPostMessage = (notification) => {
  if (notification.type === 'like') return 'liked your post';
  if (notification.type === 'comment') return 'commented on your post';
  if (notification.type === 'share') return 'shared your post';
  return 'sent a notification';
};

const normalizePostNotifications = (items = []) => (
  items.map((notification) => ({
    _id: notification._id,
    source: 'post',
    type: notification.type,
    read: Boolean(notification.read),
    createdAt: notification.createdAt,
    message: buildPostMessage(notification),
    actorName: notification.actor?.username || 'Someone',
    actorId: notification.actor?._id || null,
    actorAvatar: resolveAssetUrl(notification.actor?.profile?.avatar || notification.actor?.avatar || ''),
    comment: notification.comment || ''
  }))
);

const extractPostNotifications = (payload) => {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.notifications)) return payload.notifications;
  return [];
};

const normalizeProfileNotifications = (items = []) => (
  items.map((notification) => {
    const actorName = notification.from?.username || 'System';
    let message = notification.message || 'New account notification';
    const requestState = notification.requestState || (notification.type === 'request' ? 'pending' : null);
    const read = notification.type === 'request' && requestState !== 'pending'
      ? true
      : Boolean(notification.read);

    if (actorName && message.startsWith(`${actorName} `)) {
      message = message.slice(actorName.length + 1);
    }

    return {
      _id: notification._id,
      source: 'profile',
      type: notification.type,
      read,
      createdAt: notification.createdAt,
      message,
      actorName,
      actorId: notification.from?._id || null,
      actorAvatar: resolveAssetUrl(notification.from?.avatar || ''),
      comment: '',
      requestState
    };
  })
);

const NotificationPanel = ({ onOpenProfile, onAcceptRequest, onRejectRequest }) => {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showPanel, setShowPanel] = useState(false);
  const [actionLoadingKey, setActionLoadingKey] = useState('');
  const [requestActionOverrides, setRequestActionOverrides] = useState({});
  const token = localStorage.getItem('token');

  const refreshNotifications = useCallback(async () => {
    if (!token) {
      setNotifications([]);
      setUnreadCount(0);
      return;
    }

    const headers = { Authorization: `Bearer ${token}` };
    const [postResult, profileResult] = await Promise.allSettled([
      axios.get('/api/notifications', { headers }),
      axios.get('/api/profile/notifications', { headers })
    ]);

    const postNotifications = postResult.status === 'fulfilled'
      ? normalizePostNotifications(extractPostNotifications(postResult.value.data))
      : [];

    const profileNotifications = profileResult.status === 'fulfilled' && Array.isArray(profileResult.value.data?.notifications)
      ? normalizeProfileNotifications(profileResult.value.data.notifications)
      : [];

    const merged = [...postNotifications, ...profileNotifications]
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    setNotifications(merged);
    setUnreadCount(merged.filter((item) => !item.read).length);
  }, [token]);

  useEffect(() => {
    if (!token) return undefined;

    refreshNotifications();
    const pollInterval = setInterval(refreshNotifications, 15000);

    // Keep post notifications near real-time; refresh feed for consistency.
    const socket = io(API_BASE);
    socket.on('new-notification', () => {
      refreshNotifications();
    });

    return () => {
      clearInterval(pollInterval);
      socket.disconnect();
    };
  }, [token, refreshNotifications]);

  const handleMarkAsRead = async (notification) => {
    if (!token || notification.read) return;

    const headers = { Authorization: `Bearer ${token}` };
    const endpoint = notification.source === 'profile'
      ? `/api/profile/notifications/${notification._id}/read`
      : `/api/notifications/${notification._id}/read`;

    try {
      await axios.patch(endpoint, {}, { headers });
      setNotifications((prev) => prev.map((item) => (
        item._id === notification._id && item.source === notification.source
          ? { ...item, read: true }
          : item
      )));
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch (error) {
      console.error('Failed to mark notification as read:', error);
    }
  };

  const handleDeleteNotification = async (notification) => {
    if (!token) return;

    const headers = { Authorization: `Bearer ${token}` };
    const endpoint = notification.source === 'profile'
      ? `/api/profile/notifications/${notification._id}`
      : `/api/notifications/${notification._id}`;

    try {
      await axios.delete(endpoint, { headers });
      setNotifications((prev) => prev.filter((item) => !(
        item._id === notification._id && item.source === notification.source
      )));
      if (!notification.read) {
        setUnreadCount((prev) => Math.max(0, prev - 1));
      }
    } catch (error) {
      console.error('Failed to delete notification:', error);
    }
  };

  const handleOpenActorProfile = (notification) => {
    if (!notification?.actorId || typeof onOpenProfile !== 'function') return;

    onOpenProfile({
      _id: notification.actorId,
      username: notification.actorName,
      profile: {
        avatar: notification.actorAvatar || ''
      }
    });
    setShowPanel(false);
  };

  const handleConnectionRequestDecision = async (notification, decision) => {
    if (!token || !notification?.actorId) return;

    const actionKey = `${decision}:${notification._id}`;
    setActionLoadingKey(actionKey);
    const nextState = decision === 'accept' ? 'connected' : 'cleared';

    // Optimistically switch request controls immediately so users don't keep seeing Accept/Reject.
    setNotifications((prev) => prev.map((item) => {
      const isSameNotification = item._id === notification._id && item.source === notification.source;
      if (!isSameNotification) return item;

      return {
        ...item,
        requestState: nextState,
        read: true
      };
    }));
    setRequestActionOverrides((prev) => ({
      ...prev,
      [String(notification.actorId)]: nextState
    }));

    try {
      const headers = { Authorization: `Bearer ${token}` };
      if (decision === 'accept') {
        if (typeof onAcceptRequest === 'function') {
          await onAcceptRequest(notification.actorId);
        } else {
          await axios.post(`/api/profile/requests/${notification.actorId}/accept`, {}, { headers });
        }
      } else {
        if (typeof onRejectRequest === 'function') {
          await onRejectRequest(notification.actorId);
        } else {
          await axios.post(`/api/profile/requests/${notification.actorId}/reject`, {}, { headers });
        }
      }

      await refreshNotifications();
    } catch (error) {
      console.error(`Failed to ${decision} connection request:`, error);
      setRequestActionOverrides((prev) => {
        const next = { ...prev };
        delete next[String(notification.actorId)];
        return next;
      });
      await refreshNotifications();
    } finally {
      setActionLoadingKey('');
    }
  };

  const handleConnectBack = async (notification) => {
    if (!token || !notification?.actorId) return;

    // If already connected, treat this as a quick profile-open action.
    if ((notification.requestState || '').toLowerCase() === 'connected') {
      handleOpenActorProfile(notification);
      return;
    }

    const actionKey = `connect:${notification._id}`;
    setActionLoadingKey(actionKey);

    try {
      await axios.post(
        `/api/profile/${notification.actorId}/request-connection`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      await refreshNotifications();
    } catch (error) {
      console.error('Failed to send connection request from notification:', error);
      await refreshNotifications();
    } finally {
      setActionLoadingKey('');
    }
  };

  const getFallbackAvatar = (name = 'U') => {
    const initial = (name || 'U').charAt(0).toUpperCase();
    return `https://via.placeholder.com/40/7d4cff/ffffff?text=${encodeURIComponent(initial)}`;
  };

  return (
    <div className="notification-wrapper">
      <button
        className={`notification-bell ${unreadCount > 0 ? 'notification-unread' : ''}`}
        onClick={() => setShowPanel(!showPanel)}
        title="Notifications"
      >
        <FiBell size={20} />
        {unreadCount > 0 && <span className="notification-badge">{unreadCount}</span>}
      </button>

      {showPanel && (
        <div className="notification-panel">
          <div className="notification-header">
            <h3>Notifications</h3>
            <button
              className="notification-close"
              onClick={() => setShowPanel(false)}
            >
              <FiX size={20} />
            </button>
          </div>

          <div className="notification-list">
            {notifications.length === 0 ? (
              <p className="notification-empty">No notifications yet</p>
            ) : (
              notifications.map((notification) => {
                const isProfileRequest = notification.source === 'profile' && notification.type === 'request' && Boolean(notification.actorId);
                const actorId = notification.actorId ? String(notification.actorId) : '';
                const backendRequestState = notification.requestState || (isProfileRequest ? 'pending' : null);
                const requestState = actorId && requestActionOverrides[actorId]
                  ? requestActionOverrides[actorId]
                  : backendRequestState;
                const isPendingRequest = isProfileRequest && requestState === 'pending';
                const isConnectedRequest = isProfileRequest && requestState === 'connected';
                const canConnectBack = isProfileRequest && requestState === 'cleared';
                const isActionBusy = actionLoadingKey.endsWith(`:${notification._id}`);

                return (
                  <div
                    key={`${notification.source}-${notification._id}`}
                    className={`notification-item ${!notification.read ? 'notification-item-unread' : ''}`}
                  >
                    <img
                      src={notification.actorAvatar || getFallbackAvatar(notification.actorName)}
                      alt={notification.actorName}
                      className="notification-avatar"
                    />
                    <div className="notification-content">
                      {notification.actorId && (
                        <button
                          type="button"
                          className="notification-actor-link"
                          onClick={() => handleOpenActorProfile(notification)}
                          title={`Open ${notification.actorName}'s profile`}
                        >
                          {notification.actorName}
                        </button>
                      )}
                      <p className="notification-message">{notification.message}</p>
                      {notification.type === 'comment' && notification.comment ? (
                        <p className="notification-comment-preview">
                          "{notification.comment.substring(0, 80)}{notification.comment.length > 80 ? '...' : ''}"
                        </p>
                      ) : null}
                      <span className="notification-time">
                        {formatTime(notification.createdAt)}
                      </span>
                    </div>
                    <div className="notification-actions">
                      {isPendingRequest ? (
                        <>
                          <button
                            className="notification-action-btn notification-action-accept"
                            onClick={() => handleConnectionRequestDecision(notification, 'accept')}
                            disabled={isActionBusy}
                            title="Accept request"
                          >
                            {actionLoadingKey === `accept:${notification._id}` ? '...' : 'Accept'}
                          </button>
                          <button
                            className="notification-action-btn notification-action-reject"
                            onClick={() => handleConnectionRequestDecision(notification, 'reject')}
                            disabled={isActionBusy}
                            title="Reject request"
                          >
                            {actionLoadingKey === `reject:${notification._id}` ? '...' : 'Reject'}
                          </button>
                        </>
                      ) : isConnectedRequest ? (
                        <span className="notification-state-pill notification-state-connected">Connected</span>
                      ) : canConnectBack ? (
                        <button
                          className="notification-action-btn notification-action-connect"
                          onClick={() => handleConnectBack(notification)}
                          disabled={isActionBusy}
                          title="Send connection request"
                        >
                          {actionLoadingKey === `connect:${notification._id}` ? '...' : 'Connect back'}
                        </button>
                      ) : (
                        <>
                          {!notification.read && (
                            <button
                              className="notification-action-btn"
                              onClick={() => handleMarkAsRead(notification)}
                              title="Mark as read"
                            >
                              Read
                            </button>
                          )}
                          <button
                            className="notification-action-btn"
                            onClick={() => handleDeleteNotification(notification)}
                            title="Delete"
                          >
                            Del
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationPanel;

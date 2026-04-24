import React, { useCallback, useEffect, useRef, useState } from 'react';
import io from 'socket.io-client';
import axios from 'axios';
import {
  decryptMessagePayload,
  encryptMessageForUsers,
  ensureE2EEIdentity,
  getRecipientPublicKey,
  getUserIdFromToken
} from '../utils/e2ee';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:5000';
const socket = io(API_BASE);

const buildThreadId = (userId) => `thread-${userId}`;

const toIsoTimestamp = (value) => {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) {
    return new Date().toISOString();
  }
  return date.toISOString();
};

const formatConversationTime = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Now';
  }

  const now = new Date();
  const isSameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  if (isSameDay) {
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }

  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

const formatDateLabel = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Today';
  }

  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  const isToday =
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate();
  if (isToday) return 'Today';

  const isYesterday =
    date.getFullYear() === yesterday.getFullYear() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getDate() === yesterday.getDate();
  if (isYesterday) return 'Yesterday';

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
};

const formatMessageTime = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
};

// Add connection debugging
socket.on('connect', () => {
  console.log('Socket connected:', socket.id);
});

socket.on('disconnect', () => {
  console.log('Socket disconnected');
});

const ChatView = ({ thread, messages, onBack, onClose, onSend }) => {
  const [input, setInput] = useState('');
  const textareaRef = useRef(null);
  const msgAreaRef = useRef(null);

  useEffect(() => {
    if (msgAreaRef.current) {
      msgAreaRef.current.scrollTop = msgAreaRef.current.scrollHeight;
    }
  }, [messages]);

  const handleInput = (e) => {
    setInput(e.target.value);
    const ta = textareaRef.current;
    if (ta) {
      ta.style.height = 'auto';
      ta.style.height = Math.min(ta.scrollHeight, 80) + 'px';
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  const submit = () => {
    if (!input.trim()) return;
    onSend(input.trim());
    setInput('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
  };

  const groups = [];
  messages.forEach((message) => {
    const label = formatDateLabel(message.timestamp || message.time);
    if (!groups.length || groups[groups.length - 1].label !== label) {
      groups.push({ label, msgs: [] });
    }
    groups[groups.length - 1].msgs.push(message);
  });

  return (
    <div className="mp-chat-view">
      <div className="mp-chat-topbar">
        <button className="mp-back-btn" onClick={onBack} aria-label="Back">&#8592;</button>
        <div className={`mp-avatar ${thread.avatarClass}`} style={{ width: 36, height: 36, fontSize: 12 }}>
          {thread.initials}
        </div>
        <div className="mp-topbar-info">
          <p className="mp-topbar-name">{thread.name}</p>
          <p className="mp-topbar-role">{thread.role}</p>
        </div>
        <div className="mp-topbar-actions">
          <button title="More options" className="mp-icon-btn">&#8230;</button>
          <button title="Close" className="mp-icon-btn" onClick={onClose}>&#10005;</button>
        </div>
      </div>

      <div className="mp-messages" ref={msgAreaRef}>
        {groups.map((group) => (
          <div key={group.label}>
            <div className="mp-date-sep"><span>{group.label}</span></div>
            {group.msgs.map((message, index) => (
              <div key={message._id || index} className={`mp-msg ${message.fromSelf ? 'self' : 'other'}`}>
                {!message.fromSelf && (
                  <div className={`mp-avatar mp-msg-avatar ${thread.avatarClass}`}>
                    {thread.initials}
                  </div>
                )}
                <div className="mp-msg-col">
                  <div className="mp-bubble">{message.text}</div>
                  <span className="mp-msg-time">{formatMessageTime(message.timestamp || message.time)}</span>
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>

      <div className="mp-input-area">
        <textarea
          ref={textareaRef}
          rows={1}
          value={input}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          placeholder="Write a message..."
          className="mp-textarea"
        />
        <button
          className="mp-send-btn"
          onClick={submit}
          disabled={!input.trim()}
          aria-label="Send"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            width="16"
            height="16"
          >
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </button>
      </div>
    </div>
  );
};

const ChatItem = ({ chat, selected, onClick, showDot, lastMessage }) => (
  <button className={`mp-chat-item ${selected ? 'active' : ''}`} onClick={onClick}>
    <div className={`mp-avatar ${chat.avatarClass}`}>{chat.initials}</div>
    <div className="mp-chat-info">
      <div className="mp-chat-name-row">
        <span className="mp-chat-name">{chat.name}</span>
        <span className="mp-chat-time">{chat.time}</span>
      </div>
      <p className="mp-chat-role">{chat.role}</p>
      <p className="mp-chat-preview">{lastMessage}</p>
    </div>
    {showDot && <span className="mp-unread-dot" />}
  </button>
);

const MessagePanel = ({ onClose, activeChatUser }) => {
  const [threads, setThreads] = useState([]);
  const [localMessages, setLocalMessages] = useState({});
  const [currentChatId, setCurrentChatId] = useState(null);
  const [search, setSearch] = useState('');
  const [currentUserId, setCurrentUserId] = useState(null);
  const [publicKeyBase64, setPublicKeyBase64] = useState('');
  const [privateKeyBase64, setPrivateKeyBase64] = useState('');
  const [encryptionReady, setEncryptionReady] = useState(false);
  const [encryptionError, setEncryptionError] = useState('');

  const fetchConversations = useCallback(async (authToken = localStorage.getItem('token')) => {
    if (!authToken) return;

    try {
      const res = await axios.get(`${API_BASE}/api/chat`, {
        headers: { Authorization: `Bearer ${authToken}` }
      });

      setThreads((prev) => {
        const previousByUserId = new Map(
          prev
            .filter((thread) => thread.userId)
            .map((thread) => [String(thread.userId), thread])
        );

        const fetchedThreads = (res.data || []).map((conv) => {
          const userId = String(conv._id);
          const existing = previousByUserId.get(userId);
          const name = conv.username || existing?.name || 'User';

          return {
            id: buildThreadId(userId),
            userId,
            name,
            role: existing?.role || 'Connection',
            initials: (name || 'U').substring(0, 2).toUpperCase(),
            avatarClass: existing?.avatarClass || 'mp-avatar-blue',
            status: conv.unreadCount > 0 ? 'unseen' : 'seen',
            lastMessage: conv.lastMessage || existing?.lastMessage || 'No messages yet',
            time: formatConversationTime(conv.lastMessageTime),
            messages: existing?.messages || []
          };
        });

        const fetchedIds = new Set(fetchedThreads.map((thread) => thread.id));
        const unsyncedLocalThreads = prev.filter((thread) => !fetchedIds.has(thread.id));

        return [...fetchedThreads, ...unsyncedLocalThreads];
      });

      setLocalMessages((prev) => {
        const next = { ...prev };
        (res.data || []).forEach((conv) => {
          const threadId = buildThreadId(String(conv._id));
          if (!next[threadId]) {
            next[threadId] = [];
          }
        });
        return next;
      });
    } catch (error) {
      console.error('Failed to fetch conversations:', error);
    }
  }, []);

  const decryptTextIfNeeded = useCallback(async (messagePayload) => {
    const encrypted = Boolean(
      messagePayload?.encryptedMsg
      && messagePayload?.encryptedAesKey
      && messagePayload?.iv
    );

    if (!encrypted) {
      return messagePayload?.message || '';
    }

    if (!privateKeyBase64) {
      return '[Encrypted message]';
    }

    try {
      return await decryptMessagePayload({
        encryptedMsg: messagePayload.encryptedMsg,
        encryptedAesKey: messagePayload.encryptedAesKey,
        iv: messagePayload.iv,
        privateKey: privateKeyBase64
      });
    } catch (error) {
      return '[Unable to decrypt message]';
    }
  }, [privateKeyBase64]);

  const markMessagesAsRead = useCallback(async (userId) => {
    const token = localStorage.getItem('token');
    if (!token || !userId) return;

    try {
      await axios.patch(
        `${API_BASE}/api/chat/read`,
        { userId },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setThreads((prev) =>
        prev.map((thread) =>
          String(thread.userId) === String(userId)
            ? { ...thread, status: 'seen' }
            : thread
        )
      );
    } catch (error) {
      console.error('Failed to mark messages as read:', error);
    }
  }, []);

  const fetchMessages = useCallback(async (threadId, userId) => {
    const token = localStorage.getItem('token');
    if (!token || !threadId || !userId) return;

    try {
      let myUserId = currentUserId;
      if (!myUserId) {
        const payload = JSON.parse(atob(token.split('.')[1]));
        myUserId = payload.id;
      }

      const res = await axios.get(`${API_BASE}/api/chat/${userId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      const formattedMessages = await Promise.all(
        (res.data || []).map(async (msg) => {
          const senderId = String(msg?.from?._id || msg?.from || '');
          const timestamp = toIsoTimestamp(msg.timestamp);
          const decryptedText = await decryptTextIfNeeded(msg);

          return {
            _id: String(msg._id),
            fromSelf: senderId === String(myUserId),
            text: decryptedText,
            timestamp
          };
        })
      );

      formattedMessages.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

      setLocalMessages((prev) => {
        const existing = prev[threadId] || [];
        const mergedById = new Map();

        [...existing, ...formattedMessages].forEach((message) => {
          const key = message._id || `${message.fromSelf}-${message.timestamp}-${message.text}`;
          mergedById.set(key, { ...message, _id: key });
        });

        const merged = Array.from(mergedById.values()).sort(
          (a, b) => new Date(toIsoTimestamp(a.timestamp || a.time)) - new Date(toIsoTimestamp(b.timestamp || b.time))
        );

        return {
          ...prev,
          [threadId]: merged
        };
      });
    } catch (error) {
      console.error('Failed to fetch message history:', error);
    }
  }, [currentUserId, decryptTextIfNeeded]);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) return;

    let cancelled = false;

    const initializeSecureChat = async () => {
      try {
        const userId = getUserIdFromToken(token);
        if (!userId) {
          throw new Error('Failed to decode user identity from token.');
        }

        if (!cancelled) {
          setCurrentUserId(userId);
        }

        const identity = await ensureE2EEIdentity({
          token,
          apiBase: API_BASE
        });

        if (cancelled) return;

        setPublicKeyBase64(identity.publicKeyBase64);
        setPrivateKeyBase64(identity.privateKeyBase64);
        setEncryptionReady(true);
        setEncryptionError('');
        fetchConversations(token);
      } catch (error) {
        console.error('Failed to initialize secure chat:', error);
        if (!cancelled) {
          setEncryptionReady(false);
          setEncryptionError('Secure messaging could not be initialized.');
          fetchConversations(token);
        }
      }
    };

    initializeSecureChat();

    return () => {
      cancelled = true;
    };
  }, [fetchConversations]);

  useEffect(() => {
    if (currentUserId) {
      socket.emit('join-conversation', currentUserId);
    }

    const handleReceiveMessage = (data) => {
      if (!data?.from) return;

      const senderId = String(data.from);
      if (senderId === String(currentUserId)) {
        return;
      }

      (async () => {
        const threadId = buildThreadId(senderId);
        const timestamp = toIsoTimestamp(data.timestamp);
        const messageId = data._id ? String(data._id) : `${senderId}-${timestamp}`;
        const messageText = await decryptTextIfNeeded(data);

        setLocalMessages((prev) => {
          const existingMessages = prev[threadId] || [];
          if (existingMessages.some((message) => message._id === messageId)) {
            return prev;
          }

          return {
            ...prev,
            [threadId]: [...existingMessages, {
              _id: messageId,
              fromSelf: false,
              text: messageText,
              timestamp
            }].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
          };
        });

        setThreads((prev) => {
          const existingThread = prev.find((thread) => thread.id === threadId);
          const status = currentChatId === threadId ? 'seen' : 'unseen';

          const updatedThread = {
            id: threadId,
            userId: senderId,
            name: existingThread?.name || 'User',
            role: existingThread?.role || 'Connection',
            initials: (existingThread?.name || 'U').substring(0, 2).toUpperCase(),
            avatarClass: existingThread?.avatarClass || 'mp-avatar-blue',
            status,
            lastMessage: messageText || existingThread?.lastMessage || 'Encrypted message',
            time: formatConversationTime(timestamp),
            messages: existingThread?.messages || []
          };

          return [updatedThread, ...prev.filter((thread) => thread.id !== threadId)];
        });

        if (currentChatId === threadId) {
          markMessagesAsRead(senderId);
        } else {
          fetchConversations();
        }
      })();
    };

    const handleMessageSent = (data) => {
      console.log('Message sent confirmation:', data);
    };

    const handleMessageError = (error) => {
      console.error('Message error:', error);
    };

    socket.on('receive-message', handleReceiveMessage);
    socket.on('message-sent', handleMessageSent);
    socket.on('message-error', handleMessageError);

    return () => {
      socket.off('receive-message', handleReceiveMessage);
      socket.off('message-sent', handleMessageSent);
      socket.off('message-error', handleMessageError);
    };
  }, [currentUserId, currentChatId, decryptTextIfNeeded, fetchConversations, markMessagesAsRead]);

  useEffect(() => {
    if (!activeChatUser) return;

    const rawUserId = activeChatUser._id || activeChatUser.id;
    if (!rawUserId) return;

    const userId = String(rawUserId);
    const username = activeChatUser.username || activeChatUser.name || 'User';
    const threadId = buildThreadId(userId);

    setThreads((prev) => {
      const existing = prev.find((thread) => thread.id === threadId);

      if (existing) {
        const refreshedThread = {
          ...existing,
          name: existing.name || username,
          role: existing.role || activeChatUser.profile?.jobTitle || 'Connection',
          initials: (existing.name || username).substring(0, 2).toUpperCase()
        };

        return [refreshedThread, ...prev.filter((thread) => thread.id !== threadId)];
      }

      const newThread = {
        id: threadId,
        userId,
        name: username,
        role: activeChatUser.profile?.jobTitle || 'Connection',
        initials: username.substring(0, 2).toUpperCase(),
        avatarClass: 'mp-avatar-blue',
        status: 'seen',
        lastMessage: 'Start a new conversation',
        time: 'Now',
        messages: []
      };

      return [newThread, ...prev];
    });

    setLocalMessages((prev) => {
      if (prev[threadId]) return prev;
      return { ...prev, [threadId]: [] };
    });

    setCurrentChatId(threadId);
    fetchMessages(threadId, userId);
  }, [activeChatUser, fetchMessages]);

  const openChat = (threadId) => {
    setCurrentChatId(threadId);
    setThreads((prev) =>
      prev.map((thread) =>
        thread.id === threadId ? { ...thread, status: 'seen' } : thread
      )
    );

    const thread = threads.find((item) => item.id === threadId);
    if (thread?.userId) {
      fetchMessages(threadId, thread.userId);
      markMessagesAsRead(thread.userId);
    }
  };

  const goBack = () => setCurrentChatId(null);

  const closePanel = () => {
    setCurrentChatId(null);
    onClose?.();
  };

  const sendMessage = async (text) => {
    const trimmedText = text.trim();
    if (!trimmedText || !currentChatId || !currentUserId) {
      return;
    }

    const thread = threads.find((item) => item.id === currentChatId);
    if (!thread?.userId) {
      return;
    }

    try {
      const token = localStorage.getItem('token');
      if (!token) return;

      if (!encryptionReady || !publicKeyBase64 || !privateKeyBase64) {
        alert('Secure messaging is still initializing. Please try again in a moment.');
        return;
      }

      const recipientPublicKey = await getRecipientPublicKey({
        token,
        apiBase: API_BASE,
        recipientId: thread.userId
      });

      const encryptedPayload = await encryptMessageForUsers({
        message: trimmedText,
        recipientPublicKey,
        senderPublicKey: publicKeyBase64
      });

      const response = await axios.post(
        `${API_BASE}/api/chat/send`,
        {
          to: thread.userId,
          encryptedMsg: encryptedPayload.encryptedMsg,
          encryptedAesKeyForRecipient: encryptedPayload.encryptedAesKeyForRecipient,
          encryptedAesKeyForSender: encryptedPayload.encryptedAesKeyForSender,
          iv: encryptedPayload.iv,
          e2eeVersion: encryptedPayload.e2eeVersion
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      const timestamp = toIsoTimestamp(response.data.timestamp);
      const newMessage = {
        _id: String(response.data._id),
        fromSelf: true,
        text: trimmedText,
        timestamp
      };

      setLocalMessages((prev) => ({
        ...prev,
        [currentChatId]: [...(prev[currentChatId] || []), newMessage].sort(
          (a, b) => new Date(a.timestamp) - new Date(b.timestamp)
        )
      }));

      setThreads((prev) => {
        const existing = prev.find((item) => item.id === currentChatId);
        if (!existing) return prev;

        const updated = {
          ...existing,
          lastMessage: trimmedText,
          time: formatConversationTime(timestamp),
          status: 'seen'
        };

        return [updated, ...prev.filter((item) => item.id !== currentChatId)];
      });

      socket.emit('send-message', {
        _id: response.data._id,
        from: currentUserId,
        to: thread.userId,
        encryptedMsg: encryptedPayload.encryptedMsg,
        encryptedAesKey: encryptedPayload.encryptedAesKeyForRecipient,
        iv: encryptedPayload.iv,
        e2eeVersion: encryptedPayload.e2eeVersion,
        timestamp: response.data.timestamp
      });

      fetchConversations(token);
    } catch (error) {
      console.error('Failed to send message:', error);
      const message = error.response?.data?.msg || error.message || 'Failed to send message';
      alert(message);
    }
  };

  const filter = (list) =>
    list.filter((thread) => {
      const name = thread.name || '';
      const lastMessage = thread.lastMessage || '';
      const query = search.toLowerCase();
      return name.toLowerCase().includes(query) || lastMessage.toLowerCase().includes(query);
    });

  const unread = threads.filter((thread) => thread.status === 'unseen');
  const recent = threads.filter((thread) => thread.status !== 'unseen');
  const currentThread = threads.find((thread) => thread.id === currentChatId);

  return (
    <>
      <div className="mp-panel open" role="dialog" aria-label="Messages">
        {encryptionError && (
          <div className="mp-encryption-alert">{encryptionError}</div>
        )}
        {currentThread ? (
          <ChatView
            thread={currentThread}
            messages={localMessages[currentThread.id] || []}
            onBack={goBack}
            onClose={closePanel}
            onSend={sendMessage}
          />
        ) : (
          <>
            <div className="mp-header">
              <div className="mp-header-left">
                <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18" style={{ color: '#0a66c2' }}>
                  <path d="M20 2H4C2.9 2 2 2.9 2 4v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z" />
                </svg>
                <div>
                  <p className="mp-title">Messages</p>
                  <p className="mp-subtitle">{threads.length} conversations</p>
                </div>
              </div>
              <button className="mp-close-btn" onClick={closePanel} aria-label="Close">&#10005;</button>
            </div>

            <div className="mp-search">
              <div className="mp-search-wrap">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  width="14"
                  height="14"
                  style={{ color: '#666', flexShrink: 0 }}
                >
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input
                  type="search"
                  placeholder="Search conversations..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  aria-label="Search messages"
                />
              </div>
            </div>

            <div className="mp-body">
              {filter(unread).length > 0 && (
                <>
                  <p className="mp-group-label">Unread</p>
                  {filter(unread).map((chat) => (
                    <ChatItem
                      key={chat.id}
                      chat={chat}
                      selected={false}
                      onClick={() => openChat(chat.id)}
                      showDot
                      lastMessage={(localMessages[chat.id] || []).slice(-1)[0]?.text || chat.lastMessage}
                    />
                  ))}
                </>
              )}
              {filter(recent).length > 0 && (
                <>
                  <p className="mp-group-label">Recent</p>
                  {filter(recent).map((chat) => (
                    <ChatItem
                      key={chat.id}
                      chat={chat}
                      selected={false}
                      onClick={() => openChat(chat.id)}
                      lastMessage={(localMessages[chat.id] || []).slice(-1)[0]?.text || chat.lastMessage}
                    />
                  ))}
                </>
              )}
            </div>

            <div className="mp-footer">
              <button className="mp-new-btn">+ New message</button>
            </div>
          </>
        )}
      </div>

      <div className="mp-backdrop" onClick={closePanel} />
    </>
  );
};

export default MessagePanel;

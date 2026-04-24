import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { resolveImageUrl } from '../utils/imageUrl';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:5000';
const DEFAULT_BANNER_PATH = '/images/default_banner.jpg';

const normalizeList = (items = []) => (
  Array.isArray(items)
    ? items.map((item) => String(item || '').trim()).filter(Boolean)
    : []
);

const UserProfileView = ({ user, onOpenChat }) => {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [privateView, setPrivateView] = useState(false);
  const [connectStatus, setConnectStatus] = useState('');
  const [requestPending, setRequestPending] = useState(false);

  useEffect(() => {
    const fetchProfile = async () => {
      setLoading(true);
      setError('');
      setPrivateView(false);
      setRequestPending(false);
      setConnectStatus('');

      try {
        const token = localStorage.getItem('token');
        const res = await axios.get(`${API_BASE}/api/profile/${user._id || user.id}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const fetchedProfile = res.data.profile || {};
        setProfile({
          ...fetchedProfile,
          isFriend: typeof res.data.isFriend === 'boolean' ? res.data.isFriend : !!fetchedProfile.isFriend,
          isOwner: typeof res.data.isOwner === 'boolean' ? res.data.isOwner : !!fetchedProfile.isOwner
        });
        setRequestPending(!!fetchedProfile.connectionRequested);
      } catch (fetchError) {
        if (fetchError.response?.status === 403) {
          setPrivateView(true);
          setRequestPending(!!fetchError.response?.data?.connectionRequested);
        } else {
          setError('Unable to load profile.');
        }
      } finally {
        setLoading(false);
      }
    };

    if (user) {
      fetchProfile();
    }
  }, [user]);

  const sendConnectionRequest = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        setConnectStatus('Sign in to send a connection request.');
        return;
      }

      const res = await axios.post(
        `${API_BASE}/api/profile/${user._id || user.id}/request-connection`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setConnectStatus(res.data.msg || 'Connection request sent.');
      setRequestPending(true);
    } catch (error) {
      const msg = error.response?.data?.msg || 'Unable to send request.';
      setConnectStatus(msg);
      if (msg.toLowerCase().includes('pending')) {
        setRequestPending(true);
      } else if (msg.toLowerCase().includes('already connected')) {
        setRequestPending(false);
        setProfile((prev) => (prev ? { ...prev, isFriend: true } : prev));
      }
    }
  };

  if (!user) {
    return (
      <main className="page-content profile-page">
        <div className="profile-loading">Select a profile to view.</div>
      </main>
    );
  }

  if (loading) {
    return (
      <main className="page-content profile-page">
        <div className="profile-loading">Loading profile...</div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="page-content profile-page">
        <div className="profile-loading">{error}</div>
      </main>
    );
  }

  const fallbackName = user.username || user.name || 'Unknown user';

  if (privateView) {
    return (
      <main className="page-content profile-page">
        <section className="profile-hero-card profile-hero-upgraded">
          <div
            className="profile-hero-banner banner-placeholder"
            style={{ backgroundImage: `url(${DEFAULT_BANNER_PATH})` }}
          />
          <div className="profile-hero-body">
            <div className="profile-avatar-large">
              <div className="avatar-placeholder">{fallbackName.charAt(0).toUpperCase()}</div>
            </div>
            <div className="profile-hero-info">
              <div className="profile-top-row">
                <div>
                  <h1>{fallbackName}</h1>
                  <p className="profile-headline-text">This profile is private.</p>
                  <p className="profile-location-text">Connect to unlock full details and activity.</p>
                </div>
              </div>
              <div className="hero-action-group">
                <button type="button" className="hero-action-btn" onClick={sendConnectionRequest} disabled={requestPending}>
                  {requestPending ? 'Request sent' : 'Connect'}
                </button>
                <button type="button" className="hero-action-btn" onClick={() => onOpenChat?.(user)}>
                  Message
                </button>
              </div>
              {connectStatus ? <p className="profile-note">{connectStatus}</p> : null}
            </div>
          </div>
        </section>
      </main>
    );
  }

  const isFriend = profile.isFriend;
  const isOwner = profile.isOwner;
  const privacyMode = profile.privacySettings?.profile || 'public';
  const postsPrivacy = profile.privacySettings?.posts || 'public';
  const messagePrivacy = profile.privacySettings?.messagePrivacy || 'friends';
  const showFullDetails = privacyMode === 'public' || isFriend || isOwner;
  const acceptsConnectionRequests = profile.privacySettings?.allowConnectionRequests !== false;
  const acceptsMessages = profile.privacySettings?.allowMessages !== false;
  const showConnectButton = !isOwner && !isFriend && !requestPending && acceptsConnectionRequests;
  const data = profile.profile || {};
  const avatarUrl = resolveImageUrl(data.avatar || '');
  const bannerUrl = resolveImageUrl(data.banner || DEFAULT_BANNER_PATH);
  const headline = data.jobTitle || 'Profile headline not shared';
  const location = data.location || 'Location not shared';
  const summary = data.bio || 'Bio is not available.';
  const experience = data.experience || 'Experience details are not shared yet.';
  const education = data.education || 'Education details are not shared yet.';
  const skills = normalizeList(data.skills);
  const interests = normalizeList(data.interests);
  const badges = normalizeList(data.badges);

  const followers = Number(profile.followers || profile.friendsCount || 0);
  const postsCount = Number(profile.postsCount || 0);
  const connections = isFriend ? '1st' : requestPending ? 'Pending' : '2nd+';

  const privacyPills = [
    `Profile: ${privacyMode}`,
    `Posts: ${postsPrivacy}`,
    `Messages: ${messagePrivacy}`
  ];

  return (
    <main className="page-content profile-page">
      <section className="profile-hero-card profile-hero-upgraded">
        <div
          className={`profile-hero-banner ${!data.banner ? 'banner-placeholder' : ''}`}
          style={{ backgroundImage: `url(${bannerUrl})` }}
        />

        <div className="profile-hero-body">
          <div className="profile-avatar-large">
            {data.avatar ? (
              <img src={avatarUrl} alt="Profile avatar" />
            ) : (
              <div className="avatar-placeholder">{fallbackName.charAt(0).toUpperCase()}</div>
            )}
          </div>

          <div className="profile-hero-info">
            <div className="profile-top-row">
              <div>
                <h1>{fallbackName}</h1>
                <p className="profile-headline-text">{headline}</p>
                <p className="profile-location-text">{location}</p>
              </div>

              {!isOwner ? (
                <div className="hero-action-group">
                  {showConnectButton ? (
                    <button type="button" className="hero-action-btn" onClick={sendConnectionRequest} disabled={requestPending}>
                      {requestPending ? 'Request sent' : 'Connect'}
                    </button>
                  ) : isFriend ? (
                    <span className="hero-connected-tag">Connected</span>
                  ) : !acceptsConnectionRequests ? (
                    <span className="hero-connected-tag">Connections disabled</span>
                  ) : requestPending ? (
                    <span className="hero-connected-tag">Request pending</span>
                  ) : null}

                  <button
                    type="button"
                    className="hero-action-btn"
                    onClick={() => onOpenChat?.(user)}
                    disabled={!acceptsMessages}
                    title={!acceptsMessages ? 'This member is not accepting messages' : 'Message'}
                  >
                    {acceptsMessages ? 'Message' : 'Messages off'}
                  </button>
                </div>
              ) : (
                <div className="hero-action-group">
                  <span className="hero-connected-tag">This is you</span>
                </div>
              )}
            </div>

            <div className="profile-meta-strip">
              <div className="profile-meta-item">
                <span>Followers</span>
                <strong>{followers.toLocaleString()}</strong>
              </div>
              <div className="profile-meta-item">
                <span>Posts</span>
                <strong>{postsCount.toLocaleString()}</strong>
              </div>
              <div className="profile-meta-item">
                <span>Connection</span>
                <strong>{connections}</strong>
              </div>
            </div>

            <div className="profile-summary-section">
              {showFullDetails ? (
                <p className="profile-summary">{summary}</p>
              ) : (
                <p className="profile-summary">This profile is visible to connections only. Send a request to view more details.</p>
              )}
              {connectStatus ? <p className="profile-note">{connectStatus}</p> : null}
            </div>
          </div>
        </div>
      </section>

      <div className="profile-layout-grid profile-layout-viewer">
        <section className="profile-main-column">
          {showFullDetails ? (
            <section className="profile-section-grid">
              <article className="profile-section-card">
                <div className="profile-section-header">
                  <h2>About</h2>
                </div>
                <p>{summary}</p>
              </article>

              <article className="profile-section-card">
                <div className="profile-section-header">
                  <h2>Experience</h2>
                </div>
                <p>{experience}</p>
              </article>

              <article className="profile-section-card">
                <div className="profile-section-header">
                  <h2>Education</h2>
                </div>
                <p>{education}</p>
              </article>

              <article className="profile-section-card">
                <div className="profile-section-header">
                  <h2>Skills</h2>
                  <span>{skills.length}</span>
                </div>
                {skills.length > 0 ? (
                  <div className="badge-list">
                    {skills.map((skill, idx) => (
                      <span className="badge" key={idx}>{skill}</span>
                    ))}
                  </div>
                ) : (
                  <p>No skills have been shared yet.</p>
                )}
              </article>

              <article className="profile-section-card">
                <div className="profile-section-header">
                  <h2>Interests</h2>
                  <span>{interests.length}</span>
                </div>
                {interests.length > 0 ? (
                  <div className="badge-list">
                    {interests.map((interest, idx) => (
                      <span className="badge" key={idx}>{interest}</span>
                    ))}
                  </div>
                ) : (
                  <p>No interests have been shared yet.</p>
                )}
              </article>

              <article className="profile-section-card">
                <div className="profile-section-header">
                  <h2>Highlights</h2>
                  <span>{badges.length}</span>
                </div>
                {badges.length > 0 ? (
                  <div className="badge-list">
                    {badges.map((badge, idx) => (
                      <span className="badge" key={idx}>{badge}</span>
                    ))}
                  </div>
                ) : (
                  <p>No highlights or certifications listed yet.</p>
                )}
              </article>
            </section>
          ) : (
            <article className="profile-section-card">
              <div className="profile-section-header">
                <h2>Details locked</h2>
              </div>
              <p>This member shares full profile details with connections only.</p>
              {!isOwner && acceptsConnectionRequests ? (
                <button
                  type="button"
                  className="hero-action-btn"
                  onClick={sendConnectionRequest}
                  disabled={requestPending}
                >
                  {requestPending ? 'Request sent' : 'Connect to unlock'}
                </button>
              ) : null}
            </article>
          )}
        </section>

        <aside className="profile-side-column">
          <article className="profile-side-card">
            <h3>Connection and messaging</h3>
            <p className="profile-side-note">
              {isOwner
                ? 'You are viewing your own profile.'
                : isFriend
                  ? 'You are connected with this member.'
                  : requestPending
                    ? 'Your connection request is pending.'
                    : 'You are not connected yet.'}
            </p>
            {!isOwner ? (
              <div className="profile-side-actions">
                {showConnectButton ? (
                  <button type="button" className="hero-action-btn" onClick={sendConnectionRequest}>
                    Connect
                  </button>
                ) : null}
                <button
                  type="button"
                  className="hero-action-btn"
                  onClick={() => onOpenChat?.(user)}
                  disabled={!acceptsMessages}
                >
                  {acceptsMessages ? 'Message' : 'Messages off'}
                </button>
              </div>
            ) : null}
          </article>

          <article className="profile-side-card">
            <h3>Privacy snapshot</h3>
            <div className="profile-privacy-summary">
              {privacyPills.map((item) => (
                <span key={item} className="privacy-pill">{item}</span>
              ))}
            </div>
            <p className="profile-side-note">
              Visibility and messaging controls are set by this member's privacy preferences.
            </p>
          </article>
        </aside>
      </div>
    </main>
  );
};

export default UserProfileView;

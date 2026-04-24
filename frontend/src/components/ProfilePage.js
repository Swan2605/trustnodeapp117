import React, { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import EditProfile from './EditProfile';
import PostFeed from './PostFeed';
import { resolveImageUrl } from '../utils/imageUrl';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:5000';
const DEFAULT_BANNER_PATH = '/images/default_banner.jpg';

const normalizeList = (items = []) => (
  Array.isArray(items)
    ? items.map((item) => String(item || '').trim()).filter(Boolean)
    : []
);

const ProfilePage = ({ profile, onProfileUpdate, onOpenPrivacy, onViewProfile = () => {} }) => {
  const [showEdit, setShowEdit] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadTarget, setUploadTarget] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [suggestionsStatus, setSuggestionsStatus] = useState('');
  const [connectingSuggestionId, setConnectingSuggestionId] = useState('');
  const avatarInputRef = useRef(null);
  const bannerInputRef = useRef(null);

  const fetchSuggestions = async () => {
    const token = localStorage.getItem('token');
    if (!token) {
      setSuggestions([]);
      setSuggestionsStatus('Sign in to see suggested connections.');
      return;
    }

    try {
      setLoadingSuggestions(true);
      setSuggestionsStatus('');
      const res = await axios.get('/api/profile/suggestions?limit=5', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const list = Array.isArray(res.data?.suggestions) ? res.data.suggestions : [];
      setSuggestions(list);
      setSuggestionsStatus(list.length ? '' : 'No new matching members right now.');
    } catch (error) {
      setSuggestions([]);
      setSuggestionsStatus('Unable to load suggestions at the moment.');
    } finally {
      setLoadingSuggestions(false);
    }
  };

  useEffect(() => {
    fetchSuggestions();
  }, [profile?._id]);

  const uploadFile = async (file) => {
    const data = new FormData();
    data.append('file', file);
    try {
      const res = await axios.post('/api/upload/profile', data, {
        headers: {
          'Content-Type': 'multipart/form-data',
          Authorization: `Bearer ${localStorage.getItem('token')}`
        }
      });
      return res.data.url;
    } catch (error) {
      const message = error.response?.data?.msg || error.message;
      console.error('Image upload failed:', message);
      throw new Error(message);
    }
  };

  const updateProfileField = async (field, value) => {
    try {
      setUploading(true);
      const res = await axios.patch(
        '/api/profile',
        { [field]: value },
        { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }
      );
      onProfileUpdate(res.data.profile);
    } catch (error) {
      const message = error.response?.data?.msg || error.message;
      console.error('Profile update failed:', message);
      alert(`Unable to save profile image: ${message}`);
    } finally {
      setUploading(false);
    }
  };

  const handleFileSelect = async (event, field) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploadTarget(field);
    try {
      const fileUrl = await uploadFile(file);
      await updateProfileField(field, fileUrl);
    } catch (error) {
      alert(error.message || 'Image upload failed. Please try a JPEG/PNG image under 5MB.');
    } finally {
      setUploadTarget('');
      event.target.value = '';
    }
  };

  const triggerAvatarInput = () => avatarInputRef.current?.click();
  const triggerBannerInput = () => bannerInputRef.current?.click();

  const handleConnectSuggestion = async (memberId) => {
    const token = localStorage.getItem('token');
    if (!token || !memberId) return;

    try {
      setConnectingSuggestionId(memberId);
      await axios.post(
        `/api/profile/${memberId}/request-connection`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setSuggestions((prev) => prev.map((member) => (
        member._id === memberId
          ? { ...member, requestPending: true }
          : member
      )));
    } catch (error) {
      const message = String(error.response?.data?.msg || '').toLowerCase();
      if (message.includes('already connected')) {
        setSuggestions((prev) => prev.filter((member) => member._id !== memberId));
      } else if (message.includes('pending')) {
        setSuggestions((prev) => prev.map((member) => (
          member._id === memberId
            ? { ...member, requestPending: true }
            : member
        )));
      }
    } finally {
      setConnectingSuggestionId('');
    }
  };

  const data = profile?.profile || {};
  const avatarUrl = resolveImageUrl(data.avatar || '');
  const bannerUrl = resolveImageUrl(data.banner || DEFAULT_BANNER_PATH);
  const hasAvatar = Boolean(data.avatar && !String(data.avatar).includes('default-avatar'));
  const hasBanner = Boolean(data.banner);
  const headline = data.jobTitle || 'Add your job title here';
  const location = data.location || 'Add your location and timezone';
  const summary = data.bio || 'Add a short summary about your professional background, strengths, and goals.';
  const qualification = data.qualification || 'Add your top qualification and focus area';
  const experience = data.experience || 'Share more about your recent roles and impact.';
  const education = data.education || 'Add your education details.';
  const skills = normalizeList(data.skills);
  const interests = normalizeList(data.interests);
  const badges = normalizeList(data.badges);
  const followers = profile?.followers ?? (profile?.friends?.length ?? 0);
  const connections = profile?.friends?.length ?? followers;
  const analytics = {
    profileViews: data.profileViews || 0,
    postImpressions: data.postImpressions || 0,
    searchAppearances: data.searchAppearances || 0,
    followers,
    postsCount: profile?.postsCount || data.postsCount || 0
  };
  const privacy = profile?.privacySettings || {
    profile: 'public',
    posts: 'public',
    messagePrivacy: 'friends',
    searchEngineVisibility: true,
    activityStatus: true,
    allowMessages: true,
    allowConnectionRequests: true,
    allowTagging: 'friends',
    dataSharing: false
  };

  const completionChecklist = useMemo(() => ([
    {
      id: 'avatar',
      label: 'Profile photo',
      done: hasAvatar,
      action: 'Upload a clear headshot'
    },
    {
      id: 'headline',
      label: 'Professional headline',
      done: Boolean(String(data.jobTitle || '').trim()),
      action: 'Add your role and specialty'
    },
    {
      id: 'about',
      label: 'About summary',
      done: String(data.bio || '').trim().length >= 60,
      action: 'Write a 3-4 line professional summary'
    },
    {
      id: 'experience',
      label: 'Experience section',
      done: Boolean(String(data.experience || '').trim()),
      action: 'Highlight outcomes from recent roles'
    },
    {
      id: 'education',
      label: 'Education section',
      done: Boolean(String(data.education || '').trim()),
      action: 'Add your degree and institution'
    },
    {
      id: 'skills',
      label: 'Skills listed',
      done: skills.length >= 3,
      action: 'Add at least 3 discoverable skills'
    },
    {
      id: 'location',
      label: 'Location',
      done: Boolean(String(data.location || '').trim()),
      action: 'Add city or region'
    },
    {
      id: 'banner',
      label: 'Banner image',
      done: hasBanner,
      action: 'Add a banner for profile branding'
    }
  ]), [
    hasAvatar,
    hasBanner,
    data.jobTitle,
    data.bio,
    data.experience,
    data.education,
    data.location,
    skills.length
  ]);

  const completedItems = completionChecklist.filter((item) => item.done).length;
  const profileStrength = Math.round((completedItems / completionChecklist.length) * 100);
  const profileTier = profileStrength >= 85
    ? 'All-star'
    : profileStrength >= 65
      ? 'Strong'
      : profileStrength >= 40
        ? 'Rising'
        : 'Starter';

  const completionSuggestions = completionChecklist
    .filter((item) => !item.done)
    .slice(0, 3)
    .map((item) => item.action);

  const visibilityPills = [
    { label: `Profile: ${privacy.profile}` },
    { label: `Posts: ${privacy.posts}` },
    { label: `Messages: ${privacy.messagePrivacy || (privacy.allowMessages ? 'friends' : 'private')}` },
    {
      label: privacy.searchEngineVisibility
        ? 'Search indexing on'
        : 'Search indexing off'
    }
  ];

  const handleProfilePostCreated = () => {
    if (!profile || typeof onProfileUpdate !== 'function') return;
    const currentPostsCount = Number(profile.postsCount ?? profile.profile?.postsCount ?? 0);
    const nextPostsCount = currentPostsCount + 1;
    onProfileUpdate({
      ...profile,
      postsCount: nextPostsCount,
      profile: {
        ...(profile.profile || {}),
        postsCount: nextPostsCount
      }
    });
  };

  const handleProfilePostDeleted = () => {
    if (!profile || typeof onProfileUpdate !== 'function') return;
    const currentPostsCount = Number(profile.postsCount ?? profile.profile?.postsCount ?? 0);
    const nextPostsCount = Math.max(0, currentPostsCount - 1);
    onProfileUpdate({
      ...profile,
      postsCount: nextPostsCount,
      profile: {
        ...(profile.profile || {}),
        postsCount: nextPostsCount
      }
    });
  };

  if (!profile) {
    return (
      <main className="page-content profile-page">
        <div className="profile-loading">Loading your profile...</div>
      </main>
    );
  }

  return (
    <main className="page-content profile-page">
      {showEdit && (
        <EditProfile
          profile={profile}
          onClose={() => setShowEdit(false)}
          onUpdate={onProfileUpdate}
        />
      )}

      <div className="profile-layout-grid">
        <section className="profile-main-column">
          <section className="profile-hero-card profile-hero-upgraded">
            <div
              className={`profile-hero-banner ${!hasBanner ? 'banner-placeholder' : ''}`}
              style={{ backgroundImage: `url(${bannerUrl})` }}
            >
              <button
                type="button"
                className="hero-edit-icon"
                onClick={triggerBannerInput}
                title="Change banner"
                disabled={uploading}
              >
                <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                  <path d="M20 7h-2.2l-1.72-2.15A1 1 0 0 0 15.3 4H8.7a1 1 0 0 0-.78.35L6.2 7H4a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1Zm-8 12a5 5 0 1 1 0-10 5 5 0 0 1 0 10Z" fill="currentColor" />
                </svg>
              </button>
              <input
                ref={bannerInputRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={(event) => handleFileSelect(event, 'banner')}
              />
            </div>

            <div className="profile-hero-body">
              <div className="profile-avatar-large">
                {hasAvatar ? (
                  <img src={avatarUrl} alt="Profile avatar" />
                ) : (
                  <div className="avatar-placeholder">{profile.username?.charAt(0).toUpperCase() || 'U'}</div>
                )}
                <button
                  type="button"
                  className="avatar-edit-icon"
                  onClick={triggerAvatarInput}
                  title="Change photo"
                  disabled={uploading}
                >
                  <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                    <path d="M20 7h-2.2l-1.72-2.15A1 1 0 0 0 15.3 4H8.7a1 1 0 0 0-.78.35L6.2 7H4a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1Zm-8 12a5 5 0 1 1 0-10 5 5 0 0 1 0 10Z" fill="currentColor" />
                  </svg>
                </button>
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={(event) => handleFileSelect(event, 'avatar')}
                />
              </div>

              <div className="profile-hero-info">
                <div className="profile-top-row">
                  <div>
                    <h1>{profile.username || 'Your Name'}</h1>
                    <p className="profile-headline-text">{headline}</p>
                    <p className="profile-location-text">{location}</p>
                  </div>
                  <div className="hero-action-group">
                    <button
                      type="button"
                      className="hero-privacy-btn"
                      onClick={onOpenPrivacy}
                    >
                      Privacy settings
                    </button>
                    <button
                      type="button"
                      className="hero-edit-btn"
                      onClick={() => setShowEdit(true)}
                    >
                      Edit profile
                    </button>
                  </div>
                </div>

                <div className="profile-meta-strip">
                  <div className="profile-meta-item">
                    <span>Connections</span>
                    <strong>{Number(connections).toLocaleString()}</strong>
                  </div>
                  <div className="profile-meta-item">
                    <span>Followers</span>
                    <strong>{Number(followers).toLocaleString()}</strong>
                  </div>
                  <div className="profile-meta-item">
                    <span>Posts</span>
                    <strong>{Number(analytics.postsCount).toLocaleString()}</strong>
                  </div>
                  <div className="profile-meta-item">
                    <span>Profile strength</span>
                    <strong>{profileStrength}%</strong>
                  </div>
                </div>

                <div className="profile-summary-section">
                  <p className="profile-summary">{summary}</p>
                  <p className="qualification-text">{qualification}</p>
                  {uploading ? (
                    <p className="profile-note">
                      Uploading {uploadTarget === 'banner' ? 'banner' : 'photo'}...
                    </p>
                  ) : null}
                  <div className="profile-badges">
                    {badges.length > 0 ? (
                      badges.map((badge, index) => (
                        <span className="badge" key={index}>{badge}</span>
                      ))
                    ) : (
                      <span className="badge badge-placeholder">Add certifications or badges to increase trust.</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="profile-insights-grid profile-insights-grid-upgraded">
            <article className="insight-card">
              <h3>Profile analytics</h3>
              <div className="analytics-row">
                <div>
                  <strong>{Number(analytics.profileViews).toLocaleString()}</strong>
                  <span>profile views</span>
                </div>
                <div>
                  <strong>{Number(analytics.postImpressions).toLocaleString()}</strong>
                  <span>post impressions</span>
                </div>
                <div>
                  <strong>{Number(analytics.searchAppearances).toLocaleString()}</strong>
                  <span>search appearances</span>
                </div>
              </div>
              <p className="insight-note">Keep posting and refining your summary to boost discoverability.</p>
            </article>

            <article className="insight-card">
              <h3>Growth snapshot</h3>
              <div className="activity-row">
                <div>
                  <strong>{Number(analytics.followers).toLocaleString()}</strong>
                  <span>followers</span>
                </div>
                <div>
                  <strong>{Number(analytics.postsCount).toLocaleString()}</strong>
                  <span>posts published</span>
                </div>
              </div>
              <p className="insight-note">
                {profileStrength >= 70
                  ? 'Your profile is in strong shape. Keep your skills and experience updated.'
                  : 'Complete a few more profile sections to unlock stronger profile visibility.'}
              </p>
            </article>
          </section>

          <section className="profile-section-grid">
            <article className="profile-section-card">
              <div className="profile-section-header">
                <h2>About</h2>
                <span>{summary.length} chars</span>
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
                <p>Add your top skills so recruiters and peers can find you faster.</p>
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
                <p>Add a few professional interests to improve your suggestion matches.</p>
              )}
            </article>
          </section>

          <section className="profile-posts-showcase">
            <div className="profile-section-header">
              <h2>Posts</h2>
              <span>{Number(analytics.postsCount).toLocaleString()} created</span>
            </div>
            <p className="profile-side-note">
              Create updates and review your recent posts directly from your profile.
            </p>
            <PostFeed
              profile={profile}
              feedMode="profile"
              onPostCreated={handleProfilePostCreated}
              onPostDeleted={handleProfilePostDeleted}
              onViewProfile={onViewProfile}
            />
          </section>
        </section>

        <aside className="profile-side-column">
          <article className="profile-side-card profile-strength-card">
            <div className="profile-section-header">
              <h2>Profile strength</h2>
              <span>{profileTier}</span>
            </div>
            <div className="profile-strength-track" role="progressbar" aria-valuenow={profileStrength} aria-valuemin="0" aria-valuemax="100">
              <div className="profile-strength-fill" style={{ width: `${profileStrength}%` }} />
            </div>
            <p className="profile-side-note">
              {completedItems} of {completionChecklist.length} key sections complete.
            </p>
            <ul className="profile-checklist">
              {completionChecklist.map((item) => (
                <li key={item.id} className={item.done ? 'done' : ''}>
                  <span>{item.label}</span>
                  <strong>{item.done ? 'Done' : 'Pending'}</strong>
                </li>
              ))}
            </ul>
            {completionSuggestions.length > 0 ? (
              <p className="profile-side-note">Next best update: {completionSuggestions[0]}.</p>
            ) : null}
          </article>

          <article className="profile-side-card">
            <div className="profile-side-header">
              <h3>People you may know</h3>
              <button type="button" className="inline-link-btn" onClick={fetchSuggestions}>
                Refresh
              </button>
            </div>

            {loadingSuggestions ? (
              <p className="profile-side-note">Loading suggestions...</p>
            ) : suggestions.length > 0 ? (
              <div className="profile-suggestion-list">
                {suggestions.map((member) => {
                  const memberAvatar = resolveImageUrl(member.avatar || '');
                  const memberInitial = (member.username || 'U').charAt(0).toUpperCase();
                  const pending = Boolean(member.requestPending);
                  const isConnecting = connectingSuggestionId === member._id;
                  return (
                    <div className="profile-suggestion-item" key={member._id}>
                      <div className="profile-suggestion-avatar">
                        {memberAvatar ? (
                          <img src={memberAvatar} alt={member.username} />
                        ) : (
                          <span>{memberInitial}</span>
                        )}
                      </div>
                      <div className="profile-suggestion-copy">
                        <strong>{member.username}</strong>
                        <p>{member.jobTitle || 'Security member'}</p>
                        {member.sharedInterests?.length ? (
                          <small>Shared: {member.sharedInterests.slice(0, 2).join(', ')}</small>
                        ) : (
                          <small>Suggested from your activity</small>
                        )}
                      </div>
                      <button
                        type="button"
                        className="profile-suggestion-btn"
                        onClick={() => handleConnectSuggestion(member._id)}
                        disabled={pending || isConnecting}
                      >
                        {pending ? 'Requested' : isConnecting ? 'Sending...' : 'Connect'}
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="profile-side-note">{suggestionsStatus || 'No suggestions available right now.'}</p>
            )}
          </article>

          <article className="profile-side-card">
            <h3>Privacy snapshot</h3>
            <div className="profile-privacy-summary">
              {visibilityPills.map((item) => (
                <span key={item.label} className="privacy-pill">
                  {item.label}
                </span>
              ))}
            </div>
            <p className="profile-side-note">
              Keep profile and post visibility aligned with your networking goals.
            </p>
            <button
              type="button"
              className="hero-privacy-btn full-width-btn"
              onClick={onOpenPrivacy}
            >
              Review privacy controls
            </button>
          </article>
        </aside>
      </div>
    </main>
  );
};

export default ProfilePage;

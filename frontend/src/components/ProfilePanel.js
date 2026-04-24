import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { resolveImageUrl } from '../utils/imageUrl';

const ProfilePanel = ({ profile: initialProfile, onProfileUpdate }) => {
  const [profile, setProfile] = useState(initialProfile || null);
  const [loading, setLoading] = useState(!initialProfile);
  const [postAnalytics, setPostAnalytics] = useState({
    posts: 0,
    comments: 0,
    shares: 0,
    impressions: 0
  });
  const [loadingAnalytics, setLoadingAnalytics] = useState(false);

  useEffect(() => {
    if (initialProfile) {
      setProfile(initialProfile);
      setLoading(false);
      return;
    }

    const token = localStorage.getItem('token');
    if (!token) {
      setLoading(false);
      return;
    }

    const fetchProfile = async () => {
      try {
        const res = await axios.get('/api/profile', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        setProfile(res.data.profile);
        if (onProfileUpdate) onProfileUpdate(res.data.profile);
      } catch (error) {
        console.error('Fetch profile failed:', error);
        if (error.response?.status === 401) {
          localStorage.removeItem('token');
        }
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, [initialProfile, onProfileUpdate]);

  useEffect(() => {
    const token = localStorage.getItem('token');
    const currentUserId = profile?._id ? String(profile._id) : '';
    const profileData = profile?.profile || {};

    const fallbackPosts = Number(profile?.postsCount ?? profileData.postsCount ?? 0);
    const fallbackImpressions = Number(profileData.postImpressions || 0);

    if (!token || !currentUserId) {
      setPostAnalytics((prev) => ({
        ...prev,
        posts: fallbackPosts,
        impressions: fallbackImpressions
      }));
      return;
    }

    let cancelled = false;

    const fetchPostAnalytics = async () => {
      try {
        setLoadingAnalytics(true);
        const res = await axios.get('/api/posts', {
          headers: { Authorization: `Bearer ${token}` }
        });

        const allPosts = Array.isArray(res.data) ? res.data : [];
        const userPosts = allPosts.filter((post) => String(post?.user?._id || '') === currentUserId);

        const totalComments = userPosts.reduce((sum, post) => (
          sum + (Array.isArray(post.comments) ? post.comments.length : 0)
        ), 0);
        const totalShares = userPosts.reduce((sum, post) => (
          sum + (Array.isArray(post.shares) ? post.shares.length : 0)
        ), 0);
        const totalViews = userPosts.reduce((sum, post) => (
          sum + Number(post.views || 0)
        ), 0);

        if (cancelled) return;

        setPostAnalytics({
          posts: userPosts.length || fallbackPosts,
          comments: totalComments,
          shares: totalShares,
          impressions: Math.max(totalViews, fallbackImpressions)
        });
      } catch (error) {
        if (cancelled) return;
        setPostAnalytics((prev) => ({
          ...prev,
          posts: fallbackPosts,
          impressions: fallbackImpressions
        }));
      } finally {
        if (!cancelled) {
          setLoadingAnalytics(false);
        }
      }
    };

    fetchPostAnalytics();

    return () => {
      cancelled = true;
    };
  }, [profile]);

  if (loading) return <div className="profile-panel">Loading profile...</div>;

  const profileData = profile?.profile || {};
  const followerCount = profile?.followers ?? profile?.friends?.length ?? 0;
  const headline = profileData.jobTitle || profileData.qualification || '';
  const location = profileData.location || '';
  const profileInitial = (profile?.username || 'S').charAt(0).toUpperCase();
  const avatarUrl = profileData.avatar ? resolveImageUrl(profileData.avatar) : '';

  return (
    <div className="profile-panel">
      <article className="profile-mini-card">
        <div className="profile-mini-avatar">
          {avatarUrl ? (
            <img 
              src={avatarUrl} 
              alt={profile?.username || 'User'} 
              style={{ width: '100%', height: '100%', borderRadius: 'inherit' }}
            />
          ) : (
            <span className="profile-mini-avatar-fallback">{profileInitial}</span>
          )}
        </div>
        <div className="profile-mini-content">
          <h3>{profile?.username || 'User'}</h3>
          {headline ? <p className="profile-mini-headline">{headline}</p> : null}
          {location ? <p className="profile-mini-location">{location}</p> : null}
        </div>
        <div className="profile-mini-stats">
          <div className="profile-mini-stat-row">
            <span>Followers</span>
            <strong>{followerCount.toLocaleString()}</strong>
          </div>
        </div>
      </article>

      <article className="post-analytics-mini-card">
        <div className="post-analytics-mini-header">
          <h4>Post analytics</h4>
          <span>Home snapshot</span>
        </div>

        {loadingAnalytics ? (
          <p className="post-analytics-loading">Loading analytics...</p>
        ) : (
          <div className="post-analytics-mini-grid">
            <div className="post-analytics-mini-row">
              <span>Posts created</span>
              <strong>{Number(postAnalytics.posts || 0).toLocaleString()}</strong>
            </div>
            <div className="post-analytics-mini-row">
              <span>Comments</span>
              <strong>{Number(postAnalytics.comments || 0).toLocaleString()}</strong>
            </div>
            <div className="post-analytics-mini-row">
              <span>Shares</span>
              <strong>{Number(postAnalytics.shares || 0).toLocaleString()}</strong>
            </div>
            <div className="post-analytics-mini-row">
              <span>Impressions</span>
              <strong>{Number(postAnalytics.impressions || 0).toLocaleString()}</strong>
            </div>
          </div>
        )}
      </article>
    </div>
  );
};

export default ProfilePanel;

import React, { useEffect, useState } from 'react';
import axios from 'axios';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:5000';

const resolveImageUrl = (url) => {
  if (!url) return '';
  if (url.startsWith('http')) return url;
  return `${API_BASE}${url.startsWith('/') ? '' : '/'}${url}`;
};

const formatJoinedLabel = (joinedAt) => {
  if (!joinedAt) return 'Recently joined Trust Node';
  const now = Date.now();
  const joined = new Date(joinedAt).getTime();
  if (Number.isNaN(joined)) return 'Recently joined Trust Node';

  const diffDays = Math.floor((now - joined) / (1000 * 60 * 60 * 24));
  if (diffDays <= 0) return 'Joined today';
  if (diffDays === 1) return 'Joined 1 day ago';
  if (diffDays < 30) return `Joined ${diffDays} days ago`;
  return `Joined on ${new Date(joinedAt).toLocaleDateString()}`;
};

const footerLinks = [
  { label: 'About' },
  { label: 'Accessibility' },
  { label: 'Help Center' },
  { label: 'Privacy & Terms', caret: true },
  { label: 'Safety Center' },
  { label: 'Advertising' },
  { label: 'Business Services', caret: true },
  { label: 'Get the Trust Node app' },
  { label: 'More' }
];

const TrendingTopics = () => {
  const [joinedMembers, setJoinedMembers] = useState([]);
  const [loadingMembers, setLoadingMembers] = useState(true);
  const [memberStatus, setMemberStatus] = useState('');
  const [connectingId, setConnectingId] = useState('');

  const trustNodePicks = [
    { title: 'CTF Practice Arena', description: 'Solve short attack-defense labs for app and API security.' },
    { title: 'IR Playbooks', description: 'Ready-to-run response templates for phishing and auth abuse.' },
    { title: 'Weekly Threat Digest', description: 'Top CVEs, exploit trends, and hardening actions.' }
  ];

  const year = new Date().getFullYear();

  const fetchSuggestions = async () => {
    const token = localStorage.getItem('token');
    if (!token) {
      setJoinedMembers([]);
      setMemberStatus('Sign in to see member suggestions.');
      setLoadingMembers(false);
      return;
    }

    try {
      setLoadingMembers(true);
      const res = await axios.get(`${API_BASE}/api/profile/suggestions?limit=8`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      const suggestions = res.data?.suggestions || [];
      setJoinedMembers(suggestions);
      setMemberStatus(suggestions.length ? '' : 'No new matching members yet.');
    } catch (error) {
      setJoinedMembers([]);
      setMemberStatus('Unable to load suggestions right now.');
    } finally {
      setLoadingMembers(false);
    }
  };

  useEffect(() => {
    fetchSuggestions();
  }, []);

  const handleConnect = async (memberId) => {
    const token = localStorage.getItem('token');
    if (!token || !memberId) return;

    try {
      setConnectingId(memberId);
      await axios.post(
        `${API_BASE}/api/profile/${memberId}/request-connection`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setJoinedMembers((prev) => prev.map((member) => (
        member._id === memberId
          ? { ...member, requestPending: true }
          : member
      )));
    } catch (error) {
      const message = error.response?.data?.msg || '';

      if (message.toLowerCase().includes('already connected')) {
        setJoinedMembers((prev) => prev.filter((member) => member._id !== memberId));
      } else if (message.toLowerCase().includes('pending')) {
        setJoinedMembers((prev) => prev.map((member) => (
          member._id === memberId
            ? { ...member, requestPending: true }
            : member
        )));
      }
    } finally {
      setConnectingId('');
    }
  };

  return (
    <>
      <section className="trending-panel compact-panel">
        <div className="trending-header compact-header">
          <div>
            <h3>Trust Node Community</h3>
            <p>Suggestions from shared skills and interests</p>
          </div>
          <button type="button" className="trending-refresh-btn" onClick={fetchSuggestions}>Refresh</button>
        </div>

        {loadingMembers && <div className="member-empty">Loading suggestions...</div>}

        {!loadingMembers && joinedMembers.length > 0 && (
          <div className="member-scroll" role="list" aria-label="Suggested members">
            {joinedMembers.map((member) => (
              <article key={member._id} className="member-card" role="listitem">
                <div className="member-card-head">
                  <div className="member-avatar large">
                    {member.avatar ? (
                      <img src={resolveImageUrl(member.avatar)} alt={member.username} />
                    ) : (
                      <span>{(member.username || 'U').charAt(0).toUpperCase()}</span>
                    )}
                  </div>
                  <div className="member-content">
                    <h4>{member.username}</h4>
                    <p>
                      {member.jobTitle || 'Security member'}
                      {member.location ? ` - ${member.location}` : ''}
                    </p>
                  </div>
                </div>
                <span className="member-match">
                  {member.sharedInterests?.length
                    ? `Shared: ${member.sharedInterests.join(', ')}`
                    : formatJoinedLabel(member.joinedAt)}
                </span>
                <button
                  type="button"
                  className="member-connect-btn full"
                  onClick={() => handleConnect(member._id)}
                  disabled={member.requestPending || connectingId === member._id}
                >
                  {member.requestPending
                    ? 'Requested'
                    : connectingId === member._id
                      ? 'Sending...'
                      : 'Connect'}
                </button>
              </article>
            ))}
          </div>
        )}

        {!loadingMembers && !joinedMembers.length && (
          <div className="member-empty">{memberStatus}</div>
        )}
      </section>

      <section className="trending-panel compact-panel">
        <div className="trending-header compact-header">
          <h3>Trust Node Picks</h3>
          <p>For your workflow</p>
        </div>
        {trustNodePicks.map((item) => (
          <div key={item.title} className="trending-item compact-item">
            <h4>{item.title}</h4>
            <p>{item.description}</p>
          </div>
        ))}
      </section>

      <footer className="trending-meta-footer compact-meta">
        <div className="trending-meta-links">
          {footerLinks.map((link) => (
            <span className="trending-meta-link" key={link.label}>
              {link.label}
              {link.caret ? <span className="trending-meta-caret">v</span> : null}
            </span>
          ))}
        </div>
        <div className="trending-meta-brand">
          <strong>Trust Node</strong>
          <span>Trust Node Platform &copy; {year}</span>
        </div>
      </footer>
    </>
  );
};

export default TrendingTopics;

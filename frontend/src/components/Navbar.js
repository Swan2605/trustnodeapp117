import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { resolveImageUrl } from '../utils/imageUrl';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:5000';

const Navbar = ({
  activeTab = 'home',
  onTabChange = () => {},
  onSignIn = () => {},
  onJoinNow = () => {},
  onToggleMessages = () => {},
  onViewProfile = () => {},
  messageUnreadCount = 0,
  isLoggedIn = false,
  profileName = 'User',
  profileAvatar = '',
  profileHeadline = '',
  profileLocation = '',
  onLogout = () => {}
}) => {
  const navItems = [
    { id: 'home', label: 'Home' }
  ];
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchStatus, setSearchStatus] = useState('');
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const searchWrapperRef = useRef(null);

  const searchWrapperRef = useRef(null);
  const profileWrapperRef = useRef(null);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      setSearchStatus('');
      setShowSearchDropdown(false);
      return;
    }

    const delay = setTimeout(async () => {
      const token = localStorage.getItem('token');
      if (!token) {
        setSearchResults([]);
        setSearchStatus('Sign in to search');
        setShowSearchDropdown(true);
        return;
      }

      setSearchStatus('Searching…');
      try {
        const res = await axios.get(`${API_BASE}/api/profile/search?q=${encodeURIComponent(searchQuery)}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const results = res.data.results || [];
        setSearchResults(results.slice(0, 8));
        setSearchStatus(results.length ? '' : 'No matching results');
        setShowSearchDropdown(true);
      } catch (error) {
        setSearchResults([]);
        setSearchStatus('Unable to load results');
        setShowSearchDropdown(true);
      }
    }, 300);

    return () => clearTimeout(delay);
  }, [searchQuery]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (searchWrapperRef.current && !searchWrapperRef.current.contains(event.target)) {
        setShowSearchDropdown(false);
      }
      if (profileWrapperRef.current && !profileWrapperRef.current.contains(event.target)) {
        setShowProfileMenu(false);
      }
    };

    window.addEventListener('mousedown', handleClickOutside);
    return () => window.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleResultClick = (result) => {
    onViewProfile(result);
    setShowSearchDropdown(false);
    setSearchQuery('');
  };

  const goToTab = (tab) => {
    onTabChange(tab);
    setShowProfileMenu(false);
  };

  const handleSignOut = () => {
    setShowProfileMenu(false);
    onLogout();
  };

  const profileInitial = (profileName || 'S').trim().charAt(0).toUpperCase() || 'S';
  const profileAvatarUrl = profileAvatar ? resolveImageUrl(profileAvatar) : '';

  useEffect(() => {
    setProfileAvatarFailed(false);
  }, [profileAvatarUrl]);

  return (
    <nav className="navbar">
      <div className="nav-left">
        <div className="nav-logo">
          <img src="/images/trustnode-symbol.png" alt="Trust node logo" />
        </div>
        <div className="nav-brand">
          <img src="/images/trustnode-name.png" alt="Trust node" className="brand-image" />
        </div>
      </div>

      <div className="nav-center">
        {navItems.map((item) => (
          <button
            key={item.id}
            className={`nav-link ${activeTab === item.id ? 'active' : ''}`}
            onClick={() => onTabChange(item.id)}
          >
            {item.label}
          </button>
        ))}
        <div className="nav-search-wrapper" ref={searchWrapperRef}>
          <span className="search-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="7" />
              <line x1="16.65" y1="16.65" x2="21" y2="21" />
            </svg>
          </span>
          <input
            type="text"
            className="search-input"
            placeholder="Search Trust node"
            aria-label="Search Trust node"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => { if (searchResults.length || searchStatus) setShowSearchDropdown(true); }}
          />
          {showSearchDropdown && (
            <div className="search-dropdown">
              {searchStatus ? (
                <div className="search-dropdown-empty">{searchStatus}</div>
              ) : null}
              {searchResults.map((result) => {
                const avatarUrl = result.profile?.avatar ? resolveImageUrl(result.profile.avatar) : null;

                return (
                  <button
                    key={result._id}
                    type="button"
                    className="search-suggestion-item"
                    onClick={() => handleResultClick(result)}
                  >
                    <div className="suggestion-avatar">
                      {avatarUrl ? (
                        <img src={avatarUrl} alt={result.username} />
                      ) : (
                        <span>{result.username?.charAt(0).toUpperCase() || 'U'}</span>
                      )}
                    </div>
                    <div className="suggestion-details">
                      <strong>{result.username}</strong>
                      <span>{result.profile.jobTitle || result.profile.location || 'Profile result'}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <button className="nav-message-button" onClick={onToggleMessages} aria-label="Open messages">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          {isLoggedIn && messageUnreadCount > 0 && (
            <span className="message-badge">{messageUnreadCount > 99 ? '99+' : messageUnreadCount}</span>
          )}
        </button>
      </div>

      <div className="nav-right">
        {isLoggedIn ? (
          <>
            <div className="nav-profile-wrapper" ref={profileWrapperRef}>
              <button
                type="button"
                className={`nav-profile-btn ${showProfileMenu ? 'open' : ''}`}
                onClick={() => {
                  setShowProfileMenu((prev) => !prev);
                }}
                title="Account menu"
                aria-label="Open account menu"
                aria-expanded={showProfileMenu}
              >
                {profileAvatarUrl && !profileAvatarFailed ? (
                  
                  <img
                    src={profileAvatarUrl}
                    alt={profileName}
                    className="nav-profile-avatar"
                    onError={() => setProfileAvatarFailed(true)}
                  />
                ) : (
                  <span className="nav-profile-placeholder">{profileInitial}</span>
                )}
              </button>

              {showProfileMenu && (
                <div className="profile-menu-dropdown">
                  <div className="profile-menu-header">
                    <div className="profile-menu-avatar">
                      {profileAvatarUrl && !profileAvatarFailed ? (
                        <img
                          src={profileAvatarUrl}
                          alt={profileName}
                          className="nav-profile-avatar"
                          onError={() => setProfileAvatarFailed(true)}
                        />
                      ) : (
                        <span className="nav-profile-placeholder">{profileInitial}</span>
                      )}
                    </div>
                    <div className="profile-menu-identity">
                      <strong>{profileName || 'User'}</strong>
                      <span>{profileHeadline || 'Security professional'}</span>
                      {profileLocation ? <small>{profileLocation}</small> : null}
                    </div>
                  </div>

                  <button type="button" className="profile-menu-view-btn" onClick={() => goToTab('profile')}>
                    View Profile
                  </button>

                  <div className="profile-menu-section">
                    <span className="profile-menu-section-title">Account</span>
                    <button type="button" className="profile-menu-item" onClick={() => goToTab('privacy')}>
                      Settings & Privacy
                    </button>
                    <button type="button" className="profile-menu-item" onClick={() => goToTab('security')}>
                      Security Logs
                    </button>
                    <button type="button" className="profile-menu-item" onClick={() => goToTab('contact')}>
                      Help
                    </button>
                  </div>

                  <div className="profile-menu-section">
                    <span className="profile-menu-section-title">Manage</span>
                    <button type="button" className="profile-menu-item" onClick={() => goToTab('home')}>
                      Posts & Activity
                    </button>
                    <button type="button" className="profile-menu-item danger" onClick={handleSignOut}>
                      Sign Out
                    </button>
                  </div>
                </div>
              )}
            </div>
          </>
        ) : (
          <>
            <button className="nav-action secondary" onClick={onSignIn}>Sign in</button>
            <button className="nav-action primary" onClick={onJoinNow}>Join now</button>
          </>
        )}
      </div>
    </nav>
  );
};

export default Navbar;

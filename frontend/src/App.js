import React, { useCallback, useEffect, useState } from 'react';
import './styles.css';
import axios from 'axios';
import Login from './components/Login';
import Register from './components/Register';
import Setup2FA from './components/Setup2FA';
import Dashboard from './components/Dashboard';
import LandingPage from './components/LandingPage';
import Navbar from './components/Navbar';
import MessagePanel from './components/MessagePanel';
import NotificationPanel from './components/NotificationPanel';
import ProfilePage from './components/ProfilePage';
import UserProfileView from './components/UserProfileView';
import PrivacySettings from './components/PrivacySettings';
import SearchPage from './components/SearchPage';
import ForgotPassword from './components/ForgotPassword';
import ResetPassword from './components/ResetPassword';
import SecurityLogs from './components/SecurityLogs';
import { ensureE2EEIdentity } from './utils/e2ee';

const RECOVERY_TOKEN_SESSION_KEY = 'trustnode_reset_token';

function App() {
  const [screen, setScreen] = useState('home');
  const [resetToken, setResetToken] = useState('');
  const [activeTab, setActiveTab] = useState('home');
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [profile, setProfile] = useState(null);
  const [viewUser, setViewUser] = useState(null);
  const [activeChatUser, setActiveChatUser] = useState(null);
  const [connectionRequests, setConnectionRequests] = useState([]);
  const [setupQr, setSetupQr] = useState(null);
  const [setupUserId, setSetupUserId] = useState(null);
  const [showMessages, setShowMessages] = useState(false);
  const [unreadMessagesCount, setUnreadMessagesCount] = useState(0);

  const handleNext = (nextScreen, data = {}) => {
    if (nextScreen === 'setup2fa') {
      setSetupQr(data.qr || null);
      setSetupUserId(data.userId || null);
    }
    setScreen(nextScreen);
  };

  const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:5000';
  axios.defaults.baseURL = API_BASE;

  const handleLoginSuccess = async () => {
    setIsLoggedIn(true);
    setActiveTab('home');
    setShowMessages(false);
    setScreen('dashboard');
    await fetchProfile();
  };

  const fetchConnectionRequests = useCallback(async () => {
    const token = localStorage.getItem('token');
    if (!token) return;
    try {
      const res = await axios.get(`${API_BASE}/api/profile/requests`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setConnectionRequests(res.data.requests || []);
    } catch (error) {
      console.warn('Connection requests fetch failed', error);
      setConnectionRequests([]);
    }
  }, [API_BASE]);

  const fetchUnreadMessages = useCallback(async () => {
    const token = localStorage.getItem('token');
    if (!token) {
      setUnreadMessagesCount(0);
      return;
    }

    try {
      const res = await axios.get(`${API_BASE}/api/chat`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const totalUnread = (res.data || []).reduce((sum, conv) => sum + (conv.unreadCount || 0), 0);
      setUnreadMessagesCount(totalUnread);
    } catch (error) {
      console.warn('Unread message count fetch failed', error);
      setUnreadMessagesCount(0);
    }
  }, [API_BASE]);

  const fetchProfile = useCallback(async () => {
    const token = localStorage.getItem('token');
    if (!token) return false;
    try {
      const res = await axios.get(`${API_BASE}/api/profile`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setProfile(res.data.profile);
      setIsLoggedIn(true);
      ensureE2EEIdentity({ token, apiBase: API_BASE }).catch((error) => {
        console.warn('E2EE key initialization failed:', error);
      });
      await fetchConnectionRequests();
      await fetchUnreadMessages();
      return true;
    } catch (error) {
      console.warn('Profile fetch failed', error);
      localStorage.removeItem('token');
      setIsLoggedIn(false);
      setProfile(null);
      setConnectionRequests([]);
      setUnreadMessagesCount(0);
      return false;
    }
  }, [API_BASE, fetchConnectionRequests, fetchUnreadMessages]);

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    if (tab === 'home') {
      setScreen(isLoggedIn ? 'dashboard' : 'home');
    } else {
      setScreen(tab);
    }
  };

  const handleSignIn = async () => {
    setActiveTab('home');
    setShowMessages(false);
    setScreen('login');
  };

  const handleJoinNow = () => {
    setActiveTab('home');
    setShowMessages(false);
    setScreen('register');
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    setIsLoggedIn(false);
    setProfile(null);
    setViewUser(null);
    setActiveChatUser(null);
    setConnectionRequests([]);
    setUnreadMessagesCount(0);
    setActiveTab('home');
    setShowMessages(false);
    setScreen('home');
  };

  const handleAcceptConnectionRequest = async (requesterId) => {
    const token = localStorage.getItem('token');
    if (!token) return;
    try {
      await axios.post(`${API_BASE}/api/profile/requests/${requesterId}/accept`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      await fetchConnectionRequests();
      await fetchProfile();
    } catch (error) {
      console.warn('Accept connection request failed', error);
    }
  };

  const handleRejectConnectionRequest = async (requesterId) => {
    const token = localStorage.getItem('token');
    if (!token) return;
    try {
      await axios.post(`${API_BASE}/api/profile/requests/${requesterId}/reject`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      await fetchConnectionRequests();
    } catch (error) {
      console.warn('Reject connection request failed', error);
    }
  };

  const handleOpenChat = (user) => {
    setActiveChatUser(user);
    setShowMessages(true);
  };

  const handlePostCreated = () => {
    setProfile((prev) => {
      if (!prev) return prev;
      const currentCount = Number(prev.postsCount ?? prev.profile?.postsCount ?? 0);
      const nextPostsCount = currentCount + 1;
      return {
        ...prev,
        postsCount: nextPostsCount,
        profile: {
          ...(prev.profile || {}),
          postsCount: nextPostsCount
        }
      };
    });
  };

  const handlePostDeleted = () => {
    setProfile((prev) => {
      if (!prev) return prev;
      const currentCount = Number(prev.postsCount ?? prev.profile?.postsCount ?? 0);
      const nextPostsCount = Math.max(0, currentCount - 1);
      return {
        ...prev,
        postsCount: nextPostsCount,
        profile: {
          ...(prev.profile || {}),
          postsCount: nextPostsCount
        }
      };
    });
  };

  const toggleMessages = () => {
    setShowMessages((prev) => !prev);
    if (showMessages) {
      fetchUnreadMessages();
    }
  };

  const handleViewProfile = (user) => {
    setViewUser(user);
    setActiveTab('search');
    setShowMessages(false);
    setScreen('userProfile');
  };

  const renderScreen = () => {
    switch (screen) {
      case 'home':
        return <LandingPage onLogin={handleSignIn} onRegister={handleJoinNow} />;
      case 'features':
        return (
          <main className="page-content">
            <section className="page-hero">
              <h1>Features</h1>
              <p>Explore Trust node’s security-first collaboration tools and privacy-first workflows.</p>
            </section>
          </main>
        );
      case 'clients':
        return (
          <main className="page-content">
            <section className="page-hero">
              <h1>Clients</h1>
              <p>Learn how enterprise security teams and privacy-conscious organizations rely on Trust node.</p>
            </section>
          </main>
        );
      case 'contact':
        return (
          <main className="page-content">
            <section className="page-hero">
              <h1>Help & Support</h1>
              <p>
                Need help with login, profile setup, privacy controls, or suspicious activity alerts?
                Our support team is here to assist you.
              </p>
              <div className="profile-section-grid" style={{ marginTop: '1.25rem' }}>
                <article className="profile-section-card">
                  <div className="profile-section-header">
                    <h2>Support email</h2>
                    <span>Primary</span>
                  </div>
                  <p>
                    Email us at <strong>trustnode117@gmail.com</strong> for account recovery, 2FA help,
                    profile issues, post/privacy questions, and technical support.
                  </p>
                </article>
                <article className="profile-section-card">
                  <div className="profile-section-header">
                    <h2>What to include</h2>
                    <span>Faster resolution</span>
                  </div>
                  <p>
                    Share your username, issue summary, screenshot (if possible), and the approximate time
                    the issue happened. This helps us resolve requests much faster.
                  </p>
                </article>
                <article className="profile-section-card">
                  <div className="profile-section-header">
                    <h2>Security help</h2>
                    <span>Priority</span>
                  </div>
                  <p>
                    If you notice unknown login activity, contact support immediately and mention
                    "Urgent Security Issue" in the subject line for priority handling.
                  </p>
                </article>
              </div>
            </section>
          </main>
        );
      case 'login':
        return <Login onLogin={handleLoginSuccess} onSwitch={handleNext} />;
      case 'register':
        return <Register onNext={handleNext} />;
      case 'forgot':
        return <ForgotPassword onBackToLogin={() => setScreen('login')} />;
      case 'reset':
        return (
          <ResetPassword
            token={resetToken}
            onBackToLogin={() => {
              window.sessionStorage.removeItem(RECOVERY_TOKEN_SESSION_KEY);
              setResetToken('');
              setScreen('login');
            }}
          />
        );
      case 'setup2fa':
        return <Setup2FA qr={setupQr} userId={setupUserId} onNext={handleNext} onLogin={handleLoginSuccess} />;
      case 'dashboard':
        return (
          <Dashboard
            profile={profile}
            onProfileUpdate={setProfile}
            onPostCreated={handlePostCreated}
            onPostDeleted={handlePostDeleted}
            onViewProfile={handleViewProfile}
          />
        );
      case 'profile':
        return <ProfilePage
          profile={profile}
          onProfileUpdate={setProfile}
          onViewProfile={handleViewProfile}
          onOpenPrivacy={() => setScreen('privacy')}
        />;
      case 'privacy':
        return <PrivacySettings />;
      case 'search':
        return <SearchPage profile={profile} onSelectProfile={handleViewProfile} />;
      case 'userProfile':
        return <UserProfileView user={viewUser} onOpenChat={handleOpenChat} />;
      case 'security':
        return <SecurityLogs />;
      default:
        return <LandingPage onLogin={handleSignIn} onRegister={handleJoinNow} />;
    }
  };

  useEffect(() => {
    const path = window.location.pathname;
    const match = path.match(/^\/reset\/(.+)$/);
    if (match?.[1]) {
      const recoveryToken = decodeURIComponent(match[1]);
      window.sessionStorage.setItem(RECOVERY_TOKEN_SESSION_KEY, recoveryToken);
      setResetToken(recoveryToken);
      setScreen('reset');
      window.history.replaceState({}, document.title, '/reset');
      return;
    }

    if (path === '/reset') {
      const storedRecoveryToken = window.sessionStorage.getItem(RECOVERY_TOKEN_SESSION_KEY) || '';
      if (storedRecoveryToken) {
        setResetToken(storedRecoveryToken);
      }
      setScreen('reset');
      return;
    }

    const initializeSession = async () => {
      const token = localStorage.getItem('token');
      if (!token) return;

      const authenticated = await fetchProfile();
      if (!authenticated) return;

      setActiveTab('home');
      setScreen((prev) => (prev === 'home' ? 'dashboard' : prev));
    };

    initializeSession();
  }, [fetchProfile]);

  useEffect(() => {
    if (!isLoggedIn) return;

    fetchUnreadMessages();
    const interval = setInterval(fetchUnreadMessages, 5000);
    return () => clearInterval(interval);
  }, [isLoggedIn, fetchUnreadMessages]);

  const showNavbar = !['login', 'register', 'setup2fa', 'forgot', 'reset'].includes(screen);

  return (
    <div className="App">
      {showNavbar && (
        <>
          <Navbar
            activeTab={activeTab}
            onTabChange={handleTabChange}
            onSignIn={handleSignIn}
            onJoinNow={handleJoinNow}
            onToggleMessages={toggleMessages}
            onViewProfile={handleViewProfile}
            onViewRequest={handleViewProfile}
            onAcceptRequest={handleAcceptConnectionRequest}
            onRejectRequest={handleRejectConnectionRequest}
            connectionRequests={connectionRequests}
            messageUnreadCount={unreadMessagesCount}
            isLoggedIn={isLoggedIn}
            profileName={profile?.username || 'S'}
            profileAvatar={profile?.profile?.avatar || profile?.avatar || ''}
            profileHeadline={profile?.profile?.jobTitle || ''}
            profileLocation={profile?.profile?.location || ''}
            onLogout={handleLogout}
          />
          {isLoggedIn && (
            <NotificationPanel
              onOpenProfile={handleViewProfile}
              onAcceptRequest={handleAcceptConnectionRequest}
              onRejectRequest={handleRejectConnectionRequest}
            />
          )}
        </>
      )}
      {renderScreen()}
      {showMessages && <MessagePanel activeChatUser={activeChatUser} onClose={() => {
        setShowMessages(false);
        setActiveChatUser(null);
        fetchUnreadMessages();
      }} />}
    </div>
  );
}

export default App;

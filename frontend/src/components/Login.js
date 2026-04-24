import React, { useState } from 'react';
import axios from 'axios';

const Login = ({ onLogin, onSwitch }) => {
  const [formData, setFormData] = useState({ email: '', password: '' });
  const [verificationStage, setVerificationStage] = useState('password');
  const [challengeUserId, setChallengeUserId] = useState('');
  const [challengeId, setChallengeId] = useState('');
  const [availableMethods, setAvailableMethods] = useState({
    emailOtp: true,
    authenticatorOtp: false
  });
  const [authenticatorCode, setAuthenticatorCode] = useState('');
  const [emailOtpCode, setEmailOtpCode] = useState('');
  const [emailOtpSent, setEmailOtpSent] = useState(false);
  const [sendingOtp, setSendingOtp] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');

  const openMethodChooser = (methods, message = '') => {
    setAvailableMethods({
      emailOtp: Boolean(methods?.emailOtp),
      authenticatorOtp: Boolean(methods?.authenticatorOtp)
    });
    setVerificationStage('method');
    setStatusMessage(message || 'Choose your 2FA method.');
  };

  const handlePasswordLogin = async (e) => {
    e.preventDefault();
    const payload = {
      email: formData.email.trim().toLowerCase(),
      password: formData.password
    };

    try {
      const res = await axios.post('/api/auth/login', payload);

      if (res.data?.requiresSecondFactor) {
        setChallengeUserId(res.data.userId);
        setChallengeId(res.data.challengeId);
        setAuthenticatorCode('');
        setEmailOtpCode('');
        setEmailOtpSent(false);
        openMethodChooser(res.data.availableMethods, res.data.msg || 'Choose how you want to verify this login.');
        return;
      }

      // Backward compatibility with previous API responses
      if (res.data?.requires2FA) {
        setChallengeUserId(res.data.userId);
        setChallengeId('');
        setAuthenticatorCode('');
        setEmailOtpCode('');
        setEmailOtpSent(false);
        openMethodChooser({ emailOtp: true, authenticatorOtp: true }, 'Choose your 2FA method.');
        return;
      }

      if (res.data?.requiresStepUp) {
        setChallengeUserId(res.data.userId);
        setChallengeId('');
        setAuthenticatorCode('');
        setEmailOtpCode('');
        setEmailOtpSent(false);
        openMethodChooser({ emailOtp: true, authenticatorOtp: false }, 'Choose your 2FA method.');
        return;
      }

      if (res?.data?.token) {
        localStorage.setItem('token', res.data.token);
        onLogin();
      }
    } catch (error) {
      console.error(error);
      const message = error.response?.data?.msg || error.response?.statusText || error.message || 'Login error';
      alert(message);
    }
  };

  const handleSendEmailOtp = async () => {
    if (!challengeUserId) {
      alert('Please sign in with your password again.');
      setVerificationStage('password');
      return;
    }

    try {
      setSendingOtp(true);
      const res = await axios.post('/api/auth/send-email-otp', {
        userId: challengeUserId,
        challengeId
      });
      setEmailOtpSent(true);
      setVerificationStage('email');
      setStatusMessage(res.data?.msg || 'OTP sent. Please check your email.');
    } catch (error) {
      console.error(error);
      const isMissingEndpoint = error.response?.status === 404;
      const message = isMissingEndpoint
        ? 'Email OTP endpoint is missing on backend. Restart backend so /api/auth/send-email-otp loads.'
        : error.response?.data?.msg || 'Could not send OTP';
      alert(message);
      if (message.toLowerCase().includes('expired')) {
        setVerificationStage('password');
      }
    } finally {
      setSendingOtp(false);
    }
  };

  const handleVerifyTwoFactor = async (e) => {
    e.preventDefault();
    try {
      const res = await axios.post('/api/auth/verify-2fa', {
        userId: challengeUserId,
        challengeId,
        otp: authenticatorCode
      });
      if (res?.data?.token) {
        localStorage.setItem('token', res.data.token);
        onLogin();
      }
    } catch (error) {
      console.error(error);
      const message = error.response?.data?.msg || 'Authenticator verification failed';
      alert(message);
      if (message.toLowerCase().includes('expired')) {
        setVerificationStage('password');
      }
    }
  };

  const handleVerifyStepUp = async (e) => {
    e.preventDefault();
    try {
      const res = await axios.post('/api/auth/verify-stepup', {
        userId: challengeUserId,
        challengeId,
        otp: emailOtpCode
      });
      if (res?.data?.token) {
        localStorage.setItem('token', res.data.token);
        onLogin();
      }
    } catch (error) {
      console.error(error);
      const message = error.response?.data?.msg || 'Email OTP verification failed';
      alert(message);
      if (message.toLowerCase().includes('expired')) {
        setVerificationStage('password');
      }
    }
  };

  const renderAuthBody = () => {
    if (verificationStage === 'password') {
      return (
        <form onSubmit={handlePasswordLogin}>
          <input
            type="email"
            placeholder="E-mail"
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            required
          />
          <input
            type="password"
            placeholder="Password"
            value={formData.password}
            onChange={(e) => setFormData({ ...formData, password: e.target.value })}
            required
          />
          <button type="submit">Sign In</button>
          <div className="auth-options auth-options-clean">
            <button type="button" className="link-button forgot-link" onClick={() => onSwitch('forgot')}>Forgot your password?</button>
          </div>
        </form>
      );
    }

    if (verificationStage === 'method') {
      return (
        <div className="auth-method-picker">
          <p className="status-message">{statusMessage || 'Choose your 2FA method.'}</p>
          <div className="auth-method-options">
            <button type="button" onClick={() => setVerificationStage('email')}>Email OTP</button>
            <button
              type="button"
              onClick={() => setVerificationStage('authenticator')}
              disabled={!availableMethods.authenticatorOtp}
              className={!availableMethods.authenticatorOtp ? 'is-disabled' : ''}
            >
              Authenticator OTP
            </button>
          </div>
          {!availableMethods.authenticatorOtp && (
            <p className="status-message">Authenticator OTP is unavailable until 2FA setup is completed.</p>
          )}
        </div>
      );
    }

    if (verificationStage === 'email') {
      return (
        <form onSubmit={handleVerifyStepUp}>
          <p className="status-message">{statusMessage || 'Use email OTP to verify this login.'}</p>
          <div className="auth-inline-actions">
            <button
              type="button"
              className="auth-secondary-btn"
              onClick={handleSendEmailOtp}
              disabled={sendingOtp}
            >
              {sendingOtp ? 'Sending OTP...' : emailOtpSent ? 'Resend OTP' : 'Send OTP'}
            </button>
            <button
              type="button"
              className="auth-secondary-btn"
              onClick={() => openMethodChooser(availableMethods)}
            >
              Back to methods
            </button>
          </div>
          <input
            placeholder="Enter email OTP"
            value={emailOtpCode}
            onChange={(e) => setEmailOtpCode(e.target.value)}
            required
          />
          <button type="submit" disabled={!emailOtpSent}>Verify OTP</button>
          {!emailOtpSent && <p className="status-message">Send OTP first, then verify.</p>}
        </form>
      );
    }

    return (
      <form onSubmit={handleVerifyTwoFactor}>
        <p className="status-message">{statusMessage || 'Enter your authenticator app code.'}</p>
        <input
          placeholder="Enter authenticator OTP"
          value={authenticatorCode}
          onChange={(e) => setAuthenticatorCode(e.target.value)}
          required
        />
        <button type="submit">Verify Authenticator OTP</button>
        <button
          type="button"
          className="auth-secondary-btn"
          onClick={() => openMethodChooser(availableMethods)}
        >
          Back to methods
        </button>
      </form>
    );
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-left">
          <div className="auth-head">
            <h2>Welcome back to Trust node</h2>
            <p>Sign in with your password, then verify using either Email OTP or Authenticator OTP.</p>
          </div>
          <div className="auth-form">
            {renderAuthBody()}
            <p className="auth-note">
              Don't have an account? <button type="button" className="link-button" onClick={() => onSwitch('register')}>Create</button>
            </p>
          </div>
        </div>
        <div className="auth-right">
          <h3>Trust node Access</h3>
          <p>Log in to your secure professional network for ethical hackers, where every conversation and post is protected by enterprise-ready multi-factor verification and anomaly monitoring.</p>
        </div>
      </div>
    </div>
  );
};

export default Login;

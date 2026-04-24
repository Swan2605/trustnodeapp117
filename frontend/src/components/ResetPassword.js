import React, { useEffect, useState } from 'react';
import axios from 'axios';

const ResetPassword = ({ token: initialToken = '', onBackToLogin }) => {
  const token = String(initialToken || '');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [status, setStatus] = useState('Set your new password to complete recovery.');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!initialToken) {
      setStatus('Recovery link is missing or expired. Request a new reset email.');
    }
  }, [initialToken]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      setStatus('Passwords do not match.');
      return;
    }
    if (!token.trim()) {
      setStatus('Please provide the reset token from your email.');
      return;
    }

    setLoading(true);
    try {
      const res = await axios.post('/api/recovery/reset', { token, password });
      setStatus(res.data.msg || 'Password reset successful. You can log in now.');
      setPassword('');
      setConfirmPassword('');
      window.sessionStorage.removeItem('trustnode_reset_token');
    } catch (error) {
      const message = error.response?.data?.msg || 'Unable to reset password.';
      setStatus(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-left">
          <div className="auth-head">
            <h2>Set a new password</h2>
            <p>Use this secure recovery page from your email link and choose a strong new password.</p>
          </div>
          <div className="auth-form">
            <form onSubmit={handleSubmit}>
              <input
                type="password"
                placeholder="New password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <input
                type="password"
                placeholder="Confirm password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
              <button type="submit" disabled={loading}>{loading ? 'Resetting…' : 'Reset password'}</button>
            </form>
            <p className="auth-note">{status}</p>
            <p className="auth-note">
              Back to <button type="button" className="link-button" onClick={onBackToLogin}>Login</button>
            </p>
          </div>
        </div>
        <div className="auth-right">
          <h3>Secure reset</h3>
          <p>Create a password that keeps your Trust node account safe. For security, reset tokens are hidden and handled automatically.</p>
        </div>
      </div>
    </div>
  );
};

export default ResetPassword;

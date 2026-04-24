import React, { useState } from 'react';
import axios from 'axios';

const ForgotPassword = ({ onBackToLogin }) => {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState('Enter the email linked to your account.');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await axios.post('/api/recovery/forgot', { email });
      setStatus(res.data.msg || 'Password reset email sent. Check your inbox.');
    } catch (error) {
      const message = error.response?.data?.msg || 'Unable to send reset email.';
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
            <h2>Reset your password</h2>
            <p>We’ll send a reset link to your email so you can update your password safely.</p>
          </div>
          <div className="auth-form">
            <form onSubmit={handleSubmit}>
              <input
                type="email"
                placeholder="E-mail"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              <button type="submit" disabled={loading}>{loading ? 'Sending…' : 'Send reset link'}</button>
            </form>
            <p className="auth-note">{status}</p>
            <p className="auth-note">
              Remembered your password? <button type="button" className="link-button" onClick={onBackToLogin}>Back to login</button>
            </p>
          </div>
        </div>
        <div className="auth-right">
          <h3>Password recovery</h3>
          <p>If your email is registered, you’ll receive a secure link to reset your password immediately.</p>
        </div>
      </div>
    </div>
  );
};

export default ForgotPassword;

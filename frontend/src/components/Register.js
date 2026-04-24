import React, { useState } from 'react';
import axios from 'axios';

const Register = ({ onNext }) => {
  const [formData, setFormData] = useState({ username: '', email: '', phone: '', password: '' });
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    const payload = {
      username: formData.username.trim(),
      email: formData.email.trim().toLowerCase(),
      phone: formData.phone.trim(),
      password: formData.password
    };

    try {
      const res = await axios.post('/api/auth/register', payload);
      if (res && res.data && res.data.userId) {
        onNext('setup2fa', { qr: res.data.qr, userId: res.data.userId });
      } else {
        setError('Registration failed - check backend');
      }
    } catch (error) {
      const message = error.response?.data?.msg || error.message || 'Registration error';
      setError(message);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-left">
          <div className="auth-head">
            <h2>Build your Trust node profile</h2>
          </div>
          <div className="auth-form">
            <form onSubmit={handleSubmit}>
              <input placeholder="Username" onChange={(e) => setFormData({...formData, username: e.target.value})} required />
              <input type="email" placeholder="E-mail" onChange={(e) => setFormData({...formData, email: e.target.value})} required />
              <input placeholder="Phone (+1...)" onChange={(e) => setFormData({...formData, phone: e.target.value})} required />
              <input type="password" placeholder="Password" onChange={(e) => setFormData({...formData, password: e.target.value})} required />
              <button type="submit">Create Account</button>
            </form>
            {error && <p className="error-text">{error}</p>}
            <p className="auth-note">
              Already a Trust node member? <button type="button" className="link-button" onClick={() => onNext('login')}>Sign in</button>
            </p>
          </div>
        </div>
        <div className="auth-right">
          <h3>Cybersecurity networking</h3>
          <p>Connect with peers, share penetration testing insights, and publish secure technical write-ups in a platform built for privacy-conscious InfoSec professionals.</p>
        </div>
      </div>
    </div>
  );
};

export default Register;

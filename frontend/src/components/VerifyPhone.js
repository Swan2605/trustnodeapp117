import React, { useState } from 'react';
import axios from 'axios';

const VerifyPhone = ({ onNext }) => {
  const [otp, setOtp] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const res = await axios.post('/api/auth/verify-phone', { 
        userId: localStorage.getItem('tempUserId'), 
        otp 
      });
      // QR would be res.data.qr - show QR here in prod
      console.log('TOTP QR data:', res.data.qr);
      onNext('login');
    } catch (error) {
      alert('Invalid OTP');
    }
  };

  return (
    <div className="auth-form">
      <h2>Verify Phone OTP</h2>
      <form onSubmit={handleSubmit}>
        <input placeholder="6-digit OTP" value={otp} onChange={(e) => setOtp(e.target.value)} />
        <button type="submit">Verify & Setup Email 2FA</button>
      </form>
      <p>Check TOTP QR in console/response</p>
    </div>
  );
};

export default VerifyPhone;

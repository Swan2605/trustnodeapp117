import React from 'react';

const HeroPanel = () => {
  return (
    <section className="hero-panel">
      <div className="hero-copy">
        <p className="eyebrow">Trust node</p>
        <h1>Cybersecurity networking built for ethical hackers.</h1>
        <p className="hero-text">
          Trust node is a security-first professional networking platform designed for the cybersecurity community.
          Connect with trusted peers, publish technical write-ups, and manage penetration testing progress in an
          environment protected by strict Two-Factor Authentication, anomaly detection, and end-to-end encryption.
        </p>
        <div className="hero-actions">
          <button className="primary-btn">Create Secure Post</button>
          <button className="secondary-btn">Explore Safe Channels</button>
        </div>
      </div>
      <div className="hero-stats">
        <div className="stat-card">
          <p className="stat-value">42K</p>
          <p className="stat-label">Verified practitioners</p>
        </div>
        <div className="stat-card">
          <p className="stat-value">3.2M</p>
          <p className="stat-label">Secure messages</p>
        </div>
        <div className="stat-card">
          <p className="stat-value">98%</p>
          <p className="stat-label">Anomaly detection coverage</p>
        </div>
      </div>
    </section>
  );
};

export default HeroPanel;

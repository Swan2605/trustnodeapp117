import React from 'react';

const LandingPage = ({ onLogin, onRegister }) => {
  return (
    <div className="landing-page">
      <section className="landing-hero">
        <div className="landing-copy">
          <p className="eyebrow">Trust Node security for modern networks</p>
          <h1>Connect with trusted cyber professionals in a secure, privacy-first community.</h1>
          <p className="landing-lead">
            Trust node brings together ethical hackers, security analysts, and privacy experts in one polished platform.
            Share threat intelligence, publish security updates, and collaborate with confidence.
          </p>
          <div className="hero-actions">
            <button className="primary-btn" onClick={onRegister}>Get Started</button>
            <button className="secondary-btn" onClick={onLogin}>Sign In</button>
          </div>
          <div className="trusted-by">
            <span>Trusted by</span>
            <div className="client-logos">
              <span>HubSpot</span>
              <span>Dropbox</span>
              <span>Shopify</span>
              <span>Webflow</span>
              <span>BBC</span>
            </div>
          </div>
        </div>

        <div className="hero-visual">
          <div className="hero-card">
            <div className="hero-card-header">
              <span className="hero-chip">Live</span>
              <span>Threat dashboard</span>
            </div>
            <div className="hero-card-body">
              <div className="metric-row">
                <div>
                  <p className="metric-value">24.7K</p>
                  <p className="metric-label">Verified members</p>
                </div>
                <div>
                  <p className="metric-value">98%</p>
                  <p className="metric-label">Detection rate</p>
                </div>
              </div>
              <div className="chart-box">
                <div className="chart-bar bar-1" />
                <div className="chart-bar bar-2" />
                <div className="chart-bar bar-3" />
                <div className="chart-bar bar-4" />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="service-grid">
        <div className="section-header">
          <div>
            <p className="eyebrow">Our Active Clients</p>
            <h2>Security services built for enterprise-grade collaboration</h2>
          </div>
          <p className="section-copy">
            From vulnerability research to privacy-first communications, Trust node provides the tools that trusted teams need.
          </p>
        </div>

        <div className="service-cards">
          <div className="service-card">
            <h3>Cyber Security Solutions</h3>
            <p>Secure your network perimeter with threat intelligence sharing and hardened collaboration.</p>
          </div>
          <div className="service-card">
            <h3>Networking & Security</h3>
            <p>Connect with peers while keeping your conversations encrypted and access-controlled.</p>
          </div>
          <div className="service-card">
            <h3>Web Security</h3>
            <p>Publish reports, audits, and findings in a trusted environment that preserves confidentiality.</p>
          </div>
          <div className="service-card">
            <h3>Data Security</h3>
            <p>Protect every file, message, and post with modern privacy defaults and secure sharing.</p>
          </div>
          <div className="service-card">
            <h3>Threats Block</h3>
            <p>Monitor suspicious activity and receive alerts for anomalous behavior across your network.</p>
          </div>
          <div className="service-card">
            <h3>Secure Collaboration</h3>
            <p>Bring teams together under one platform with role-based access and privacy-first controls.</p>
          </div>
        </div>
      </section>

      <section className="landing-feature">
        <div className="feature-copy">
          <p className="eyebrow">Security driven by people</p>
          <h2>Security isn’t just a job to us. We do this because we love it.</h2>
          <p>
            Every conversation on Trust node is designed to be safe, monitored for anomalies, and easy to manage.
            Build your network with experts who care about privacy, trust, and resilience.
          </p>
        </div>
        <div className="feature-highlights">
          <div className="highlight-card">
            <p className="highlight-value">20,000+</p>
            <p>Security professionals connected</p>
          </div>
          <div className="highlight-card">
            <p className="highlight-value">2,000+</p>
            <p>Active secure teams</p>
          </div>
          <div className="highlight-card">
            <p className="highlight-value">99.9%</p>
            <p>Platform uptime for secure messaging</p>
          </div>
        </div>
      </section>
    </div>
  );
};

export default LandingPage;

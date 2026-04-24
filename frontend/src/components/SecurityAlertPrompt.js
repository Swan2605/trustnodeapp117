import React from 'react';

const SecurityAlertPrompt = ({ alert, onConfirm, onSecureAccount }) => {
  if (!alert) {
    return (
      <main className="page-content">
        <section className="profile-hero-card security-section">
          <h1>Security confirmation</h1>
          <p>No pending security alerts were found.</p>
        </section>
      </main>
    );
  }

  return (
    <main className="page-content security-alert-prompt">
      <section className="profile-hero-card security-section">
        <div className="security-header">
          <div>
            <h1>Was this you?</h1>
            <p>This login was flagged as suspicious. Confirm whether the activity was legitimate.</p>
          </div>
        </div>

        <div className="alert-summary-card">
          <h2>{alert.message || 'Suspicious sign-in detected'}</h2>
          <div className="alert-summary-details">
            <p><strong>Risk level:</strong> {alert.riskLevel}</p>
            <p><strong>Device:</strong> {alert.device || 'Unknown'}</p>
            <p><strong>Browser:</strong> {alert.browser || 'Unknown'}</p>
            <p><strong>Location:</strong> {alert.location || 'Unknown'}</p>
            <p><strong>IP:</strong> {alert.ip || 'Unknown'}</p>
          </div>
        </div>

        <div className="security-action-buttons">
          <button className="primary-button" onClick={onConfirm}>Yes, it was me</button>
          <button className="secondary-button" onClick={onSecureAccount}>No, secure my account</button>
        </div>
      </section>
    </main>
  );
};

export default SecurityAlertPrompt;

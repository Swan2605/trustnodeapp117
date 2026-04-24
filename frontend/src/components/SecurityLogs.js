import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { jsPDF } from 'jspdf';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:5000';

const actionLabels = {
  login: 'New login',
  logout: 'Logged out',
  failed_login: 'Failed login attempt',
  anomaly: 'Suspicious activity detected',
  access: 'Account access',
  password_change: 'Password changed',
  two_factor_enabled: 'Two-factor authentication enabled'
};

const actionSeverity = {
  login: 'success',
  logout: 'normal',
  failed_login: 'danger',
  anomaly: 'danger',
  access: 'info',
  password_change: 'warning',
  two_factor_enabled: 'success'
};

const SecurityLogs = () => {
  const [sessions, setSessions] = useState([]);
  const [logs, setLogs] = useState([]);
  const [currentSessionId, setCurrentSessionId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionMessage, setActionMessage] = useState('');
  const [activeTab, setActiveTab] = useState('sessions');

  const token = localStorage.getItem('token');

  const fetchSecurityData = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const res = await axios.get(`${API_BASE}/api/profile/security-logs`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setSessions(res.data.sessions || []);
      setLogs(res.data.logs || []);
      setCurrentSessionId(res.data.currentSessionId || '');
    } catch (err) {
      setError(err.response?.data?.msg || 'Failed to load security information');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchSecurityData();
  }, [fetchSecurityData]);

  const handleLogoutOtherDevices = async () => {
    try {
      await axios.post(`${API_BASE}/api/profile/security-logs/logout-other`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setActionMessage('All other sessions have been signed out.');
      fetchSecurityData();
    } catch (err) {
      setError(err.response?.data?.msg || 'Could not log out other devices');
    }
  };

  const handleLogoutSession = async (sessionId) => {
    try {
      await axios.post(`${API_BASE}/api/profile/security-logs/sessions/${sessionId}/logout`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setActionMessage('Selected device has been logged out.');
      fetchSecurityData();
    } catch (err) {
      setError(err.response?.data?.msg || 'Could not log out selected device');
    }
  };

  const handleSecureAccount = async () => {
    try {
      await axios.post(`${API_BASE}/api/profile/security-account/secure`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setActionMessage('Account lockdown initiated. Please reset your password immediately.');
      fetchSecurityData();
    } catch (err) {
      setError(err.response?.data?.msg || 'Could not secure account');
    }
  };

  const handleExportPdf = async () => {
    try {
      const res = await axios.get(`${API_BASE}/api/profile/security-data/export`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      const sessionsData = res.data.sessions || [];
      const logsData = res.data.logs || [];

      const doc = new jsPDF({ unit: 'pt', format: 'letter' });
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(18);
      doc.text('Trust Node Security Report', 40, 40);
      doc.setFontSize(10);
      doc.text(`Generated: ${new Date().toLocaleString()}`, 40, 60);

      let y = 90;
      doc.setFontSize(12);
      doc.text('Active Sessions', 40, y);
      y += 18;
      sessionsData.forEach((session, idx) => {
        doc.setFontSize(11);
        doc.text(`${idx + 1}. ${session.device || 'Unknown device'} (${session.browser || 'Unknown browser'} / ${session.os || 'Unknown OS'})`, 48, y);
        y += 14;
        doc.setFontSize(10);
        doc.text(`Location: ${session.location || session.ip || 'Unknown'}`, 60, y);
        y += 12;
        doc.text(`Logged in: ${new Date(session.createdAt).toLocaleString()}`, 60, y);
        y += 12;
        doc.text(`Last active: ${new Date(session.lastActive).toLocaleString()}`, 60, y);
        y += 12;
        doc.text(`Active: ${session.active ? 'Yes' : 'No'}`, 60, y);
        y += 20;
        if (y > 720) {
          doc.addPage();
          y = 40;
        }
      });

      if (y > 720) {
        doc.addPage();
        y = 40;
      }

      doc.setFontSize(12);
      doc.text('Security Activity Logs', 40, y);
      y += 18;

      logsData.forEach((log, idx) => {
        doc.setFontSize(11);
        const label = actionLabels[log.action] || log.action;
        const anomaly = log.action === 'anomaly' ? ' (Anomaly detected)' : '';
        doc.text(`${idx + 1}. ${label}${anomaly}`, 48, y);
        y += 14;
        doc.setFontSize(10);
        doc.text(`Timestamp: ${new Date(log.timestamp).toLocaleString()}`, 60, y);
        y += 12;
        doc.text(`Device: ${log.device || 'Unknown'}`, 60, y);
        y += 12;
        doc.text(`IP: ${log.ip || 'Unknown'}`, 60, y);
        y += 12;
        if (log.details) {
          doc.text(`Details: ${typeof log.details === 'string' ? log.details : JSON.stringify(log.details)}`, 60, y, { maxWidth: 480 });
          y += 18;
        }
        y += 8;
        if (y > 720) {
          doc.addPage();
          y = 40;
        }
      });

      doc.save(`security-report-${Date.now()}.pdf`);
      setActionMessage('PDF report generated successfully!');
    } catch (err) {
      setError(err.response?.data?.msg || 'Could not generate PDF report');
    }
  };

  if (loading) return <div className="page-content">Loading security logs...</div>;
  if (error) return <div className="page-content">Error: {error}</div>;

  return (
    <main className="page-content">
      <div className="security-page-layout">
        <aside className="security-tab-sidebar">
          <button
            className={`security-tab-item ${activeTab === 'sessions' ? 'active' : ''}`}
            onClick={() => setActiveTab('sessions')}
          >
            Active Sessions
          </button>
          <button
            className={`security-tab-item ${activeTab === 'logs' ? 'active' : ''}`}
            onClick={() => setActiveTab('logs')}
          >
            Security Activity
          </button>
        </aside>

        <section className="security-tab-content">
          <div className="security-panel-header">
            <div>
              <h1>{activeTab === 'sessions' ? 'Active Sessions & Device Management' : 'Security Activity Log'}</h1>
              <p>{activeTab === 'sessions'
                ? 'See where your account is currently signed in and manage active sessions.'
                : 'Review recent account activity including logins, password changes, and anomalies.'}
              </p>
            </div>
            <button
              className="export-button"
              onClick={handleExportPdf}
              title="Download security report as PDF"
            >
              <span className="export-icon"></span> Download PDF report
            </button>
          </div>

          {actionMessage && <div className="security-action-message">{actionMessage}</div>}

          {activeTab === 'sessions' ? (
            <>
              <div className="security-action-buttons">
                <button
                  className="primary-button"
                  onClick={handleLogoutOtherDevices}
                  disabled={!sessions.some((s) => s.sessionId !== currentSessionId)}
                >
                  Log Out of All Other Devices
                </button>
                <button
                  className="secondary-button"
                  onClick={handleSecureAccount}
                >
                  Secure Your Account
                </button>
              </div>

              <div className="sessions-list">
                {sessions.length === 0 ? (
                  <p>No active sessions found.</p>
                ) : (
                  sessions.map((session) => (
                    <div key={session.sessionId} className="session-card">
                      <div className="session-main">
                        <div>
                          <strong>{session.device || 'Unknown device'}</strong>
                          <p>{session.browser || 'Unknown browser'} • {session.os || 'Unknown OS'}</p>
                        </div>
                        <div className="session-meta">
                          <span>{session.location || session.ip || 'Unknown location'}</span>
                          <span>Last active: {new Date(session.lastActive).toLocaleString()}</span>
                          <span>Logged in: {new Date(session.createdAt).toLocaleString()}</span>
                        </div>
                      </div>
                      <div className="session-actions">
                        {session.sessionId === currentSessionId ? (
                          <button className="secondary-button" disabled>Current device</button>
                        ) : (
                          <button className="secondary-button" onClick={() => handleLogoutSession(session.sessionId)}>
                            Log out
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </>
          ) : (
            <div className="logs-list">
              {logs.length === 0 ? (
                <p>No security events have been recorded yet.</p>
              ) : (
                logs.map((log) => {
                  const label = actionLabels[log.action] || log.action;
                  const severity = actionSeverity[log.action] || 'normal';
                  return (
                    <div key={log._id} className={`log-item log-${severity}`}>
                      <div className="log-header">
                        <div>
                          <strong>{label}</strong>
                          <p>{new Date(log.timestamp).toLocaleString()}</p>
                        </div>
                        <span className="log-tag">{log.action === 'failed_login' ? 'Failed' : log.action === 'anomaly' ? 'Alert' : 'Info'}</span>
                      </div>
                      <div className="log-details">
                        <p><strong>IP:</strong> {log.ip || 'Unknown'}</p>
                        <p><strong>Device:</strong> {log.device || 'Unknown'}</p>
                        <p><strong>Anomaly:</strong> {log.action === 'anomaly' ? 'Yes' : 'No'}</p>
                        {log.details && <p><strong>Details:</strong> {typeof log.details === 'string' ? log.details : JSON.stringify(log.details)}</p>}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </section>
      </div>
    </main>
  );
};

export default SecurityLogs;

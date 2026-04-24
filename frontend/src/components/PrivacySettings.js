import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';

const DEFAULT_SETTINGS = {
  profile: 'public',
  posts: 'public',
  activityStatus: true,
  searchEngineVisibility: true,
  allowMessages: true,
  allowConnectionRequests: true,
  allowTagging: 'friends',
  dataSharing: false,
  invitationsFromNetwork: true,
  messagesYouReceive: true,
  researchInvitations: false,
  marketingEmails: false,
  focusedInbox: false,
  deliveryIndicators: true,
  messagingSuggestions: true,
  messageNudges: false,
  harmfulMessageDetection: true
};

const DEFAULT_DEMOGRAPHIC = {
  gender: 'Prefer not to say',
  disability: 'Prefer not to say'
};

const DEFAULT_VERIFICATIONS = {
  identity: {
    type: 'Identity',
    enabled: false,
    verifiedBy: '',
    details: '',
    verificationDate: ''
  },
  workplace: {
    type: 'Workplace',
    enabled: false,
    organization: '',
    method: '',
    email: '',
    verificationDate: '',
    saveEmail: false
  }
};

const mergeVerifications = (value = {}) => ({
  identity: {
    ...DEFAULT_VERIFICATIONS.identity,
    ...(value.identity || {})
  },
  workplace: {
    ...DEFAULT_VERIFICATIONS.workplace,
    ...(value.workplace || {})
  }
});

const mergeDemographic = (value = {}) => ({
  ...DEFAULT_DEMOGRAPHIC,
  ...(value || {})
});

const PrivacySettings = () => {
  const [activeTab, setActiveTab] = useState('security');
  const [activeSubView, setActiveSubView] = useState(null);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [demographic, setDemographic] = useState(DEFAULT_DEMOGRAPHIC);
  const [verifications, setVerifications] = useState(DEFAULT_VERIFICATIONS);
  const [saving, setSaving] = useState(false);

  const authHeaders = useMemo(() => ({
    Authorization: `Bearer ${localStorage.getItem('token')}`
  }), []);

  const applyServerState = (payload = {}) => {
    setSettings((prev) => ({ ...prev, ...payload }));
    if (payload.demographic) {
      setDemographic(mergeDemographic(payload.demographic));
    }
    if (payload.verifications) {
      setVerifications(mergeVerifications(payload.verifications));
    }
  };

  const fetchSettings = async () => {
    try {
      const response = await axios.get('/api/privacy', { headers: authHeaders });
      applyServerState(response.data || {});
    } catch (error) {
      console.error(error);
    }
  };

  useEffect(() => {
    fetchSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateSettings = async () => {
    try {
      setSaving(true);
      const payload = {
        profile: settings.profile,
        posts: settings.posts,
        activityStatus: settings.activityStatus,
        searchEngineVisibility: settings.searchEngineVisibility,
        allowMessages: settings.allowMessages,
        allowConnectionRequests: settings.allowConnectionRequests,
        allowTagging: settings.allowTagging,
        dataSharing: settings.dataSharing,
        invitationsFromNetwork: settings.invitationsFromNetwork,
        messagesYouReceive: settings.messagesYouReceive,
        researchInvitations: settings.researchInvitations,
        marketingEmails: settings.marketingEmails,
        focusedInbox: settings.focusedInbox,
        deliveryIndicators: settings.deliveryIndicators,
        messagingSuggestions: settings.messagingSuggestions,
        messageNudges: settings.messageNudges,
        harmfulMessageDetection: settings.harmfulMessageDetection,
        demographic,
        verifications
      };

      const response = await axios.put('/api/privacy', payload, { headers: authHeaders });
      applyServerState(response.data || {});
      alert('Privacy settings saved.');
    } catch (error) {
      console.error(error);
      alert('Unable to save privacy settings.');
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveDemographic = () => {
    setDemographic(DEFAULT_DEMOGRAPHIC);
  };

  const handleDeleteVerification = (kind) => {
    setVerifications((prev) => ({
      ...prev,
      [kind]: {
        ...DEFAULT_VERIFICATIONS[kind]
      }
    }));
  };

  const renderSidebar = () => (
    <aside className="privacy-sidebar">
      <div className="privacy-sidebar-header">
        <h3>Settings</h3>
      </div>
      <nav className="privacy-nav">
        <button
          className={`privacy-nav-item ${activeTab === 'security' ? 'active' : ''}`}
          onClick={() => setActiveTab('security')}
        >
          Sign in & security
        </button>
        <button
          className={`privacy-nav-item ${activeTab === 'visibility' ? 'active' : ''}`}
          onClick={() => setActiveTab('visibility')}
        >
          Visibility
        </button>
        <button
          className={`privacy-nav-item ${activeTab === 'messaging' ? 'active' : ''}`}
          onClick={() => setActiveTab('messaging')}
        >
          Messaging experience
        </button>
        <button
          className={`privacy-nav-item ${activeTab === 'data' ? 'active' : ''}`}
          onClick={() => setActiveTab('data')}
        >
          Data privacy
        </button>
      </nav>
    </aside>
  );

  if (activeSubView === 'verifications') {
    return (
      <div className="privacy-settings-layout">
        {renderSidebar()}

        <main className="privacy-content">
          <div className="privacy-section">
            <div className="verifications-back">
              <button className="back-button" onClick={() => setActiveSubView(null)}>
                {'<'} Back
              </button>
            </div>

            <div className="privacy-section-header">
              <h2>Verifications</h2>
              <p>These are your verifications. You can delete them at any time.</p>
            </div>

            <div className="verifications-list">
              <div className="verification-card">
                <div className="verification-header">
                  <h3>{verifications.identity.type}</h3>
                </div>
                <div className="verification-content">
                  {verifications.identity.enabled ? (
                    <>
                      <p><strong>Verified by:</strong> {verifications.identity.verifiedBy || 'Provider unavailable'}</p>
                      <p>{verifications.identity.details || 'No verification details provided.'}</p>
                      <p><strong>Verification Date:</strong> {verifications.identity.verificationDate || 'N/A'}</p>
                    </>
                  ) : (
                    <p>No identity verification is currently saved.</p>
                  )}
                </div>
                <button
                  className="delete-button"
                  onClick={() => handleDeleteVerification('identity')}
                  disabled={!verifications.identity.enabled}
                >
                  Delete
                </button>
              </div>

              <div className="verification-card">
                <div className="verification-header">
                  <h3>{verifications.workplace.type}</h3>
                </div>
                <div className="verification-content">
                  {verifications.workplace.enabled ? (
                    <>
                      <p><strong>Organization:</strong> {verifications.workplace.organization || 'N/A'}</p>
                      <p><strong>Method:</strong> {verifications.workplace.method || 'N/A'}</p>
                      <p><strong>Email:</strong> {verifications.workplace.email || 'N/A'}</p>
                      <p><strong>Verification Date:</strong> {verifications.workplace.verificationDate || 'N/A'}</p>
                    </>
                  ) : (
                    <p>No workplace verification is currently saved.</p>
                  )}
                </div>

                <div className="verification-toggle-section">
                  <div className="toggle-content">
                    <p className="toggle-label">Save your work email to autofill future lead forms</p>
                    <p className="toggle-description">
                      Saving your work email lets Trust node autofill future lead forms.
                    </p>
                  </div>
                  <label className="toggle">
                    <input
                      type="checkbox"
                      checked={verifications.workplace.saveEmail}
                      onChange={(event) => setVerifications((prev) => ({
                        ...prev,
                        workplace: {
                          ...prev.workplace,
                          saveEmail: event.target.checked
                        }
                      }))}
                    />
                    <span className="toggle-slider" />
                  </label>
                </div>

                <button
                  className="delete-button"
                  onClick={() => handleDeleteVerification('workplace')}
                  disabled={!verifications.workplace.enabled}
                >
                  Delete
                </button>
              </div>
            </div>

            <div className="demographic-actions">
              <button className="btn-secondary" onClick={() => setActiveSubView(null)} disabled={saving}>
                Cancel
              </button>
              <button className="btn-primary" onClick={updateSettings} disabled={saving}>
                {saving ? 'Saving...' : 'Save changes'}
              </button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (activeSubView === 'demographic') {
    return (
      <div className="privacy-settings-layout">
        {renderSidebar()}

        <main className="privacy-content">
          <div className="privacy-section">
            <div className="demographic-back">
              <button className="back-button" onClick={() => setActiveSubView(null)}>
                {'<'} Back
              </button>
            </div>

            <div className="privacy-section-header">
              <h2>Demographic info</h2>
            </div>

            <div className="demographic-intro">
              <p>Here is the information you provided. This is not displayed on your profile.</p>
              <p>You can remove personal demographic data in one click.</p>
              <button className="remove-button" onClick={handleRemoveDemographic}>
                Remove
              </button>
            </div>

            <div className="demographic-section">
              <h3 className="demographic-section-title">Gender</h3>
              <label className="demographic-field-label">Select your gender identity</label>
              <select
                value={demographic.gender}
                onChange={(event) => setDemographic({ ...demographic, gender: event.target.value })}
                className="demographic-select"
              >
                <option value="Woman">Woman</option>
                <option value="Man">Man</option>
                <option value="Non-binary">Non-binary</option>
                <option value="Prefer not to say">Prefer not to say</option>
              </select>
            </div>

            <div className="demographic-section">
              <h3 className="demographic-section-title">Disability</h3>
              <label className="demographic-field-label">
                Do you have a disability that substantially limits a major life activity?
              </label>
              <select
                value={demographic.disability}
                onChange={(event) => setDemographic({ ...demographic, disability: event.target.value })}
                className="demographic-select"
              >
                <option value="Yes">Yes</option>
                <option value="No">No</option>
                <option value="Prefer not to say">Prefer not to say</option>
              </select>
            </div>

            <div className="demographic-info-section">
              <h4 className="demographic-info-title">How Trust Node uses this data</h4>
              <p className="demographic-info-text">
                Demographic data is not shown on your public profile. It is used for aggregate insights only.
              </p>
            </div>

            <div className="demographic-actions">
              <button className="btn-secondary" onClick={() => setActiveSubView(null)} disabled={saving}>
                Cancel
              </button>
              <button className="btn-primary" onClick={updateSettings} disabled={saving}>
                {saving ? 'Saving...' : 'Save changes'}
              </button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="privacy-settings-layout">
      {renderSidebar()}

      <main className="privacy-content">
        {activeTab === 'security' && (
          <div className="privacy-section">
            <div className="privacy-section-header">
              <h2>Sign in & security</h2>
              <p>Secure your account and manage login settings.</p>
            </div>

            <div className="settings-items">
              <div className="settings-item toggle-item">
                <div className="settings-item-left">
                  <h4>Activity status</h4>
                  <p>Let people know when you are active</p>
                </div>
                <label className="toggle">
                  <input
                    type="checkbox"
                    checked={settings.activityStatus}
                    onChange={(event) => setSettings({ ...settings, activityStatus: event.target.checked })}
                  />
                  <span className="toggle-slider" />
                </label>
              </div>

              <div className="settings-item toggle-item">
                <div className="settings-item-left">
                  <h4>Allow messages from members</h4>
                  <p>Control who can message you</p>
                </div>
                <label className="toggle">
                  <input
                    type="checkbox"
                    checked={settings.allowMessages}
                    onChange={(event) => setSettings({
                      ...settings,
                      allowMessages: event.target.checked,
                      messagesYouReceive: event.target.checked
                    })}
                  />
                  <span className="toggle-slider" />
                </label>
              </div>

              <div className="settings-item">
                <div className="settings-item-left">
                  <h4>Tagging permissions</h4>
                  <p>Control who can tag you</p>
                </div>
                <div className="settings-item-right">
                  <select
                    value={settings.allowTagging}
                    onChange={(event) => setSettings({ ...settings, allowTagging: event.target.value })}
                    className="settings-select"
                  >
                    <option value="friends">Friends only</option>
                    <option value="everyone">Everyone</option>
                    <option value="no one">No one</option>
                  </select>
                  <span className="arrow-icon">&gt;</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'visibility' && (
          <div className="privacy-section">
            <div className="privacy-section-header">
              <h2>Visibility</h2>
              <p>Control who can see your profile and activity.</p>
            </div>

            <div className="settings-items">
              <div className="settings-item">
                <div className="settings-item-left">
                  <h4>Profile visibility</h4>
                  <p>Control who can view your profile details</p>
                </div>
                <div className="settings-item-right">
                  <select
                    value={settings.profile}
                    onChange={(event) => setSettings({ ...settings, profile: event.target.value })}
                    className="settings-select"
                  >
                    <option value="public">Everyone</option>
                    <option value="friends">Connections only</option>
                    <option value="private">Only me</option>
                  </select>
                  <span className="arrow-icon">&gt;</span>
                </div>
              </div>

              <div className="settings-item">
                <div className="settings-item-left">
                  <h4>Post visibility</h4>
                  <p>New posts will use this visibility automatically</p>
                </div>
                <div className="settings-item-right">
                  <select
                    value={settings.posts}
                    onChange={(event) => setSettings({ ...settings, posts: event.target.value })}
                    className="settings-select"
                  >
                    <option value="public">Everyone</option>
                    <option value="friends">Connections</option>
                    <option value="private">Only me</option>
                  </select>
                  <span className="arrow-icon">&gt;</span>
                </div>
              </div>

              <div className="settings-item toggle-item">
                <div className="settings-item-left">
                  <h4>Search engine visibility</h4>
                  <p>Allow search engines to index your profile</p>
                </div>
                <label className="toggle">
                  <input
                    type="checkbox"
                    checked={settings.searchEngineVisibility}
                    onChange={(event) => setSettings({ ...settings, searchEngineVisibility: event.target.checked })}
                  />
                  <span className="toggle-slider" />
                </label>
              </div>

              <div className="settings-item toggle-item">
                <div className="settings-item-left">
                  <h4>Activity visibility</h4>
                  <p>Show others when you are active</p>
                </div>
                <label className="toggle">
                  <input
                    type="checkbox"
                    checked={settings.activityStatus}
                    onChange={(event) => setSettings({ ...settings, activityStatus: event.target.checked })}
                  />
                  <span className="toggle-slider" />
                </label>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'data' && (
          <div className="privacy-section">
            <div className="privacy-section-header">
              <h2>Data privacy</h2>
              <p>Manage how your data is used and shared.</p>
            </div>

            <div className="settings-items">
              <div className="settings-group-header">Who can reach you</div>

              <div className="settings-item toggle-item">
                <div className="settings-item-left">
                  <h4>Connection requests</h4>
                  <p>Allow members to send you connection requests</p>
                </div>
                <label className="toggle">
                  <input
                    type="checkbox"
                    checked={settings.allowConnectionRequests}
                    onChange={(event) => setSettings({ ...settings, allowConnectionRequests: event.target.checked })}
                  />
                  <span className="toggle-slider" />
                </label>
              </div>

              <div className="settings-item toggle-item">
                <div className="settings-item-left">
                  <h4>Invitations from your network</h4>
                </div>
                <label className="toggle">
                  <input
                    type="checkbox"
                    checked={settings.invitationsFromNetwork}
                    onChange={(event) => setSettings({ ...settings, invitationsFromNetwork: event.target.checked })}
                  />
                  <span className="toggle-slider" />
                </label>
              </div>

              <div className="settings-item toggle-item">
                <div className="settings-item-left">
                  <h4>Messages and chat</h4>
                  <p>Allow members to send you direct messages</p>
                </div>
                <label className="toggle">
                  <input
                    type="checkbox"
                    checked={settings.allowMessages}
                    onChange={(event) => setSettings({
                      ...settings,
                      allowMessages: event.target.checked,
                      messagesYouReceive: event.target.checked
                    })}
                  />
                  <span className="toggle-slider" />
                </label>
              </div>

              <div className="settings-item toggle-item">
                <div className="settings-item-left">
                  <h4>Research invitations</h4>
                </div>
                <label className="toggle">
                  <input
                    type="checkbox"
                    checked={settings.researchInvitations}
                    onChange={(event) => setSettings({ ...settings, researchInvitations: event.target.checked })}
                  />
                  <span className="toggle-slider" />
                </label>
              </div>

              <div className="settings-item toggle-item">
                <div className="settings-item-left">
                  <h4>Marketing emails and promotions</h4>
                </div>
                <label className="toggle">
                  <input
                    type="checkbox"
                    checked={settings.marketingEmails}
                    onChange={(event) => setSettings({ ...settings, marketingEmails: event.target.checked })}
                  />
                  <span className="toggle-slider" />
                </label>
              </div>

              <div className="settings-item toggle-item">
                <div className="settings-item-left">
                  <h4>Share usage data</h4>
                  <p>Help us improve by sharing your activity data</p>
                </div>
                <label className="toggle">
                  <input
                    type="checkbox"
                    checked={settings.dataSharing}
                    onChange={(event) => setSettings({ ...settings, dataSharing: event.target.checked })}
                  />
                  <span className="toggle-slider" />
                </label>
              </div>

              <div
                className="settings-item"
                role="button"
                tabIndex={0}
                onClick={() => setActiveSubView('demographic')}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') setActiveSubView('demographic');
                }}
              >
                <div className="settings-item-left">
                  <h4>Demographic info</h4>
                  <p>View and control stored demographic data</p>
                </div>
                <div className="settings-item-right">
                  <span className="arrow-icon">&gt;</span>
                </div>
              </div>

              <div
                className="settings-item"
                role="button"
                tabIndex={0}
                onClick={() => setActiveSubView('verifications')}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') setActiveSubView('verifications');
                }}
              >
                <div className="settings-item-left">
                  <h4>Verifications</h4>
                  <p>Manage identity and workplace verification records</p>
                </div>
                <div className="settings-item-right">
                  <span className="arrow-icon">&gt;</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'messaging' && (
          <div className="privacy-section">
            <div className="privacy-section-header">
              <h2>Messaging experience</h2>
              <p>Control your messaging preferences and notifications.</p>
            </div>

            <div className="settings-items">
              <div className="settings-item toggle-item">
                <div className="settings-item-left">
                  <h4>Allow direct messages and chat</h4>
                </div>
                <label className="toggle">
                  <input
                    type="checkbox"
                    checked={settings.allowMessages}
                    onChange={(event) => setSettings({
                      ...settings,
                      allowMessages: event.target.checked,
                      messagesYouReceive: event.target.checked
                    })}
                  />
                  <span className="toggle-slider" />
                </label>
              </div>

              <div className="settings-item toggle-item">
                <div className="settings-item-left">
                  <h4>Focused Inbox</h4>
                </div>
                <label className="toggle">
                  <input
                    type="checkbox"
                    checked={settings.focusedInbox}
                    onChange={(event) => setSettings({ ...settings, focusedInbox: event.target.checked })}
                  />
                  <span className="toggle-slider" />
                </label>
              </div>

              <div className="settings-item toggle-item">
                <div className="settings-item-left">
                  <h4>Delivery and typing indicators</h4>
                </div>
                <label className="toggle">
                  <input
                    type="checkbox"
                    checked={settings.deliveryIndicators}
                    onChange={(event) => setSettings({ ...settings, deliveryIndicators: event.target.checked })}
                  />
                  <span className="toggle-slider" />
                </label>
              </div>

              <div className="settings-item toggle-item">
                <div className="settings-item-left">
                  <h4>Messaging suggestions</h4>
                </div>
                <label className="toggle">
                  <input
                    type="checkbox"
                    checked={settings.messagingSuggestions}
                    onChange={(event) => setSettings({ ...settings, messagingSuggestions: event.target.checked })}
                  />
                  <span className="toggle-slider" />
                </label>
              </div>

              <div className="settings-item toggle-item">
                <div className="settings-item-left">
                  <h4>Message nudges</h4>
                </div>
                <label className="toggle">
                  <input
                    type="checkbox"
                    checked={settings.messageNudges}
                    onChange={(event) => setSettings({ ...settings, messageNudges: event.target.checked })}
                  />
                  <span className="toggle-slider" />
                </label>
              </div>

              <div className="settings-item toggle-item">
                <div className="settings-item-left">
                  <h4>Harmful message detection</h4>
                </div>
                <label className="toggle">
                  <input
                    type="checkbox"
                    checked={settings.harmfulMessageDetection}
                    onChange={(event) => setSettings({ ...settings, harmfulMessageDetection: event.target.checked })}
                  />
                  <span className="toggle-slider" />
                </label>
              </div>
            </div>
          </div>
        )}

        <div className="privacy-actions">
          <button className="btn-secondary" onClick={fetchSettings} disabled={saving}>
            Reset
          </button>
          <button className="btn-primary" onClick={updateSettings} disabled={saving}>
            {saving ? 'Saving...' : 'Save changes'}
          </button>
        </div>
      </main>
    </div>
  );
};

export default PrivacySettings;

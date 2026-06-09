import React, { useState } from 'react';
import { useSettings } from '../context/SettingsContext';

/* ── Reusable primitives ─────────────────────────────────────────────────── */

const Toggle: React.FC<{ checked: boolean; onChange: (v: boolean) => void; id: string }> = ({
  checked, onChange, id,
}) => (
  <label className="stg-toggle" htmlFor={id}>
    <input
      type="checkbox"
      id={id}
      checked={checked}
      onChange={e => onChange(e.target.checked)}
      className="stg-toggle__input"
    />
    <span className="stg-toggle__track">
      <span className="stg-toggle__thumb" />
    </span>
  </label>
);

const SettingsRow: React.FC<{
  label: string;
  sublabel?: string;
  control: React.ReactNode;
}> = ({ label, sublabel, control }) => (
  <div className="stg-row">
    <div className="stg-row__text">
      <span className="stg-row__label">{label}</span>
      {sublabel && <span className="stg-row__sub">{sublabel}</span>}
    </div>
    <div className="stg-row__control">{control}</div>
  </div>
);

const SectionCard: React.FC<{
  icon: string;
  title: string;
  children: React.ReactNode;
  id: string;
}> = ({ icon, title, children, id }) => (
  <div className="stg-section glass-panel" id={id}>
    <div className="stg-section__header">
      <span className="stg-section__icon">{icon}</span>
      <h2 className="stg-section__title">{title}</h2>
    </div>
    <div className="stg-section__body">{children}</div>
  </div>
);

/* ── Settings Page ───────────────────────────────────────────────────────── */
const ALERT_OPTIONS = [2, 5, 10, 15, 30, 60];
const ALERT_LABELS: Record<number, string> = {
  2: '2 min', 5: '5 min', 10: '10 min',
  15: '15 min', 30: '30 min', 60: '1 hour',
};

import { useGoogleAuth } from '../context/GoogleAuthContext';

const SECTIONS = [
  { id: 'notifications', label: 'Notifications', icon: '🔔' },
  { id: 'calendar', label: 'Calendar', icon: '📅' },
  { id: 'recording', label: 'Recording', icon: '📋' },
  { id: 'profile', label: 'Profile', icon: '👤' },
  { id: 'theme', label: 'Theme', icon: '🎨' },
  { id: 'account', label: 'Account', icon: '🔐' },
];

const SettingsPage: React.FC = () => {
  const { settings, updateSettings, resetSettings, savedFlash } = useSettings();
  const { isConnected, disconnect } = useGoogleAuth();
  const [activeSection, setActiveSection] = useState('notifications');
  const [confirmReset, setConfirmReset] = useState(false);

  // Load user data from localStorage
  const storedUser = JSON.parse(localStorage.getItem('auth_user') || '{}');
  // isGoogleUser: true means they logged in via Google OAuth — username (login email) is read-only,
  // but they CAN still set a site-specific password.
  const isGoogleUser = !!storedUser.isGoogleUser;
  const [accUsername, setAccUsername] = useState(storedUser.username || '');
  const [accPassword, setAccPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateError, setUpdateError] = useState('');
  const [updateSuccess, setUpdateSuccess] = useState('');

  const handleUpdateAccount = async (e: React.FormEvent) => {
    e.preventDefault();

    // For Google users, we only send password (they can't change their login email)
    if (!isGoogleUser && !accUsername.trim()) {
      setUpdateError('Username cannot be empty.');
      return;
    }
    if (accPassword && accPassword !== confirmPassword) {
      setUpdateError('Passwords do not match.');
      return;
    }
    if (!accPassword && isGoogleUser) {
      setUpdateError('Please enter a new password.');
      return;
    }

    setIsUpdating(true);
    setUpdateError('');
    setUpdateSuccess('');

    try {
      const token = localStorage.getItem('auth_token');
      const body: Record<string, string> = {};
      if (!isGoogleUser) body.username = accUsername.trim();
      if (accPassword) body.password = accPassword;

      const response = await fetch('http://localhost:5000/api/user/update', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });

      const data = await response.json();
      if (!response.ok) {
        setUpdateError(data.error || 'Failed to update account.');
      } else {
        setUpdateSuccess(data.message || 'Account updated successfully!');
        if (data.user) {
          const current = JSON.parse(localStorage.getItem('auth_user') || '{}');
          localStorage.setItem('auth_user', JSON.stringify({
            ...current,
            id: data.user.id,
            name: data.user.name,
            username: data.user.email,
          }));
        }
        setAccPassword('');
        setConfirmPassword('');
      }
    } catch (err) {
      console.error(err);
      setUpdateError('Could not connect to server.');
    } finally {
      setIsUpdating(false);
    }
  };

  const toggleAlertTiming = (mins: number) => {
    const next = settings.alertTimings.includes(mins)
      ? settings.alertTimings.filter(t => t !== mins)
      : [...settings.alertTimings, mins].sort((a, b) => a - b);
    if (next.length > 0) updateSettings({ alertTimings: next });
  };

  const goTo = (id: string) => setActiveSection(id);

  return (
    <section className="stg-page animate-fade-in">

      {/* ── Page Header ── */}
      <div className="stg-header">
        <div>
          <h1 className="stg-header__title">Settings</h1>
          <p className="stg-header__sub">Manage your preferences and account</p>
        </div>
        {savedFlash && (
          <div className="stg-saved-badge">✓ Saved</div>
        )}
      </div>

      <div className="stg-layout">

        {/* ── Sticky side nav ── */}
        <nav className="stg-sidenav glass-panel">
          {SECTIONS.map(s => (
            <button
              key={s.id}
              className={`stg-sidenav__item ${activeSection === s.id ? 'active' : ''}`}
              onClick={() => goTo(s.id)}
            >
              <span className="stg-sidenav__icon">{s.icon}</span>
              <span>{s.label}</span>
            </button>
          ))}
        </nav>

        {/* ── Content — only the active section is rendered ── */}
        <div key={activeSection} className="stg-content animate-fade-in">

          {activeSection === 'notifications' && (
            <SectionCard icon="🔔" title="Notifications &amp; Alerts" id="stg-notifications">

              <div className="stg-field">
                <label className="stg-field__label">Alert me before meeting</label>
                <p className="stg-field__sub">Select one or more reminders (at least one required)</p>
                <div className="stg-chip-group">
                  {ALERT_OPTIONS.map(mins => (
                    <button
                      key={mins}
                      className={`stg-chip ${settings.alertTimings.includes(mins) ? 'active' : ''}`}
                      onClick={() => toggleAlertTiming(mins)}
                    >
                      {ALERT_LABELS[mins]}
                    </button>
                  ))}
                </div>
              </div>

              <div className="stg-divider" />

              <SettingsRow
                label="Alert type"
                sublabel="How you receive reminders"
                control={
                  <select
                    className="stg-select"
                    value={settings.alertType}
                    onChange={e => updateSettings({ alertType: e.target.value as any })}
                  >
                    <option value="banner">In-app banner only</option>
                    <option value="notification">Browser notification only</option>
                    <option value="both">Both</option>
                  </select>
                }
              />

              <SettingsRow
                label="Alert sound"
                sublabel="Play a chime when a reminder fires"
                control={
                  <Toggle
                    id="alert-sound"
                    checked={settings.alertSound}
                    onChange={v => updateSettings({ alertSound: v })}
                  />
                }
              />

              <SettingsRow
                label="Repeat alert"
                sublabel="Re-notify if you dismiss the first reminder"
                control={
                  <Toggle
                    id="repeat-alert"
                    checked={settings.repeatAlert}
                    onChange={v => updateSettings({ repeatAlert: v })}
                  />
                }
              />

              {settings.repeatAlert && (
                <SettingsRow
                  label="Repeat interval"
                  sublabel="How many minutes between repeats"
                  control={
                    <select
                      className="stg-select"
                      value={settings.repeatIntervalMins}
                      onChange={e => updateSettings({ repeatIntervalMins: Number(e.target.value) })}
                    >
                      {[2, 5, 10, 15].map(v => (
                        <option key={v} value={v}>{v} min</option>
                      ))}
                    </select>
                  }
                />
              )}
            </SectionCard>
          )}

          {activeSection === 'calendar' && (
            <SectionCard icon="📅" title="Calendar" id="stg-calendar">

              <div className="stg-connected-account">
                <div className="stg-connected-account__icon">
                  {isConnected ? '🟢' : '⚪'}
                </div>
                <div className="stg-connected-account__info">
                  <span className="stg-connected-account__label">
                    {isConnected ? 'Google Calendar connected' : 'No calendar connected'}
                  </span>
                  <span className="stg-connected-account__sub">
                    {isConnected
                      ? 'Your events are syncing automatically'
                      : 'Go to the Calendar tab to connect'}
                  </span>
                </div>
                {isConnected && (
                  <button className="stg-btn stg-btn--danger" onClick={disconnect}>
                    Disconnect
                  </button>
                )}
              </div>

              <div className="stg-divider" />

              <SettingsRow
                label="Auto-refresh interval"
                sublabel="How often to pull new events from Google Calendar"
                control={
                  <select
                    className="stg-select"
                    value={settings.syncFrequencyMins}
                    onChange={e => updateSettings({ syncFrequencyMins: Number(e.target.value) })}
                  >
                    <option value={0}>Manual only</option>
                    <option value={5}>Every 5 minutes</option>
                    <option value={15}>Every 15 minutes</option>
                    <option value={30}>Every 30 minutes</option>
                    <option value={60}>Every hour</option>
                  </select>
                }
              />

              <SettingsRow
                label="Lookahead window"
                sublabel="How far ahead to fetch events"
                control={
                  <select
                    className="stg-select"
                    value={settings.lookaheadDays}
                    onChange={e => updateSettings({ lookaheadDays: Number(e.target.value) })}
                  >
                    <option value={7}>1 week</option>
                    <option value={30}>1 month</option>
                    <option value={90}>3 months</option>
                    <option value={180}>6 months</option>
                  </select>
                }
              />
            </SectionCard>
          )}

          {activeSection === 'recording' && (
            <SectionCard icon="📋" title="Event Recording" id="stg-recording">

              <SettingsRow
                label="Auto-log attended meetings"
                sublabel="Automatically mark past meetings as completed"
                control={
                  <Toggle
                    id="auto-log"
                    checked={settings.autoLogMeetings}
                    onChange={v => updateSettings({ autoLogMeetings: v })}
                  />
                }
              />

              <SettingsRow
                label="History retention"
                sublabel="How long to keep completed meeting records"
                control={
                  <select
                    className="stg-select"
                    value={settings.historyRetentionDays}
                    onChange={e => updateSettings({ historyRetentionDays: Number(e.target.value) })}
                  >
                    <option value={7}>7 days</option>
                    <option value={30}>30 days</option>
                    <option value={90}>90 days</option>
                    <option value={365}>1 year</option>
                    <option value={0}>Forever</option>
                  </select>
                }
              />
            </SectionCard>
          )}

          {activeSection === 'profile' && (
            <SectionCard icon="👤" title="Profile" id="stg-profile">

              <div className="stg-field">
                <label className="stg-field__label" htmlFor="display-name">Display name</label>
                <input
                  id="display-name"
                  className="form-input"
                  placeholder="Your name"
                  value={settings.displayName}
                  onChange={e => updateSettings({ displayName: e.target.value })}
                />
              </div>

              <SettingsRow
                label="Timezone"
                sublabel={`Detected: ${Intl.DateTimeFormat().resolvedOptions().timeZone}`}
                control={
                  <select
                    className="stg-select"
                    value={settings.timezone}
                    onChange={e => updateSettings({ timezone: e.target.value })}
                  >
                    {[
                      'Asia/Kolkata', 'UTC', 'America/New_York', 'America/Los_Angeles',
                      'Europe/London', 'Europe/Berlin', 'Asia/Tokyo', 'Asia/Singapore',
                      'Australia/Sydney',
                    ].map(tz => (
                      <option key={tz} value={tz}>{tz}</option>
                    ))}
                  </select>
                }
              />
            </SectionCard>
          )}

          {activeSection === 'theme' && (
            <SectionCard icon="🎨" title="Theme Settings" id="stg-theme">
              <SettingsRow
                label="App Theme"
                sublabel="Switch between light and dark mode"
                control={
                  <select
                    className="stg-select"
                    value={settings.theme || 'dark'}
                    onChange={e => updateSettings({ theme: e.target.value as 'light' | 'dark' })}
                  >
                    <option value="dark">Dark Theme</option>
                    <option value="light">Light Theme</option>
                  </select>
                }
              />
            </SectionCard>
          )}

          {activeSection === 'account' && (
            <SectionCard icon="🔐" title="Account Settings" id="stg-account">

              <form onSubmit={handleUpdateAccount} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '2rem' }}>

                {/* Username — read-only for Google users, editable for local */}
                <div className="stg-field">
                  <label className="stg-field__label" htmlFor="acc-username">Username</label>
                  <input
                    id="acc-username"
                    className="form-input"
                    placeholder="Enter username"
                    value={accUsername}
                    onChange={e => setAccUsername(e.target.value)}
                    disabled={isGoogleUser}
                    style={isGoogleUser ? { opacity: 0.65, cursor: 'not-allowed' } : {}}
                  />
                  {isGoogleUser && (
                    <span className="stg-field__sub">
                      Your login email is managed by Google and cannot be changed here.
                    </span>
                  )}
                </div>

                {/* Password — editable for ALL users, including Google */}
                <div className="stg-field">
                  <label className="stg-field__label" htmlFor="acc-password">
                    {isGoogleUser ? 'Set site password' : 'New password'}
                  </label>
                  <input
                    id="acc-password"
                    type="password"
                    className="form-input"
                    placeholder="••••••••"
                    value={accPassword}
                    onChange={e => setAccPassword(e.target.value)}
                  />
                  <span className="stg-field__sub">
                    {isGoogleUser
                      ? 'Set a password to also log in directly with your email.'
                      : 'Leave blank to keep your current password.'}
                  </span>
                </div>

                <div className="stg-field">
                  <label className="stg-field__label" htmlFor="acc-confirm-password">Confirm password</label>
                  <input
                    id="acc-confirm-password"
                    type="password"
                    className="form-input"
                    placeholder="••••••••"
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                  />
                </div>

                {updateError && (
                  <div style={{ color: 'var(--danger)', fontSize: '0.85rem', fontWeight: 500 }}>
                    ⚠️ {updateError}
                  </div>
                )}

                {updateSuccess && (
                  <div style={{ color: 'var(--success)', fontSize: '0.85rem', fontWeight: 500 }}>
                    ✓ {updateSuccess}
                  </div>
                )}

                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ width: 'fit-content', marginTop: '0.5rem' }}
                  disabled={isUpdating}
                >
                  {isUpdating ? 'Saving...' : 'Save Changes'}
                </button>
              </form>

              <div className="stg-divider" style={{ margin: '1.5rem 0' }} />

              <div className="stg-danger-zone">
                <div>
                  <span className="stg-row__label">Reset all settings</span>
                  <span className="stg-row__sub" style={{ display: 'block' }}>
                    Restore all preferences to their defaults
                  </span>
                </div>
                {!confirmReset ? (
                  <button className="stg-btn stg-btn--ghost" onClick={() => setConfirmReset(true)}>
                    Reset to defaults
                  </button>
                ) : (
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                      className="stg-btn stg-btn--danger"
                      onClick={() => { resetSettings(); setConfirmReset(false); }}
                    >
                      Confirm reset
                    </button>
                    <button className="stg-btn stg-btn--ghost" onClick={() => setConfirmReset(false)}>
                      Cancel
                    </button>
                  </div>
                )}
              </div>

            </SectionCard>
          )}

        </div>
      </div>
    </section>
  );
};

export default SettingsPage;

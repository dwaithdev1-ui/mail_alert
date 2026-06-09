import React, { useState } from 'react';
import { useGmail } from '../hooks/useGmail';
import { useGoogleAuth } from '../context/GoogleAuthContext';
import { useCalendarContext } from '../context/CalendarContext';
import { useToast } from '../context/ToastContext';

const MailScanner: React.FC = () => {
  const { isLoading: gmailLoading, emails, error: gmailError, scanEmails } = useGmail();
  const { isConnected, connect, disconnect, isLoading: authLoading, error: authError } = useGoogleAuth();
  const { addLocalEvent, events: calendarEvents } = useCalendarContext();
  const { showToast } = useToast();
  
  // Default query changed to empty to ensure read emails are also scanned
  const [query, setQuery] = useState('');

  const isLoading = gmailLoading || authLoading;
  const error = authError || gmailError;

  const handleScan = (e: React.FormEvent) => {
    e.preventDefault();
    scanEmails(query);
  };

  const meetingEmails = emails.filter(email => email.meetingLinks && email.meetingLinks.length > 0);

  // Group emails by meeting date
  const todayDate = new Date();
  const startOfToday = new Date(todayDate.getFullYear(), todayDate.getMonth(), todayDate.getDate());
  
  const startOfTomorrow = new Date(startOfToday);
  startOfTomorrow.setDate(startOfToday.getDate() + 1);
  
  const startOfAfterTomorrow = new Date(startOfToday);
  startOfAfterTomorrow.setDate(startOfToday.getDate() + 2);

  const groups = {
    today: [] as typeof meetingEmails,
    tomorrow: [] as typeof meetingEmails,
    upcoming: [] as typeof meetingEmails,
    past: [] as typeof meetingEmails,
  };

  meetingEmails.forEach(email => {
    const start = new Date(email.extractedMeetingTime || email.date);
    if (start < startOfToday) {
      groups.past.push(email);
    } else if (start >= startOfToday && start < startOfTomorrow) {
      groups.today.push(email);
    } else if (start >= startOfTomorrow && start < startOfAfterTomorrow) {
      groups.tomorrow.push(email);
    } else {
      groups.upcoming.push(email);
    }
  });

  const ascSort = (a: typeof meetingEmails[0], b: typeof meetingEmails[0]) => {
    return new Date(a.extractedMeetingTime || a.date).getTime() - new Date(b.extractedMeetingTime || b.date).getTime();
  };

  const descSort = (a: typeof meetingEmails[0], b: typeof meetingEmails[0]) => {
    return new Date(b.extractedMeetingTime || b.date).getTime() - new Date(a.extractedMeetingTime || a.date).getTime();
  };

  groups.today.sort(ascSort);
  groups.tomorrow.sort(ascSort);
  groups.upcoming.sort(ascSort);
  groups.past.sort(descSort);

  const renderEmailCard = (email: typeof meetingEmails[0]) => {
    const eventId = `local-${email.id}`;
    const isAdded = calendarEvents.some(e => e.id === eventId);
    
    const start = new Date(email.extractedMeetingTime || email.date);
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    
    // Consider it past due if the meeting start time has already passed
    const isPastDue = start < new Date();

    return (
      <div key={email.id} className="glass-panel" style={{ 
        padding: '1.5rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '1rem',
        borderLeft: email.extractedMeetingTime ? '4px solid var(--success)' : '4px solid var(--accent-primary)',
        position: 'relative'
      }}>
        
        {/* Header row: From and Date */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'var(--accent-primary)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>
              {email.from.charAt(0).toUpperCase()}
            </div>
            <strong style={{ fontSize: '1rem', color: 'var(--text-primary)' }}>{email.from.split('<')[0].trim()}</strong>
          </div>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            {new Date(email.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>

        {/* Subject */}
        <h3 style={{ fontSize: '1.15rem', margin: '0', color: 'var(--text-primary)' }}>
          {email.subject}
        </h3>
        
        {/* Snippet */}
        <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.95rem', lineHeight: '1.5' }}>
          {email.snippet}
        </p>

        {/* Extracted Details & Links */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', marginTop: '0.5rem' }}>
          {email.extractedMeetingTime && (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(16, 185, 129, 0.1)', color: 'var(--success)', padding: '0.4rem 0.75rem', borderRadius: '20px', fontSize: '0.85rem', fontWeight: '500' }}>
              <span>🗓️</span>
              {new Date(email.extractedMeetingTime).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </div>
          )}
          
          {email.meetingLinks.map((link, idx) => (
            <a 
              key={idx} 
              href={link} 
              target="_blank" 
              rel="noopener noreferrer" 
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(14, 165, 233, 0.1)', color: 'var(--accent-primary)', padding: '0.4rem 0.75rem', borderRadius: '20px', fontSize: '0.85rem', fontWeight: '500', textDecoration: 'none' }}
            >
              <span>🔗</span>
              {new URL(link).hostname}
            </a>
          ))}
        </div>

        {/* Action Bar */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.5rem', paddingTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
          {isPastDue ? (
            <button 
              className="btn" 
              style={{ padding: '0.5rem 1.25rem', fontSize: '0.9rem', background: 'rgba(220, 38, 38, 0.1)', color: 'var(--danger)', cursor: 'default' }}
              disabled
            >
              Meeting Past Due
            </button>
          ) : isAdded ? (
            <button 
              className="btn" 
              style={{ padding: '0.5rem 1.25rem', fontSize: '0.9rem', background: 'rgba(16, 185, 129, 0.1)', color: 'var(--success)', cursor: 'default' }}
              disabled
            >
              ✓ Added to Calendar
            </button>
          ) : (
            <button 
              className="btn btn-primary" 
              style={{ padding: '0.5rem 1.25rem', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
              onClick={() => {
                let shortTitle = email.subject.replace(/^(Re|Fwd|FW|RE):\s*/gi, '').trim();
                if (shortTitle.length > 30) {
                  shortTitle = shortTitle.substring(0, 27) + '...';
                }
                if (!shortTitle) shortTitle = 'Meeting';

                addLocalEvent({
                  id: eventId,
                  title: shortTitle,
                  start: start.toISOString(),
                  end: end.toISOString(),
                  description: `Added from Meeting Scanner.\nLink: ${email.meetingLinks[0]}`,
                  location: 'Online',
                  colorId: '7',
                  isAllDay: false
                });
                showToast(email.extractedMeetingTime 
                  ? 'Meeting scheduled at detected time!' 
                  : 'Meeting added using email received time.');
              }}
            >
              <span>+</span> Add to Calendar
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <section className="stg-page animate-fade-in" style={{ padding: '2rem' }}>
      <div className="stg-header">
        <div>
          <h1 className="stg-header__title">Meeting Scanner</h1>
          <p className="stg-header__sub">Connect your Gmail to scan unread emails and extract meeting links</p>
        </div>
      </div>

      <div className="stg-layout" style={{ gridTemplateColumns: '1fr', marginTop: '2rem' }}>
        <div className="stg-section glass-panel">
          <div className="stg-section__header">
            <span className="stg-section__icon">📧</span>
            <h2 className="stg-section__title">Gmail Connection</h2>
          </div>
          
          <div className="stg-section__body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {!isConnected ? (
              <div>
                <p style={{ color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                  Google Services are not connected. Please activate Google Services from the Dashboard, or click below.
                </p>
                <button className="btn btn-primary" onClick={connect} disabled={isLoading}>
                  {isLoading ? 'Connecting...' : 'Connect Google Services'}
                </button>
              </div>
            ) : (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
                  <span style={{ color: 'var(--success)', fontWeight: 'bold' }}>✓ Connected to Google Services</span>
                  <button className="btn" style={{ background: 'var(--btn-ghost-bg)', color: 'var(--text-primary)' }} onClick={disconnect}>
                    Disconnect
                  </button>
                </div>
                
                <form onSubmit={handleScan} style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                  <input 
                    type="text" 
                    className="form-input" 
                    placeholder="Search query (e.g. from:boss@company.com subject:urgent)" 
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    style={{ flex: 1 }}
                  />
                  <button type="submit" className="btn btn-primary" disabled={isLoading}>
                    {isLoading ? 'Scanning...' : 'Scan'}
                  </button>
                </form>
              </div>
            )}
            
            {error && (
              <div style={{ padding: '1rem', background: 'rgba(220, 38, 38, 0.1)', color: 'var(--danger)', borderRadius: '8px', marginTop: '1rem' }}>
                <strong>Error: </strong> {error}
              </div>
            )}
          </div>
        </div>

        {isConnected && (
          <div className="stg-section glass-panel" style={{ marginTop: '2rem' }}>
             <div className="stg-section__header">
              <span className="stg-section__icon">📊</span>
              <h2 className="stg-section__title">Meeting Results {meetingEmails.length > 0 && `(${meetingEmails.length})`}</h2>
            </div>
            <div className="stg-section__body">
              {isLoading && emails.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>
                  Scanning inbox...
                </div>
              ) : meetingEmails.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>
                  {emails.length === 0 ? 'No emails found for this query.' : 'No meeting links found in recent emails.'}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                  {/* Today group */}
                  {groups.today.length > 0 && (
                    <div>
                      <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.1rem', color: 'var(--accent-primary)', marginBottom: '1rem', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '0.5rem' }}>
                        <span>📅</span> Today ({groups.today.length})
                      </h3>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        {groups.today.map(email => renderEmailCard(email))}
                      </div>
                    </div>
                  )}

                  {/* Tomorrow group */}
                  {groups.tomorrow.length > 0 && (
                    <div>
                      <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.1rem', color: '#f59e0b', marginBottom: '1rem', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '0.5rem' }}>
                        <span>🌅</span> Tomorrow ({groups.tomorrow.length})
                      </h3>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        {groups.tomorrow.map(email => renderEmailCard(email))}
                      </div>
                    </div>
                  )}

                  {/* Upcoming group */}
                  {groups.upcoming.length > 0 && (
                    <div>
                      <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.1rem', color: 'var(--success)', marginBottom: '1rem', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '0.5rem' }}>
                        <span>🚀</span> Upcoming ({groups.upcoming.length})
                      </h3>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        {groups.upcoming.map(email => renderEmailCard(email))}
                      </div>
                    </div>
                  )}

                  {/* Past group */}
                  {groups.past.length > 0 && (
                    <div>
                      <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.1rem', color: 'var(--text-secondary)', marginBottom: '1rem', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '0.5rem' }}>
                        <span>⏱️</span> Past Meetings ({groups.past.length})
                      </h3>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        {groups.past.map(email => renderEmailCard(email))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
};

export default MailScanner;

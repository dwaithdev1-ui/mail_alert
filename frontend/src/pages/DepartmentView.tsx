import React, { useState, useMemo, useEffect } from 'react';
import { useGmail } from '../hooks/useGmail';
import { useGoogleAuth } from '../context/GoogleAuthContext';
import { useCalendarContext } from '../context/CalendarContext';
import { useToast } from '../context/ToastContext';

const DepartmentView: React.FC = () => {
  const { isLoading: gmailLoading, emails, error: gmailError, scanEmails } = useGmail();
  const { isConnected, connect, disconnect, isLoading: authLoading, error: authError } = useGoogleAuth();
  const { addLocalEvent, events: calendarEvents } = useCalendarContext();
  const { showToast } = useToast();
  
  const [query, setQuery] = useState('');
  const [activeTab, setActiveTab] = useState<string>('');

  const isLoading = gmailLoading || authLoading;
  const error = authError || gmailError;

  const handleScan = (e: React.FormEvent) => {
    e.preventDefault();
    scanEmails(query);
  };

  const meetingEmails = emails.filter(email => email.meetingLinks && email.meetingLinks.length > 0);

  const dynamicDepartments = useMemo(() => {
    const depts = new Set(meetingEmails.map(e => e.department));
    return Array.from(depts).sort();
  }, [meetingEmails]);

  useEffect(() => {
    if (dynamicDepartments.length > 0 && (!activeTab || !dynamicDepartments.includes(activeTab))) {
      setActiveTab(dynamicDepartments[0]);
    }
  }, [dynamicDepartments, activeTab]);

  // Group emails by department
  const groupedEmails = useMemo(() => {
    const groups: Record<string, typeof meetingEmails> = {};
    dynamicDepartments.forEach(d => groups[d] = []);
    
    meetingEmails.forEach(email => {
      if (!groups[email.department]) {
        groups[email.department] = [];
      }
      groups[email.department].push(email);
    });
    return groups;
  }, [meetingEmails, dynamicDepartments]);

  return (
    <section className="stg-page animate-fade-in" style={{ padding: '2rem' }}>
      <div className="stg-header">
        <div>
          <h1 className="stg-header__title">Department View</h1>
          <p className="stg-header__sub">Your meetings intelligently categorized by department.</p>
        </div>
      </div>

      <div className="stg-layout" style={{ gridTemplateColumns: '1fr', marginTop: '2rem' }}>
        <div className="stg-section glass-panel">
          <div className="stg-section__header">
            <span className="stg-section__icon">🏢</span>
            <h2 className="stg-section__title">Categorizer Engine</h2>
          </div>
          
          <div className="stg-section__body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {!isConnected ? (
              <div>
                <p style={{ color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                  Google Services are not connected. Please activate Google Services.
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
                    placeholder="Search query (leave blank for latest)" 
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    style={{ flex: 1 }}
                  />
                  <button type="submit" className="btn btn-primary" disabled={isLoading}>
                    {isLoading ? 'Scanning...' : 'Scan & Categorize'}
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

        {isConnected && meetingEmails.length > 0 && (
          <div className="stg-section glass-panel" style={{ marginTop: '2rem', padding: '0', overflow: 'hidden' }}>
            {/* Tabs */}
            <div style={{ display: 'flex', overflowX: 'auto', borderBottom: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.2)' }}>
              {dynamicDepartments.map(dept => {
                const count = groupedEmails[dept]?.length || 0;
                return (
                  <button
                    key={dept}
                    onClick={() => setActiveTab(dept)}
                    style={{
                      padding: '1rem 1.5rem',
                      background: 'none',
                      border: 'none',
                      borderBottom: activeTab === dept ? '2px solid var(--accent-primary)' : '2px solid transparent',
                      color: activeTab === dept ? 'var(--accent-primary)' : 'var(--text-secondary)',
                      fontSize: '0.95rem',
                      fontWeight: activeTab === dept ? 'bold' : 'normal',
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                      transition: 'all 0.2s',
                      opacity: count === 0 && activeTab !== dept ? 0.5 : 1
                    }}
                  >
                    {dept} <span style={{ marginLeft: '0.5rem', background: activeTab === dept ? 'var(--accent-primary)' : 'rgba(255,255,255,0.1)', color: activeTab === dept ? '#fff' : 'var(--text-secondary)', padding: '0.1rem 0.5rem', borderRadius: '12px', fontSize: '0.75rem' }}>{count}</span>
                  </button>
                );
              })}
            </div>

            <div className="stg-section__body" style={{ padding: '2rem' }}>
              {groupedEmails[activeTab]?.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
                  <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📭</div>
                  No meetings categorized under <strong>{activeTab}</strong>.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                  {groupedEmails[activeTab]?.map(email => (
                    <div key={email.id} className="glass-panel" style={{ 
                      padding: '1.5rem',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '1rem',
                      borderLeft: email.extractedMeetingTime ? '4px solid var(--success)' : '4px solid var(--accent-primary)',
                      position: 'relative',
                      background: 'rgba(255,255,255,0.02)'
                    }}>
                      
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

                      <h3 style={{ fontSize: '1.15rem', margin: '0', color: 'var(--text-primary)' }}>
                        {email.subject}
                      </h3>
                      
                      <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.95rem', lineHeight: '1.5' }}>
                        {email.snippet}
                      </p>

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

                      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.5rem', paddingTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                        {(() => {
                          const eventId = `local-${email.id}`;
                          const isAdded = calendarEvents.some(e => e.id === eventId);
                          
                          const start = new Date(email.extractedMeetingTime || email.date);
                          const end = new Date(start.getTime() + 60 * 60 * 1000);
                          const isPastDue = start < new Date();
                          
                          if (isPastDue) {
                            return (
                              <button 
                                className="btn" 
                                style={{ padding: '0.5rem 1.25rem', fontSize: '0.9rem', background: 'rgba(220, 38, 38, 0.1)', color: 'var(--danger)', cursor: 'default' }}
                                disabled
                              >
                                Meeting Past Due
                              </button>
                            );
                          }

                          if (isAdded) {
                            return (
                              <button 
                                className="btn" 
                                style={{ padding: '0.5rem 1.25rem', fontSize: '0.9rem', background: 'rgba(16, 185, 129, 0.1)', color: 'var(--success)', cursor: 'default' }}
                                disabled
                              >
                                ✓ Added to Calendar
                              </button>
                            );
                          }

                          return (
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
                                  description: `Added from Department View.\nLink: ${email.meetingLinks[0]}`,
                                  location: 'Online',
                                  colorId: '9', // Different color for dept
                                  isAllDay: false
                                });
                                showToast(email.extractedMeetingTime 
                                  ? 'Meeting scheduled at detected time!' 
                                  : 'Meeting added using email received time.');
                              }}
                            >
                              <span>+</span> Add to Calendar
                            </button>
                          );
                        })()}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
};

export default DepartmentView;

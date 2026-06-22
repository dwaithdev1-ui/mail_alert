import React, { useState, useMemo, useEffect } from 'react';
import {
  format, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  addDays, addMonths, subMonths, isSameMonth, isToday,
  parseISO, startOfDay, endOfDay,
} from 'date-fns';
import { useCalendarContext } from '../context/CalendarContext';
import { useGoogleAuth } from '../context/GoogleAuthContext';
import type { CalendarEvent } from '../types/calendar';
import { GC_COLORS } from '../hooks/useGoogleCalendar';
import { useGmail } from '../hooks/useGmail';
import { useToast } from '../context/ToastContext';

/* ── Helpers ────────────────────────────────────────────────────────────── */

function getEventColor(event: CalendarEvent): string {
  if (event.colorId && GC_COLORS[event.colorId]) return GC_COLORS[event.colorId];
  return '#0ea5e9';
}

function buildCalendarGrid(monthDate: Date): Date[][] {
  const monthStart = startOfMonth(monthDate);
  const monthEnd = endOfMonth(monthDate);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });

  const weeks: Date[][] = [];
  let day = gridStart;
  while (day <= gridEnd) {
    const week: Date[] = [];
    for (let i = 0; i < 7; i++) {
      week.push(day);
      day = addDays(day, 1);
    }
    weeks.push(week);
  }
  return weeks;
}

function eventsForDay(events: CalendarEvent[], day: Date): CalendarEvent[] {
  const dayStart = startOfDay(day);
  const dayEnd = endOfDay(day);
  return events.filter((e) => {
    const start = parseISO(e.start);
    const end = parseISO(e.end);
    return start <= dayEnd && end >= dayStart;
  });
}

/* ── Event Detail Modal ─────────────────────────────────────────────────── */
const EventModal: React.FC<{ event: CalendarEvent; onClose: () => void }> = ({ event, onClose }) => {
  const color = getEventColor(event);
  const { deleteEvent } = useCalendarContext();
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    if (window.confirm(`Are you sure you want to cancel the meeting "${event.title}"?`)) {
      setIsDeleting(true);
      try {
        await deleteEvent(event.id);
        onClose();
      } catch (err: any) {
        alert(err.message || 'Failed to cancel meeting');
      } finally {
        setIsDeleting(false);
      }
    }
  };

  return (
    <div className="cal-modal-overlay" onClick={onClose}>
      <div className="cal-modal glass-panel" onClick={(e) => e.stopPropagation()}>
        <button className="cal-modal__close" onClick={onClose} aria-label="Close">✕</button>
        <div className="cal-modal__accent" style={{ background: color }} />
        <div className="cal-modal__body">
          <h2 className="cal-modal__title">{event.title}</h2>

          <div className="cal-modal__meta">
            <span className="cal-modal__meta-icon">🕐</span>
            <span>
              {event.isAllDay
                ? `All day · ${format(parseISO(event.start), 'MMM d, yyyy')}`
                : `${format(parseISO(event.start), 'MMM d, yyyy · h:mm a')} → ${format(parseISO(event.end), 'h:mm a')}`}
            </span>
          </div>

          {event.location && (
            <div className="cal-modal__meta">
              <span className="cal-modal__meta-icon">📍</span>
              <span>{event.location}</span>
            </div>
          )}

          {event.description && (
            <div className="cal-modal__desc">
              <p>{event.description.replace(/<[^>]*>/g, '')}</p>
            </div>
          )}

          <div style={{ display: 'flex', gap: '10px', marginTop: '0.5rem' }}>
            {event.htmlLink && (
              <a
                className="cal-modal__link btn-primary"
                href={event.htmlLink}
                target="_blank"
                rel="noopener noreferrer"
                style={{ flex: 1 }}
              >
                Open in Google Calendar ↗
              </a>
            )}
            <button
              className="cal-modal__link btn"
              onClick={handleDelete}
              disabled={isDeleting}
              style={{
                flex: 1,
                background: 'rgba(239, 68, 68, 0.1)',
                color: 'var(--danger)',
                border: '1px solid rgba(239, 68, 68, 0.25)',
                cursor: 'pointer'
              }}
            >
              {isDeleting ? 'Cancelling...' : 'Cancel Meeting'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

/* ── Day Detail Modal ───────────────────────────────────────────────────── */
const DayDetailModal: React.FC<{
  day: Date;
  events: CalendarEvent[];
  onClose: () => void;
  onEventClick: (e: CalendarEvent) => void;
}> = ({ day, events, onClose, onEventClick }) => {
  const { createEvent, patchEvent } = useCalendarContext();
  const { sendEmail } = useGmail();
  const { showToast } = useToast();
  const { isConnected } = useGoogleAuth();

  const [mode, setMode] = useState<'list' | 'create' | 'prompt' | 'email'>('list');
  const [title, setTitle] = useState('');
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('10:00');
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');
  const [invitees, setInvitees] = useState('');
  const [meetingLink, setMeetingLink] = useState('');
  const [autoMeet, setAutoMeet] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Email form state
  const [emailTo, setEmailTo] = useState('');
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);

  const [allContacts, setAllContacts] = useState<any[]>([]);
  const [searchActive, setSearchActive] = useState(false);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  useEffect(() => {
    const fetchContacts = async () => {
      try {
        const token = localStorage.getItem('auth_token');
        const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:5001'}/api/contacts`, {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });
        const data = await response.json();
        if (response.ok) {
          setAllContacts(data.contacts || []);
        }
      } catch (err) {
        console.error('Failed to fetch contacts for autocomplete:', err);
      }
    };
    if (mode === 'create') {
      fetchContacts();
    }
  }, [mode]);

  const activeSegment = useMemo(() => {
    if (!invitees) return '';
    const parts = invitees.split(',');
    return parts[parts.length - 1].trim();
  }, [invitees]);

  const suggestions = useMemo(() => {
    if (!activeSegment) return [];
    const parts = invitees.split(',');
    const completedEmails = parts.slice(0, -1).map(p => p.trim().toLowerCase());
    
    return allContacts.filter(contact => {
      const isAlreadyAdded = completedEmails.includes(contact.email.toLowerCase());
      if (isAlreadyAdded) return false;
      const matchStr = `${contact.name} ${contact.email} ${contact.designation || ''} ${contact.department || ''}`.toLowerCase();
      return matchStr.includes(activeSegment.toLowerCase());
    });
  }, [allContacts, activeSegment, invitees]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setFormError('Title is required');
      return;
    }
    setFormError(null);
    setIsSubmitting(true);

    const parsedInvitees = invitees
      .split(',')
      .map(email => email.trim())
      .filter(email => email.length > 0 && email.includes('@'));

    try {
      const startDateTime = new Date(day);
      const [sh, sm] = startTime.split(':').map(Number);
      startDateTime.setHours(sh, sm, 0, 0);

      const endDateTime = new Date(day);
      const [eh, em] = endTime.split(':').map(Number);
      endDateTime.setHours(eh, em, 0, 0);

      if (endDateTime <= startDateTime) {
        setFormError('End time must be after start time');
        setIsSubmitting(false);
        return;
      }

      // 1. Create the event silently first (no emails sent to guests yet)
      // This is crucial because we need the actual Google Meet link to generate the formal AI draft.
      const googleEvent = await createEvent({
        title,
        start: startDateTime.toISOString(),
        end: endDateTime.toISOString(),
        location,
        description: description + (meetingLink ? `\n\nMeeting Link: ${meetingLink}` : ''),
        attendees: parsedInvitees.length > 0 ? parsedInvitees : undefined,
        createMeet: autoMeet,
        sendUpdates: 'none', // Create silently
      });

      // 2. Extract the generated Google Meet link
      let finalMeetLink = meetingLink;
      if (autoMeet && googleEvent?.conferenceData?.entryPoints) {
        const videoEntryPoint = googleEvent.conferenceData.entryPoints.find(
          (ep: any) => ep.entryPointType === 'video'
        );
        if (videoEntryPoint?.uri) {
          finalMeetLink = videoEntryPoint.uri;
        }
      }

      // 3. Prepare fallback email content and call backend to generate professional draft using Groq
      const formattedDate = format(day, 'EEEE, MMMM d, yyyy');
      const timeStr = `${startTime} - ${endTime}`;
      let emailSubjectStr = `Meeting Invitation: ${title}`;
      let emailBodyStr = `Hello,\n\nYou have been invited to the following meeting:\n\nTitle: ${title}\nDate: ${formattedDate}\nTime: ${timeStr}\n${location ? `Location: ${location}\n` : ''}${finalMeetLink ? `Meeting Link: ${finalMeetLink}\n` : ''}${description ? `Agenda/Details: ${description}\n` : ''}\nBest regards,`;

      if (isConnected) {
        try {
          const draftRes = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:5001'}/api/agent/draft-email`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${localStorage.getItem('auth_token')}`,
            },
            body: JSON.stringify({
              title,
              date: formattedDate,
              time: timeStr,
              location,
              link: finalMeetLink,
              agenda: description, // description represents the 1-line agenda
            }),
          });

          if (draftRes.ok) {
            const draftData = await draftRes.json();
            if (draftData.draft?.subject && draftData.draft?.body) {
              emailSubjectStr = draftData.draft.subject;
              emailBodyStr = draftData.draft.body;
            }
          }
        } catch (draftErr) {
          console.error('Failed to generate professional draft, using fallback template:', draftErr);
        }
      }

      // 4. Update the event on Google Calendar with the professional description and trigger guest updates
      // This will send Google Calendar's notification email containing the beautiful formal text.
      if (googleEvent?.id) {
        try {
          await patchEvent(googleEvent.id, {
            description: emailBodyStr,
            location: finalMeetLink || location || undefined
          }, 'all');
        } catch (patchErr) {
          console.error('Failed to update Google Calendar event description:', patchErr);
        }
      }

      // 5. Send Gmail and complete flow
      if (parsedInvitees.length > 0 && isConnected) {
        try {
          await Promise.all(parsedInvitees.map(email => sendEmail(email, emailSubjectStr, emailBodyStr)));
          showToast('Event registered and professional email invitations sent!');
        } catch (mailErr: any) {
          console.error('Failed to send invite emails:', mailErr);
          showToast('Event registered, but failed to send personal invite emails.');
        }
        onClose();
      } else {
        setEmailSubject(emailSubjectStr);
        setEmailBody(emailBodyStr);
        setMode('prompt');
      }
    } catch (err: any) {
      setFormError(err.message || 'Failed to create event');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSendEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailTo.trim()) {
      setEmailError('Recipient email is required');
      return;
    }
    setEmailError(null);
    setIsSendingEmail(true);

    try {
      await sendEmail(emailTo, emailSubject, emailBody);
      showToast('Notification email sent successfully!');
      onClose();
    } catch (err: any) {
      setEmailError(err.message || 'Failed to send email');
    } finally {
      setIsSendingEmail(false);
    }
  };

  return (
    <div className="cal-modal-overlay" onClick={onClose}>
      <div
        className="cal-day-modal glass-panel"
        onClick={(e) => e.stopPropagation()}
        style={{ maxHeight: '90vh', width: '480px' }}
      >
        {/* Header */}
        <div className="cal-day-modal__header">
          <div>
            <div className="cal-day-modal__date-num">{format(day, 'd')}</div>
            <div className="cal-day-modal__date-label">{format(day, 'EEEE, MMMM yyyy')}</div>
          </div>
          <button className="cal-modal__close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {mode === 'list' && (
          <>
            {/* Event count badge */}
            <div className="cal-day-modal__count" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>{events.length} meeting{events.length !== 1 ? 's' : ''}</span>
              <button
                className="btn btn-primary"
                style={{ padding: '4px 10px', fontSize: '0.75rem', borderRadius: '6px' }}
                onClick={() => setMode('create')}
              >
                + Register Event
              </button>
            </div>

            {/* Scrollable event list */}
            <div className="cal-day-modal__list">
              {events.length === 0 ? (
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', padding: '12px 0' }}>
                  No meetings scheduled.
                </p>
              ) : (
                events
                  .sort((a, b) => parseISO(a.start).getTime() - parseISO(b.start).getTime())
                  .map((ev) => {
                    const color = getEventColor(ev);
                    return (
                      <button
                        key={ev.id}
                        className="cal-day-modal__row"
                        style={{ borderLeft: `3px solid ${color}` }}
                        onClick={() => { onClose(); onEventClick(ev); }}
                      >
                        <div className="cal-day-modal__row-dot" style={{ background: color }} />
                        <div className="cal-day-modal__row-body">
                          <span className="cal-day-modal__row-title">{ev.title}</span>
                          <span className="cal-day-modal__row-time" style={{ color }}>
                            {ev.isAllDay
                              ? 'All day'
                              : `${format(parseISO(ev.start), 'h:mm a')} – ${format(parseISO(ev.end), 'h:mm a')}`}
                          </span>
                          {ev.location && (
                            <span className="cal-day-modal__row-loc">📍 {ev.location}</span>
                          )}
                        </div>
                        <span className="cal-day-modal__row-arrow">›</span>
                      </button>
                    );
                  })
              )}
            </div>
          </>
        )}

        {mode === 'create' && (
          <form onSubmit={handleSubmit} style={{ padding: '0 20px 20px 20px', display: 'flex', flexDirection: 'column', gap: '12px', overflowY: 'auto', flex: 1 }}>
            <h3 style={{ margin: '10px 0 0 0', fontSize: '1.1rem', color: 'var(--text-primary)' }}>Register New Event</h3>
            
            {formError && (
              <div style={{ color: 'var(--danger)', fontSize: '0.8rem', background: 'rgba(239, 68, 68, 0.08)', padding: '6px 10px', borderRadius: '6px', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                {formError}
              </div>
            )}

            <div className="cal-form-group">
              <label className="cal-form-label">Event Title *</label>
              <input
                type="text"
                className="cal-form-input"
                placeholder="e.g. Budget Planning Meeting"
                value={title}
                onChange={e => setTitle(e.target.value)}
                required
                disabled={isSubmitting}
              />
            </div>

            <div style={{ display: 'flex', gap: '12px' }}>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label className="cal-form-label">Start Time</label>
                <input
                  type="time"
                  className="cal-form-input"
                  value={startTime}
                  onChange={e => setStartTime(e.target.value)}
                  disabled={isSubmitting}
                />
              </div>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label className="cal-form-label">End Time</label>
                <input
                  type="time"
                  className="cal-form-input"
                  value={endTime}
                  onChange={e => setEndTime(e.target.value)}
                  disabled={isSubmitting}
                />
              </div>
            </div>

            <div className="cal-form-group">
              <label className="cal-form-label">Location</label>
              <input
                type="text"
                className="cal-form-input"
                placeholder="e.g. Conference Room A"
                value={location}
                onChange={e => setLocation(e.target.value)}
                disabled={isSubmitting}
              />
            </div>

            <div className="cal-form-group">
              <label className="cal-form-label">Description</label>
              <textarea
                className="cal-form-input cal-form-textarea"
                placeholder="Event details or notes..."
                value={description}
                onChange={e => setDescription(e.target.value)}
                disabled={isSubmitting}
                rows={3}
              />
            </div>

            <div className="cal-form-group" style={{ position: 'relative' }}>
              <label className="cal-form-label">Invitees (comma-separated email addresses)</label>
              <input
                type="text"
                className="cal-form-input"
                placeholder="e.g. dean@college.edu, hod@college.edu"
                value={invitees}
                onChange={e => {
                  setInvitees(e.target.value);
                  setSearchActive(true);
                }}
                onFocus={() => setSearchActive(true)}
                onBlur={() => {
                  setTimeout(() => setSearchActive(false), 200);
                }}
                disabled={isSubmitting}
              />
              {searchActive && suggestions.length > 0 && (
                <div
                  style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    right: 0,
                    zIndex: 1000,
                    marginTop: '4px',
                    background: 'var(--select-option-bg)',
                    backdropFilter: 'var(--glass-blur)',
                    border: '1px solid var(--glass-border)',
                    borderRadius: 'var(--radius-sm)',
                    boxShadow: 'var(--glass-shadow)',
                    maxHeight: '160px',
                    overflowY: 'auto',
                    display: 'flex',
                    flexDirection: 'column',
                  }}
                >
                  {suggestions.map((s, idx) => (
                    <div
                      key={s.id}
                      style={{
                        padding: '8px 12px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        cursor: 'pointer',
                        background: hoveredIdx === idx ? 'var(--hover-bg)' : 'transparent',
                        transition: 'background 0.2s',
                        borderBottom: idx < suggestions.length - 1 ? '1px solid var(--divider-color)' : 'none',
                      }}
                      onMouseEnter={() => setHoveredIdx(idx)}
                      onMouseLeave={() => setHoveredIdx(null)}
                      onClick={() => {
                        const parts = invitees.split(',');
                        parts[parts.length - 1] = ` ${s.email}`;
                        const updated = parts.join(',').trim();
                        setInvitees(updated ? `${updated}, ` : '');
                        setSearchActive(false);
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div
                          style={{
                            width: '26px',
                            height: '26px',
                            borderRadius: '50%',
                            background: 'linear-gradient(135deg, var(--accent-primary) 0%, #6366f1 100%)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '0.75rem',
                            fontWeight: 'bold',
                            color: 'white',
                          }}
                        >
                          {s.name
                            .split(' ')
                            .map((n: string) => n.charAt(0))
                            .slice(0, 2)
                            .join('')
                            .toUpperCase()}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                            {s.name}
                          </span>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                            {s.email}
                          </span>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        {s.designation && (
                          <span style={{ fontSize: '0.65rem', background: 'rgba(14, 165, 233, 0.15)', color: 'var(--accent-primary)', padding: '1px 4px', borderRadius: '4px' }}>
                            {s.designation}
                          </span>
                        )}
                        {s.department && (
                          <span style={{ fontSize: '0.65rem', background: 'rgba(255, 255, 255, 0.1)', color: 'var(--text-secondary)', padding: '1px 4px', borderRadius: '4px' }}>
                            {s.department}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="cal-form-group">
              <label className="cal-form-label">Meeting Link (for virtual meetings)</label>
              <input
                type="text"
                className="cal-form-input"
                placeholder={autoMeet ? "Google Meet link will be generated automatically" : "e.g. https://meet.google.com/abc-defg-hij"}
                value={autoMeet ? '' : meetingLink}
                onChange={e => setMeetingLink(e.target.value)}
                disabled={isSubmitting || autoMeet}
              />
            </div>

            {isConnected && (
              <div className="cal-form-group-checkbox" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <input
                  type="checkbox"
                  id="auto-meet-checkbox"
                  checked={autoMeet}
                  onChange={e => {
                    setAutoMeet(e.target.checked);
                    if (e.target.checked) setMeetingLink('');
                  }}
                  disabled={isSubmitting}
                  style={{ width: '16px', height: '16px', accentColor: 'var(--primary)' }}
                />
                <label htmlFor="auto-meet-checkbox" className="cal-form-label" style={{ margin: 0, cursor: 'pointer', fontSize: '0.85rem' }}>
                  Auto-generate Google Meet link
                </label>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '10px' }}>
              <button
                type="button"
                className="btn"
                onClick={() => setMode('list')}
                disabled={isSubmitting}
                style={{ padding: '8px 14px', fontSize: '0.85rem' }}
              >
                Back
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={isSubmitting}
                style={{ padding: '8px 16px', fontSize: '0.85rem' }}
              >
                {isSubmitting ? 'Registering...' : 'Save Event'}
              </button>
            </div>
          </form>
        )}

        {mode === 'prompt' && (
          <div style={{ padding: '0 20px 20px 20px', display: 'flex', flexDirection: 'column', gap: '16px', textAlign: 'center' }}>
            <div style={{ fontSize: '3rem', marginTop: '1rem' }}>✉️</div>
            <h3 style={{ margin: 0, fontSize: '1.25rem', color: 'var(--text-primary)' }}>Send Email Notification?</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', margin: 0 }}>
              Would you like to send an email notification about this meeting to the participants using your connected Google account?
            </p>
            <div style={{ display: 'flex', gap: '12px', marginTop: '10px', justifyContent: 'center' }}>
              <button
                type="button"
                className="btn"
                onClick={onClose}
                style={{ flex: 1, padding: '10px 16px', fontSize: '0.9rem' }}
              >
                No, Skip
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setMode('email')}
                style={{ flex: 1, padding: '10px 16px', fontSize: '0.9rem' }}
              >
                Yes, Compose
              </button>
            </div>
          </div>
        )}

        {mode === 'email' && (
          <form onSubmit={handleSendEmail} style={{ padding: '0 20px 20px 20px', display: 'flex', flexDirection: 'column', gap: '12px', overflowY: 'auto', flex: 1 }}>
            <h3 style={{ margin: '10px 0 0 0', fontSize: '1.1rem', color: 'var(--text-primary)' }}>Compose Notification</h3>
            
            {emailError && (
              <div style={{ color: 'var(--danger)', fontSize: '0.8rem', background: 'rgba(239, 68, 68, 0.08)', padding: '6px 10px', borderRadius: '6px', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                {emailError}
              </div>
            )}

            <div className="cal-form-group">
              <label className="cal-form-label">To (Email Address) *</label>
              <input
                type="email"
                className="cal-form-input"
                placeholder="recipient@example.com"
                value={emailTo}
                onChange={e => setEmailTo(e.target.value)}
                required
                disabled={isSendingEmail}
              />
            </div>

            <div className="cal-form-group">
              <label className="cal-form-label">Subject</label>
              <input
                type="text"
                className="cal-form-input"
                value={emailSubject}
                onChange={e => setEmailSubject(e.target.value)}
                required
                disabled={isSendingEmail}
              />
            </div>

            <div className="cal-form-group">
              <label className="cal-form-label">Message Body</label>
              <textarea
                className="cal-form-input cal-form-textarea"
                value={emailBody}
                onChange={e => setEmailBody(e.target.value)}
                required
                disabled={isSendingEmail}
                rows={8}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '10px' }}>
              <button
                type="button"
                className="btn"
                onClick={() => setMode('prompt')}
                disabled={isSendingEmail}
                style={{ padding: '8px 14px', fontSize: '0.85rem' }}
              >
                Back
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={isSendingEmail}
                style={{ padding: '8px 16px', fontSize: '0.85rem' }}
              >
                {isSendingEmail ? 'Sending...' : 'Send Email'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

/* ── Day Cell ───────────────────────────────────────────────────────────── */
const DayCell: React.FC<{
  day: Date;
  currentMonth: Date;
  events: CalendarEvent[];
  onEventClick: (e: CalendarEvent) => void;
  onDayClick: (day: Date) => void;
}> = ({ day, currentMonth, events, onEventClick, onDayClick }) => {
  const inMonth = isSameMonth(day, currentMonth);
  const today = isToday(day);
  const MAX_VISIBLE = 3;

  return (
    <div
      className={`cal-day ${!inMonth ? 'cal-day--outside' : ''} ${today ? 'cal-day--today' : ''} ${events.length > 0 ? 'cal-day--has-events' : ''}`}
      onClick={() => onDayClick(day)}
      style={{ cursor: 'pointer' }}
    >
      <div className="cal-day__num">
        <span className={today ? 'cal-day__num-badge' : ''}>{format(day, 'd')}</span>
      </div>
      <div className="cal-day__events">
        {events.slice(0, MAX_VISIBLE).map((ev) => (
          <button
            key={ev.id}
            className="cal-event-pill"
            style={{ background: `${getEventColor(ev)}22`, borderLeft: `3px solid ${getEventColor(ev)}` }}
            onClick={(e) => { e.stopPropagation(); onEventClick(ev); }}
            title={ev.title}
          >
            {!ev.isAllDay && (
              <span className="cal-event-pill__time" style={{ color: getEventColor(ev) }}>
                {format(parseISO(ev.start), 'h:mm a')}
              </span>
            )}
            <span className="cal-event-pill__title">{ev.title}</span>
          </button>
        ))}
        {events.length > MAX_VISIBLE && (
          <button
            className="cal-day__more"
            onClick={(e) => { e.stopPropagation(); onDayClick(day); }}
          >
            +{events.length - MAX_VISIBLE} more
          </button>
        )}
      </div>
    </div>
  );
};

/* ── Connect CTA ────────────────────────────────────────────────────────── */
const ConnectCTA: React.FC<{ onConnect: () => void; isLoading: boolean; error: string | null }> = ({
  onConnect, isLoading, error,
}) => (
  <div className="cal-connect">
    <div className="cal-connect__icon">📅</div>
    <h2 className="cal-connect__title">Connect Google Calendar</h2>
    <p className="cal-connect__sub">
      Sync your real meetings and events directly from Google Calendar.
    </p>
    {error && <p className="cal-connect__error">⚠ {error}</p>}
    <button
      id="cal-connect-btn"
      className="btn btn-primary cal-connect__btn"
      onClick={onConnect}
      disabled={isLoading}
    >
      {isLoading ? (
        <><span className="cal-spinner" /> Connecting…</>
      ) : (
        <>
          <svg width="20" height="20" viewBox="0 0 48 48" style={{ verticalAlign: 'middle', marginRight: 8 }}>
            <path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.8 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.1 7.9 3l5.7-5.7C34.5 6.5 29.6 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.6-.4-3.9z"/>
            <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.5 15.3 18.9 12 24 12c3.1 0 5.8 1.1 7.9 3l5.7-5.7C34.5 6.5 29.6 4 24 4 16.3 4 9.7 8.4 6.3 14.7z"/>
            <path fill="#4CAF50" d="M24 44c5.5 0 10.5-2.1 14.3-5.5l-6.6-5.6C29.9 34.9 27.1 36 24 36c-5.2 0-9.6-3.2-11.3-7.7l-6.6 5.1C9.5 39.5 16.2 44 24 44z"/>
            <path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.3-2.3 4.3-4.3 5.6l6.6 5.6C37.3 37.7 44 33 44 24c0-1.3-.1-2.6-.4-3.9z"/>
          </svg>
          Connect with Google
        </>
      )}
    </button>
    <p className="cal-connect__hint">
      Requires <code>calendar.readonly</code> permission. We never store your events.
    </p>
  </div>
);

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

const YEAR_RANGE = Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - 4 + i);

/* ── Calendar Page ──────────────────────────────────────────────────────── */
const CalendarPage: React.FC = () => {
  const { events, refresh, isLoading: calLoading } = useCalendarContext();
  const { isConnected, connect, disconnect, isLoading: authLoading, error } = useGoogleAuth();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [selectedDay, setSelectedDay] = useState<{ day: Date; events: CalendarEvent[] } | null>(null);
  const [view, setView] = useState<'month' | 'agenda'>('month');

  const isLoading = calLoading || authLoading;

  const grid = useMemo(() => buildCalendarGrid(currentMonth), [currentMonth]);

  const handleMonthSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), parseInt(e.target.value), 1));
  };

  const handleYearSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setCurrentMonth(new Date(parseInt(e.target.value), currentMonth.getMonth(), 1));
  };

  // Agenda view: events sorted by start, only future + today
  const agendaEvents = useMemo(() => {
    const now = new Date();
    return [...events]
      .filter((e) => parseISO(e.end) >= now)
      .sort((a, b) => parseISO(a.start).getTime() - parseISO(b.start).getTime())
      .slice(0, 30);
  }, [events]);

  const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <section className="cal-page animate-fade-in">

      {/* ── Header ── */}
      <div className="cal-header">
        <div className="cal-header__left">
          <h1 className="cal-header__title">Calendar</h1>
          <p className="cal-header__sub">{format(new Date(), 'EEEE, MMMM d, yyyy')}</p>
        </div>
        {isConnected && (
          <div className="cal-header__actions">
            <div className="cal-view-toggle">
              <button
                className={`cal-view-toggle__btn ${view === 'month' ? 'active' : ''}`}
                onClick={() => setView('month')}
              >Month</button>
              <button
                className={`cal-view-toggle__btn ${view === 'agenda' ? 'active' : ''}`}
                onClick={() => setView('agenda')}
              >Agenda</button>
            </div>
            <button className="cal-btn cal-btn--ghost" onClick={refresh} disabled={isLoading} title="Refresh">
              {isLoading ? <span className="cal-spinner" /> : '↻'}
            </button>
            <button className="cal-btn cal-btn--ghost cal-btn--danger" onClick={disconnect} title="Disconnect">
              Disconnect
            </button>
          </div>
        )}
      </div>

      {/* ── Not Connected ── */}
      {!isConnected && (
        <ConnectCTA onConnect={connect} isLoading={isLoading} error={error} />
      )}

      {/* ── Connected: Month View ── */}
      {isConnected && view === 'month' && (
        <div className="cal-month-wrap glass-panel">
          {/* Month navigation */}
          <div className="cal-month-nav">
            <button className="cal-btn" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>‹</button>

            <div className="cal-month-nav__dropdowns">
              <select
                className="cal-nav-select"
                value={currentMonth.getMonth()}
                onChange={handleMonthSelect}
                aria-label="Select month"
              >
                {MONTHS.map((m, i) => (
                  <option key={m} value={i}>{m}</option>
                ))}
              </select>

              <select
                className="cal-nav-select"
                value={currentMonth.getFullYear()}
                onChange={handleYearSelect}
                aria-label="Select year"
              >
                {YEAR_RANGE.map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>

            <button className="cal-btn" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>›</button>
            <button
              className="cal-btn cal-btn--today"
              onClick={() => setCurrentMonth(new Date())}
            >Today</button>
          </div>

          {/* Weekday headers */}
          <div className="cal-weekdays">
            {WEEKDAYS.map((d) => (
              <div key={d} className="cal-weekday">{d}</div>
            ))}
          </div>

          {/* Day grid */}
          <div className="cal-grid">
            {grid.flat().map((day, i) => (
              <DayCell
                key={i}
                day={day}
                currentMonth={currentMonth}
                events={eventsForDay(events, day)}
                onEventClick={setSelectedEvent}
                onDayClick={(d) => setSelectedDay({ day: d, events: eventsForDay(events, d) })}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── Connected: Agenda View ── */}
      {isConnected && view === 'agenda' && (
        <div className="cal-agenda glass-panel">
          <h3 className="cal-agenda__heading">Upcoming Events ({agendaEvents.length})</h3>
          {agendaEvents.length === 0 ? (
            <p className="cal-agenda__empty">No upcoming events found.</p>
          ) : (
            <div className="cal-agenda__list">
              {agendaEvents.map((ev) => {
                const color = getEventColor(ev);
                return (
                  <button
                    key={ev.id}
                    className="cal-agenda__row"
                    style={{ borderLeft: `4px solid ${color}` }}
                    onClick={() => setSelectedEvent(ev)}
                  >
                    <div className="cal-agenda__date">
                      <span className="cal-agenda__day">{format(parseISO(ev.start), 'd')}</span>
                      <span className="cal-agenda__month">{format(parseISO(ev.start), 'MMM')}</span>
                    </div>
                    <div className="cal-agenda__info">
                      <span className="cal-agenda__title">{ev.title}</span>
                      <span className="cal-agenda__time" style={{ color }}>
                        {ev.isAllDay
                          ? 'All day'
                          : `${format(parseISO(ev.start), 'h:mm a')} – ${format(parseISO(ev.end), 'h:mm a')}`}
                      </span>
                      {ev.location && (
                        <span className="cal-agenda__loc">📍 {ev.location}</span>
                      )}
                    </div>
                    <div className="cal-agenda__dot" style={{ background: color }} />
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Day Detail Modal ── */}
      {selectedDay && (
        <DayDetailModal
          day={selectedDay.day}
          events={selectedDay.events}
          onClose={() => setSelectedDay(null)}
          onEventClick={setSelectedEvent}
        />
      )}

      {/* ── Event Detail Modal ── */}
      {selectedEvent && (
        <EventModal event={selectedEvent} onClose={() => setSelectedEvent(null)} />
      )}
    </section>
  );
};

export default CalendarPage;

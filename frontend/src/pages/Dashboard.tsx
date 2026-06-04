import React, { useMemo } from 'react';
import { isToday, format, parseISO } from 'date-fns';
import { useCalendarContext } from '../context/CalendarContext';
import { useGoogleAuth } from '../context/GoogleAuthContext';
import { useGmailContext } from '../context/GmailContext';
import type { CalendarEvent } from '../types/calendar';
import { useNavigate } from 'react-router-dom';

/* ── Meeting status logic ───────────────────────────────────────────────── */
const getStatus = (event: CalendarEvent): MeetingStatus => {
  if (event.isAllDay) {
    const day = parseISO(event.start);
    if (isToday(day)) return 'today';
    return parseISO(event.end) < new Date() ? 'done' : 'upcoming';
  }
  const now = new Date();
  const start = parseISO(event.start);
  const end = parseISO(event.end);
  const diffMins = Math.round((start.getTime() - now.getTime()) / 60000);
  if (end < now) return 'done';
  if (diffMins >= -5 && diffMins <= 5) return 'ongoing';
  if (isToday(start)) return 'today';
  return 'upcoming';
};

type MeetingStatus = 'done' | 'ongoing' | 'today' | 'upcoming';

const STATUS_META: Record<MeetingStatus, { label: string; color: string; dot: string; glow: string }> = {
  ongoing: { label: 'Ongoing',   color: '#10b981', dot: '#10b981', glow: 'rgba(16,185,129,0.18)' },
  today:   { label: 'Due Today', color: '#0ea5e9', dot: '#0ea5e9', glow: 'rgba(14,165,233,0.18)' },
  upcoming:{ label: 'Upcoming',  color: '#a78bfa', dot: '#a78bfa', glow: 'rgba(167,139,250,0.18)' },
  done:    { label: 'Completed', color: '#64748b', dot: '#475569', glow: 'rgba(71,85,105,0.12)' },
};

/* ── Stat Banner ────────────────────────────────────────────────────────── */
const StatBanner: React.FC<{
  count: number; label: string; accent: string; glow: string; icon: string; sublabel?: string;
}> = ({ count, label, accent, glow, icon, sublabel }) => (
  <div className="stat-banner glass-panel" style={{ '--accent': accent, '--glow': glow } as React.CSSProperties}>
    <div className="stat-banner__left">
      <div className="stat-banner__icon">{icon}</div>
      <div className="stat-banner__text">
        <span className="stat-banner__label">{label}</span>
        {sublabel && <span className="stat-banner__sub">{sublabel}</span>}
      </div>
    </div>
    <div className="stat-banner__count">{count}</div>
  </div>
);

/* ── Meeting Row ────────────────────────────────────────────────────────── */
const MeetingRow: React.FC<{ event: CalendarEvent; status: MeetingStatus; index: number }> = ({
  event, status, index,
}) => {
  const meta = STATUS_META[status];
  const start = parseISO(event.start);
  return (
    <div className="meeting-row" style={{ animationDelay: `${index * 70}ms` }}>
      <span className="meeting-row__dot" style={{ background: meta.dot, boxShadow: `0 0 6px ${meta.dot}` }} />
      <div className="meeting-row__body">
        <span className="meeting-row__title">{event.title}</span>
        <span className="meeting-row__time">
          {event.isAllDay
            ? `All day · ${format(start, 'MMM d, yyyy')}`
            : format(start, 'MMM d, yyyy · h:mm a')}
        </span>
      </div>
      <span className="meeting-row__badge" style={{
        color: meta.color, borderColor: `${meta.dot}40`, background: `${meta.dot}14`,
      }}>
        {meta.label}
      </span>
    </div>
  );
};

/* ── Meeting Section ────────────────────────────────────────────────────── */
const MeetingSection: React.FC<{ status: MeetingStatus; list: CalendarEvent[] }> = ({ status, list }) => {
  const meta = STATUS_META[status];
  return (
    <div className="meeting-section glass-panel">
      <div className="meeting-section__header">
        <span className="meeting-section__dot" style={{ background: meta.dot, boxShadow: `0 0 8px ${meta.dot}` }} />
        <h3 className="meeting-section__title">{meta.label} Meetings</h3>
        <span className="meeting-section__count" style={{
          color: meta.color, borderColor: `${meta.dot}30`, background: `${meta.dot}12`,
        }}>
          {list.length}
        </span>
      </div>
      {list.length === 0 ? (
        <p className="meeting-section__empty">No meetings here</p>
      ) : (
        <div className="meeting-list">
          {list.map((ev, idx) => (
            <MeetingRow key={ev.id} event={ev} status={status} index={idx} />
          ))}
        </div>
      )}
    </div>
  );
};

/* ── Dashboard ──────────────────────────────────────────────────────────── */
const Dashboard: React.FC = () => {
  const { events, isLoading: calLoading } = useCalendarContext();
  const { emails, isLoading: gmailLoading } = useGmailContext();
  const { isConnected, isLoading: authLoading, connect, disconnect } = useGoogleAuth();
  const navigate = useNavigate();

  const isLoading = calLoading || authLoading || gmailLoading;

  const { done, ongoing, today, upcoming } = useMemo(() => {
    const buckets: Record<MeetingStatus, CalendarEvent[]> = {
      done: [], ongoing: [], today: [], upcoming: [],
    };
    events.forEach((ev) => buckets[getStatus(ev)].push(ev));
    return buckets;
  }, [events]);

  const meetingEmailsCount = useMemo(() => {
    return emails.filter(email => email.meetingLinks && email.meetingLinks.length > 0).length;
  }, [emails]);

  const departmentsCount = useMemo(() => {
    const meetingEmails = emails.filter(email => email.meetingLinks && email.meetingLinks.length > 0);
    const depts = new Set(meetingEmails.map(e => e.department));
    return depts.size;
  }, [emails]);

  return (
    <section className="dashboard animate-fade-in">

      {/* Header */}
      <div className="dashboard__header">
        <div>
          <h1 className="dashboard__title">Dashboard</h1>
          <p className="dashboard__subtitle">{format(new Date(), 'EEEE, MMMM d, yyyy')}</p>
        </div>
      </div>

      {/* Google Services Connection Card */}
      <div className="glass-panel" style={{ marginBottom: '2rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1.5rem 2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
          <div style={{
            width: '48px', height: '48px', borderRadius: '12px',
            background: isConnected ? 'rgba(16, 185, 129, 0.15)' : 'rgba(255, 255, 255, 0.05)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem'
          }}>
            {isConnected ? '✓' : '🔌'}
          </div>
          <div>
            <h3 style={{ margin: '0 0 0.25rem 0', fontSize: '1.1rem' }}>
              {isConnected ? 'Google Services Connected' : 'Google Services Not Connected'}
            </h3>
            <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
              {isConnected 
                ? 'Your Calendar and Gmail are actively syncing.' 
                : 'Connect your account to instantly sync your Calendar and scan recent emails.'}
            </p>
          </div>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          {isLoading && <span className="cal-spinner" style={{ width: 20, height: 20 }} />}
          {!isConnected ? (
            <button
              className="btn btn-primary"
              style={{ fontSize: '0.95rem', padding: '0.6rem 1.25rem' }}
              onClick={connect}
              disabled={isLoading}
            >
              Connect Google Services
            </button>
          ) : (
            <button
              className="btn"
              style={{ fontSize: '0.9rem', padding: '0.5rem 1rem', background: 'var(--btn-ghost-bg)', color: 'var(--text-primary)' }}
              onClick={disconnect}
              disabled={isLoading}
            >
              Disconnect
            </button>
          )}
        </div>
      </div>

      {/* Stat Banners */}
      <div className="dashboard__stats" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
        <StatBanner count={events.length}   label="Total Events" sublabel="synced" accent="#0ea5e9" glow="rgba(14,165,233,0.15)" icon="📋" />
        <StatBanner count={today.length}    label="Due Today"    sublabel="scheduled" accent="#f59e0b" glow="rgba(245,158,11,0.15)" icon="📅" />
        <StatBanner count={meetingEmailsCount} label="Mail Meetings" sublabel="extracted" accent="#ec4899" glow="rgba(236,72,153,0.15)" icon="📬" />
        <StatBanner count={departmentsCount} label="Departments"  sublabel="active" accent="#8b5cf6" glow="rgba(139,92,246,0.15)" icon="🏢" />
      </div>

      {/* Meeting Sections */}
      <div className="dashboard__sections">
        <MeetingSection status="ongoing"  list={ongoing} />
        <MeetingSection status="today"    list={today} />
        <MeetingSection status="upcoming" list={upcoming} />
        <MeetingSection status="done"     list={done} />
      </div>

    </section>
  );
};

export default Dashboard;

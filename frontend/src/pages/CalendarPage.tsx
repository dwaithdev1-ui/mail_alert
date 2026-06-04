import React, { useState, useMemo } from 'react';
import {
  format, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  addDays, addMonths, subMonths, isSameMonth, isSameDay, isToday,
  parseISO, startOfDay, endOfDay,
} from 'date-fns';
import { useCalendarContext } from '../context/CalendarContext';
import { useGoogleAuth } from '../context/GoogleAuthContext';
import type { CalendarEvent } from '../types/calendar';
import { GC_COLORS } from '../hooks/useGoogleCalendar';

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

          {event.htmlLink && (
            <a
              className="cal-modal__link btn-primary"
              href={event.htmlLink}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open in Google Calendar ↗
            </a>
          )}
        </div>
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
}> = ({ day, currentMonth, events, onEventClick }) => {
  const inMonth = isSameMonth(day, currentMonth);
  const today = isToday(day);
  const MAX_VISIBLE = 3;

  return (
    <div className={`cal-day ${!inMonth ? 'cal-day--outside' : ''} ${today ? 'cal-day--today' : ''}`}>
      <div className="cal-day__num">
        <span className={today ? 'cal-day__num-badge' : ''}>{format(day, 'd')}</span>
      </div>
      <div className="cal-day__events">
        {events.slice(0, MAX_VISIBLE).map((ev) => (
          <button
            key={ev.id}
            className="cal-event-pill"
            style={{ background: `${getEventColor(ev)}22`, borderLeft: `3px solid ${getEventColor(ev)}` }}
            onClick={() => onEventClick(ev)}
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
          <span className="cal-day__more">+{events.length - MAX_VISIBLE} more</span>
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

      {/* ── Event Detail Modal ── */}
      {selectedEvent && (
        <EventModal event={selectedEvent} onClose={() => setSelectedEvent(null)} />
      )}
    </section>
  );
};

export default CalendarPage;

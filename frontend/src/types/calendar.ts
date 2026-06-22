export interface CalendarEvent {
  id: string;
  title: string;
  /** ISO datetime string, e.g. "2026-06-04T10:00:00+05:30" */
  start: string;
  /** ISO datetime string */
  end: string;
  description?: string;
  location?: string;
  /** Google Calendar event page URL */
  htmlLink?: string;
  /** Google Calendar color id (1-11) */
  colorId?: string;
  /** True when the event spans full day(s) */
  isAllDay: boolean;
  /** Calendar owner's display name */
  calendarName?: string;
}

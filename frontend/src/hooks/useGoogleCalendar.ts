import { useState, useCallback, useEffect } from 'react';
import type { CalendarEvent } from '../types/calendar';
import { useGoogleAuth } from '../context/GoogleAuthContext';

/** Google Calendar color map (colorId → hex) */
const GC_COLORS: Record<string, string> = {
  '1': '#7986CB', '2': '#33B679', '3': '#8E24AA', '4': '#E67C73',
  '5': '#F6BF26', '6': '#F4511E', '7': '#039BE5', '8': '#616161',
  '9': '#3F51B5', '10': '#0B8043', '11': '#D50000',
};
export { GC_COLORS };

function mapGoogleEvent(item: any): CalendarEvent {
  const isAllDay = Boolean(item.start?.date && !item.start?.dateTime);
  return {
    id: item.id,
    title: item.summary || '(No title)',
    start: item.start?.dateTime ?? item.start?.date ?? '',
    end: item.end?.dateTime ?? item.end?.date ?? '',
    description: item.description,
    location: item.location,
    htmlLink: item.htmlLink,
    colorId: item.colorId,
    isAllDay,
    calendarName: item.organizer?.displayName,
  };
}

export interface UseGoogleCalendarReturn {
  isConnected: boolean;
  isLoading: boolean;
  events: CalendarEvent[];
  error: string | null;
  refresh: () => void;
}

export function useGoogleCalendar(): UseGoogleCalendarReturn {
  const { accessToken, isConnected, error: authError } = useGoogleAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [error, setError] = useState<string | null>(null);

  const fetchEvents = useCallback(async () => {
    if (!accessToken) return;
    setIsLoading(true);
    setError(null);
    try {
      // Fetch 3 months back + 3 months forward
      const timeMin = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
      const timeMax = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();

      const url = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events');
      url.searchParams.set('timeMin', timeMin);
      url.searchParams.set('timeMax', timeMax);
      url.searchParams.set('singleEvents', 'true');
      url.searchParams.set('orderBy', 'startTime');
      url.searchParams.set('maxResults', '100');

      const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData?.error?.message || `HTTP ${res.status}`);
      }

      const data = await res.json();
      const mapped = (data.items ?? []).map(mapGoogleEvent);
      setEvents(mapped);
    } catch (err: any) {
      setError(err.message ?? 'Failed to fetch calendar events');
    } finally {
      setIsLoading(false);
    }
  }, [accessToken]);

  // Auto fetch when token is ready
  useEffect(() => {
    if (accessToken) {
      fetchEvents();
    } else {
      setEvents([]);
    }
  }, [accessToken, fetchEvents]);

  return { 
    isConnected, 
    isLoading, 
    events, 
    error: authError || error, 
    refresh: fetchEvents 
  };
}

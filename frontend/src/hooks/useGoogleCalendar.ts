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
  let location = item.location;
  if (!location && item.conferenceData?.entryPoints) {
    const videoEntryPoint = item.conferenceData.entryPoints.find(
      (ep: any) => ep.entryPointType === 'video'
    );
    if (videoEntryPoint?.uri) {
      location = videoEntryPoint.uri;
    }
  }
  return {
    id: item.id,
    title: item.summary || '(No title)',
    start: item.start?.dateTime ?? item.start?.date ?? '',
    end: item.end?.dateTime ?? item.end?.date ?? '',
    description: item.description,
    location,
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
  createEvent: (eventData: {
    title: string;
    start: string;
    end: string;
    location?: string;
    description?: string;
    attendees?: string[];
    createMeet?: boolean;
    sendUpdates?: 'all' | 'none';
  }) => Promise<any>;
  patchEvent: (eventId: string, eventData: {
    description?: string;
    location?: string;
  }, sendUpdates?: 'all' | 'none') => Promise<any>;
  deleteEvent: (eventId: string) => Promise<void>;
  accessToken: string | null;
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
      url.searchParams.set('conferenceDataVersion', '1');

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

  const createEvent = useCallback(async (eventData: {
    title: string;
    start: string;
    end: string;
    location?: string;
    description?: string;
    attendees?: string[];
    createMeet?: boolean;
    sendUpdates?: 'all' | 'none';
  }) => {
    if (!accessToken) return null;
    const sendUpdatesVal = eventData.sendUpdates ?? 'all';
    const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?sendUpdates=${sendUpdatesVal}${eventData.createMeet ? '&conferenceDataVersion=1' : ''}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        summary: eventData.title,
        start: { dateTime: eventData.start },
        end: { dateTime: eventData.end },
        location: eventData.location || undefined,
        description: eventData.description || undefined,
        attendees: eventData.attendees?.map(email => ({ email })) || undefined,
        conferenceData: eventData.createMeet ? {
          createRequest: {
            requestId: Math.random().toString(36).substring(2, 15),
            conferenceSolutionKey: {
              type: 'hangoutsMeet'
            }
          }
        } : undefined
      }),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData?.error?.message || `HTTP ${res.status}`);
    }

    const data = await res.json();
    await fetchEvents();
    return data;
  }, [accessToken, fetchEvents]);

  const patchEvent = useCallback(async (eventId: string, eventData: {
    description?: string;
    location?: string;
  }, sendUpdates: 'all' | 'none' = 'all') => {
    if (!accessToken) return null;
    const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}?sendUpdates=${sendUpdates}`;
    const res = await fetch(url, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        description: eventData.description || undefined,
        location: eventData.location || undefined,
      }),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData?.error?.message || `HTTP ${res.status}`);
    }

    const data = await res.json();
    await fetchEvents();
    return data;
  }, [accessToken, fetchEvents]);

  const deleteEvent = useCallback(async (eventId: string) => {
    if (!accessToken) return;
    const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`;
    const res = await fetch(url, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData?.error?.message || `HTTP ${res.status}`);
    }

    await fetchEvents();
  }, [accessToken, fetchEvents]);

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
    refresh: fetchEvents,
    createEvent,
    patchEvent,
    deleteEvent,
    accessToken
  };
}

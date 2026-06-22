import React, { createContext, useContext, useState, useMemo } from 'react';
import { useGoogleCalendar } from '../hooks/useGoogleCalendar';
import type { UseGoogleCalendarReturn } from '../hooks/useGoogleCalendar';
import type { CalendarEvent } from '../types/calendar';

interface CalendarContextState extends UseGoogleCalendarReturn {
  addLocalEvent: (event: CalendarEvent) => void;
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
}

const CalendarContext = createContext<CalendarContextState | null>(null);

export const CalendarProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const calendarState = useGoogleCalendar();
  const [localEvents, setLocalEvents] = useState<CalendarEvent[]>([]);

  const addLocalEvent = (event: CalendarEvent) => {
    setLocalEvents(prev => {
      // Prevent duplicates by checking if the ID already exists
      if (prev.some(e => e.id === event.id)) {
        return prev;
      }
      return [...prev, event];
    });
  };

  const deleteLocalEvent = (eventId: string) => {
    setLocalEvents(prev => prev.filter(e => e.id !== eventId));
  };

  const triggerBackendSync = async () => {
    const token = localStorage.getItem('auth_token');
    const googleAccessToken = calendarState.accessToken;
    if (token && googleAccessToken) {
      try {
        await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:5001'}/api/calendar/sync`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ googleAccessToken })
        });
      } catch (err) {
        console.error('Failed to trigger database calendar sync:', err);
      }
    }
  };

  const createEvent = async (eventData: {
    title: string;
    start: string;
    end: string;
    location?: string;
    description?: string;
    attendees?: string[];
    createMeet?: boolean;
    sendUpdates?: 'all' | 'none';
  }) => {
    const created = await calendarState.createEvent(eventData);
    await triggerBackendSync();
    return created;
  };

  const patchEvent = async (eventId: string, eventData: {
    description?: string;
    location?: string;
  }, sendUpdates?: 'all' | 'none') => {
    const updated = await calendarState.patchEvent(eventId, eventData, sendUpdates);
    await triggerBackendSync();
    return updated;
  };

  const deleteEvent = async (eventId: string) => {
    if (eventId.startsWith('local-')) {
      deleteLocalEvent(eventId);
    } else {
      await calendarState.deleteEvent(eventId);
      await triggerBackendSync();
    }
  };

  const combinedEvents = useMemo(() => {
    // Merge and sort by start time
    const merged = [...calendarState.events, ...localEvents];
    return merged.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
  }, [calendarState.events, localEvents]);

  const value = useMemo(() => ({
    ...calendarState,
    events: combinedEvents,
    addLocalEvent,
    createEvent,
    patchEvent,
    deleteEvent,
  }), [calendarState, combinedEvents]);

  return (
    <CalendarContext.Provider value={value}>
      {children}
    </CalendarContext.Provider>
  );
};

export function useCalendarContext(): CalendarContextState {
  const ctx = useContext(CalendarContext);
  if (!ctx) throw new Error('useCalendarContext must be used inside <CalendarProvider>');
  return ctx;
}

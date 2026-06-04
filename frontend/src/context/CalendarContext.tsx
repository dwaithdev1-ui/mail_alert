import React, { createContext, useContext, useState, useMemo } from 'react';
import { useGoogleCalendar } from '../hooks/useGoogleCalendar';
import type { UseGoogleCalendarReturn } from '../hooks/useGoogleCalendar';
import type { CalendarEvent } from '../types/calendar';

interface CalendarContextState extends UseGoogleCalendarReturn {
  addLocalEvent: (event: CalendarEvent) => void;
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

  const combinedEvents = useMemo(() => {
    // Merge and sort by start time
    const merged = [...calendarState.events, ...localEvents];
    return merged.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
  }, [calendarState.events, localEvents]);

  const value = useMemo(() => ({
    ...calendarState,
    events: combinedEvents,
    addLocalEvent,
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

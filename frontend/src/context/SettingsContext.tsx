import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

export interface UserSettings {
  // Notifications
  alertTimings: number[];          // minutes before: e.g. [5, 10, 15]
  alertType: 'notification' | 'banner' | 'both';
  alertSound: boolean;
  repeatAlert: boolean;
  repeatIntervalMins: number;

  // Calendar
  syncFrequencyMins: number;       // 0 = manual
  lookaheadDays: number;

  // Event Recording
  autoLogMeetings: boolean;
  historyRetentionDays: number;

  // Profile
  displayName: string;
  timezone: string;
  theme: 'light' | 'dark';
}

const DEFAULTS: UserSettings = {
  alertTimings: [5, 10],
  alertType: 'both',
  alertSound: true,
  repeatAlert: false,
  repeatIntervalMins: 5,
  syncFrequencyMins: 15,
  lookaheadDays: 90,
  autoLogMeetings: true,
  historyRetentionDays: 30,
  displayName: '',
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  theme: 'dark',
};

const STORAGE_KEY = 'mail_alert_settings';

function loadSettings(): UserSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return DEFAULTS;
  }
}

interface SettingsContextValue {
  settings: UserSettings;
  updateSettings: (patch: Partial<UserSettings>) => void;
  resetSettings: () => void;
  savedFlash: boolean;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<UserSettings>(loadSettings);
  const [savedFlash, setSavedFlash] = useState(false);

  // Apply theme to document element
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', settings.theme || 'dark');
  }, [settings.theme]);

  // Persist on every change
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  }, [settings]);

  const updateSettings = useCallback((patch: Partial<UserSettings>) => {
    setSettings(prev => ({ ...prev, ...patch }));
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 2000);
  }, []);

  const resetSettings = useCallback(() => {
    setSettings(DEFAULTS);
  }, []);

  return (
    <SettingsContext.Provider value={{ settings, updateSettings, resetSettings, savedFlash }}>
      {children}
    </SettingsContext.Provider>
  );
};

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used inside <SettingsProvider>');
  return ctx;
}

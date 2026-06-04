import { useState, useCallback } from 'react';
import { useGoogleAuth } from '../context/GoogleAuthContext';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface AgentState {
  isLoading: boolean;
  error: string | null;
  history: ChatMessage[];
  lastToolsUsed: string[];
}

export function useAgent() {
  const [state, setState] = useState<AgentState>({
    isLoading: false,
    error: null,
    history: [],
    lastToolsUsed: [],
  });

  const { accessToken: googleAccessToken } = useGoogleAuth();

  const sendMessage = useCallback(async (message: string) => {
    const token = localStorage.getItem('auth_token');
    if (!token) {
      setState(s => ({ ...s, error: 'Not authenticated' }));
      return;
    }

    // Optimistically add user message
    setState(s => ({
      ...s,
      isLoading: true,
      error: null,
      history: [...s.history, { role: 'user', content: message }],
    }));

    try {
      const res = await fetch(`${API_BASE}/api/agent/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          message,
          history: state.history, // send history BEFORE this message (backend adds it)
          googleAccessToken,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      setState(s => ({
        ...s,
        isLoading: false,
        error: data.error || null,
        history: data.history || [...s.history, { role: 'assistant', content: data.reply }],
        lastToolsUsed: data.toolsUsed || [],
      }));
    } catch (err: any) {
      setState(s => ({
        ...s,
        isLoading: false,
        error: err.message || 'Agent request failed',
        history: [...s.history, { role: 'assistant', content: `Error: ${err.message}` }],
      }));
    }
  }, [state.history, googleAccessToken]);

  const clearHistory = useCallback(() => {
    setState({ isLoading: false, error: null, history: [], lastToolsUsed: [] });
  }, []);

  return { ...state, sendMessage, clearHistory };
}

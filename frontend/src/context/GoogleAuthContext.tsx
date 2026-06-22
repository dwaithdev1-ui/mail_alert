import React, { createContext, useContext, useState, useCallback, useRef, type ReactNode } from 'react';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string;
const COMBINED_SCOPES = 'https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send';

interface GoogleAuthContextType {
  accessToken: string | null;
  isConnected: boolean;
  isLoading: boolean;
  error: string | null;
  connect: () => void;
  disconnect: () => void;
}

const GoogleAuthContext = createContext<GoogleAuthContextType | null>(null);

export const GoogleAuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tokenClientRef = useRef<any>(null);

  const initTokenClient = useCallback(() => {
    if (!window.google?.accounts?.oauth2) {
      setError('Google Identity Services not loaded yet.');
      return null;
    }
    if (tokenClientRef.current) return tokenClientRef.current;

    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: COMBINED_SCOPES,
      callback: (response: any) => {
        if (response.error) {
          setError(`Auth error: ${response.error_description ?? response.error}`);
          setIsLoading(false);
          return;
        }
        setAccessToken(response.access_token);
        setError(null);
        setIsLoading(false);
      },
      error_callback: (err: any) => {
        setError(`OAuth error: ${err.type}`);
        setIsLoading(false);
      },
    });

    tokenClientRef.current = client;
    return client;
  }, []);

  const connect = useCallback(() => {
    setIsLoading(true);
    setError(null);
    const client = initTokenClient();
    if (client) {
      client.requestAccessToken({ prompt: accessToken ? '' : 'consent' });
    } else {
      setIsLoading(false);
    }
  }, [initTokenClient, accessToken]);

  const disconnect = useCallback(() => {
    if (accessToken) {
      window.google?.accounts?.oauth2?.revoke(accessToken, () => {});
    }
    setAccessToken(null);
    tokenClientRef.current = null;
  }, [accessToken]);

  return (
    <GoogleAuthContext.Provider
      value={{
        accessToken,
        isConnected: !!accessToken,
        isLoading,
        error,
        connect,
        disconnect,
      }}
    >
      {children}
    </GoogleAuthContext.Provider>
  );
};

export const useGoogleAuth = () => {
  const ctx = useContext(GoogleAuthContext);
  if (!ctx) throw new Error('useGoogleAuth must be used within a GoogleAuthProvider');
  return ctx;
};

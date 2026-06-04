/**
 * TypeScript type declarations for the Google Identity Services (GIS) library.
 * Loaded via <script src="https://accounts.google.com/gsi/client">
 */

interface TokenResponse {
  access_token: string;
  expires_in: number;
  scope: string;
  token_type: string;
  error?: string;
  error_description?: string;
}

interface TokenClientConfig {
  client_id: string;
  scope: string;
  callback: (response: TokenResponse) => void;
  error_callback?: (error: { type: string }) => void;
  prompt?: string;
}

interface TokenClient {
  requestAccessToken(overrideConfig?: Partial<TokenClientConfig>): void;
}

interface Google {
  accounts: {
    oauth2: {
      initTokenClient(config: TokenClientConfig): TokenClient;
      revoke(token: string, callback?: () => void): void;
    };
  };
}

declare global {
  interface Window {
    google: Google;
  }
}

export {};

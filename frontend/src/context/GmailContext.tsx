import React, { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import * as chrono from 'chrono-node';
import { useGoogleAuth } from './GoogleAuthContext';
import { detectDepartment } from '../utils/departments';

export interface ParsedEmail {
  id: string;
  threadId: string;
  snippet: string;
  subject: string;
  from: string;
  date: string;
  meetingLinks: string[];
  extractedMeetingTime?: string | null;
  department: string;
}

export interface GmailContextType {
  emails: ParsedEmail[];
  isLoading: boolean;
  error: string | null;
  scanEmails: (query?: string) => Promise<void>;
}

const GmailContext = createContext<GmailContextType | null>(null);

function getEmailBody(payload: any): string {
  if (!payload) return '';
  if (payload.mimeType === 'text/plain' && payload.body?.data) {
    return atob(payload.body.data.replace(/-/g, '+').replace(/_/g, '/'));
  }
  if (payload.parts) {
    let body = '';
    for (const part of payload.parts) {
      if (part.mimeType === 'text/plain' && part.body?.data) {
        body += atob(part.body.data.replace(/-/g, '+').replace(/_/g, '/'));
      } else if (part.parts) {
        body += getEmailBody(part);
      }
    }
    if (body) return body;
  }
  return '';
}

export const GmailProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { accessToken, isConnected, error: authError } = useGoogleAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [emails, setEmails] = useState<ParsedEmail[]>([]);
  const [error, setError] = useState<string | null>(null);

  const scanEmails = useCallback(async (query: string = '') => {
    if (!accessToken) return;
    
    setIsLoading(true);
    setError(null);
    try {
      // 1. Search for messages
      const url = new URL('https://gmail.googleapis.com/gmail/v1/users/me/messages');
      url.searchParams.set('q', query);
      url.searchParams.set('maxResults', '20');

      const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData?.error?.message || `HTTP ${res.status}`);
      }

      const data = await res.json();
      if (!data.messages) {
        setEmails([]);
        setIsLoading(false);
        return;
      }

      // 2. Fetch details for each message
      const messagePromises = data.messages.map(async (msg: { id: string, threadId: string }) => {
        const msgRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=full`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        const msgData = await msgRes.json();
        
        const headers = msgData.payload?.headers || [];
        const getHeader = (name: string) => headers.find((h: any) => h.name.toLowerCase() === name.toLowerCase())?.value || '';
        const emailDate = getHeader('Date') || '';
        
        // Extract body and find meeting links
        const bodyText = getEmailBody(msgData.payload);
        const subjectText = getHeader('Subject') || '';
        const combinedText = subjectText + ' ' + bodyText;
        
        const linkRegex = /((?:https?:\/\/)?(?:meet\.google\.com|zoom\.us\/j|teams\.microsoft\.com\/l\/meetup-join|webex\.com)\/[^\s"'>]+)/gi;
        const foundLinks = Array.from(combinedText.matchAll(linkRegex), m => {
          let link = m[1];
          if (!link.startsWith('http')) {
            link = 'https://' + link;
          }
          return link;
        });
        const uniqueLinks = [...new Set(foundLinks)];

        // Pre-process combinedText to fix times missing colons (e.g., "4 35 am" -> "4:35 am")
        const preprocessedText = combinedText.replace(/\b(\d{1,2})\s+(\d{2})\s*(am|pm)\b/gi, '$1:$2 $3');

        // Parse date from body text using chrono
        let extractedDate: Date | null = null;
        try {
          const referenceDate = emailDate ? new Date(emailDate) : new Date();
          const parsedResults = chrono.parse(preprocessedText, referenceDate, { forwardDate: true });
          if (parsedResults.length > 0) {
            extractedDate = parsedResults[0].start.date();
          }
        } catch (e) {
          console.error("Date parse error", e);
        }

        return {
          id: msgData.id,
          threadId: msgData.threadId,
          snippet: msgData.snippet,
          subject: subjectText,
          from: getHeader('From') || '(Unknown Sender)',
          date: emailDate,
          meetingLinks: uniqueLinks,
          extractedMeetingTime: extractedDate ? extractedDate.toISOString() : null,
          department: detectDepartment(getHeader('From') || '', subjectText, msgData.snippet || '')
        };
      });

      const parsedEmails = await Promise.all(messagePromises);
      setEmails(parsedEmails);
    } catch (err: any) {
      setError(err.message ?? 'Failed to scan emails');
    } finally {
      setIsLoading(false);
    }
  }, [accessToken]);

  // Automatically scan emails when token is available
  useEffect(() => {
    if (accessToken) {
      scanEmails('');
    } else {
      setEmails([]);
    }
  }, [accessToken, scanEmails]);

  return (
    <GmailContext.Provider value={{ emails, isLoading, error: authError || error, scanEmails }}>
      {children}
    </GmailContext.Provider>
  );
};

export const useGmailContext = () => {
  const ctx = useContext(GmailContext);
  if (!ctx) throw new Error('useGmailContext must be used within a GmailProvider');
  return ctx;
};

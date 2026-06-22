import { useGmailContext } from '../context/GmailContext';
import type { ParsedEmail, GmailContextType as UseGmailReturn } from '../context/GmailContext';

export type { ParsedEmail, UseGmailReturn };

export function useGmail() {
  return useGmailContext();
}

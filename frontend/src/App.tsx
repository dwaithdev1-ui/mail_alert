import { useState, useEffect } from 'react';
import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { GoogleAuthProvider, useGoogleAuth } from './context/GoogleAuthContext';
import { CalendarProvider } from './context/CalendarContext';
import { SettingsProvider } from './context/SettingsContext';
import { ToastProvider } from './context/ToastContext';
import { GmailProvider } from './context/GmailContext';
import Sidebar from './components/Sidebar';
import AlertPort from './components/AlertPort';
import AgentChat from './components/AgentChat';
import VoiceAssistant from './components/VoiceAssistant';
import Dashboard from './pages/Dashboard';
import LoginPage from './pages/LoginPage';
import HelpDesk from './pages/HelpDesk';
import CalendarPage from './pages/CalendarPage';
import SettingsPage from './pages/Settings';
import MailScanner from './pages/MailScanner';
import DepartmentView from './pages/DepartmentView';
import AddressBook from './pages/AddressBook';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || 'YOUR_GOOGLE_CLIENT_ID';

function AppContent() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => !!localStorage.getItem('auth_token'));
  const [isAgentOpen, setIsAgentOpen] = useState(false);
  const { accessToken: googleToken } = useGoogleAuth();

  // Automatic Calendar Sync when Google Token is available
  useEffect(() => {
    if (isAuthenticated && googleToken) {
      const token = localStorage.getItem('auth_token');
      fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/api/calendar/sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ googleAccessToken: googleToken })
      })
      .then(res => res.json())
      .then(data => console.log('Calendar sync result:', data))
      .catch(err => console.error('Calendar sync failed:', err));
    }
  }, [isAuthenticated, googleToken]);

  const handleLoginSuccess = (token: string) => {
    localStorage.setItem('auth_token', token);
    setIsAuthenticated(true);
  };

  const handleLogout = () => {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_user');
    setIsAuthenticated(false);
  };

  return (
    <Router>
      {isAuthenticated ? (
        <div className="app-layout">
          <AlertPort />
          <AgentChat isOpen={isAgentOpen} setIsOpen={setIsAgentOpen} />
          <VoiceAssistant />
          <Sidebar onLogout={handleLogout} isAgentOpen={isAgentOpen} onToggleAgent={() => setIsAgentOpen(!isAgentOpen)} />
          <main className="main-content animate-fade-in">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/calendar" element={<CalendarPage />} />
              <Route path="/mail" element={<MailScanner />} />
              <Route path="/departments" element={<DepartmentView />} />
              <Route path="/contacts" element={<AddressBook />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/help" element={<HelpDesk />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </main>
        </div>
      ) : (
        <LoginPage onLoginSuccess={handleLoginSuccess} />
      )}
    </Router>
  );
}

function App() {
  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <GoogleAuthProvider>
        <GmailProvider>
          <ToastProvider>
            <SettingsProvider>
              <CalendarProvider>
                <AppContent />
              </CalendarProvider>
            </SettingsProvider>
          </ToastProvider>
        </GmailProvider>
      </GoogleAuthProvider>
    </GoogleOAuthProvider>
  );
}

export default App;

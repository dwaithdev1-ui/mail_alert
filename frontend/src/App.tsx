import { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { GoogleOAuthProvider } from '@react-oauth/google';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import LoginPage from './pages/LoginPage';
import HelpDesk from './pages/HelpDesk';


const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || 'YOUR_GOOGLE_CLIENT_ID';

function App() {
  console.log('App component rendered');
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(true);

  const handleLoginSuccess = (token: string) => {
    localStorage.setItem('auth_token', token);
    setIsAuthenticated(true);
  };

  const handleLogout = () => {
    localStorage.removeItem('auth_token');
    setIsAuthenticated(false);
  };

  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <Router>
        {isAuthenticated ? (
          <div className="app-layout">
            <Sidebar onLogout={handleLogout} />
            <main className="main-content animate-fade-in">
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/help" element={<HelpDesk />} />

                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </main>
          </div>
        ) : (
          <LoginPage onLoginSuccess={handleLoginSuccess} />
        )}
      </Router>
    </GoogleOAuthProvider>
  );
}

export default App;

import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import LoginPage from './pages/LoginPage';
import Settings from './pages/Settings';

function App() {
  // TODO: replace with real authentication state (e.g., context or Redux)
  const isAuthenticated = false;

  return (
    <Router>
      {isAuthenticated ? (
        <div className="app-layout">
          <Sidebar />
          <main className="content">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </main>
        </div>
      ) : (
        <LoginPage />
      )}
    </Router>
  );
}

export default App;

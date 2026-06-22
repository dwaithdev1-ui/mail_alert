import React, { useState } from 'react';
import { GoogleLogin } from '@react-oauth/google';
import type { CredentialResponse } from '@react-oauth/google';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5001';
const BASE = import.meta.env.DEV ? '' : API_BASE;
interface LoginPageProps {
  onLoginSuccess: (token: string) => void;
}

const LoginPage: React.FC<LoginPageProps> = ({ onLoginSuccess }) => {
  const [isSignUp, setIsSignUp] = useState(false);
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const handleLocalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (isSignUp) {
        if (!fullName.trim() || !username.trim() || !password.trim()) {
          alert('Please fill out all fields.');
          return;
        }
        if (password !== confirmPassword) {
          alert('Passwords do not match.');
          return;
        }

        const response = await fetch(`${BASE}/api/auth/signup`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fullName, username, password }),
        });

        const data = await response.json();

        if (!response.ok) {
          alert(data.error || 'Signup failed. Please try again.');
          return;
        }

        alert('Account created successfully! Logging you in...');
        if (data.user) {
          localStorage.setItem('auth_user', JSON.stringify({
            id: data.user.id,
            name: data.user.name,
            username: data.user.email
          }));
        }
        onLoginSuccess(data.token);
      } else {
        if (!username.trim() || !password.trim()) {
          alert('Please fill out both fields.');
          return;
        }

        const response = await fetch(`${BASE}/api/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password }),
        });


        const data = await response.json();

        if (!response.ok) {
          alert(data.error || 'Invalid credentials.');
          return;
        }

        if (data.user) {
          localStorage.setItem('auth_user', JSON.stringify({
            id: data.user.id,
            name: data.user.name,
            username: data.user.email
          }));
        }
        onLoginSuccess(data.token);
      }
    } catch (error) {
      console.error('Authentication error:', error);
      alert('Could not connect to the backend server. Please make sure the backend is running.');
    }
  };

  const handleGoogleSuccess = async (credentialResponse: CredentialResponse) => {
    if (!credentialResponse.credential) return;

    try {
      // Decode the Google JWT to extract email + name (already verified by Google on the client)
      const payload = JSON.parse(atob(credentialResponse.credential.split('.')[1]));

      // Register / find this Google user in our own DB so they get a real userId,
      // can set a site password, and have an editable profile.
      const response = await fetch(`${BASE}/api/auth/google`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: payload.email, name: payload.name }),
      });

      const data = await response.json();

      if (!response.ok) {
        alert(data.error || 'Google login failed. Please try again.');
        return;
      }

      if (data.user) {
        localStorage.setItem('auth_user', JSON.stringify({
          id: data.user.id,
          name: data.user.name,
          username: data.user.email,
          isGoogleUser: true,
        }));
      }

      onLoginSuccess(data.token);
    } catch (e) {
      console.error('Google auth error:', e);
      alert('Could not connect to the backend server. Please make sure the backend is running.');
    }
  };

  const handleGoogleError = () => {
    console.error('Google login failed');
  };

  return (
    <div className="auth-page animate-fade-in">
      <section className="auth-card glass-panel">
        <div style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>✉️</div>
        <h2 className="login-title" style={{ marginBottom: '1.5rem' }}>
          {isSignUp ? 'Create Your Account' : 'Welcome to Mail‑Alert'}
        </h2>
        
        <form className="auth-form" onSubmit={handleLocalSubmit}>
          {isSignUp && (
            <div className="form-group animate-fade-in">
              <label htmlFor="fullName">Full Name</label>
              <input
                type="text"
                id="fullName"
                className="form-input"
                placeholder="John Doe"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
              />
            </div>
          )}

          <div className="form-group">
            <label htmlFor="username">Username or Email</label>
            <input
              type="text"
              id="username"
              className="form-input"
              placeholder="Enter your username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </div>
          
          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              type="password"
              id="password"
              className="form-input"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          {isSignUp && (
            <div className="form-group animate-fade-in">
              <label htmlFor="confirmPassword">Confirm Password</label>
              <input
                type="password"
                id="confirmPassword"
                className="form-input"
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
            </div>
          )}

          <button type="submit" className="btn btn-primary" style={{ marginTop: '0.5rem' }}>
            {isSignUp ? 'Create Account' : 'Sign In'}
          </button>
        </form>

        <div className="auth-divider">or</div>

        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1.5rem' }}>
          <GoogleLogin onSuccess={handleGoogleSuccess} onError={handleGoogleError} />
        </div>

        <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
          {isSignUp ? 'Already have an account? ' : "Don't have an account? "}
          <span 
            style={{ 
              color: 'var(--accent-primary)', 
              cursor: 'pointer', 
              textDecoration: 'underline',
              fontWeight: 500
            }}
            onClick={() => {
              setIsSignUp(!isSignUp);
              // Clear fields on toggle
              setFullName('');
              setUsername('');
              setPassword('');
              setConfirmPassword('');
            }}
          >
            {isSignUp ? 'Sign In' : 'Create one'}
          </span>
        </p>
      </section>
    </div>
  );
};

export default LoginPage;


import React from 'react';
import { GoogleLogin } from '@react-oauth/google';
import './LoginPage.css';

const LoginPage: React.FC = () => {
  const handleSuccess = (credentialResponse: any) => {
    console.log('Google login success', credentialResponse);
    // TODO: store token, set auth state, redirect to dashboard
  };

  const handleError = () => {
    console.error('Google login failed');
  };

  return (
    <section className="login-page glass">
      <h2 className="login-title">Welcome to Mail‑Alert Agent</h2>
      <GoogleLogin onSuccess={handleSuccess} onError={handleError} />
    </section>
  );
};

export default LoginPage;

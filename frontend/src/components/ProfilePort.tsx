import React, { useEffect, useState } from 'react';

interface UserInfo {
  fullName: string;
  email: string;
}

const ProfilePort: React.FC = () => {
  const [user, setUser] = useState<UserInfo>({ fullName: '', email: '' });

  // In a real app, decode token or fetch from backend
  useEffect(() => {
    // Placeholder data – replace with actual logic
    const token = localStorage.getItem('auth_token');
    // For demo, we just set static values
    setUser({ fullName: 'John Doe', email: 'john.doe@example.com' });
  }, []);

  return (
    <div className="profile-port glass-panel" style={{ padding: '1rem', marginBottom: '1.5rem', borderRadius: 'var(--radius-md)', textAlign: 'center' }}>
      <div className="avatar" style={{ width: '60px', height: '60px', borderRadius: '50%', background: 'var(--glass-bg)', margin: '0 auto', marginBottom: '0.5rem' }} />
      <h3 style={{ color: 'var(--text-primary)', margin: 0 }}>{user.fullName}</h3>
      <p style={{ color: 'var(--text-secondary)', margin: 0, fontSize: '0.9rem' }}>{user.email}</p>
    </div>
  );
};

export default ProfilePort;

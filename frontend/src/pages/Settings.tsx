import React, { useState, useEffect } from 'react';

interface UserProfile {
  fullName: string;
  email: string;
}

const Settings: React.FC = () => {
  const [profile, setProfile] = useState<UserProfile>({ fullName: '', email: '' });

  // In a real app, fetch profile from backend or decode token
  useEffect(() => {
    const token = localStorage.getItem('auth_token');
    // Placeholder values – replace with actual data as needed
    setProfile({ fullName: 'John Doe', email: 'john.doe@example.com' });
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setProfile(prev => ({ ...prev, [name]: value }));
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    alert('Profile saved (placeholder)');
    // Here you would send the updated profile to the backend
  };

  return (
    <section className="settings-page glass-panel animate-fade-in" style={{ padding: '2rem', maxWidth: '600px', margin: '0 auto' }}>
      <h2 className="page-title">Profile Settings</h2>
      <form className="auth-form" onSubmit={handleSave}>
        <div className="form-group">
          <label htmlFor="fullName">Full Name</label>
          <input id="fullName" name="fullName" className="form-input" value={profile.fullName} onChange={handleChange} required />
        </div>
        <div className="form-group">
          <label htmlFor="email">Email</label>
          <input id="email" name="email" type="email" className="form-input" value={profile.email} onChange={handleChange} required />
        </div>
        <button type="submit" className="btn btn-primary">Save Changes</button>
      </form>
    </section>
  );
};

export default Settings;


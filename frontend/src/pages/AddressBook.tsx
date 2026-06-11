import React, { useState, useEffect, useMemo } from 'react';
import { useToast } from '../context/ToastContext';

interface Contact {
  id: number;
  name: string;
  email: string;
  designation: string | null;
  department: string | null;
}

const AddressBook: React.FC = () => {
  const { showToast } = useToast();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Form states
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [designation, setDesignation] = useState('');
  const [department, setDepartment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001';

  const fetchContacts = async () => {
    setIsLoading(true);
    setError('');
    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`${API_URL}/api/contacts`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch contacts');
      }
      setContacts(data.contacts || []);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Could not load contacts');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchContacts();
  }, []);

  const handleAddContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim()) {
      showToast('Name and Email are required.');
      return;
    }

    setIsSubmitting(true);
    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`${API_URL}/api/contacts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          designation: designation.trim() || undefined,
          department: department.trim() || undefined,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to add contact');
      }

      showToast(`Contact "${name}" saved successfully!`);
      setName('');
      setEmail('');
      setDesignation('');
      setDepartment('');
      fetchContacts();
    } catch (err: any) {
      console.error(err);
      showToast(err.message || 'Failed to add contact');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteContact = async (id: number, contactName: string) => {
    if (!window.confirm(`Are you sure you want to delete ${contactName}?`)) {
      return;
    }

    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`${API_URL}/api/contacts/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to delete contact');
      }

      showToast(`Deleted "${contactName}"`);
      setContacts(prev => prev.filter(c => c.id !== id));
    } catch (err: any) {
      console.error(err);
      showToast(err.message || 'Failed to delete contact');
    }
  };

  const filteredContacts = useMemo(() => {
    if (!searchQuery.trim()) return contacts;
    const q = searchQuery.toLowerCase();
    return contacts.filter(
      c =>
        c.name.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q) ||
        (c.designation && c.designation.toLowerCase().includes(q)) ||
        (c.department && c.department.toLowerCase().includes(q))
    );
  }, [contacts, searchQuery]);

  const getInitials = (fullName: string) => {
    return fullName
      .split(' ')
      .map(n => n.charAt(0))
      .slice(0, 2)
      .join('')
      .toUpperCase();
  };

  // Harmonious gradient generator based on name hash
  const getAvatarGradient = (fullName: string) => {
    let hash = 0;
    for (let i = 0; i < fullName.length; i++) {
      hash = fullName.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue1 = Math.abs(hash % 360);
    const hue2 = (hue1 + 40) % 360;
    return `linear-gradient(135deg, hsl(${hue1}, 75%, 55%) 0%, hsl(${hue2}, 75%, 45%) 100%)`;
  };

  return (
    <section className="stg-page animate-fade-in" style={{ padding: '2rem' }}>
      {/* Page Header */}
      <div className="stg-header">
        <div>
          <h1 className="stg-header__title">Address Book</h1>
          <p className="stg-header__sub">
            Manage your personal contacts for email autocomplete invitations and voice assistant lookups.
          </p>
        </div>
      </div>

      <div className="stg-layout" style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '2rem', marginTop: '2rem' }}>
        {/* Left: Add Contact Form */}
        <div className="stg-section glass-panel" style={{ height: 'fit-content' }}>
          <div className="stg-section__header">
            <span className="stg-section__icon">👤</span>
            <h2 className="stg-section__title">New Contact</h2>
          </div>
          <div className="stg-section__body" style={{ marginTop: '1rem' }}>
            <form onSubmit={handleAddContact} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>Full Name *</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. Dr. Sunita Sharma"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  required
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>Email Address *</label>
                <input
                  type="email"
                  className="form-input"
                  placeholder="e.g. hod.cse@college.edu"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>Designation</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. HOD"
                  value={designation}
                  onChange={e => setDesignation(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>Department</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. Computer Science"
                  value={department}
                  onChange={e => setDepartment(e.target.value)}
                />
              </div>

              <button
                type="submit"
                className="btn btn-primary"
                style={{ width: '100%', padding: '12px', borderRadius: '8px', fontSize: '0.95rem' }}
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Saving...' : 'Add Contact'}
              </button>
            </form>
          </div>
        </div>

        {/* Right: Search & Contacts List */}
        <div className="stg-section glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div className="stg-section__header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <span className="stg-section__icon">📚</span>
              <h2 className="stg-section__title" style={{ margin: 0 }}>Contacts ({filteredContacts.length})</h2>
            </div>
            
            <input
              type="text"
              className="form-input"
              placeholder="🔍 Search name, email, role, or dept..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{ maxWidth: '300px' }}
            />
          </div>

          <div className="stg-section__body" style={{ flex: 1, minHeight: '300px' }}>
            {isLoading ? (
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '200px', color: 'var(--text-secondary)' }}>
                <span>Loading address book...</span>
              </div>
            ) : error ? (
              <div style={{ padding: '1rem', background: 'rgba(220, 38, 38, 0.1)', color: 'var(--danger)', borderRadius: '8px', textAlign: 'center' }}>
                {error}
              </div>
            ) : filteredContacts.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
                <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🎴</div>
                {searchQuery ? 'No matching contacts found.' : 'No contacts saved yet. Add some to get started!'}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {filteredContacts.map(contact => (
                  <div
                    key={contact.id}
                    className="glass-panel"
                    style={{
                      padding: '1.25rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      background: 'rgba(255, 255, 255, 0.02)',
                      border: '1px solid var(--glass-border)',
                      transition: 'transform 0.2s, background 0.2s',
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)';
                      e.currentTarget.style.transform = 'translateY(-2px)';
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.02)';
                      e.currentTarget.style.transform = 'translateY(0)';
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
                      {/* Initials Avatar Orb */}
                      <div
                        style={{
                          width: '46px',
                          height: '46px',
                          borderRadius: '50%',
                          background: getAvatarGradient(contact.name),
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '1rem',
                          fontWeight: 'bold',
                          color: '#ffffff',
                          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
                          flexShrink: 0,
                        }}
                      >
                        {getInitials(contact.name)}
                      </div>

                      {/* Contact details */}
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '1.05rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                            {contact.name}
                          </span>
                          {contact.designation && (
                            <span
                              style={{
                                fontSize: '0.75rem',
                                background: 'rgba(14, 165, 233, 0.12)',
                                color: 'var(--accent-primary)',
                                padding: '0.2rem 0.5rem',
                                borderRadius: '12px',
                                fontWeight: 500,
                              }}
                            >
                              {contact.designation}
                            </span>
                          )}
                          {contact.department && (
                            <span
                              style={{
                                fontSize: '0.75rem',
                                background: 'rgba(255, 255, 255, 0.08)',
                                color: 'var(--text-secondary)',
                                padding: '0.2rem 0.5rem',
                                borderRadius: '12px',
                                fontWeight: 500,
                              }}
                            >
                              {contact.department}
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                          {contact.email}
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <button
                      className="btn"
                      style={{
                        padding: '0.5rem',
                        background: 'transparent',
                        color: 'rgba(239, 68, 68, 0.6)',
                        border: 'none',
                        cursor: 'pointer',
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'all 0.2s',
                      }}
                      onMouseEnter={e => {
                        e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)';
                        e.currentTarget.style.color = 'var(--danger)';
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.background = 'transparent';
                        e.currentTarget.style.color = 'rgba(239, 68, 68, 0.6)';
                      }}
                      onClick={() => handleDeleteContact(contact.id, contact.name)}
                      title="Delete Contact"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        <line x1="10" y1="11" x2="10" y2="17"></line>
                        <line x1="14" y1="11" x2="14" y2="17"></line>
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};

export default AddressBook;

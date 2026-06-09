import React, { useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';

interface SidebarProps {
  onLogout: () => void;
  isAgentOpen: boolean;
  onToggleAgent: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ onLogout, isAgentOpen, onToggleAgent }) => {
  const [user, setUser] = useState<{ name: string; username: string } | null>(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('auth_user');
      if (stored) {
        setUser(JSON.parse(stored));
      }
    } catch (e) {
      console.error('Failed to parse auth_user', e);
    }
  }, []);

  return (
    <nav className="sidebar glass">
      <ul>
        <li>
          <NavLink to="/" end className={({ isActive }) => (isActive ? 'active' : undefined)}>
            Home
          </NavLink>
        </li>
        <li>
          <NavLink to="/calendar" className={({ isActive }) => (isActive ? 'active' : undefined)}>
            Calendar
          </NavLink>
        </li>
        <li>
          <NavLink to="/mail" className={({ isActive }) => (isActive ? 'active' : undefined)}>
            Meeting Scanner
          </NavLink>
        </li>
        <li>
          <NavLink to="/departments" className={({ isActive }) => (isActive ? 'active' : undefined)}>
            Departments
          </NavLink>
        </li>
        <li>
          <NavLink to="/contacts" className={({ isActive }) => (isActive ? 'active' : undefined)}>
            Address Book
          </NavLink>
        </li>
        <li>
          <NavLink to="/settings" className={({ isActive }) => (isActive ? 'active' : undefined)}>
            Settings
          </NavLink>
        </li>
        <li>
          <NavLink to="/help" className={({ isActive }) => (isActive ? 'active' : undefined)}>
            Help Desk
          </NavLink>
        </li>
      </ul>

      <div style={{
        marginTop: 'auto',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
      }}>
        <button
          onClick={onToggleAgent}
          style={{
            width: '100%',
            textAlign: 'left',
            background: isAgentOpen ? 'rgba(14, 165, 233, 0.15)' : 'transparent',
            border: 'none',
            textDecoration: 'none',
            color: isAgentOpen ? 'var(--accent-primary)' : 'var(--text-secondary)',
            fontWeight: 500,
            padding: '0.75rem 1rem',
            borderRadius: 'var(--radius-sm)',
            transition: 'all 0.2s ease',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            cursor: 'pointer',
            fontFamily: 'inherit',
            fontSize: 'inherit',
          }}
          onMouseEnter={e => {
            if (!isAgentOpen) {
              e.currentTarget.style.background = 'var(--hover-bg)';
              e.currentTarget.style.color = 'var(--text-primary)';
            }
          }}
          onMouseLeave={e => {
            if (!isAgentOpen) {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.color = 'var(--text-secondary)';
            }
          }}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{
              color: isAgentOpen ? 'var(--accent-primary)' : 'var(--text-secondary)',
              filter: isAgentOpen ? 'drop-shadow(0 0 5px rgba(14, 165, 233, 0.5))' : 'none',
            }}
          >
            <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
          </svg>
          <span>AI Assistant</span>
        </button>

        <div style={{
          padding: '12px',
          background: 'var(--glass-bg)',
          border: '1px solid var(--glass-border)',
          boxShadow: 'var(--glass-shadow)',
          borderRadius: '14px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
        }}>
        {/* User Profile Info */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {/* Avatar Orb */}
          <div style={{
            width: '36px',
            height: '36px',
            borderRadius: '50%',
            background: 'linear-gradient(135deg, var(--accent-primary) 0%, #6366f1 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '0.85rem',
            fontWeight: 'bold',
            color: 'white',
            boxShadow: '0 2px 8px rgba(14, 165, 233, 0.25)',
            flexShrink: 0,
          }}>
            {user ? user.name.charAt(0).toUpperCase() : 'U'}
          </div>
          
          {/* Text Details */}
          <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', flex: 1 }}>
            <span style={{
              fontSize: '0.85rem',
              fontWeight: 600,
              color: 'var(--text-primary)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis'
            }}>
              {user ? user.name : 'User'}
            </span>
            <span style={{
              fontSize: '0.7rem',
              color: 'var(--text-secondary)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis'
            }}>
              {user ? user.username : ''}
            </span>
          </div>
        </div>

        {/* Action Button: Logout */}
        <button
          onClick={onLogout}
          style={{
            width: '100%',
            padding: '8px 12px',
            background: 'rgba(239, 68, 68, 0.08)',
            border: '1px solid rgba(239, 68, 68, 0.18)',
            color: 'var(--danger)',
            fontSize: '0.78rem',
            fontWeight: 600,
            borderRadius: '8px',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            fontFamily: 'inherit',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = 'rgba(239, 68, 68, 0.15)';
            e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.35)';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = 'rgba(239, 68, 68, 0.08)';
            e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.18)';
          }}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
            <polyline points="16 17 21 12 16 7"></polyline>
            <line x1="21" y1="12" x2="9" y2="12"></line>
          </svg>
          <span>Logout</span>
        </button>
      </div>
      </div>
    </nav>
  );
};

export default Sidebar;

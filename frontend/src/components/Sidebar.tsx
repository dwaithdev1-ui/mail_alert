import React from 'react';
import { NavLink } from 'react-router-dom';
import AlertPort from './AlertPort';
import { useCalendarContext } from '../context/CalendarContext';

interface SidebarProps {
  onLogout: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ onLogout }) => {
  const { events } = useCalendarContext();

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

      <div style={{ marginTop: 'auto' }}>
        <button onClick={onLogout} className="logoutBtn">
          Disconnect
        </button>
      </div>
    </nav>
  );
};

export default Sidebar;

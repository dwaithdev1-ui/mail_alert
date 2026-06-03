import React from 'react';
import { NavLink } from 'react-router-dom';
import AlertPort from './AlertPort';

import { meetings } from '../data/meetings';

interface SidebarProps {
  onLogout: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ onLogout }) => {
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
      
      <AlertPort meetings={meetings} />
      <button className="logoutBtn" onClick={onLogout}>Logout</button>
    </nav>
  );
};

export default Sidebar;

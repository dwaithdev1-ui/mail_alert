import React from 'react';
import { NavLink } from 'react-router-dom';

interface SidebarProps {
  onLogout: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ onLogout }) => {
  return (
    <nav className="sidebar glass">
      <ul>
        <li>
          <NavLink to="/" end className={({ isActive }) => isActive ? 'active' : undefined}>
            Home
          </NavLink>
        </li>
        <li>
          <NavLink to="/calendar" className={({ isActive }) => isActive ? 'active' : undefined}>
            Calendar
          </NavLink>
        </li>
        <li>
          <NavLink to="/settings" className={({ isActive }) => isActive ? 'active' : undefined}>
            Settings
          </NavLink>
        </li>
        <li>
          <button className="logoutBtn" onClick={onLogout}>Logout</button>
        </li>
      </ul>
    </nav>
  );
};

export default Sidebar;

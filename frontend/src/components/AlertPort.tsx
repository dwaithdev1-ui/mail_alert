import React, { useEffect, useState } from 'react';

interface Meeting {
  title: string;
  time: string; // ISO string
}

interface AlertPortProps {
  meetings: Meeting[];
}

/**
 * AlertPort – displayed in the left sidebar.
 * Shows a badge when a meeting starts within the next 5 minutes.
 */
const AlertPort: React.FC<AlertPortProps> = ({ meetings }) => {
  const [activeAlerts, setActiveAlerts] = useState<Meeting[]>([]);

  useEffect(() => {
    const checkAlerts = () => {
      const now = Date.now();
      const fiveMins = 5 * 60 * 1000;
      const alerts = meetings.filter((m) => {
        const meetingTime = new Date(m.time).getTime();
        const diff = meetingTime - now;
        return diff > 0 && diff <= fiveMins;
      });
      setActiveAlerts(alerts);
    };
    checkAlerts();
    const intervalId = setInterval(checkAlerts, 30 * 1000);
    return () => clearInterval(intervalId);
  }, [meetings]);

  if (activeAlerts.length === 0) {
    return null;
  }

  return (
    <div className="alert-port glass">
      <h3 className="alert-title">Upcoming Alerts</h3>
      <ul className="alert-list">
        {activeAlerts.map((m) => (
          <li key={m.title} className="alert-item">
            <span className="alert-meeting">{m.title}</span>
            <span className="alert-badge">5 min</span>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default AlertPort;

import React, { useEffect, useState } from 'react';
import { Meeting, meetings } from '../data/meetings';

/**
 * AlertDesk – a glass‑styled desk that shows meetings occurring within the next 5 minutes.
 */
const AlertDesk: React.FC = () => {
  const [upcoming, setUpcoming] = useState<Meeting[]>([]);

  useEffect(() => {
    const check = () => {
      const now = Date.now();
      const fiveMins = 5 * 60 * 1000;
      const alerts = meetings.filter((m) => {
        const diff = new Date(m.time).getTime() - now;
        return diff > 0 && diff <= fiveMins;
      });
      setUpcoming(alerts);
    };
    check();
    const interval = setInterval(check, 30 * 1000);
    return () => clearInterval(interval);
  }, []);

  if (upcoming.length === 0) return null;

  return (
    <div className="glass-panel" style={{ padding: '0.75rem', marginBottom: '1rem' }}>
      <h3 className="page-title" style={{ fontSize: '1rem', marginBottom: '0.5rem' }}>
        Upcoming Alerts
      </h3>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {upcoming.map((m) => (
          <li key={m.title} style={{ marginBottom: '0.25rem', color: 'var(--text-primary)' }}>
            {m.title} – in <strong>5 min</strong>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default AlertDesk;

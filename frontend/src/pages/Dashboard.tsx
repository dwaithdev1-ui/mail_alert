import React, { useMemo } from 'react';
import type { Meeting } from '../data/meetings';
import { meetings } from '../data/meetings';
import { isToday } from 'date-fns';

/**
 * Determine meeting status relative to the current time.
 *   - "done": meeting ended more than 5 minutes ago.
 *   - "ongoing": meeting is within ±5 minutes of now.
 *   - "today": meeting later today (but not within the ongoing window).
 *   - "upcoming": any future meeting beyond today.
 */
const getMeetingStatus = (meeting: Meeting): 'done' | 'ongoing' | 'today' | 'upcoming' => {
  const now = new Date();
  const meetingTime = new Date(meeting.time);
  const diffMins = Math.round((meetingTime.getTime() - now.getTime()) / 60000);
  if (diffMins < -5) return 'done';
  if (diffMins >= -5 && diffMins <= 5) return 'ongoing';
  if (isToday(meetingTime)) return 'today';
  return 'upcoming';
};

const Dashboard: React.FC = () => {
  console.log('Dashboard rendered');
  const { done, ongoing, today, upcoming } = useMemo(() => {
    const d: Meeting[] = [];
    const o: Meeting[] = [];
    const t: Meeting[] = [];
    const u: Meeting[] = [];
    meetings.forEach((m) => {
      const status = getMeetingStatus(m);
      if (status === 'done') d.push(m);
      else if (status === 'ongoing') o.push(m);
      else if (status === 'today') t.push(m);
      else u.push(m);
    });
    return { done: d, ongoing: o, today: t, upcoming: u };
  }, []);

  const renderSection = (title: string, list: Meeting[]) => (
    <section className="email-card glass-panel" style={{ marginBottom: '1.5rem' }}>
      <h3 className="page-title" style={{ marginBottom: '0.5rem' }}>{title}</h3>
      {list.length === 0 ? (
        <p className="text-secondary">No meetings</p>
      ) : (
        list.map((m, idx) => (
          <div key={idx} style={{ marginBottom: '0.75rem' }}>
            <h4 style={{ margin: 0 }}>{m.title}</h4>
            <p className="meeting-time" style={{ margin: 0 }}>
              <strong>Time:</strong> {new Date(m.time).toLocaleString()}
            </p>
          </div>
        ))
      )}
    </section>
  );

  return (
    <section className="dashboard glass-panel" style={{ padding: '2rem', maxWidth: '1000px', margin: '0 auto' }}>
      <h1 className="page-title" style={{ marginBottom: '1rem' }}>Dashboard</h1>
      {renderSection('Meetings Done', done)}
      {renderSection('Ongoing Meetings', ongoing)}
      {renderSection('Meetings Due Today', today)}
      {renderSection('Upcoming Meetings', upcoming)}
    </section>
  );
};

export default Dashboard;

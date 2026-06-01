import React from 'react';
import './Dashboard.css';

const Dashboard: React.FC = () => (
  <section className="dashboard container">
    <h2 className="page-title">Upcoming Meetings</h2>

    <section className="email-card glass">
      <h4>Project Review Meeting</h4>
      <p className="subject"><strong>Subject:</strong> Project Review Meeting</p>
      <p className="meeting-time"><strong>Time:</strong> Tomorrow 10:00 AM</p>
      <button
        className="btn btn-action"
        onClick={() => alert('Add to Google Calendar – placeholder')}
      >
        Add to Google Calendar
      </button>
    </section>

    <section className="email-card glass">
      <h4>ECE Department Update</h4>
      <p className="subject"><strong>Subject:</strong> Weekly Lab Schedule</p>
      <p className="meeting-time"><strong>Time:</strong> Thursday 2:30 PM</p>
      <button
        className="btn btn-action"
        onClick={() => alert('Add to Google Calendar – placeholder')}
      >
        Add to Google Calendar
      </button>
    </section>
  </section>
);

export default Dashboard;

import React from "react";
import {
  Bell,
  Calendar,
  Mail,
  AlertTriangle,
  Settings,
} from "lucide-react";

export default function PrincipalDashboard() {
  const meetings = [
    {
      id: 1,
      dept: "CSE",
      title: "Project Review Meeting",
      time: "10:00 AM",
    },
    {
      id: 2,
      dept: "ECE",
      title: "Lab Inspection",
      time: "12:30 PM",
    },
    {
      id: 3,
      dept: "MECH",
      title: "Faculty Discussion",
      time: "3:00 PM",
    },
  ];

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <h1>Principal Dashboard</h1>

        <div style={styles.notification}>
          <Bell size={22} />
          <span style={styles.badge}>3</span>
        </div>
      </div>

      {/* Daily Briefing */}
      <div style={styles.card}>
        <h2>
          <Calendar size={20} /> Daily Briefing
        </h2>

        <p>✔ 3 meetings scheduled today</p>
        <p>✔ 2 new mails from HODs</p>
        <p>✔ 1 meeting conflict detected</p>
      </div>

      {/* Meetings List */}
      <div style={styles.card}>
        <h2>
          <Mail size={20} /> Meetings & Alerts
        </h2>

        {meetings.map((meeting) => (
          <div key={meeting.id} style={styles.meetingCard}>
            <div>
              <h3>{meeting.title}</h3>
              <p>Department: {meeting.dept}</p>
              <p>Time: {meeting.time}</p>
            </div>

            <button style={styles.button}>View</button>
          </div>
        ))}
      </div>

      {/* Conflict Warning */}
      <div style={styles.warning}>
        <AlertTriangle size={20} />
        <span>
          Conflict Warning: Two meetings overlap at 3:00 PM
        </span>
      </div>

      {/* Alert Configuration */}
      <div style={styles.card}>
        <h2>
          <Settings size={20} /> Alert Configuration
        </h2>

        <label>
          <input type="checkbox" defaultChecked />
          Email Notifications
        </label>

        <br />

        <label>
          <input type="checkbox" defaultChecked />
          Push Notifications
        </label>

        <br />

        <label>
          Reminder Before Meeting:
          <select style={styles.select}>
            <option>10 Minutes</option>
            <option>30 Minutes</option>
            <option>1 Hour</option>
          </select>
        </label>
      </div>
    </div>
  );
}

const styles = {
  container: {
    padding: "20px",
    fontFamily: "Arial",
    backgroundColor: "#f4f6f9",
    minHeight: "100vh",
  },

  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "20px",
  },

  notification: {
    position: "relative",
    cursor: "pointer",
  },

  badge: {
    position: "absolute",
    top: "-8px",
    right: "-8px",
    backgroundColor: "red",
    color: "white",
    borderRadius: "50%",
    width: "18px",
    height: "18px",
    fontSize: "12px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },

  card: {
    backgroundColor: "white",
    padding: "20px",
    borderRadius: "10px",
    marginBottom: "20px",
    boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
  },

  meetingCard: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "15px",
    border: "1px solid #ddd",
    borderRadius: "8px",
    marginTop: "10px",
  },

  button: {
    padding: "8px 15px",
    backgroundColor: "#2563eb",
    color: "white",
    border: "none",
    borderRadius: "5px",
    cursor: "pointer",
  },

  warning: {
    backgroundColor: "#fff3cd",
    color: "#856404",
    padding: "15px",
    borderRadius: "8px",
    display: "flex",
    alignItems: "center",
    gap: "10px",
    marginBottom: "20px",
  },

  select: {
    marginLeft: "10px",
    padding: "5px",
  },
};
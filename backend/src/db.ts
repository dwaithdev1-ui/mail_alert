import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const schema = process.env.DB_SCHEMA || 'personal_agent';

const initInMemory = (): Pool => {
  const { newDb } = require('pg-mem');
  const memDb = newDb();

  memDb.public.none(`
    CREATE SCHEMA IF NOT EXISTS ${schema};
    SET search_path TO ${schema}, public;
  `);

  // Users table
  memDb.public.none(`
    CREATE TABLE ${schema}.users (
      id SERIAL PRIMARY KEY,
      full_name TEXT NOT NULL,
      username TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      google_token TEXT,
      google_refresh_token TEXT,
      is_google_user BOOLEAN DEFAULT false,
      created_at TIMESTAMP DEFAULT now()
    );
  `);

  // Meetings table
  memDb.public.none(`
    CREATE TABLE ${schema}.meetings (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES ${schema}.users(id),
      title TEXT NOT NULL,
      start_time TIMESTAMP NOT NULL,
      end_time TIMESTAMP NOT NULL,
      location TEXT,
      description TEXT,
      gcal_event_id TEXT,
      google_event_id TEXT UNIQUE,
      color_id TEXT,
      source TEXT DEFAULT 'manual',
      status TEXT DEFAULT 'scheduled',
      attendees TEXT[],
      created_at TIMESTAMP DEFAULT now(),
      updated_at TIMESTAMP DEFAULT now()
    );
  `);

  // Alerts table
  memDb.public.none(`
    CREATE TABLE ${schema}.alerts (
      id SERIAL PRIMARY KEY,
      meeting_id INTEGER REFERENCES ${schema}.meetings(id),
      threshold_min INTEGER NOT NULL,
      channel TEXT DEFAULT 'in-app',
      fired_at TIMESTAMP DEFAULT now(),
      UNIQUE (meeting_id, threshold_min, channel)
    );
  `);

  // Notifications table
  memDb.public.none(`
    CREATE TABLE ${schema}.notifications (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES ${schema}.users(id),
      meeting_id INTEGER REFERENCES ${schema}.meetings(id),
      message TEXT NOT NULL,
      is_read BOOLEAN DEFAULT false,
      read_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT now()
    );
  `);

  // Conflicts table
  memDb.public.none(`
    CREATE TABLE ${schema}.conflicts (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES ${schema}.users(id),
      proposed_start TIMESTAMP NOT NULL,
      proposed_end TIMESTAMP NOT NULL,
      conflicting_meeting_id INTEGER REFERENCES ${schema}.meetings(id),
      detected_at TIMESTAMP DEFAULT now(),
      UNIQUE (user_id, proposed_start, proposed_end, conflicting_meeting_id)
    );
  `);

  // Briefings table
  memDb.public.none(`
    CREATE TABLE ${schema}.briefings (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES ${schema}.users(id),
      brief_date DATE NOT NULL,
      content TEXT NOT NULL,
      model TEXT,
      created_at TIMESTAMP DEFAULT now(),
      UNIQUE (user_id, brief_date)
    );
  `);

  // Departments table
  memDb.public.none(`
    CREATE TABLE ${schema}.departments (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES ${schema}.users(id),
      name TEXT NOT NULL,
      hod_name TEXT,
      hod_email TEXT,
      created_at TIMESTAMP DEFAULT now(),
      UNIQUE (user_id, name)
    );
  `);

  // Emails table
  memDb.public.none(`
    CREATE TABLE ${schema}.emails (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES ${schema}.users(id),
      gmail_message_id TEXT,
      from_address TEXT,
      subject TEXT,
      snippet TEXT,
      body TEXT,
      received_at TIMESTAMP,
      department TEXT,
      meeting_links TEXT[],
      extracted_time TIMESTAMP,
      parsed_meeting_id INTEGER REFERENCES ${schema}.meetings(id),
      created_at TIMESTAMP DEFAULT now()
    );
  `);

  // Jobs table
  memDb.public.none(`
    CREATE TABLE ${schema}.jobs (
      id SERIAL PRIMARY KEY,
      queue TEXT NOT NULL,
      bull_job_id TEXT,
      status TEXT DEFAULT 'pending',
      payload JSONB,
      result JSONB,
      error TEXT,
      created_at TIMESTAMP DEFAULT now(),
      updated_at TIMESTAMP DEFAULT now()
    );
  `);

  // Contacts table
  memDb.public.none(`
    CREATE TABLE ${schema}.contacts (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES ${schema}.users(id),
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      designation TEXT,
      department TEXT,
      created_at TIMESTAMP DEFAULT now(),
      UNIQUE (user_id, email)
    );
  `);

  // Tickets table
  memDb.public.none(`
    CREATE TABLE ${schema}.tickets (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT DEFAULT 'open',
      priority TEXT DEFAULT 'medium',
      created_by INTEGER REFERENCES ${schema}.users(id),
      assigned_to INTEGER REFERENCES ${schema}.users(id),
      created_at TIMESTAMP DEFAULT now(),
      updated_at TIMESTAMP DEFAULT now()
    );
  `);

  // Ticket attachments table
  memDb.public.none(`
    CREATE TABLE ${schema}.ticket_attachments (
      id SERIAL PRIMARY KEY,
      ticket_id INTEGER REFERENCES ${schema}.tickets(id),
      filename TEXT NOT NULL,
      filepath TEXT NOT NULL,
      uploaded_at TIMESTAMP DEFAULT now()
    );
  `);

  // Ticket audit table
  memDb.public.none(`
    CREATE TABLE ${schema}.ticket_audit (
      id SERIAL PRIMARY KEY,
      ticket_id INTEGER REFERENCES ${schema}.tickets(id),
      action TEXT NOT NULL,
      actor_user_id INTEGER REFERENCES ${schema}.users(id),
      detail JSONB,
      changed_at TIMESTAMP DEFAULT now()
    );
  `);

  // Insert demo data
  const bcrypt = require('bcryptjs');
  const hashedDemo = bcrypt.hashSync('password', 10);
  const hashedPrincipal = bcrypt.hashSync('123456', 10);
  
  memDb.public.none(`INSERT INTO ${schema}.users (full_name, username, password) VALUES ('Demo User', 'demo', '${hashedDemo}');`);
  memDb.public.none(`INSERT INTO ${schema}.users (full_name, username, password) VALUES ('Principal User', 'principal@gmail.com', '${hashedPrincipal}');`);
  
  const now = new Date();
  const start = new Date(now.getTime() + 5 * 60 * 1000);
  const end = new Date(now.getTime() + 60 * 60 * 1000);
  
  memDb.public.none(`
    INSERT INTO ${schema}.meetings (user_id, title, start_time, end_time, status)
    VALUES (1, 'Demo Meeting', '${start.toISOString()}', '${end.toISOString()}', 'scheduled');
  `);

  // Seed mock contacts for Principal (id = 2)
  const defaultContacts = [
    { name: 'Dr. Ramesh Kumar', email: 'dean.academic@college.edu', designation: 'Dean', department: 'Academics' },
    { name: 'Dr. Sunita Sharma', email: 'hod.cse@college.edu', designation: 'HOD', department: 'Computer Science' },
    { name: 'Dr. Anil Verma', email: 'hod.ece@college.edu', designation: 'HOD', department: 'Electronics' },
    { name: 'Dr. Priya Nair', email: 'hod.me@college.edu', designation: 'HOD', department: 'Mechanical' },
    { name: 'Mr. Satish Reddy', email: 'registrar@college.edu', designation: 'Registrar', department: 'Administration' },
  ];

  for (const dc of defaultContacts) {
    memDb.public.none(`
      INSERT INTO ${schema}.contacts (user_id, name, email, designation, department)
      VALUES (2, '${dc.name}', '${dc.email}', '${dc.designation}', '${dc.department}');
    `);
  }

  const { Pool } = memDb.adapters.createPg();
  return new Pool() as any;
};
let pool: Pool;


if (process.env.USE_IN_MEMORY === 'true' ||
    !(process.env.DB_HOST && process.env.DB_PORT && process.env.DB_USER && process.env.DB_PASSWORD && process.env.DB_NAME)) {
  // Use in‑memory DB
  pool = initInMemory();
} else {
  // Real PostgreSQL connection
  const connectionString = `postgresql://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`;
  pool = new Pool({ connectionString });
}

export default pool;
export const schemaName = schema;

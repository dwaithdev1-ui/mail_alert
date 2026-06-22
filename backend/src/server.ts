import dotenv from 'dotenv';
dotenv.config();
import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import pool, { schemaName } from './db';
import { startMeetingAlertScanner } from './checkMeetings';

// Route imports
import meetingsRouter from './routes/meetings';
import alertsRouter from './routes/alerts';
import notificationsRouter from './routes/notifications';
import conflictsRouter from './routes/conflicts';
import contactsRouter from './routes/contacts';
import ticketsRouter from './routes/tickets';
import googleAuthRouter from './routes/googleAuth';
import agentRouter from './routes/agent';
import briefingRouter from './routes/briefing';
import calendarSyncRouter from './routes/calendarSync';

const app = express();
let PORT = parseInt(process.env.PORT || '5001', 10);

// Helper to start server with automatic port increment on conflict
const startServer = (port: number) => {
  const server = app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
    if (process.env.ENABLE_SCANNER !== 'false') {
      try {
        startMeetingAlertScanner();
      } catch (e: any) {
        console.warn('Alert scanner failed to start:', e.message || e);
      }
    }
  });
  server.on('error', (err: any) => {
    if (err.code === 'EADDRINUSE') {
      console.warn(`Port ${port} in use, trying ${port + 1}`);
      startServer(port + 1);
    } else {
      console.error('Server error:', err);
    }
  });
};

app.use(cors());
app.use(express.json());

// ── API routes ───────────────────────────────────────────────────────
app.use('/api/meetings', meetingsRouter);
app.use('/api/alerts', alertsRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api/conflicts', conflictsRouter);
app.use('/api/agent', agentRouter);
app.use('/api/briefing', briefingRouter);
app.use('/api/calendar', calendarSyncRouter);
app.use('/api/tickets', ticketsRouter);
app.use('/api/contacts', contactsRouter);
app.use('/api/auth/google', googleAuthRouter);

// ── Signup ───────────────────────────────────────────────────────
app.post('/api/auth/signup', async (req, res) => {
  const { fullName, username, password } = req.body;
  if (!fullName || !username || !password) {
    return res.status(400).json({ error: 'All fields are required' });
  }
  try {
    const userCheck = await pool.query(
      `SELECT id FROM ${schemaName}.users WHERE username = $1`,
      [username.trim()]
    );
    if (userCheck.rows.length > 0) {
      return res.status(400).json({ error: 'Username or email already exists' });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const insertResult = await pool.query(
      `INSERT INTO ${schemaName}.users (full_name, username, password) VALUES ($1, $2, $3) RETURNING id, full_name, username`,
      [fullName.trim(), username.trim(), hashedPassword]
    );
    const newUser = insertResult.rows[0];
    return res.status(201).json({
      success: true,
      message: 'Account created successfully!',
      token: `token-${newUser.id}-${Date.now()}`,
      user: { id: newUser.id, name: newUser.full_name, email: newUser.username, isGoogleUser: false }
    });
  } catch (error: any) {
    console.error('Signup error:', error);
    return res.status(500).json({ error: 'Internal server error during registration' });
  }
});

// ── Login ───────────────────────────────────────────────────────
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }
  try {
    const userResult = await pool.query(
      `SELECT * FROM ${schemaName}.users WHERE username = $1`,
      [username.trim()]
    );
    if (userResult.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }
    const user = userResult.rows[0];
    const isPasswordMatch = await bcrypt.compare(password, user.password);
    if (!isPasswordMatch) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }
    return res.status(200).json({
      success: true,
      message: 'Logged in successfully!',
      token: `token-${user.id}-${Date.now()}`,
      user: { id: user.id, name: user.full_name, email: user.username, isGoogleUser: false }
    });
  } catch (error: any) {
    console.error('Login error (DB query failed):', error);
    if (error.code === 'ECONNREFUSED') {
      return res.status(500).json({ error: 'Database connection failed. Please ensure the database is running.' });
    }
    return res.status(500).json({ error: 'Internal server error during login' });
  }
});

// ── Update username / password ─────────────────────────────────────────────────
app.post('/api/user/update', async (req, res) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }
  const parts = token.split('-');
  const userId = parseInt(parts[1], 10);
  if (parts[0] !== 'token' || isNaN(userId)) {
    return res.status(403).json({ error: 'Invalid token' });
  }
  const { username, password } = req.body;
  if (!username && !password) {
    return res.status(400).json({ error: 'Either username or password is required to update' });
  }
  try {
    const client = await pool.connect();
    try {
      if (username) {
        const userCheck = await client.query(
          `SELECT id FROM ${schemaName}.users WHERE username = $1 AND id != $2`,
          [username.trim(), userId]
        );
        if (userCheck.rows.length > 0) {
          return res.status(400).json({ error: 'Username already exists' });
        }
        await client.query(
          `UPDATE ${schemaName}.users SET username = $1 WHERE id = $2`,
          [username.trim(), userId]
        );
      }
      if (password) {
        const hashedPassword = await bcrypt.hash(password, 10);
        await client.query(
          `UPDATE ${schemaName}.users SET password = $1 WHERE id = $2`,
          [hashedPassword, userId]
        );
      }
      const userResult = await client.query(
        `SELECT id, full_name, username FROM ${schemaName}.users WHERE id = $1`,
        [userId]
      );
      if (userResult.rows.length === 0) {
        return res.status(404).json({ error: 'User not found' });
      }
      const u = userResult.rows[0];
      return res.status(200).json({
        success: true,
        message: 'Account updated successfully!',
        user: { id: u.id, name: u.full_name, email: u.username }
      });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Update error:', error);
    return res.status(500).json({ error: 'Internal server error during update' });
  }
});

// ── Health check ───────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', schema: schemaName });
});

// Start the server
startServer(PORT);
process.on('SIGINT', () => {
  console.log('\ud83d\udc4b Shutting down server...');
  process.exit(0);
});


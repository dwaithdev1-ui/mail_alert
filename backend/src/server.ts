import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import pool, { schemaName } from './db';

// Phase 1 routes
import meetingsRouter      from './routes/meetings';
import alertsRouter        from './routes/alerts';
import notificationsRouter from './routes/notifications';
import conflictsRouter     from './routes/conflicts';
// Phase 2 routes
import agentRouter         from './routes/agent';
import briefingRouter      from './routes/briefing';
// Phase 4 routes
import calendarSyncRouter  from './routes/calendarSync';
import contactsRouter      from './routes/contacts';

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// ── Phase 1 API routes ───────────────────────────────────────────────────────
app.use('/api/meetings',      meetingsRouter);
app.use('/api/alerts',        alertsRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api/conflicts',     conflictsRouter);
// ── Phase 2 API routes ───────────────────────────────────────────────────────
app.use('/api/agent',         agentRouter);
app.use('/api/briefing',      briefingRouter);
// ── Phase 4 API routes ───────────────────────────────────────────────────────
app.use('/api/calendar',      calendarSyncRouter);
app.use('/api/contacts',      contactsRouter);

// ── Signup ────────────────────────────────────────────────────────────────────
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
      `INSERT INTO ${schemaName}.users (full_name, username, password)
       VALUES ($1, $2, $3) RETURNING id, full_name, username`,
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

// ── Login ─────────────────────────────────────────────────────────────────────
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
    console.error('Login error:', error);
    return res.status(500).json({ error: 'Internal server error during login' });
  }
});

// ── Google OAuth → DB ─────────────────────────────────────────────────────────
// Creates or finds the user in our own DB so Google users get a real ID,
// can set a site-specific password, and have an editable username/display name.
app.post('/api/auth/google', async (req, res) => {
  const { email, name } = req.body;

  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }

  try {
    let userResult = await pool.query(
      `SELECT id, full_name, username FROM ${schemaName}.users WHERE username = $1`,
      [email.trim()]
    );

    let user;
    if (userResult.rows.length === 0) {
      // New Google user — store with a random placeholder password.
      // They can set a real site password later via /api/user/update.
      const placeholderPassword = await bcrypt.hash(randomBytes(32).toString('hex'), 10);
      const insertResult = await pool.query(
        `INSERT INTO ${schemaName}.users (full_name, username, password)
         VALUES ($1, $2, $3) RETURNING id, full_name, username`,
        [name?.trim() || email.trim(), email.trim(), placeholderPassword]
      );
      user = insertResult.rows[0];
    } else {
      user = userResult.rows[0];
    }

    return res.status(200).json({
      success: true,
      token: `token-${user.id}-${Date.now()}`,
      user: { id: user.id, name: user.full_name, email: user.username, isGoogleUser: true }
    });
  } catch (error: any) {
    console.error('Google auth error:', error);
    return res.status(500).json({ error: 'Internal server error during Google auth' });
  }
});

// ── Update username / password ─────────────────────────────────────────────────
// Works for ALL users (local and Google OAuth). 
// Google users: email (login key) cannot be changed, but site password CAN be set.
app.post('/api/user/update', async (req, res) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  // Token format: token-{userId}-{timestamp}
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
        // Ensure no other user already has this username (note: both $1 and $2 supplied)
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
  } catch (error: any) {
    console.error('Update error:', error);
    return res.status(500).json({ error: 'Internal server error during update' });
  }
});

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', schema: schemaName });
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});

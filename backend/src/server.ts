import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import pool, { schemaName } from './db';

const app = express();
const PORT = process.env.PORT || 5000;

// Enable CORS so the React app running on another port can make requests
app.use(cors());
app.use(express.json());

// Signup route
app.post('/api/auth/signup', async (req, res) => {
  const { fullName, username, password } = req.body;

  if (!fullName || !username || !password) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  try {
    // Check if user already exists
    const userCheck = await pool.query(
      `SELECT id FROM ${schemaName}.users WHERE username = $1`,
      [username.trim()]
    );

    if (userCheck.rows.length > 0) {
      return res.status(400).json({ error: 'Username or email already exists' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insert user
    const insertResult = await pool.query(
      `INSERT INTO ${schemaName}.users (full_name, username, password) VALUES ($1, $2, $3) RETURNING id, full_name, username`,
      [fullName.trim(), username.trim(), hashedPassword]
    );

    const newUser = insertResult.rows[0];

    return res.status(201).json({
      success: true,
      message: 'Account created successfully!',
      token: `token-${newUser.id}-${Date.now()}`,
      user: {
        id: newUser.id,
        name: newUser.full_name,
        email: newUser.username
      }
    });
  } catch (error: any) {
    console.error('Signup error:', error);
    return res.status(500).json({ error: 'Internal server error during registration' });
  }
});

// Login route
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  try {
    // Find user
    const userResult = await pool.query(
      `SELECT * FROM ${schemaName}.users WHERE username = $1`,
      [username.trim()]
    );

    if (userResult.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const user = userResult.rows[0];

    // Check password
    const isPasswordMatch = await bcrypt.compare(password, user.password);
    if (!isPasswordMatch) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    return res.status(200).json({
      success: true,
      message: 'Logged in successfully!',
      token: `token-${user.id}-${Date.now()}`,
      user: {
        id: user.id,
        name: user.full_name,
        email: user.username
      }
    });
  } catch (error: any) {
    console.error('Login error:', error);
    return res.status(500).json({ error: 'Internal server error during login' });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', schema: schemaName });
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});

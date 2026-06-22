import express, { Request, Response } from 'express';
import pool, { schemaName } from '../db';

// Simple token generation (consistent with other auth routes)
const generateToken = (userId: number) => `token-${userId}-${Date.now()}`;

const router = express.Router();

// POST /api/auth/google – expects { email, name }
router.post('/', async (req: Request, res: Response) => {
  const { email, name } = req.body;
  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }

  try {
    // Check if user exists
    const result = await pool.query(
      `SELECT id, full_name, username FROM ${schemaName}.users WHERE username = $1`,
      [email.trim()]
    );

    if (result.rows.length > 0) {
      // Existing user – return token
      const user = result.rows[0];
      return res.json({
        success: true,
        token: generateToken(user.id),
        user: { id: user.id, name: user.full_name, email: user.username, isGoogleUser: true },
      });
    }

    // New Google user – insert into DB with a random password
    const randomPassword = Math.random().toString(36).slice(-8);
    const insertResult = await pool.query(
      `INSERT INTO ${schemaName}.users (full_name, username, password) VALUES ($1, $2, $3) RETURNING id, full_name, username`,
      [name?.trim() || 'Google User', email.trim(), randomPassword]
    );
    const newUser = insertResult.rows[0];
    return res.status(201).json({
      success: true,
      token: generateToken(newUser.id),
      user: { id: newUser.id, name: newUser.full_name, email: newUser.username, isGoogleUser: true },
    });
  } catch (err: any) {
    console.error('Google auth error:', err);
    return res.status(500).json({ error: 'Internal server error during Google authentication' });
  }
});

export default router;

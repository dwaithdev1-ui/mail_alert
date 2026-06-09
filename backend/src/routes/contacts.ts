import { Router, Response } from 'express';
import pool, { schemaName } from '../db';
import { requireAuth, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(requireAuth);

/**
 * GET /api/contacts
 * Returns all contacts for the logged-in user.
 */
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT id, name, email, designation, department, created_at
       FROM ${schemaName}.contacts
       WHERE user_id = $1
       ORDER BY name ASC`,
      [req.userId]
    );
    return res.json({ success: true, contacts: result.rows });
  } catch (err: any) {
    console.error('GET /api/contacts error:', err);
    return res.status(500).json({ error: 'Failed to fetch contacts', details: err.message });
  }
});

/**
 * POST /api/contacts
 * Adds a new contact for the logged-in user.
 */
router.post('/', async (req: AuthRequest, res: Response) => {
  const { name, email, designation, department } = req.body;

  if (!name || !name.trim() || !email || !email.trim()) {
    return res.status(400).json({ error: 'Name and email are required' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO ${schemaName}.contacts (user_id, name, email, designation, department)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id, email) DO UPDATE SET
         name = EXCLUDED.name,
         designation = EXCLUDED.designation,
         department = EXCLUDED.department
       RETURNING id, name, email, designation, department`,
      [req.userId, name.trim(), email.trim().toLowerCase(), designation?.trim() || null, department?.trim() || null]
    );
    return res.status(201).json({ success: true, contact: result.rows[0] });
  } catch (err: any) {
    console.error('POST /api/contacts error:', err);
    return res.status(500).json({ error: 'Failed to create contact', details: err.message });
  }
});

/**
 * DELETE /api/contacts/:id
 * Deletes a contact by ID.
 */
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  const contactId = parseInt(req.params.id, 10);
  if (isNaN(contactId)) {
    return res.status(400).json({ error: 'Invalid contact ID' });
  }

  try {
    const result = await pool.query(
      `DELETE FROM ${schemaName}.contacts
       WHERE id = $1 AND user_id = $2
       RETURNING id`,
      [contactId, req.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Contact not found or unauthorized' });
    }

    return res.json({ success: true, message: 'Contact deleted successfully', deletedId: contactId });
  } catch (err: any) {
    console.error('DELETE /api/contacts error:', err);
    return res.status(500).json({ error: 'Failed to delete contact', details: err.message });
  }
});

export default router;

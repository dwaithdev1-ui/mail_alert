import { Router, Response } from 'express';
import pool, { schemaName } from '../db';
import { requireAuth, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(requireAuth);

/* ── GET /api/meetings ──────────────────────────────────────────────────────
   Returns all meetings for the authenticated user, newest first.
   Query params: ?status=upcoming|ongoing|done|cancelled  ?date=YYYY-MM-DD
   ─────────────────────────────────────────────────────────────────────────── */
router.get('/', async (req: AuthRequest, res: Response) => {
  const { status, date } = req.query;

  let query = `
    SELECT id, title, start_time, end_time, location, description,
           gcal_event_id, color_id, source, status, created_at
    FROM ${schemaName}.meetings
    WHERE user_id = $1
  `;
  const params: any[] = [req.userId];

  if (status) {
    params.push(status);
    query += ` AND status = $${params.length}`;
  }

  if (date) {
    params.push(date);
    query += ` AND DATE(start_time) = $${params.length}`;
  }

  query += ` ORDER BY start_time ASC`;

  try {
    const result = await pool.query(query, params);
    return res.json({ success: true, meetings: result.rows });
  } catch (err: any) {
    console.error('GET /meetings error:', err);
    return res.status(500).json({ error: 'Failed to fetch meetings' });
  }
});

/* ── GET /api/meetings/:id ──────────────────────────────────────────────── */
router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT * FROM ${schemaName}.meetings WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.userId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Meeting not found' });
    return res.json({ success: true, meeting: result.rows[0] });
  } catch (err: any) {
    console.error('GET /meetings/:id error:', err);
    return res.status(500).json({ error: 'Failed to fetch meeting' });
  }
});

/* ── POST /api/meetings ─────────────────────────────────────────────────────
   Body: { title, start_time, end_time, location?, description?,
           gcal_event_id?, color_id?, source? }
   ─────────────────────────────────────────────────────────────────────────── */
router.post('/', async (req: AuthRequest, res: Response) => {
  const { title, start_time, end_time, location, description, gcal_event_id, color_id, source } = req.body;

  if (!title || !start_time || !end_time) {
    return res.status(400).json({ error: 'title, start_time and end_time are required' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO ${schemaName}.meetings
         (user_id, title, start_time, end_time, location, description, gcal_event_id, color_id, source)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING *`,
      [req.userId, title, start_time, end_time, location || null, description || null,
       gcal_event_id || null, color_id || null, source || 'manual']
    );
    return res.status(201).json({ success: true, meeting: result.rows[0] });
  } catch (err: any) {
    console.error('POST /meetings error:', err);
    return res.status(500).json({ error: 'Failed to create meeting' });
  }
});

/* ── PATCH /api/meetings/:id ────────────────────────────────────────────────
   Partial update: any subset of { title, start_time, end_time, location,
   description, status, gcal_event_id, color_id }
   ─────────────────────────────────────────────────────────────────────────── */
router.patch('/:id', async (req: AuthRequest, res: Response) => {
  const allowed = ['title', 'start_time', 'end_time', 'location', 'description', 'status', 'gcal_event_id', 'color_id'];
  const updates: string[] = [];
  const values: any[]    = [];

  allowed.forEach(field => {
    if (req.body[field] !== undefined) {
      values.push(req.body[field]);
      updates.push(`${field} = $${values.length}`);
    }
  });

  if (updates.length === 0) {
    return res.status(400).json({ error: 'No valid fields to update' });
  }

  values.push(req.params.id, req.userId);
  const whereIdx = values.length;

  try {
    const result = await pool.query(
      `UPDATE ${schemaName}.meetings
       SET ${updates.join(', ')}, updated_at = NOW()
       WHERE id = $${whereIdx - 1} AND user_id = $${whereIdx}
       RETURNING *`,
      values
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Meeting not found' });
    return res.json({ success: true, meeting: result.rows[0] });
  } catch (err: any) {
    console.error('PATCH /meetings/:id error:', err);
    return res.status(500).json({ error: 'Failed to update meeting' });
  }
});

/* ── DELETE /api/meetings/:id ───────────────────────────────────────────── */
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const result = await pool.query(
      `DELETE FROM ${schemaName}.meetings WHERE id = $1 AND user_id = $2 RETURNING id`,
      [req.params.id, req.userId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Meeting not found' });
    return res.json({ success: true, message: 'Meeting deleted' });
  } catch (err: any) {
    console.error('DELETE /meetings/:id error:', err);
    return res.status(500).json({ error: 'Failed to delete meeting' });
  }
});

/* ── GET /api/meetings/today ────────────────────────────────────────────── */
router.get('/filter/today', async (req: AuthRequest, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT * FROM ${schemaName}.meetings
       WHERE user_id = $1
         AND DATE(start_time AT TIME ZONE 'UTC') = CURRENT_DATE
         AND status != 'cancelled'
       ORDER BY start_time ASC`,
      [req.userId]
    );
    return res.json({ success: true, meetings: result.rows });
  } catch (err: any) {
    console.error('GET /meetings/filter/today error:', err);
    return res.status(500).json({ error: 'Failed to fetch today meetings' });
  }
});

export default router;

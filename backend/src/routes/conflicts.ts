import { Router, Response } from 'express';
import pool, { schemaName } from '../db';
import { requireAuth, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(requireAuth);

/* ── POST /api/conflicts/check ──────────────────────────────────────────────
   Body: { proposed_start: ISO-string, proposed_end: ISO-string,
           exclude_meeting_id?: number }
   Returns all existing meetings that overlap the proposed window.
   Uses PostgreSQL range overlap: (start1, end1) OVERLAPS (start2, end2)
   ─────────────────────────────────────────────────────────────────────────── */
router.post('/check', async (req: AuthRequest, res: Response) => {
  const { proposed_start, proposed_end, exclude_meeting_id } = req.body;

  if (!proposed_start || !proposed_end) {
    return res.status(400).json({ error: 'proposed_start and proposed_end are required' });
  }

  if (new Date(proposed_start) >= new Date(proposed_end)) {
    return res.status(400).json({ error: 'proposed_start must be before proposed_end' });
  }

  try {
    let query = `
      SELECT id, title, start_time, end_time, status, location
      FROM ${schemaName}.meetings
      WHERE user_id = $1
        AND status != 'cancelled'
        AND (start_time, end_time) OVERLAPS ($2::timestamptz, $3::timestamptz)
    `;
    const params: any[] = [req.userId, proposed_start, proposed_end];

    if (exclude_meeting_id) {
      params.push(exclude_meeting_id);
      query += ` AND id != $${params.length}`;
    }

    query += ` ORDER BY start_time ASC`;

    const result = await pool.query(query, params);
    const conflicts = result.rows;

    if (conflicts.length === 0) {
      return res.json({ success: true, hasConflict: false, conflicts: [] });
    }

    // Log conflicts into the conflicts table
    for (const conflict of conflicts) {
      await pool.query(
        `INSERT INTO ${schemaName}.conflicts
           (proposed_start, proposed_end, conflicting_meeting_id, user_id)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT DO NOTHING`,
        [proposed_start, proposed_end, conflict.id, req.userId]
      );
    }

    return res.json({
      success: true,
      hasConflict: true,
      conflicts,
      message: `Found ${conflicts.length} conflicting meeting${conflicts.length !== 1 ? 's' : ''}`,
    });
  } catch (err: any) {
    console.error('POST /conflicts/check error:', err);
    return res.status(500).json({ error: 'Failed to check conflicts' });
  }
});

/* ── GET /api/conflicts ─────────────────────────────────────────────────────
   Returns recent conflict logs for this user (useful for audit / dashboard)
   ─────────────────────────────────────────────────────────────────────────── */
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT c.id, c.proposed_start, c.proposed_end, c.detected_at,
              m.id AS conflict_meeting_id, m.title AS conflict_meeting_title,
              m.start_time AS conflict_start, m.end_time AS conflict_end
       FROM ${schemaName}.conflicts c
       JOIN ${schemaName}.meetings m ON m.id = c.conflicting_meeting_id
       WHERE c.user_id = $1
       ORDER BY c.detected_at DESC
       LIMIT 100`,
      [req.userId]
    );
    return res.json({ success: true, conflicts: result.rows });
  } catch (err: any) {
    console.error('GET /conflicts error:', err);
    return res.status(500).json({ error: 'Failed to fetch conflict log' });
  }
});

export default router;

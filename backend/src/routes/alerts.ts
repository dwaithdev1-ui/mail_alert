import { Router, Response } from 'express';
import pool, { schemaName } from '../db';
import { requireAuth, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(requireAuth);

/* ── GET /api/alerts ────────────────────────────────────────────────────────
   Returns the alert fire history for this user.
   Query params: ?meeting_id=<id>  ?limit=50
   ─────────────────────────────────────────────────────────────────────────── */
router.get('/', async (req: AuthRequest, res: Response) => {
  const limit     = Math.min(parseInt(req.query.limit as string || '50', 10), 200);
  const meetingId = req.query.meeting_id;

  let query = `
    SELECT a.id, a.meeting_id, a.threshold_min, a.channel, a.fired_at,
           m.title AS meeting_title, m.start_time
    FROM ${schemaName}.alerts a
    JOIN ${schemaName}.meetings m ON m.id = a.meeting_id
    WHERE m.user_id = $1
  `;
  const params: any[] = [req.userId];

  if (meetingId) {
    params.push(meetingId);
    query += ` AND a.meeting_id = $${params.length}`;
  }

  query += ` ORDER BY a.fired_at DESC LIMIT $${params.length + 1}`;
  params.push(limit);

  try {
    const result = await pool.query(query, params);
    return res.json({ success: true, alerts: result.rows });
  } catch (err: any) {
    console.error('GET /alerts error:', err);
    return res.status(500).json({ error: 'Failed to fetch alerts' });
  }
});

/* ── POST /api/alerts/send ──────────────────────────────────────────────────
   Body: { meeting_id, threshold_min, channel? }
   Logs the alert as fired. In Phase 3 this will also enqueue the BullMQ job.
   ─────────────────────────────────────────────────────────────────────────── */
router.post('/send', async (req: AuthRequest, res: Response) => {
  const { meeting_id, threshold_min, channel = 'in-app' } = req.body;

  if (!meeting_id || threshold_min == null) {
    return res.status(400).json({ error: 'meeting_id and threshold_min are required' });
  }

  try {
    // Verify meeting belongs to this user
    const meetingCheck = await pool.query(
      `SELECT id, title, start_time FROM ${schemaName}.meetings
       WHERE id = $1 AND user_id = $2`,
      [meeting_id, req.userId]
    );
    if (meetingCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Meeting not found' });
    }
    const meeting = meetingCheck.rows[0];

    // Insert alert log
    const alertResult = await pool.query(
      `INSERT INTO ${schemaName}.alerts (meeting_id, threshold_min, channel)
       VALUES ($1, $2, $3)
       ON CONFLICT (meeting_id, threshold_min, channel) DO UPDATE SET fired_at = NOW()
       RETURNING *`,
      [meeting_id, threshold_min, channel]
    );

    // Also create an in-app notification
    await pool.query(
      `INSERT INTO ${schemaName}.notifications (user_id, meeting_id, message)
       VALUES ($1, $2, $3)`,
      [req.userId, meeting_id,
       `Meeting "${meeting.title}" starts in ${threshold_min} minute${threshold_min !== 1 ? 's' : ''}`]
    );

    return res.json({
      success: true,
      alert: alertResult.rows[0],
      message: `Alert fired for meeting "${meeting.title}"`,
    });
  } catch (err: any) {
    console.error('POST /alerts/send error:', err);
    return res.status(500).json({ error: 'Failed to send alert' });
  }
});

export default router;

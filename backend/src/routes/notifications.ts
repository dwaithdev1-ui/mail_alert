import { Router, Response } from 'express';
import pool, { schemaName } from '../db';
import { requireAuth, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(requireAuth);

/* ── GET /api/notifications ─────────────────────────────────────────────────
   Returns the in-app notification inbox for the current user.
   Query params: ?unread_only=true  ?limit=50
   ─────────────────────────────────────────────────────────────────────────── */
router.get('/', async (req: AuthRequest, res: Response) => {
  const limit      = Math.min(parseInt(req.query.limit as string || '50', 10), 200);
  const unreadOnly = req.query.unread_only === 'true';

  let query = `
    SELECT n.id, n.message, n.is_read, n.created_at,
           n.meeting_id, m.title AS meeting_title, m.start_time
    FROM ${schemaName}.notifications n
    LEFT JOIN ${schemaName}.meetings m ON m.id = n.meeting_id
    WHERE n.user_id = $1
  `;
  const params: any[] = [req.userId];

  if (unreadOnly) {
    query += ` AND n.is_read = FALSE`;
  }

  query += ` ORDER BY n.created_at DESC LIMIT $${params.length + 1}`;
  params.push(limit);

  try {
    const result = await pool.query(query, params);

    // Also return the unread count as a convenience
    const countResult = await pool.query(
      `SELECT COUNT(*) FROM ${schemaName}.notifications WHERE user_id = $1 AND is_read = FALSE`,
      [req.userId]
    );
    const unreadCount = parseInt(countResult.rows[0].count, 10);

    return res.json({ success: true, notifications: result.rows, unreadCount });
  } catch (err: any) {
    console.error('GET /notifications error:', err);
    return res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

/* ── PATCH /api/notifications/:id/read ──────────────────────────────────── */
router.patch('/:id/read', async (req: AuthRequest, res: Response) => {
  try {
    const result = await pool.query(
      `UPDATE ${schemaName}.notifications
       SET is_read = TRUE, read_at = NOW()
       WHERE id = $1 AND user_id = $2
       RETURNING id`,
      [req.params.id, req.userId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Notification not found' });
    return res.json({ success: true });
  } catch (err: any) {
    console.error('PATCH /notifications/:id/read error:', err);
    return res.status(500).json({ error: 'Failed to mark notification as read' });
  }
});

/* ── PATCH /api/notifications/read-all ─────────────────────────────────── */
router.patch('/read-all', async (req: AuthRequest, res: Response) => {
  try {
    await pool.query(
      `UPDATE ${schemaName}.notifications
       SET is_read = TRUE, read_at = NOW()
       WHERE user_id = $1 AND is_read = FALSE`,
      [req.userId]
    );
    return res.json({ success: true, message: 'All notifications marked as read' });
  } catch (err: any) {
    console.error('PATCH /notifications/read-all error:', err);
    return res.status(500).json({ error: 'Failed to mark all notifications as read' });
  }
});

/* ── DELETE /api/notifications/:id ─────────────────────────────────────── */
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const result = await pool.query(
      `DELETE FROM ${schemaName}.notifications WHERE id = $1 AND user_id = $2 RETURNING id`,
      [req.params.id, req.userId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Notification not found' });
    return res.json({ success: true });
  } catch (err: any) {
    console.error('DELETE /notifications/:id error:', err);
    return res.status(500).json({ error: 'Failed to delete notification' });
  }
});

export default router;

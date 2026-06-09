import { Router, Response } from 'express';
import pool, { schemaName } from '../db';
import { requireAuth, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(requireAuth);

router.post('/sync', async (req: AuthRequest, res: Response) => {
  const { googleAccessToken } = req.body;
  if (!googleAccessToken) {
    return res.status(400).json({ error: 'googleAccessToken is required' });
  }

  try {
    const timeMin = new Date().toISOString();
    const gRes = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(timeMin)}&singleEvents=true&orderBy=startTime&conferenceDataVersion=1`, {
      headers: { 'Authorization': `Bearer ${googleAccessToken}` }
    });

    if (!gRes.ok) {
      throw new Error(`Google API returned ${gRes.status}`);
    }

    const data = await gRes.json() as any;
    const items = data.items || [];
    let syncedCount = 0;

    for (const item of items) {
      if (!item.start?.dateTime || !item.end?.dateTime) continue; // Skip all-day events for now

      let location = item.location || null;
      if (!location && item.conferenceData?.entryPoints) {
        const videoEntryPoint = item.conferenceData.entryPoints.find(
          (ep: any) => ep.entryPointType === 'video'
        );
        if (videoEntryPoint?.uri) {
          location = videoEntryPoint.uri;
        }
      }

      await pool.query(
        `INSERT INTO ${schemaName}.meetings 
           (user_id, title, start_time, end_time, location, description, google_event_id, source)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'google')
         ON CONFLICT (google_event_id) DO UPDATE SET
           title = EXCLUDED.title,
           start_time = EXCLUDED.start_time,
           end_time = EXCLUDED.end_time,
           location = EXCLUDED.location,
           description = EXCLUDED.description,
           updated_at = NOW()`,
        [
          req.userId,
          item.summary || 'Untitled Event',
          item.start.dateTime,
          item.end.dateTime,
          location,
          item.description || null,
          item.id
        ]
      );
      syncedCount++;
    }

    res.json({ success: true, syncedCount });
  } catch (error: any) {
    console.error('Calendar sync error:', error);
    res.status(500).json({ error: 'Failed to sync calendar', details: error.message });
  }
});

export default router;

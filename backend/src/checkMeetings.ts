import cron from 'node-cron';
import pool, { schemaName } from './db';

// Standard meeting alert thresholds (in minutes before a meeting starts)
const ALERT_THRESHOLDS = [5, 10, 15];

/**
 * Scan database for scheduled meetings starting in the next 30 minutes
 * and generate alerts / in-app notifications if they fall under thresholds.
 */
async function scanUpcomingMeetings() {
  try {
    // 1. Fetch scheduled meetings starting in the next 30 minutes
    const query = `
      SELECT id, user_id, title, start_time
      FROM ${schemaName}.meetings
      WHERE status = 'scheduled'
        AND start_time > NOW()::timestamp
        AND start_time <= (NOW() + INTERVAL '30 minutes')::timestamp
    `;
    const res = await pool.query(query);
    const meetings = res.rows;

    if (meetings.length === 0) {
      return;
    }

    const nowMs = Date.now();

    for (const m of meetings) {
      const startTime = new Date(m.start_time).getTime();
      const diffMins = (startTime - nowMs) / 60000;

      // Only check thresholds if the meeting is still in the future
      if (diffMins <= 0) continue;

      for (const threshold of ALERT_THRESHOLDS) {
        // If remaining time is less than or equal to threshold
        if (diffMins <= threshold) {
          const channel = 'in-app';

          // 2. Check if this alert has already fired
          const checkQuery = `
            SELECT id FROM ${schemaName}.alerts
            WHERE meeting_id = $1 AND threshold_min = $2 AND channel = $3
          `;
          const alertCheck = await pool.query(checkQuery, [m.id, threshold, channel]);
      console.log('[AlertScanner] alertCheck rows:', alertCheck.rows.length);

          if (alertCheck.rows.length === 0) {
            // 3. Log alert as fired (use ON CONFLICT DO NOTHING just in case of parallel check races)
            const insertAlertQuery = `
              INSERT INTO ${schemaName}.alerts (meeting_id, threshold_min, channel)
              VALUES ($1, $2, $3)
              ON CONFLICT (meeting_id, threshold_min, channel) DO NOTHING
              RETURNING id
            `;
            const alertRes = await pool.query(insertAlertQuery, [m.id, threshold, channel]);

            // If we successfully inserted the alert
            if (alertRes.rows.length > 0) {
              console.log(`[AlertScanner] Fired ${threshold}-minute alert for meeting: "${m.title}" (ID: ${m.id})`);

              // 4. Create in-app notification
              const message = `Meeting "${m.title}" starts in ${threshold} minute${threshold !== 1 ? 's' : ''}`;
              const insertNotificationQuery = `
                INSERT INTO ${schemaName}.notifications (user_id, meeting_id, message)
                VALUES ($1, $2, $3)
              `;
              await pool.query(insertNotificationQuery, [m.user_id, m.id, message]);
            }
          }
        }
      }
    }
  } catch (err) {
    console.error('[AlertScanner] Error scanning upcoming meetings:', err);
  }
}

/**
 * Start the background meeting scanner.
 * It will run every minute.
 */
export function startMeetingAlertScanner() {
  console.log('🚀 Background Meeting Alert Scanner initialized (running every minute)');
  
  // Run once immediately on startup
  scanUpcomingMeetings().catch(err => console.error('[AlertScanner] Initial run error:', err));
  
  // Schedule to run every minute
  cron.schedule('* * * * *', async () => {
    await scanUpcomingMeetings();
  });
}

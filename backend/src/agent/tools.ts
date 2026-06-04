import pool, { schemaName } from '../db';

/**
 * All tool implementations — pure DB/business logic, no Anthropic SDK here.
 * The agent loop in agentLoop.ts calls these when Claude requests a tool.
 */

/* ── search_meetings ─────────────────────────────────────────────────────── */
export async function search_meetings(userId: number, args: {
  date?: string;          // YYYY-MM-DD
  title_contains?: string;
  status?: string;
  limit?: number;
}) {
  const { date, title_contains, status, limit = 10 } = args;
  let query = `
    SELECT id, title, start_time, end_time, location, description, status, source
    FROM ${schemaName}.meetings
    WHERE user_id = $1
  `;
  const params: any[] = [userId];

  if (date) {
    params.push(date);
    query += ` AND DATE(start_time AT TIME ZONE 'UTC') = $${params.length}`;
  }
  if (title_contains) {
    params.push(`%${title_contains}%`);
    query += ` AND title ILIKE $${params.length}`;
  }
  if (status) {
    params.push(status);
    query += ` AND status = $${params.length}`;
  }

  params.push(limit);
  query += ` ORDER BY start_time ASC LIMIT $${params.length}`;

  const result = await pool.query(query, params);
  return result.rows;
}

/* ── get_today_meetings ──────────────────────────────────────────────────── */
export async function get_today_meetings(userId: number) {
  const result = await pool.query(
    `SELECT id, title, start_time, end_time, location, status
     FROM ${schemaName}.meetings
     WHERE user_id = $1
       AND DATE(start_time) = CURRENT_DATE
       AND status != 'cancelled'
     ORDER BY start_time ASC`,
    [userId]
  );
  return result.rows;
}

/* ── create_meeting ──────────────────────────────────────────────────────── */
export async function create_meeting(userId: number, args: {
  title: string;
  start_time: string;   // ISO-8601
  end_time: string;
  location?: string;
  description?: string;
}, googleToken?: string) {
  const { title, start_time, end_time, location, description } = args;
  const result = await pool.query(
    `INSERT INTO ${schemaName}.meetings
       (user_id, title, start_time, end_time, location, description, source)
     VALUES ($1,$2,$3,$4,$5,$6,'agent')
     RETURNING id, title, start_time, end_time, status`,
    [userId, title, start_time, end_time, location || null, description || null]
  );
  const row = result.rows[0];

  if (googleToken) {
    try {
      const gRes = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${googleToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          summary: title,
          start: { dateTime: new Date(start_time).toISOString() },
          end: { dateTime: new Date(end_time).toISOString() },
          location: location || undefined,
          description: description || undefined,
        })
      });
      if (gRes.ok) {
        const gData = await gRes.json() as any;
        await pool.query(
          `UPDATE ${schemaName}.meetings SET google_event_id = $1 WHERE id = $2`,
          [gData.id, row.id]
        );
        row.google_event_id = gData.id;
      }
    } catch (err) {
      console.error('Failed to write to Google Calendar:', err);
    }
  }

  return row;
}

/* ── cancel_meeting ──────────────────────────────────────────────────────── */
export async function cancel_meeting(userId: number, args: {
  meeting_id: number;
}, googleToken?: string) {
  const result = await pool.query(
    `UPDATE ${schemaName}.meetings
     SET status = 'cancelled', updated_at = NOW()
     WHERE id = $1 AND user_id = $2
     RETURNING id, title, status`,
    [args.meeting_id, userId]
  );
  if (result.rows.length === 0) {
    return { error: `Meeting ID ${args.meeting_id} not found or not yours.` };
  }
  const row = result.rows[0];

  // Try fetching the google_event_id to delete from Google Calendar
  if (googleToken) {
    const existing = await pool.query(
      `SELECT google_event_id FROM ${schemaName}.meetings WHERE id = $1`,
      [args.meeting_id]
    );
    const gcalId = existing.rows[0]?.google_event_id;
    if (gcalId) {
      try {
        await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${gcalId}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${googleToken}` }
        });
      } catch (err) {
        console.error('Failed to delete from Google Calendar:', err);
      }
    }
  }

  return row;
}

/* ── update_meeting ──────────────────────────────────────────────────────── */
export async function update_meeting(userId: number, args: {
  meeting_id: number;
  title?: string;
  start_time?: string;
  end_time?: string;
  location?: string;
  description?: string;
}, googleToken?: string) {
  const { meeting_id, ...fields } = args;
  const allowed = ['title', 'start_time', 'end_time', 'location', 'description'];
  const updates: string[] = [];
  const values: any[] = [];

  allowed.forEach(f => {
    if ((fields as any)[f] !== undefined) {
      values.push((fields as any)[f]);
      updates.push(`${f} = $${values.length}`);
    }
  });

  if (updates.length === 0) return { error: 'Nothing to update' };

  values.push(meeting_id, userId);
  const result = await pool.query(
    `UPDATE ${schemaName}.meetings
     SET ${updates.join(', ')}, updated_at = NOW()
     WHERE id = $${values.length - 1} AND user_id = $${values.length}
     RETURNING id, title, start_time, end_time, status`,
    values
  );
  if (result.rows.length === 0) return { error: 'Meeting not found' };
  const row = result.rows[0];

  if (googleToken) {
    const existing = await pool.query(
      `SELECT google_event_id FROM ${schemaName}.meetings WHERE id = $1`,
      [meeting_id]
    );
    const gcalId = existing.rows[0]?.google_event_id;
    
    if (gcalId) {
      try {
        const payload: any = {};
        if (fields.title) payload.summary = fields.title;
        if (fields.start_time) payload.start = { dateTime: new Date(fields.start_time).toISOString() };
        if (fields.end_time) payload.end = { dateTime: new Date(fields.end_time).toISOString() };
        if (fields.location) payload.location = fields.location;
        if (fields.description) payload.description = fields.description;

        await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${gcalId}`, {
          method: 'PATCH',
          headers: { 'Authorization': `Bearer ${googleToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      } catch (err) {
        console.error('Failed to update Google Calendar:', err);
      }
    }
  }

  return row;
}

/* ── check_conflicts ─────────────────────────────────────────────────────── */
export async function check_conflicts(userId: number, args: {
  proposed_start: string;
  proposed_end: string;
  exclude_meeting_id?: number;
}) {
  const { proposed_start, proposed_end, exclude_meeting_id } = args;
  let query = `
    SELECT id, title, start_time, end_time, status
    FROM ${schemaName}.meetings
    WHERE user_id = $1
      AND status != 'cancelled'
      AND (start_time, end_time) OVERLAPS ($2::timestamptz, $3::timestamptz)
  `;
  const params: any[] = [userId, proposed_start, proposed_end];

  if (exclude_meeting_id) {
    params.push(exclude_meeting_id);
    query += ` AND id != $${params.length}`;
  }

  const result = await pool.query(query, params);
  return {
    hasConflict: result.rows.length > 0,
    conflicts: result.rows,
  };
}

/* ── list_notifications ──────────────────────────────────────────────────── */
export async function list_notifications(userId: number, args: { unread_only?: boolean; limit?: number }) {
  const { unread_only = true, limit = 10 } = args;
  let query = `
    SELECT n.id, n.message, n.is_read, n.created_at
    FROM ${schemaName}.notifications n
    WHERE n.user_id = $1
  `;
  const params: any[] = [userId];

  if (unread_only) query += ` AND n.is_read = FALSE`;
  params.push(limit);
  query += ` ORDER BY n.created_at DESC LIMIT $${params.length}`;

  const result = await pool.query(query, params);
  return result.rows;
}

/* ── get_briefing ────────────────────────────────────────────────────────── */
export async function get_briefing(userId: number) {
  const result = await pool.query(
    `SELECT brief_date, content, created_at
     FROM ${schemaName}.briefings
     WHERE user_id = $1 AND brief_date = CURRENT_DATE`,
    [userId]
  );
  if (result.rows.length > 0) return result.rows[0];
  return { content: null, message: "No briefing generated yet for today. Use generate_briefing to create one." };
}

import pool, { schemaName } from '../db';

/* ── Fuzzy Name Matching (Jaro-Winkler) ─────────────────────────────────── */

/**
 * Jaro similarity between two strings (0..1).
 */
function jaro(s1: string, s2: string): number {
  if (s1 === s2) return 1;
  const len1 = s1.length;
  const len2 = s2.length;
  if (len1 === 0 || len2 === 0) return 0;

  const matchDist = Math.floor(Math.max(len1, len2) / 2) - 1;
  const s1Matches = new Array(len1).fill(false);
  const s2Matches = new Array(len2).fill(false);

  let matches = 0;
  let transpositions = 0;

  for (let i = 0; i < len1; i++) {
    const start = Math.max(0, i - matchDist);
    const end = Math.min(i + matchDist + 1, len2);
    for (let j = start; j < end; j++) {
      if (s2Matches[j] || s1[i] !== s2[j]) continue;
      s1Matches[i] = true;
      s2Matches[j] = true;
      matches++;
      break;
    }
  }

  if (matches === 0) return 0;

  let k = 0;
  for (let i = 0; i < len1; i++) {
    if (!s1Matches[i]) continue;
    while (!s2Matches[k]) k++;
    if (s1[i] !== s2[k]) transpositions++;
    k++;
  }

  return (matches / len1 + matches / len2 + (matches - transpositions / 2) / matches) / 3;
}

/**
 * Jaro-Winkler similarity (boosts score for common prefixes, 0..1).
 */
function jaroWinkler(s1: string, s2: string, prefixScale = 0.1): number {
  const jaroSim = jaro(s1, s2);
  let prefix = 0;
  for (let i = 0; i < Math.min(4, Math.min(s1.length, s2.length)); i++) {
    if (s1[i] === s2[i]) prefix++;
    else break;
  }
  return jaroSim + prefix * prefixScale * (1 - jaroSim);
}

/**
 * Best fuzzy score for a query against a full name or email address.
 * Compares the query against the full string AND against each individual token.
 * Tokenizes by space, dot, dash, underscore, and @ symbol to handle email/usernames.
 * Returns the highest similarity score found.
 */
function bestNameScore(query: string, fullName: string): number {
  const q = query.toLowerCase().trim();
  const name = fullName.toLowerCase().trim();
  const tokens = name.split(/[\s\._\-@]+/);

  let best = jaroWinkler(q, name);
  for (const token of tokens) {
    if (!token) continue;
    const score = jaroWinkler(q, token);
    if (score > best) best = score;
  }
  return best;
}

const lastSyncTimeMap = new Map<number, number>();

async function syncGoogleCalendar(userId: number, googleAccessToken: string) {
  const now = Date.now();
  const lastSync = lastSyncTimeMap.get(userId) || 0;
  if (now - lastSync < 15000) {
    return; // throttle sync to once per 15 seconds
  }
  lastSyncTimeMap.set(userId, now);

  try {
    const oneMonthAgo = new Date();
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
    const timeMin = oneMonthAgo.toISOString();

    const gRes = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(timeMin)}&singleEvents=true&orderBy=startTime&conferenceDataVersion=1`,
      {
        headers: { 'Authorization': `Bearer ${googleAccessToken}` }
      }
    );

    if (!gRes.ok) {
      console.warn(`[CalendarSync] Google API error: ${gRes.status}`);
      return;
    }

    const data = (await gRes.json()) as any;
    const items = data.items || [];

    for (const item of items) {
      if (!item.start?.dateTime || !item.end?.dateTime) continue;

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
          userId,
          item.summary || 'Untitled Event',
          item.start.dateTime,
          item.end.dateTime,
          location,
          item.description || null,
          item.id
        ]
      );
    }
  } catch (err) {
    console.error('[CalendarSync] Failed to auto-sync Google Calendar in tool:', err);
  }
}

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
}, googleToken?: string) {
  if (googleToken) {
    await syncGoogleCalendar(userId, googleToken);
  }
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
export async function get_today_meetings(userId: number, googleToken?: string) {
  if (googleToken) {
    await syncGoogleCalendar(userId, googleToken);
  }
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
  attendees?: string[] | string;
  create_meet?: boolean;
}, googleToken?: string) {
  const { title, start_time, end_time, location, description, attendees, create_meet } = args;

  if (googleToken) {
    await syncGoogleCalendar(userId, googleToken);
  }

  // Check conflicts
  const conflictsCheck = await check_conflicts(userId, {
    proposed_start: start_time,
    proposed_end: end_time
  });

  if (conflictsCheck.hasConflict) {
    const titles = conflictsCheck.conflicts.map(c => `"${c.title}"`).join(', ');
    return { error: `Scheduling failed. Time slot overlaps with existing meeting(s): ${titles}.` };
  }

  // Convert attendees to a clean string array if it was passed as a string or single value
  let attendeesList: string[] | null = null;
  if (attendees) {
    if (Array.isArray(attendees)) {
      attendeesList = attendees;
    } else if (typeof attendees === 'string') {
      attendeesList = attendees.split(',').map(email => email.trim()).filter(email => email.length > 0);
    }
  }

  let finalLocation = location || null;

  // Insert into DB (initially with provided location)
  const result = await pool.query(
    `INSERT INTO ${schemaName}.meetings
       (user_id, title, start_time, end_time, location, description, source, attendees)
     VALUES ($1,$2,$3,$4,$5,$6,'agent',$7)
     RETURNING id, title, start_time, end_time, location, status, attendees`,
    [userId, title, start_time, end_time, finalLocation, description || null, attendeesList]
  );
  const row = result.rows[0];

  if (googleToken) {
    try {
      const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?sendUpdates=all${create_meet ? '&conferenceDataVersion=1' : ''}`;
      const gRes = await fetch(url, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${googleToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          summary: title,
          start: { dateTime: new Date(start_time).toISOString() },
          end: { dateTime: new Date(end_time).toISOString() },
          location: finalLocation || undefined,
          description: description || undefined,
          attendees: attendeesList?.map(email => ({ email })) || undefined,
          conferenceData: create_meet ? {
            createRequest: {
              requestId: Math.random().toString(36).substring(2, 15),
              conferenceSolutionKey: { type: 'hangoutsMeet' }
            }
          } : undefined
        })
      });
      if (gRes.ok) {
        const gData = await gRes.json() as any;
        
        let meetLink = '';
        if (create_meet && gData.conferenceData?.entryPoints) {
          const videoEntryPoint = gData.conferenceData.entryPoints.find(
            (ep: any) => ep.entryPointType === 'video'
          );
          if (videoEntryPoint?.uri) {
            meetLink = videoEntryPoint.uri;
            finalLocation = meetLink;
          }
        }

        await pool.query(
          `UPDATE ${schemaName}.meetings SET google_event_id = $1, location = $2 WHERE id = $3`,
          [gData.id, finalLocation, row.id]
        );
        row.google_event_id = gData.id;
        row.location = finalLocation;
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

  if (googleToken) {
    await syncGoogleCalendar(userId, googleToken);
  }

  // If time is being updated, check conflicts
  if (fields.start_time || fields.end_time) {
    let currentStart = fields.start_time;
    let currentEnd = fields.end_time;
    
    if (!currentStart || !currentEnd) {
      const currentRes = await pool.query(
        `SELECT start_time, end_time FROM ${schemaName}.meetings WHERE id = $1 AND user_id = $2`,
        [meeting_id, userId]
      );
      if (currentRes.rows.length === 0) return { error: 'Meeting not found' };
      if (!currentStart) currentStart = currentRes.rows[0].start_time;
      if (!currentEnd) currentEnd = currentRes.rows[0].end_time;
    }

    const conflictsCheck = await check_conflicts(userId, {
      proposed_start: currentStart!,
      proposed_end: currentEnd!,
      exclude_meeting_id: meeting_id
    });

    if (conflictsCheck.hasConflict) {
      const titles = conflictsCheck.conflicts.map(c => `"${c.title}"`).join(', ');
      return { error: `Update failed. Proposed time slot overlaps with existing meeting(s): ${titles}.` };
    }
  }

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
}, googleToken?: string) {
  if (googleToken) {
    await syncGoogleCalendar(userId, googleToken);
  }
  const { proposed_start, proposed_end, exclude_meeting_id } = args;
  let query = `
    SELECT id, title, start_time, end_time, status
    FROM ${schemaName}.meetings
    WHERE user_id = $1
      AND status != 'cancelled'
      AND (start_time < $3::timestamptz AND end_time > $2::timestamptz)
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

/* ── search_contacts ─────────────────────────────────────────────────────── */
/**
 * Search contacts with a two-phase strategy:
 * 1. ILIKE exact/substring match (fast, high confidence).
 * 2. Fuzzy Jaro-Winkler match over all contacts (handles voice mis-recognitions).
 *
 * Returns rows annotated with:
 *   match_type: 'exact' | 'fuzzy'
 *   fuzzy_score: 0..1  (1 = perfect match)
 *
 * The agent should prefer exact matches and explicitly confirm fuzzy ones with the user.
 */
export async function search_contacts(userId: number, args: { query: string }) {
  const { query } = args;
  const rawQuery = query.trim();
  if (!rawQuery) return [];

  const terms = rawQuery.split(/\s+/).filter(t => t.length > 0);

  // ── Phase 1: ILIKE substring match ─────────────────────────────────────────
  const conditions: string[] = [];
  const params: any[] = [userId];

  terms.forEach((term) => {
    params.push(`%${term}%`);
    const idx = params.length;
    conditions.push(`(name ILIKE $${idx} OR email ILIKE $${idx} OR designation ILIKE $${idx} OR department ILIKE $${idx})`);
  });

  const exactQueryStr = `
    SELECT id, name, email, designation, department
    FROM ${schemaName}.contacts
    WHERE user_id = $1
      AND (${conditions.join(' OR ')})
    ORDER BY name ASC
  `;

  const exactResult = await pool.query(exactQueryStr, params);
  const exactRows = exactResult.rows.map(r => ({ ...r, match_type: 'exact', fuzzy_score: 1.0 }));

  // If we have solid exact matches, return them (annotated)
  if (exactRows.length > 0) {
    return exactRows;
  }

  // ── Phase 2: Fuzzy Jaro-Winkler match ──────────────────────────────────────
  // Fetch all contacts and rank by best name score against each query term.
  const allResult = await pool.query(
    `SELECT id, name, email, designation, department FROM ${schemaName}.contacts WHERE user_id = $1`,
    [userId]
  );

  const FUZZY_THRESHOLD = 0.70; // contacts below this are discarded

  const scored = allResult.rows
    .map(row => {
      // Score against each term; take the max score across all terms
      const score = Math.max(...terms.map(t => {
        const nameScore = bestNameScore(t, row.name);
        const emailScore = bestNameScore(t, row.email);
        return Math.max(nameScore, emailScore);
      }));
      return { ...row, match_type: 'fuzzy', fuzzy_score: parseFloat(score.toFixed(3)) };
    })
    .filter(r => r.fuzzy_score >= FUZZY_THRESHOLD)
    .sort((a, b) => b.fuzzy_score - a.fuzzy_score);

  return scored;
}

/* ── create_contact ──────────────────────────────────────────────────────── */
export async function create_contact(userId: number, args: {
  name: string;
  email: string;
  designation?: string;
  department?: string;
}) {
  const { name, email, designation, department } = args;
  const result = await pool.query(
    `INSERT INTO ${schemaName}.contacts (user_id, name, email, designation, department)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (user_id, email) DO UPDATE SET
       name = EXCLUDED.name,
       designation = EXCLUDED.designation,
       department = EXCLUDED.department
     RETURNING id, name, email, designation, department`,
    [userId, name.trim(), email.trim().toLowerCase(), designation?.trim() || null, department?.trim() || null]
  );
  return result.rows[0];
}

/* ── send_email ──────────────────────────────────────────────────────────── */
export async function send_email(userId: number, args: {
  to: string;
  subject: string;
  body: string;
}, googleToken?: string) {
  if (!googleToken) {
    return { error: 'Google account is not connected. Cannot send email.' };
  }

  const { to, subject, body } = args;

  // ── Guard: Verify recipient against the user's real contacts ──────────────
  // This prevents hallucinated email addresses from ever being sent.
  const allContactsRes = await pool.query(
    `SELECT name, email FROM ${schemaName}.contacts WHERE user_id = $1`,
    [userId]
  );
  const allContacts: { name: string; email: string }[] = allContactsRes.rows;

  const toNorm = to.trim().toLowerCase();

  // Check exact email match first
  const exactMatch = allContacts.find(c => c.email.toLowerCase() === toNorm);

  if (!exactMatch) {
    // Try fuzzy match on email domain/local parts as a fallback
    const fuzzyMatch = allContacts
      .map(c => ({ ...c, score: bestNameScore(toNorm, c.email.toLowerCase()) }))
      .filter(c => c.score >= 0.82)
      .sort((a, b) => b.score - a.score)[0];

    if (!fuzzyMatch) {
      // Hard reject — list actual contacts so the AI can self-correct
      const contactList = allContacts.length > 0
        ? allContacts.map(c => `"${c.name}" <${c.email}>`).join(', ')
        : '(no contacts saved)';
      return {
        error: `SEND BLOCKED: "${to}" does not match any contact in the Address Book. ` +
               `You must use an email address from the user's saved contacts. ` +
               `Available contacts: ${contactList}. ` +
               `Call search_contacts to find the correct email, then retry send_email with a verified address.`
      };
    }

    // Fuzzy-matched — redirect to the correct address and log it
    console.warn(`[send_email] Redirecting hallucinated address "${to}" → "${fuzzyMatch.email}" (score: ${fuzzyMatch.score.toFixed(3)})`);
    args = { ...args, to: fuzzyMatch.email };
  }
  // ─────────────────────────────────────────────────────────────────────────

  try {
    const str = [
      `To: ${to}`,
      `Subject: ${subject}`,
      `MIME-Version: 1.0`,
      `Content-Type: text/plain; charset="UTF-8"`,
      `Content-Transfer-Encoding: 7bit`,
      ``,
      body
    ].join('\r\n');

    // Base64Url encode the message
    const raw = Buffer.from(str)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${googleToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ raw })
    });

    if (!res.ok) {
      const errData: any = await res.json().catch(() => ({}));
      return { error: `Gmail API error: ${errData?.error?.message || res.statusText}` };
    }

    const data: any = await res.json();
    return { success: true, messageId: data.id, threadId: data.threadId };
  } catch (err: any) {
    console.error('send_email tool error:', err);
    return { error: `Failed to send email: ${err.message}` };
  }
}

"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.search_meetings = search_meetings;
exports.get_today_meetings = get_today_meetings;
exports.create_meeting = create_meeting;
exports.cancel_meeting = cancel_meeting;
exports.update_meeting = update_meeting;
exports.check_conflicts = check_conflicts;
exports.list_notifications = list_notifications;
exports.get_briefing = get_briefing;
const db_1 = __importStar(require("../db"));
/**
 * All tool implementations — pure DB/business logic, no Anthropic SDK here.
 * The agent loop in agentLoop.ts calls these when Claude requests a tool.
 */
/* ── search_meetings ─────────────────────────────────────────────────────── */
async function search_meetings(userId, args) {
    const { date, title_contains, status, limit = 10 } = args;
    let query = `
    SELECT id, title, start_time, end_time, location, description, status, source
    FROM ${db_1.schemaName}.meetings
    WHERE user_id = $1
  `;
    const params = [userId];
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
    const result = await db_1.default.query(query, params);
    return result.rows;
}
/* ── get_today_meetings ──────────────────────────────────────────────────── */
async function get_today_meetings(userId) {
    const result = await db_1.default.query(`SELECT id, title, start_time, end_time, location, status
     FROM ${db_1.schemaName}.meetings
     WHERE user_id = $1
       AND DATE(start_time) = CURRENT_DATE
       AND status != 'cancelled'
     ORDER BY start_time ASC`, [userId]);
    return result.rows;
}
/* ── create_meeting ──────────────────────────────────────────────────────── */
async function create_meeting(userId, args, googleToken) {
    const { title, start_time, end_time, location, description } = args;
    const result = await db_1.default.query(`INSERT INTO ${db_1.schemaName}.meetings
       (user_id, title, start_time, end_time, location, description, source)
     VALUES ($1,$2,$3,$4,$5,$6,'agent')
     RETURNING id, title, start_time, end_time, status`, [userId, title, start_time, end_time, location || null, description || null]);
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
                const gData = await gRes.json();
                await db_1.default.query(`UPDATE ${db_1.schemaName}.meetings SET google_event_id = $1 WHERE id = $2`, [gData.id, row.id]);
                row.google_event_id = gData.id;
            }
        }
        catch (err) {
            console.error('Failed to write to Google Calendar:', err);
        }
    }
    return row;
}
/* ── cancel_meeting ──────────────────────────────────────────────────────── */
async function cancel_meeting(userId, args, googleToken) {
    const result = await db_1.default.query(`UPDATE ${db_1.schemaName}.meetings
     SET status = 'cancelled', updated_at = NOW()
     WHERE id = $1 AND user_id = $2
     RETURNING id, title, status`, [args.meeting_id, userId]);
    if (result.rows.length === 0) {
        return { error: `Meeting ID ${args.meeting_id} not found or not yours.` };
    }
    const row = result.rows[0];
    // Try fetching the google_event_id to delete from Google Calendar
    if (googleToken) {
        const existing = await db_1.default.query(`SELECT google_event_id FROM ${db_1.schemaName}.meetings WHERE id = $1`, [args.meeting_id]);
        const gcalId = existing.rows[0]?.google_event_id;
        if (gcalId) {
            try {
                await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${gcalId}`, {
                    method: 'DELETE',
                    headers: { 'Authorization': `Bearer ${googleToken}` }
                });
            }
            catch (err) {
                console.error('Failed to delete from Google Calendar:', err);
            }
        }
    }
    return row;
}
/* ── update_meeting ──────────────────────────────────────────────────────── */
async function update_meeting(userId, args, googleToken) {
    const { meeting_id, ...fields } = args;
    const allowed = ['title', 'start_time', 'end_time', 'location', 'description'];
    const updates = [];
    const values = [];
    allowed.forEach(f => {
        if (fields[f] !== undefined) {
            values.push(fields[f]);
            updates.push(`${f} = $${values.length}`);
        }
    });
    if (updates.length === 0)
        return { error: 'Nothing to update' };
    values.push(meeting_id, userId);
    const result = await db_1.default.query(`UPDATE ${db_1.schemaName}.meetings
     SET ${updates.join(', ')}, updated_at = NOW()
     WHERE id = $${values.length - 1} AND user_id = $${values.length}
     RETURNING id, title, start_time, end_time, status`, values);
    if (result.rows.length === 0)
        return { error: 'Meeting not found' };
    const row = result.rows[0];
    if (googleToken) {
        const existing = await db_1.default.query(`SELECT google_event_id FROM ${db_1.schemaName}.meetings WHERE id = $1`, [meeting_id]);
        const gcalId = existing.rows[0]?.google_event_id;
        if (gcalId) {
            try {
                const payload = {};
                if (fields.title)
                    payload.summary = fields.title;
                if (fields.start_time)
                    payload.start = { dateTime: new Date(fields.start_time).toISOString() };
                if (fields.end_time)
                    payload.end = { dateTime: new Date(fields.end_time).toISOString() };
                if (fields.location)
                    payload.location = fields.location;
                if (fields.description)
                    payload.description = fields.description;
                await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${gcalId}`, {
                    method: 'PATCH',
                    headers: { 'Authorization': `Bearer ${googleToken}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
            }
            catch (err) {
                console.error('Failed to update Google Calendar:', err);
            }
        }
    }
    return row;
}
/* ── check_conflicts ─────────────────────────────────────────────────────── */
async function check_conflicts(userId, args) {
    const { proposed_start, proposed_end, exclude_meeting_id } = args;
    let query = `
    SELECT id, title, start_time, end_time, status
    FROM ${db_1.schemaName}.meetings
    WHERE user_id = $1
      AND status != 'cancelled'
      AND (start_time, end_time) OVERLAPS ($2::timestamptz, $3::timestamptz)
  `;
    const params = [userId, proposed_start, proposed_end];
    if (exclude_meeting_id) {
        params.push(exclude_meeting_id);
        query += ` AND id != $${params.length}`;
    }
    const result = await db_1.default.query(query, params);
    return {
        hasConflict: result.rows.length > 0,
        conflicts: result.rows,
    };
}
/* ── list_notifications ──────────────────────────────────────────────────── */
async function list_notifications(userId, args) {
    const { unread_only = true, limit = 10 } = args;
    let query = `
    SELECT n.id, n.message, n.is_read, n.created_at
    FROM ${db_1.schemaName}.notifications n
    WHERE n.user_id = $1
  `;
    const params = [userId];
    if (unread_only)
        query += ` AND n.is_read = FALSE`;
    params.push(limit);
    query += ` ORDER BY n.created_at DESC LIMIT $${params.length}`;
    const result = await db_1.default.query(query, params);
    return result.rows;
}
/* ── get_briefing ────────────────────────────────────────────────────────── */
async function get_briefing(userId) {
    const result = await db_1.default.query(`SELECT brief_date, content, created_at
     FROM ${db_1.schemaName}.briefings
     WHERE user_id = $1 AND brief_date = CURRENT_DATE`, [userId]);
    if (result.rows.length > 0)
        return result.rows[0];
    return { content: null, message: "No briefing generated yet for today. Use generate_briefing to create one." };
}

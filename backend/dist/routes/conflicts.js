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
const express_1 = require("express");
const db_1 = __importStar(require("../db"));
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
router.use(auth_1.requireAuth);
/* ── POST /api/conflicts/check ──────────────────────────────────────────────
   Body: { proposed_start: ISO-string, proposed_end: ISO-string,
           exclude_meeting_id?: number }
   Returns all existing meetings that overlap the proposed window.
   Uses PostgreSQL range overlap: (start1, end1) OVERLAPS (start2, end2)
   ─────────────────────────────────────────────────────────────────────────── */
router.post('/check', async (req, res) => {
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
      FROM ${db_1.schemaName}.meetings
      WHERE user_id = $1
        AND status != 'cancelled'
        AND (start_time, end_time) OVERLAPS ($2::timestamptz, $3::timestamptz)
    `;
        const params = [req.userId, proposed_start, proposed_end];
        if (exclude_meeting_id) {
            params.push(exclude_meeting_id);
            query += ` AND id != $${params.length}`;
        }
        query += ` ORDER BY start_time ASC`;
        const result = await db_1.default.query(query, params);
        const conflicts = result.rows;
        if (conflicts.length === 0) {
            return res.json({ success: true, hasConflict: false, conflicts: [] });
        }
        // Log conflicts into the conflicts table
        for (const conflict of conflicts) {
            await db_1.default.query(`INSERT INTO ${db_1.schemaName}.conflicts
           (proposed_start, proposed_end, conflicting_meeting_id, user_id)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT DO NOTHING`, [proposed_start, proposed_end, conflict.id, req.userId]);
        }
        return res.json({
            success: true,
            hasConflict: true,
            conflicts,
            message: `Found ${conflicts.length} conflicting meeting${conflicts.length !== 1 ? 's' : ''}`,
        });
    }
    catch (err) {
        console.error('POST /conflicts/check error:', err);
        return res.status(500).json({ error: 'Failed to check conflicts' });
    }
});
/* ── GET /api/conflicts ─────────────────────────────────────────────────────
   Returns recent conflict logs for this user (useful for audit / dashboard)
   ─────────────────────────────────────────────────────────────────────────── */
router.get('/', async (req, res) => {
    try {
        const result = await db_1.default.query(`SELECT c.id, c.proposed_start, c.proposed_end, c.detected_at,
              m.id AS conflict_meeting_id, m.title AS conflict_meeting_title,
              m.start_time AS conflict_start, m.end_time AS conflict_end
       FROM ${db_1.schemaName}.conflicts c
       JOIN ${db_1.schemaName}.meetings m ON m.id = c.conflicting_meeting_id
       WHERE c.user_id = $1
       ORDER BY c.detected_at DESC
       LIMIT 100`, [req.userId]);
        return res.json({ success: true, conflicts: result.rows });
    }
    catch (err) {
        console.error('GET /conflicts error:', err);
        return res.status(500).json({ error: 'Failed to fetch conflict log' });
    }
});
exports.default = router;

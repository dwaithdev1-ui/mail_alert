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
/* ── GET /api/alerts ────────────────────────────────────────────────────────
   Returns the alert fire history for this user.
   Query params: ?meeting_id=<id>  ?limit=50
   ─────────────────────────────────────────────────────────────────────────── */
router.get('/', async (req, res) => {
    const limit = Math.min(parseInt(req.query.limit || '50', 10), 200);
    const meetingId = req.query.meeting_id;
    let query = `
    SELECT a.id, a.meeting_id, a.threshold_min, a.channel, a.fired_at,
           m.title AS meeting_title, m.start_time
    FROM ${db_1.schemaName}.alerts a
    JOIN ${db_1.schemaName}.meetings m ON m.id = a.meeting_id
    WHERE m.user_id = $1
  `;
    const params = [req.userId];
    if (meetingId) {
        params.push(meetingId);
        query += ` AND a.meeting_id = $${params.length}`;
    }
    query += ` ORDER BY a.fired_at DESC LIMIT $${params.length + 1}`;
    params.push(limit);
    try {
        const result = await db_1.default.query(query, params);
        return res.json({ success: true, alerts: result.rows });
    }
    catch (err) {
        console.error('GET /alerts error:', err);
        return res.status(500).json({ error: 'Failed to fetch alerts' });
    }
});
/* ── POST /api/alerts/send ──────────────────────────────────────────────────
   Body: { meeting_id, threshold_min, channel? }
   Logs the alert as fired. In Phase 3 this will also enqueue the BullMQ job.
   ─────────────────────────────────────────────────────────────────────────── */
router.post('/send', async (req, res) => {
    const { meeting_id, threshold_min, channel = 'in-app' } = req.body;
    if (!meeting_id || threshold_min == null) {
        return res.status(400).json({ error: 'meeting_id and threshold_min are required' });
    }
    try {
        // Verify meeting belongs to this user
        const meetingCheck = await db_1.default.query(`SELECT id, title, start_time FROM ${db_1.schemaName}.meetings
       WHERE id = $1 AND user_id = $2`, [meeting_id, req.userId]);
        if (meetingCheck.rows.length === 0) {
            return res.status(404).json({ error: 'Meeting not found' });
        }
        const meeting = meetingCheck.rows[0];
        // Insert alert log
        const alertResult = await db_1.default.query(`INSERT INTO ${db_1.schemaName}.alerts (meeting_id, threshold_min, channel)
       VALUES ($1, $2, $3)
       ON CONFLICT (meeting_id, threshold_min, channel) DO UPDATE SET fired_at = NOW()
       RETURNING *`, [meeting_id, threshold_min, channel]);
        // Also create an in-app notification
        await db_1.default.query(`INSERT INTO ${db_1.schemaName}.notifications (user_id, meeting_id, message)
       VALUES ($1, $2, $3)`, [req.userId, meeting_id,
            `Meeting "${meeting.title}" starts in ${threshold_min} minute${threshold_min !== 1 ? 's' : ''}`]);
        return res.json({
            success: true,
            alert: alertResult.rows[0],
            message: `Alert fired for meeting "${meeting.title}"`,
        });
    }
    catch (err) {
        console.error('POST /alerts/send error:', err);
        return res.status(500).json({ error: 'Failed to send alert' });
    }
});
exports.default = router;

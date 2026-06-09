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
/* ── GET /api/notifications ─────────────────────────────────────────────────
   Returns the in-app notification inbox for the current user.
   Query params: ?unread_only=true  ?limit=50
   ─────────────────────────────────────────────────────────────────────────── */
router.get('/', async (req, res) => {
    const limit = Math.min(parseInt(req.query.limit || '50', 10), 200);
    const unreadOnly = req.query.unread_only === 'true';
    let query = `
    SELECT n.id, n.message, n.is_read, n.created_at,
           n.meeting_id, m.title AS meeting_title, m.start_time
    FROM ${db_1.schemaName}.notifications n
    LEFT JOIN ${db_1.schemaName}.meetings m ON m.id = n.meeting_id
    WHERE n.user_id = $1
  `;
    const params = [req.userId];
    if (unreadOnly) {
        query += ` AND n.is_read = FALSE`;
    }
    query += ` ORDER BY n.created_at DESC LIMIT $${params.length + 1}`;
    params.push(limit);
    try {
        const result = await db_1.default.query(query, params);
        // Also return the unread count as a convenience
        const countResult = await db_1.default.query(`SELECT COUNT(*) FROM ${db_1.schemaName}.notifications WHERE user_id = $1 AND is_read = FALSE`, [req.userId]);
        const unreadCount = parseInt(countResult.rows[0].count, 10);
        return res.json({ success: true, notifications: result.rows, unreadCount });
    }
    catch (err) {
        console.error('GET /notifications error:', err);
        return res.status(500).json({ error: 'Failed to fetch notifications' });
    }
});
/* ── PATCH /api/notifications/:id/read ──────────────────────────────────── */
router.patch('/:id/read', async (req, res) => {
    try {
        const result = await db_1.default.query(`UPDATE ${db_1.schemaName}.notifications
       SET is_read = TRUE, read_at = NOW()
       WHERE id = $1 AND user_id = $2
       RETURNING id`, [req.params.id, req.userId]);
        if (result.rows.length === 0)
            return res.status(404).json({ error: 'Notification not found' });
        return res.json({ success: true });
    }
    catch (err) {
        console.error('PATCH /notifications/:id/read error:', err);
        return res.status(500).json({ error: 'Failed to mark notification as read' });
    }
});
/* ── PATCH /api/notifications/read-all ─────────────────────────────────── */
router.patch('/read-all', async (req, res) => {
    try {
        await db_1.default.query(`UPDATE ${db_1.schemaName}.notifications
       SET is_read = TRUE, read_at = NOW()
       WHERE user_id = $1 AND is_read = FALSE`, [req.userId]);
        return res.json({ success: true, message: 'All notifications marked as read' });
    }
    catch (err) {
        console.error('PATCH /notifications/read-all error:', err);
        return res.status(500).json({ error: 'Failed to mark all notifications as read' });
    }
});
/* ── DELETE /api/notifications/:id ─────────────────────────────────────── */
router.delete('/:id', async (req, res) => {
    try {
        const result = await db_1.default.query(`DELETE FROM ${db_1.schemaName}.notifications WHERE id = $1 AND user_id = $2 RETURNING id`, [req.params.id, req.userId]);
        if (result.rows.length === 0)
            return res.status(404).json({ error: 'Notification not found' });
        return res.json({ success: true });
    }
    catch (err) {
        console.error('DELETE /notifications/:id error:', err);
        return res.status(500).json({ error: 'Failed to delete notification' });
    }
});
exports.default = router;

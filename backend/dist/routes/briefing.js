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
const generative_ai_1 = require("@google/generative-ai");
const db_1 = __importStar(require("../db"));
const auth_1 = require("../middleware/auth");
const tools_1 = require("../agent/tools");
const router = (0, express_1.Router)();
router.use(auth_1.requireAuth);
const BRIEFING_MODEL = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
/* ── Generate briefing content via Gemini ───────────────────────────────── */
async function generateBriefingContent(userId) {
    const meetings = await (0, tools_1.get_today_meetings)(userId);
    const notifs = await db_1.default.query(`SELECT message, created_at FROM ${db_1.schemaName}.notifications
     WHERE user_id = $1 AND is_read = FALSE ORDER BY created_at DESC LIMIT 5`, [userId]);
    const now = new Date().toLocaleString('en-US', {
        timeZone: 'Asia/Kolkata',
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
        hour: '2-digit', minute: '2-digit'
    });
    const prompt = `Today is ${now} (IST).

Today's meetings:
${meetings.length === 0
        ? '(No meetings scheduled for today)'
        : meetings.map((m) => `- ${m.title} at ${new Date(m.start_time).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' })}${m.location ? ` @ ${m.location}` : ''} [${m.status}]`).join('\n')}

Recent notifications:
${notifs.rows.length === 0
        ? '(None)'
        : notifs.rows.map((n) => `- ${n.message}`).join('\n')}

Write a concise daily briefing for the college principal. Include:
1. A brief overview of today's schedule
2. Any important alerts or reminders
3. One short motivational/productivity tip

Keep it under 150 words. Use plain text, no markdown headers.`;
    const genAI = new generative_ai_1.GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: BRIEFING_MODEL });
    const result = await model.generateContent(prompt);
    return result.response.text();
}
/* ── GET /api/briefing/today ────────────────────────────────────────────────
   Returns today's stored briefing. If none exists, auto-generates one.
   ─────────────────────────────────────────────────────────────────────────── */
router.get('/today', async (req, res) => {
    try {
        // Check DB first
        const existing = await db_1.default.query(`SELECT brief_date, content, model, created_at
       FROM ${db_1.schemaName}.briefings
       WHERE user_id = $1 AND brief_date = CURRENT_DATE`, [req.userId]);
        if (existing.rows.length > 0) {
            return res.json({ success: true, briefing: existing.rows[0], cached: true });
        }
        // No briefing yet — generate now (or return empty if no API key)
        if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'your-gemini-api-key-here') {
            return res.json({
                success: true,
                briefing: null,
                cached: false,
                message: 'Add a valid GEMINI_API_KEY to .env to enable AI briefings (free at aistudio.google.com).',
            });
        }
        const content = await generateBriefingContent(req.userId);
        // Store in DB
        const saved = await db_1.default.query(`INSERT INTO ${db_1.schemaName}.briefings (user_id, brief_date, content, model)
       VALUES ($1, CURRENT_DATE, $2, $3)
       ON CONFLICT (user_id, brief_date) DO UPDATE SET content = $2, model = $3, created_at = NOW()
       RETURNING brief_date, content, model, created_at`, [req.userId, content, BRIEFING_MODEL]);
        return res.json({ success: true, briefing: saved.rows[0], cached: false });
    }
    catch (err) {
        console.error('GET /briefing/today error:', err);
        return res.status(500).json({ error: 'Failed to fetch briefing', details: err.message });
    }
});
/* ── POST /api/briefing/generate ────────────────────────────────────────────
   Force-regenerates today's briefing (ignores cached version).
   ─────────────────────────────────────────────────────────────────────────── */
router.post('/generate', async (req, res) => {
    if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'your-gemini-api-key-here') {
        return res.status(503).json({ error: 'GEMINI_API_KEY not configured — get a free key at aistudio.google.com' });
    }
    try {
        const content = await generateBriefingContent(req.userId);
        const saved = await db_1.default.query(`INSERT INTO ${db_1.schemaName}.briefings (user_id, brief_date, content, model)
       VALUES ($1, CURRENT_DATE, $2, $3)
       ON CONFLICT (user_id, brief_date) DO UPDATE SET content = $2, model = $3, created_at = NOW()
       RETURNING brief_date, content, model, created_at`, [req.userId, content, BRIEFING_MODEL]);
        return res.json({ success: true, briefing: saved.rows[0] });
    }
    catch (err) {
        console.error('POST /briefing/generate error:', err);
        return res.status(500).json({ error: 'Failed to generate briefing', details: err.message });
    }
});
/* ── GET /api/briefing/history ──────────────────────────────────────────── */
router.get('/history', async (req, res) => {
    try {
        const result = await db_1.default.query(`SELECT brief_date, content, model, created_at
       FROM ${db_1.schemaName}.briefings
       WHERE user_id = $1
       ORDER BY brief_date DESC LIMIT 30`, [req.userId]);
        return res.json({ success: true, briefings: result.rows });
    }
    catch (err) {
        return res.status(500).json({ error: 'Failed to fetch briefing history' });
    }
});
exports.default = router;

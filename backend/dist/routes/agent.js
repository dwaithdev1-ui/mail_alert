"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const agentLoop_1 = require("../agent/agentLoop");
const auth_1 = require("../middleware/auth");
const openai_1 = __importDefault(require("openai"));
const router = (0, express_1.Router)();
router.use(auth_1.requireAuth);
/**
 * POST /api/agent/chat
 *
 * Body:
 *   message: string               — the new user message
 *   history: ChatMessage[]        — previous conversation turns (maintained by frontend)
 *
 * Response:
 *   reply: string                 — Claude's final answer
 *   toolsUsed: string[]           — which tools were called this turn
 *   history: ChatMessage[]        — updated history to send back next turn
 */
router.post('/chat', async (req, res) => {
    const { message, history = [], googleAccessToken } = req.body;
    if (!message || typeof message !== 'string' || !message.trim()) {
        return res.status(400).json({ error: 'message is required' });
    }
    if (!Array.isArray(history)) {
        return res.status(400).json({ error: 'history must be an array' });
    }
    try {
        const agentResponse = await (0, agentLoop_1.runAgentLoop)(req.userId, history, message.trim(), googleAccessToken);
        // Build updated history for the client to store and send next time
        const updatedHistory = [
            ...history,
            { role: 'user', content: message.trim() },
            { role: 'assistant', content: agentResponse.reply },
        ];
        return res.json({
            success: true,
            reply: agentResponse.reply,
            toolsUsed: agentResponse.toolsUsed,
            history: updatedHistory,
            error: agentResponse.error,
        });
    }
    catch (err) {
        console.error('POST /agent/chat error:', err);
        return res.status(500).json({
            error: 'Agent error',
            details: err.message,
        });
    }
});
/**
 * POST /api/agent/draft-email
 *
 * Body:
 *   title: string
 *   date: string
 *   time: string
 *   location?: string
 *   link?: string
 *   agenda?: string
 */
router.post('/draft-email', async (req, res) => {
    const { title, date, time, location, link, agenda } = req.body;
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey || apiKey === 'your-groq-api-key-here') {
        return res.status(500).json({ error: 'Groq API key is not configured' });
    }
    const groq = new openai_1.default({
        apiKey,
        baseURL: 'https://api.groq.com/openai/v1',
    });
    const prompt = `Write a highly professional, polite email invitation for a college meeting.
Meeting Details:
- Title: ${title}
- Date: ${date}
- Time: ${time}
- Location: ${location || 'N/A'}
- Meeting Link: ${link || 'N/A'}
- Agenda/Details: ${agenda || 'N/A'}

Format the email with a clear Subject line and a professional Body. Return your output as a JSON object with keys "subject" and "body".
Example:
{
  "subject": "Invitation: Project Review Meeting",
  "body": "Dear Colleague,\\n\\nYou are cordially invited to..."
}
Strictly return only the JSON object, no other text or explanation.`;
    try {
        const response = await groq.chat.completions.create({
            model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
            messages: [{ role: 'user', content: prompt }],
            response_format: { type: 'json_object' },
        });
        const content = response.choices[0].message.content || '{}';
        const parsed = JSON.parse(content);
        return res.json({ success: true, draft: parsed });
    }
    catch (err) {
        console.error('Draft email error:', err);
        return res.status(500).json({ error: 'Failed to generate email draft', details: err.message });
    }
});
exports.default = router;

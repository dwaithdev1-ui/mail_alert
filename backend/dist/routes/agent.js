"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const agentLoop_1 = require("../agent/agentLoop");
const auth_1 = require("../middleware/auth");
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
exports.default = router;

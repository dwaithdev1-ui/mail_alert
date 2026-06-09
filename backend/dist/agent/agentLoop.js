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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runAgentLoop = runAgentLoop;
const openai_1 = __importDefault(require("openai"));
const tools_impl = __importStar(require("./tools"));
const MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
const MAX_ITERATIONS = 10;
/* ── Tool schemas (OpenAI / Groq function-calling format) ───────────────── */
const TOOLS = [
    {
        type: 'function',
        function: {
            name: 'search_meetings',
            description: "Search the user's meetings by date, title, or status. Use before cancelling or updating.",
            parameters: {
                type: 'object',
                properties: {
                    date: { type: 'string', description: 'Filter by date, YYYY-MM-DD format' },
                    title_contains: { type: 'string', description: 'Case-insensitive substring match on title' },
                    status: { type: 'string', description: 'Filter by status: scheduled | ongoing | done | cancelled' },
                    limit: { type: 'integer', description: 'Max results to return (default 10)' },
                },
                required: [],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'get_today_meetings',
            description: "Get all of today's non-cancelled meetings in chronological order.",
            parameters: { type: 'object', properties: {} },
        },
    },
    {
        type: 'function',
        function: {
            name: 'create_meeting',
            description: 'Create a new meeting. Always call check_conflicts first.',
            parameters: {
                type: 'object',
                properties: {
                    title: { type: 'string', description: 'Meeting title' },
                    start_time: { type: 'string', description: 'Start time ISO-8601, e.g. 2026-06-05T15:00:00+05:30' },
                    end_time: { type: 'string', description: 'End time ISO-8601' },
                    location: { type: 'string', description: 'Location or meeting link (optional)' },
                    description: { type: 'string', description: 'Additional notes (optional)' },
                },
                required: ['title', 'start_time', 'end_time'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'cancel_meeting',
            description: 'Cancel a meeting by ID. Always search first to confirm the correct meeting_id.',
            parameters: {
                type: 'object',
                properties: {
                    meeting_id: { type: 'integer', description: 'The numeric ID of the meeting to cancel' },
                },
                required: ['meeting_id'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'update_meeting',
            description: "Update an existing meeting's title, time, or location.",
            parameters: {
                type: 'object',
                properties: {
                    meeting_id: { type: 'integer', description: 'ID of the meeting to update' },
                    title: { type: 'string', description: 'New title' },
                    start_time: { type: 'string', description: 'New start time ISO-8601' },
                    end_time: { type: 'string', description: 'New end time ISO-8601' },
                    location: { type: 'string', description: 'New location' },
                    description: { type: 'string', description: 'New description' },
                },
                required: ['meeting_id'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'check_conflicts',
            description: 'Check if a proposed slot overlaps any existing meetings. Call this before scheduling.',
            parameters: {
                type: 'object',
                properties: {
                    proposed_start: { type: 'string', description: 'Proposed start ISO-8601' },
                    proposed_end: { type: 'string', description: 'Proposed end ISO-8601' },
                    exclude_meeting_id: { type: 'integer', description: 'Exclude this ID (for rescheduling)' },
                },
                required: ['proposed_start', 'proposed_end'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'list_notifications',
            description: "List the user's recent in-app notifications.",
            parameters: {
                type: 'object',
                properties: {
                    unread_only: { type: 'boolean', description: 'Only return unread (default true)' },
                    limit: { type: 'integer', description: 'Max results (default 10)' },
                },
                required: [],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'get_briefing',
            description: "Get today's AI-generated daily briefing summary.",
            parameters: { type: 'object', properties: {} },
        },
    },
];
/* ── Tool executor ──────────────────────────────────────────────────────── */
async function executeTool(userId, name, args, googleToken) {
    switch (name) {
        case 'search_meetings': return tools_impl.search_meetings(userId, args);
        case 'get_today_meetings': return tools_impl.get_today_meetings(userId);
        case 'create_meeting': return tools_impl.create_meeting(userId, args, googleToken);
        case 'cancel_meeting': return tools_impl.cancel_meeting(userId, args, googleToken);
        case 'update_meeting': return tools_impl.update_meeting(userId, args, googleToken);
        case 'check_conflicts': return tools_impl.check_conflicts(userId, args);
        case 'list_notifications': return tools_impl.list_notifications(userId, args);
        case 'get_briefing': return tools_impl.get_briefing(userId);
        default: return { error: `Unknown tool: ${name}` };
    }
}
/* ── Main agent loop ────────────────────────────────────────────────────── */
async function runAgentLoop(userId, conversationHistory, userMessage, googleToken) {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey || apiKey === 'your-groq-api-key-here') {
        return {
            reply: 'AI Agent is not configured. Add a valid GROQ_API_KEY to your .env file (get a free key at console.groq.com).',
            toolsUsed: [],
            error: 'GROQ_API_KEY not configured',
        };
    }
    const groq = new openai_1.default({
        apiKey,
        baseURL: 'https://api.groq.com/openai/v1',
    });
    const nowIST = new Date().toLocaleString('en-US', {
        timeZone: 'Asia/Kolkata',
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
        hour: '2-digit', minute: '2-digit',
    });
    const systemPrompt = `You are an intelligent scheduling assistant for a college principal.
Today's date and time: ${nowIST} (IST).

Your capabilities:
- Search, create, update, and cancel meetings
- Check scheduling conflicts before creating meetings
- Show today's meetings and briefings
- Check notification inbox

Guidelines:
1. ALWAYS call check_conflicts before creating a new meeting.
2. If the user wants to cancel a meeting but hasn't specified which one, call search_meetings first, list the results, and ask for confirmation with the meeting title and ID.
3. Parse natural language dates relative to today in IST timezone.
4. If a request is ambiguous (e.g. "cancel my meeting" when multiple exist), list the options and ask which one.
5. Be concise and professional. Format times in 12-hour IST format.
6. Confirm every action taken (created/cancelled/updated) with relevant details.`;
    // Build messages array: system + prior history + new user message
    const messages = [
        { role: 'system', content: systemPrompt },
        ...conversationHistory.map(m => ({
            role: m.role,
            content: m.content,
        })),
        { role: 'user', content: userMessage },
    ];
    const toolsUsed = [];
    let iteration = 0;
    // Tools that perform a write action — after these, force a text summary
    const ACTION_TOOLS = new Set(['create_meeting', 'cancel_meeting', 'update_meeting']);
    try {
        while (iteration < MAX_ITERATIONS) {
            iteration++;
            // After an action tool ran, force plain-text response (no more tool calls)
            const forceText = toolsUsed.some(t => ACTION_TOOLS.has(t));
            // Retry up to 3 times for transient 503/429 errors
            let response;
            for (let attempt = 0; attempt <= 3; attempt++) {
                try {
                    response = await groq.chat.completions.create({
                        model: MODEL,
                        messages,
                        ...(forceText ? {} : { tools: TOOLS, tool_choice: 'auto' }),
                        max_tokens: 1024,
                    });
                    break;
                }
                catch (sendErr) {
                    const status = sendErr?.status;
                    const msg = String(sendErr?.message || '');
                    const isFailedGeneration = status === 400 && msg.includes('failed_generation');
                    const isRetryable = status === 503 || status === 429 ||
                        msg.includes('503') || msg.includes('overloaded') || msg.includes('high demand');
                    if (isFailedGeneration && attempt < 3) {
                        // Model tried to call a function but produced invalid JSON — force text response
                        console.warn('[AgentLoop] failed_generation — retrying with tool_choice:none');
                        response = await groq.chat.completions.create({
                            model: MODEL,
                            messages,
                            max_tokens: 1024,
                        });
                        break;
                    }
                    if (isRetryable && attempt < 3) {
                        const delay = 1000 * Math.pow(2, attempt);
                        console.warn(`[AgentLoop] Retryable error (attempt ${attempt + 1}/3), retrying in ${delay}ms...`);
                        await new Promise(r => setTimeout(r, delay));
                        continue;
                    }
                    throw sendErr;
                }
            }
            const choice = response.choices[0];
            const assistantMsg = choice.message;
            // Add assistant turn to messages
            messages.push(assistantMsg);
            // No tool calls → final text answer
            if (!assistantMsg.tool_calls || assistantMsg.tool_calls.length === 0) {
                return {
                    reply: assistantMsg.content || '(No response from agent)',
                    toolsUsed,
                };
            }
            // Execute each requested tool call
            for (const toolCall of assistantMsg.tool_calls) {
                if (toolCall.type !== 'function') {
                    continue;
                }
                const { id, function: fn } = toolCall;
                const name = fn.name;
                let args = {};
                try {
                    args = JSON.parse(fn.arguments || '{}');
                }
                catch { }
                toolsUsed.push(name);
                let toolResult;
                try {
                    toolResult = await executeTool(userId, name, args, googleToken);
                }
                catch (err) {
                    toolResult = { error: err.message };
                }
                // Truncate large results to keep context manageable
                const resultStr = JSON.stringify(toolResult);
                messages.push({
                    role: 'tool',
                    tool_call_id: id,
                    content: resultStr.length > 2000 ? resultStr.slice(0, 2000) + '…' : resultStr,
                });
            }
        }
        return {
            reply: 'Agent reached maximum iterations. Please try a simpler request.',
            toolsUsed,
        };
    }
    catch (err) {
        console.error('[AgentLoop] Groq API error:', err);
        const msg = err?.message || String(err);
        const isAuthError = msg.includes('401') || msg.includes('invalid_api_key') || msg.includes('Unauthorized');
        return {
            reply: isAuthError
                ? 'The Groq API key is invalid. Please update GROQ_API_KEY in your .env file with a key from console.groq.com.'
                : `AI error: ${msg}`,
            toolsUsed,
            error: msg,
        };
    }
}

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
const db_1 = __importStar(require("../db"));
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
                    date: { anyOf: [{ type: 'string' }, { type: 'null' }], description: 'Filter by date, YYYY-MM-DD format. Omit if not filtering by date.' },
                    title_contains: { anyOf: [{ type: 'string' }, { type: 'null' }], description: 'Case-insensitive substring match on title. Omit if not filtering by title.' },
                    status: { anyOf: [{ type: 'string' }, { type: 'null' }], description: 'Filter by status: scheduled | ongoing | done | cancelled. Omit if not filtering by status.' },
                    limit: { anyOf: [{ type: 'integer' }, { type: 'null' }], description: 'Max results to return (default 10). Omit if not custom limiting.' },
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
                    location: { anyOf: [{ type: 'string' }, { type: 'null' }], description: 'Location or meeting link. Omit if none.' },
                    description: { anyOf: [{ type: 'string' }, { type: 'null' }], description: 'Additional notes. Omit if none.' },
                    attendees: {
                        anyOf: [
                            { type: 'array', items: { type: 'string' } },
                            { type: 'string' },
                            { type: 'null' }
                        ],
                        description: 'List of email addresses to invite. Omit if none.'
                    },
                    create_meet: {
                        anyOf: [{ type: 'boolean' }, { type: 'null' }],
                        description: 'Set to true to automatically generate a Google Meet link for this meeting (e.g. if the user requests a virtual, online, Google Meet, or video conference meeting). Omit if false.'
                    },
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
                    title: { anyOf: [{ type: 'string' }, { type: 'null' }], description: 'New title. Omit if not updating.' },
                    start_time: { anyOf: [{ type: 'string' }, { type: 'null' }], description: 'New start time ISO-8601. Omit if not updating.' },
                    end_time: { anyOf: [{ type: 'string' }, { type: 'null' }], description: 'New end time ISO-8601. Omit if not updating.' },
                    location: { anyOf: [{ type: 'string' }, { type: 'null' }], description: 'New location. Omit if not updating.' },
                    description: { anyOf: [{ type: 'string' }, { type: 'null' }], description: 'New description. Omit if not updating.' },
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
                    exclude_meeting_id: { anyOf: [{ type: 'integer' }, { type: 'null' }], description: 'Exclude this ID (for rescheduling). Omit if not rescheduling.' },
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
                    unread_only: { anyOf: [{ type: 'boolean' }, { type: 'null' }], description: 'Only return unread (default true). Omit if default.' },
                    limit: { anyOf: [{ type: 'integer' }, { type: 'null' }], description: 'Max results (default 10). Omit if default.' },
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
    {
        type: 'function',
        function: {
            name: 'search_contacts',
            description: "Search the user's Address Book contacts by name, email, department, or designation. Uses fuzzy Jaro-Winkler matching to handle voice mis-recognitions. Each result includes 'match_type' (\"exact\" | \"fuzzy\") and 'fuzzy_score' (0–1). Exact matches are returned first; fuzzy matches require confirmation from the user if the score is below 0.88 or there are multiple results.",
            parameters: {
                type: 'object',
                properties: {
                    query: { type: 'string', description: 'Name, email, or department to search for. Can be partial, phonetic, or misheard.' },
                },
                required: ['query'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'create_contact',
            description: "Add a new contact to the user's Address Book contacts list.",
            parameters: {
                type: 'object',
                properties: {
                    name: { type: 'string', description: 'Full name of the contact' },
                    email: { type: 'string', description: 'Email address of the contact' },
                    designation: { anyOf: [{ type: 'string' }, { type: 'null' }], description: 'Job title/designation (e.g. HOD, Dean). Omit if none.' },
                    department: { anyOf: [{ type: 'string' }, { type: 'null' }], description: 'Department name (e.g. CSE, ECE). Omit if none.' },
                },
                required: ['name', 'email'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'send_email',
            description: 'Send a standalone email message to one or more recipients.',
            parameters: {
                type: 'object',
                properties: {
                    to: { type: 'string', description: 'Recipient email address' },
                    subject: { type: 'string', description: 'Email subject line' },
                    body: { type: 'string', description: 'Main content/body of the email' },
                },
                required: ['to', 'subject', 'body'],
            },
        },
    },
];
/* ── Tool executor ──────────────────────────────────────────────────────── */
async function executeTool(userId, name, args, googleToken) {
    switch (name) {
        case 'search_meetings': return tools_impl.search_meetings(userId, args, googleToken);
        case 'get_today_meetings': return tools_impl.get_today_meetings(userId, googleToken);
        case 'create_meeting': return tools_impl.create_meeting(userId, args, googleToken);
        case 'cancel_meeting': return tools_impl.cancel_meeting(userId, args, googleToken);
        case 'update_meeting': return tools_impl.update_meeting(userId, args, googleToken);
        case 'check_conflicts': return tools_impl.check_conflicts(userId, args, googleToken);
        case 'list_notifications': return tools_impl.list_notifications(userId, args);
        case 'get_briefing': return tools_impl.get_briefing(userId);
        case 'search_contacts': return tools_impl.search_contacts(userId, args);
        case 'create_contact': return tools_impl.create_contact(userId, args);
        case 'send_email': return tools_impl.send_email(userId, args, googleToken);
        default: return { error: `Unknown tool: ${name}` };
    }
}
/* ── Helpers ────────────────────────────────────────────────────────────── */
const ACTION_TOOLS = new Set(['create_meeting', 'cancel_meeting', 'update_meeting', 'send_email']);
function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}
/* ── Main agent loop ────────────────────────────────────────────────────── */
async function runAgentLoop(userId, conversationHistory, userMessage, googleToken) {
    console.log(`\n=== [AgentLoop Start] ===\nUser Message: "${userMessage}"\n=========================\n`);
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
    let contactsList = '(No contacts saved in Address Book)';
    try {
        const contactsRes = await db_1.default.query(`SELECT name, email, designation, department FROM ${db_1.schemaName}.contacts WHERE user_id = $1 ORDER BY name ASC`, [userId]);
        if (contactsRes.rows.length > 0) {
            contactsList = contactsRes.rows
                .map(c => `- Name: "${c.name}", Email: "${c.email}"${c.designation ? `, Designation: "${c.designation}"` : ''}${c.department ? `, Department: "${c.department}"` : ''}`)
                .join('\n');
        }
    }
    catch (err) {
        console.error('[agentLoop] Failed to fetch contacts for system prompt:', err);
    }
    let userProfileStr = '';
    try {
        const userRes = await db_1.default.query(`SELECT full_name, username FROM ${db_1.schemaName}.users WHERE id = $1`, [userId]);
        if (userRes.rows.length > 0) {
            const u = userRes.rows[0];
            userProfileStr = `Current User (Principal): ${u.full_name} (${u.username})`;
        }
    }
    catch (err) {
        console.error('[agentLoop] Failed to fetch user profile for system prompt:', err);
    }
    const systemPrompt = `You are an intelligent scheduling and communication assistant for a college principal.
Today's date and time: ${nowIST} (IST).
${userProfileStr ? userProfileStr + '\n' : ''}
Your capabilities:
- Search, create, update, and cancel meetings
- Send professional emails via Gmail
- Check scheduling conflicts before creating meetings
- Show today's meetings and briefings
- Check notification inbox

USER'S ADDRESS BOOK (SAVED CONTACTS):
These are the ONLY contacts currently saved in the user's Address Book:
${contactsList}

Address Book & Fuzzy Name Matching Rules:
1. NAME TO EMAIL RESOLUTION: If the user mentions a person's name (e.g., "Sreedhar"), a designation (e.g., "Dean"), or a department, you MUST CALL 'search_contacts' FIRST.
2. NO HALLUCINATION: NEVER guess, fabricate, or assume any email address. NEVER use a person's name as their email (e.g. do not guess "sridhar@gmail.com"). Always resolve the email via 'search_contacts' first.
3. INTERPRETING FUZZY RESULTS: The 'search_contacts' tool returns contacts with two extra fields:
   - match_type: "exact" means a direct substring match; "fuzzy" means a phonetic/spelling-tolerant match.
   - fuzzy_score: a 0.0–1.0 confidence score (1.0 = perfect match).
   Use these rules based on the results:
   a. If match_type is "exact" → proceed directly (high confidence).
   b. If match_type is "fuzzy" AND fuzzy_score >= 0.88 AND only ONE result → proceed but mention to the user: "I matched your voice input to [Name] ([email]) from your Address Book."
   c. If match_type is "fuzzy" AND multiple results OR fuzzy_score < 0.88 → ASK the user to confirm: "Voice recognition may have misheard the name. I found these matches: [list names + emails]. Which did you mean?"
   d. If NO contacts are returned (empty list) → tell the user the contact was not found in the Address Book and ask them to add it first.
4. MANDATORY SEARCH: Even if you think you know the email, you MUST verify it via 'search_contacts' before calling 'create_meeting' or 'send_email'.
5. NO PARTIAL ACTIONS: Do not schedule a meeting or send an email with a placeholder or assumed email address. Resolve the real email first.
6. STRICT TRUTH: Refer only to contacts that are actually listed in the USER'S ADDRESS BOOK above. If 'search_contacts' returns nothing, do NOT invent or pretend you found any contact (like Sridhar sridhar.ch@college.ac.in). State clearly that the contact was not found.
7. NEVER LEAK TOOL INTERNALS: Do NOT mention tool names (e.g., "search_contacts"), internal field names ("match_type", "fuzzy_score"), or raw JSON in your responses. Summarise results in plain, natural language only.

General Guidelines:
1. ALWAYS call check_conflicts before creating a new meeting.
2. Confirm every action taken (created/cancelled/updated/emailed) with relevant details.
3. You MUST call the appropriate tool (create_meeting, cancel_meeting, update_meeting, send_email) to perform any changes or send communications. 
4. If check_conflicts returns no conflicts, you MUST call create_meeting in the very next turn to actually schedule the meeting.
5. Be concise and professional. Format times in 12-hour IST format.`;
    // Build messages array: system + prior history + new user message (filtering out error messages to avoid model priming)
    const messages = [
        { role: 'system', content: systemPrompt },
        ...conversationHistory
            .filter(m => {
            const text = m.content || '';
            return !text.includes('tool call validation failed') && !text.includes('AI error:');
        })
            .slice(-8)
            .map(m => ({
            role: m.role,
            content: m.content,
        })),
        { role: 'user', content: userMessage },
    ];
    const toolsUsed = [];
    let iteration = 0;
    // Tracks whether an ACTION tool ran in the PREVIOUS iteration only.
    // After a write action we force one plain-text summary turn, then resume normally.
    let forceText = false;
    try {
        while (iteration < MAX_ITERATIONS) {
            iteration++;
            console.log(`[AgentLoop] Iteration ${iteration} starting. forceText: ${forceText}`);
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
                    const errMsg = String(sendErr?.message || '');
                    const isFailedGeneration = status === 400 && errMsg.includes('failed_generation');
                    const isRetryable = status === 503 || status === 429 ||
                        errMsg.includes('503') || errMsg.includes('overloaded') || errMsg.includes('high demand');
                    // Model tried to call a function but produced invalid JSON.
                    // Retry once WITHOUT tools to force a clean text response.
                    if (isFailedGeneration && attempt < 3) {
                        console.warn('[AgentLoop] failed_generation — retrying without tools (text only)');
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
                        await sleep(delay);
                        continue;
                    }
                    throw sendErr;
                }
            }
            if (!response) {
                throw new Error('No response received from Groq API after retries.');
            }
            const choice = response.choices[0];
            const assistantMsg = choice.message;
            console.log(`[AgentLoop] Assistant response: ${assistantMsg.content ? `"${assistantMsg.content}"` : '(no text content)'}`);
            if (assistantMsg.tool_calls && assistantMsg.tool_calls.length > 0) {
                console.log(`[AgentLoop] Tool calls generated: ${JSON.stringify(assistantMsg.tool_calls.map((tc) => ({ name: tc.function.name, arguments: tc.function.arguments })))}`);
            }
            // Add assistant turn to messages (normalize null content to empty string)
            messages.push({
                role: 'assistant',
                content: assistantMsg.content ?? '',
                ...(assistantMsg.tool_calls ? { tool_calls: assistantMsg.tool_calls } : {}),
            });
            // No tool calls → final text answer
            if (!assistantMsg.tool_calls || assistantMsg.tool_calls.length === 0) {
                console.log(`\n=== [AgentLoop End] ===\nReply: "${assistantMsg.content || ''}"\nTools Used: ${JSON.stringify(toolsUsed)}\n=======================\n`);
                return {
                    reply: assistantMsg.content || '(No response from agent)',
                    toolsUsed,
                };
            }
            // Execute each requested tool call; track if any was a write action
            let actionRanThisTurn = false;
            for (const toolCall of assistantMsg.tool_calls) {
                const { id, function: fn } = toolCall;
                const name = fn.name;
                let args = {};
                try {
                    args = JSON.parse(fn.arguments || '{}');
                }
                catch {
                    args = {};
                }
                toolsUsed.push(name);
                if (ACTION_TOOLS.has(name))
                    actionRanThisTurn = true;
                console.log(`[AgentLoop] Executing tool "${name}" with args:`, JSON.stringify(args));
                let toolResult;
                try {
                    toolResult = await executeTool(userId, name, args, googleToken);
                }
                catch (err) {
                    toolResult = { error: err?.message || String(err) };
                }
                console.log(`[AgentLoop] Tool "${name}" returned:`, JSON.stringify(toolResult));
                // Truncate large results to keep context manageable
                const resultStr = JSON.stringify(toolResult);
                messages.push({
                    role: 'tool',
                    tool_call_id: id,
                    content: resultStr.length > 2000 ? resultStr.slice(0, 2000) + '…' : resultStr,
                });
            }
            // Only force a text-only summary on the iteration IMMEDIATELY after a write action.
            forceText = actionRanThisTurn;
        }
        console.log(`[AgentLoop] Maximum iterations reached.`);
        return {
            reply: 'Agent reached maximum iterations. Please try a simpler request.',
            toolsUsed,
        };
    }
    catch (err) {
        console.error('[AgentLoop] Groq API error:', err);
        const errMsg = err?.message || String(err);
        const isAuthError = errMsg.includes('401') || errMsg.includes('invalid_api_key') || errMsg.includes('Unauthorized');
        return {
            reply: isAuthError
                ? 'The Groq API key is invalid. Please update GROQ_API_KEY in your .env file with a key from console.groq.com.'
                : `AI error: ${errMsg}`,
            toolsUsed,
            error: errMsg,
        };
    }
}

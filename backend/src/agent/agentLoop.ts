import { GoogleGenerativeAI } from '@google/generative-ai';
import * as tools_impl from './tools';

const MODEL = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
const MAX_ITERATIONS = 10;
// Force restart to load .env

/* ── Tool schemas (Gemini function declarations) ────────────────────────── */
const FUNCTION_DECLARATIONS = [
  {
    name: 'search_meetings',
    description: "Search the user's meetings by date, title, or status. Use before cancelling or updating.",
    parameters: {
      type: 'object',
      properties: {
        date:           { type: 'string',  description: 'Filter by date, YYYY-MM-DD format' },
        title_contains: { type: 'string',  description: 'Case-insensitive substring match on title' },
        status:         { type: 'string',  description: 'Filter by status: scheduled | ongoing | done | cancelled' },
        limit:          { type: 'number',  description: 'Max results to return (default 10)' },
      },
    },
  },
  {
    name: 'get_today_meetings',
    description: "Get all of today's non-cancelled meetings in chronological order.",
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'create_meeting',
    description: 'Create a new meeting. Always call check_conflicts first.',
    parameters: {
      type: 'object',
      properties: {
        title:       { type: 'string', description: 'Meeting title' },
        start_time:  { type: 'string', description: 'Start time ISO-8601, e.g. 2026-06-05T15:00:00+05:30' },
        end_time:    { type: 'string', description: 'End time ISO-8601' },
        location:    { type: 'string', description: 'Location or meeting link (optional)' },
        description: { type: 'string', description: 'Additional notes (optional)' },
      },
      required: ['title', 'start_time', 'end_time'],
    },
  },
  {
    name: 'cancel_meeting',
    description: 'Cancel a meeting by ID. Always search first to confirm the correct meeting_id.',
    parameters: {
      type: 'object',
      properties: {
        meeting_id: { type: 'number', description: 'The numeric ID of the meeting to cancel' },
      },
      required: ['meeting_id'],
    },
  },
  {
    name: 'update_meeting',
    description: "Update an existing meeting's title, time, or location.",
    parameters: {
      type: 'object',
      properties: {
        meeting_id:  { type: 'number', description: 'ID of the meeting to update' },
        title:       { type: 'string', description: 'New title' },
        start_time:  { type: 'string', description: 'New start time ISO-8601' },
        end_time:    { type: 'string', description: 'New end time ISO-8601' },
        location:    { type: 'string', description: 'New location' },
        description: { type: 'string', description: 'New description' },
      },
      required: ['meeting_id'],
    },
  },
  {
    name: 'check_conflicts',
    description: 'Check if a proposed slot overlaps any existing meetings. Call this before scheduling.',
    parameters: {
      type: 'object',
      properties: {
        proposed_start:     { type: 'string', description: 'Proposed start ISO-8601' },
        proposed_end:       { type: 'string', description: 'Proposed end ISO-8601' },
        exclude_meeting_id: { type: 'number', description: 'Exclude this ID (for rescheduling)' },
      },
      required: ['proposed_start', 'proposed_end'],
    },
  },
  {
    name: 'list_notifications',
    description: "List the user's recent in-app notifications.",
    parameters: {
      type: 'object',
      properties: {
        unread_only: { type: 'boolean', description: 'Only return unread (default true)' },
        limit:       { type: 'number',  description: 'Max results (default 10)' },
      },
    },
  },
  {
    name: 'get_briefing',
    description: "Get today's AI-generated daily briefing summary.",
    parameters: { type: 'object', properties: {} },
  },
];

/* ── Tool executor ──────────────────────────────────────────────────────── */
async function executeTool(userId: number, name: string, args: any, googleToken?: string): Promise<any> {
  switch (name) {
    case 'search_meetings':    return tools_impl.search_meetings(userId, args);
    case 'get_today_meetings': return tools_impl.get_today_meetings(userId);
    case 'create_meeting':     return tools_impl.create_meeting(userId, args, googleToken);
    case 'cancel_meeting':     return tools_impl.cancel_meeting(userId, args, googleToken);
    case 'update_meeting':     return tools_impl.update_meeting(userId, args, googleToken);
    case 'check_conflicts':    return tools_impl.check_conflicts(userId, args);
    case 'list_notifications': return tools_impl.list_notifications(userId, args);
    case 'get_briefing':       return tools_impl.get_briefing(userId);
    default:                   return { error: `Unknown tool: ${name}` };
  }
}

/* ── Message types ──────────────────────────────────────────────────────── */
export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AgentResponse {
  reply: string;
  toolsUsed: string[];
  error?: string;
}

/* ── Main agent loop ────────────────────────────────────────────────────── */
export async function runAgentLoop(
  userId: number,
  conversationHistory: ChatMessage[],
  userMessage: string,
  googleToken?: string
): Promise<AgentResponse> {

  if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'your-gemini-api-key-here') {
    return {
      reply: 'AI Agent is not configured. Add a valid GEMINI_API_KEY to your .env file (get a free key at aistudio.google.com).',
      toolsUsed: [],
      error: 'GEMINI_API_KEY not configured',
    };
  }

  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

  const nowIST = new Date().toLocaleString('en-US', { 
    timeZone: 'Asia/Kolkata', 
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', 
    hour: '2-digit', minute: '2-digit' 
  });
  const systemInstruction = `You are an intelligent scheduling assistant for a college principal.
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

  const model = genAI.getGenerativeModel({
    model: MODEL,
    systemInstruction,
    tools: [{ functionDeclarations: FUNCTION_DECLARATIONS as any }],
    generationConfig: { maxOutputTokens: 1024 },
  });

  // Convert stored history to Gemini format (role: 'user' | 'model')
  const geminiHistory = conversationHistory.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));

  const chat = model.startChat({ history: geminiHistory });

  const toolsUsed: string[] = [];
  let iteration = 0;
  let currentMessage: any = userMessage;

  while (iteration < MAX_ITERATIONS) {
    iteration++;

    const result = await chat.sendMessage(currentMessage);
    const response = result.response;
    const parts = response.candidates?.[0]?.content?.parts ?? [];

    // Collect any function calls in this response
    const fnCallParts = parts.filter((p: any) => p.functionCall);

    if (fnCallParts.length === 0) {
      // No function calls — final text answer
      const text = response.text();
      return { reply: text || '(No response from agent)', toolsUsed };
    }

    // Execute all requested tool calls
    const fnResponses: any[] = [];
    for (const part of fnCallParts) {
      const call = part.functionCall!;
      const { name, args } = call;
      toolsUsed.push(name);

      let toolResult: any;
      try {
        toolResult = await executeTool(userId, name, args ?? {}, googleToken);
      } catch (err: any) {
        toolResult = { error: err.message };
      }

      fnResponses.push({
        functionResponse: {
          name,
          response: { result: toolResult },
        },
      });
    }

    // Feed results back — Gemini continues the turn
    currentMessage = fnResponses;
  }

  return {
    reply: 'Agent reached maximum iterations. Please try a simpler request.',
    toolsUsed,
  };
}

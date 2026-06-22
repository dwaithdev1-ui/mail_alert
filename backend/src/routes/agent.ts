import { Router, Response } from 'express';
import { runAgentLoop, ChatMessage } from '../agent/agentLoop';
import { requireAuth, AuthRequest } from '../middleware/auth';
import OpenAI from 'openai';

const router = Router();
router.use(requireAuth);

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
router.post('/chat', async (req: AuthRequest, res: Response) => {
  const { message, history = [], googleAccessToken } = req.body;

  if (!message || typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ error: 'message is required' });
  }

  if (!Array.isArray(history)) {
    return res.status(400).json({ error: 'history must be an array' });
  }

  try {
    const agentResponse = await runAgentLoop(
      req.userId!,
      history as ChatMessage[],
      message.trim(),
      googleAccessToken
    );

    // Build updated history for the client to store and send next time
    const updatedHistory: ChatMessage[] = [
      ...history,
      { role: 'user',      content: message.trim() },
      { role: 'assistant', content: agentResponse.reply },
    ];

    return res.json({
      success: true,
      reply:      agentResponse.reply,
      toolsUsed:  agentResponse.toolsUsed,
      history:    updatedHistory,
      error:      agentResponse.error,
    });
  } catch (err: any) {
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
router.post('/draft-email', async (req: AuthRequest, res: Response) => {
  const { title, date, time, location, link, agenda } = req.body;

  let apiKey = process.env.GROQ_API_KEY;
  let baseURL = 'https://api.groq.com/openai/v1';
  let modelName = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';

  if (!apiKey || apiKey === 'your-groq-api-key-here') {
    if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'your-gemini-api-key-here') {
      apiKey = process.env.GEMINI_API_KEY;
      baseURL = 'https://generativelanguage.googleapis.com/v1beta/openai/';
      modelName = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
    } else if (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== 'your-openai-api-key-here') {
      apiKey = process.env.OPENAI_API_KEY;
      baseURL = 'https://api.openai.com/v1';
      modelName = process.env.OPENAI_MODEL || 'gpt-4o-mini';
    }
  }

  if (!apiKey || apiKey.startsWith('your-')) {
    const mockSubject = `Invitation: ${title}`;
    const mockBody = `Dear Colleague,\n\nYou are cordially invited to attend the meeting "${title}" scheduled on ${date} at ${time}.\n\nLocation: ${location || 'N/A'}\nMeeting Link: ${link || 'N/A'}\nAgenda/Details: ${agenda || 'N/A'}\n\nBest regards,\nOffice of the Principal`;
    return res.json({ success: true, draft: { subject: mockSubject, body: mockBody } });
  }

  const groq = new OpenAI({
    apiKey,
    baseURL,
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
      model: modelName,
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0].message.content || '{}';
    const parsed = JSON.parse(content);
    return res.json({ success: true, draft: parsed });
  } catch (err: any) {
    console.error('Draft email error:', err);
    return res.status(500).json({ error: 'Failed to generate email draft', details: err.message });
  }
});

export default router;

// Vercel serverless function: POST /api/chat
// Set GROQ_API_KEY (and optionally GROQ_MODEL) in Vercel → Project → Settings → Environment Variables.
import { handleChat, type ChatBody } from '../server/chatCore';

interface Req {
  method?: string;
  body?: unknown;
}
interface Res {
  status: (code: number) => Res;
  json: (data: unknown) => void;
  setHeader: (k: string, v: string) => void;
}

export default async function handler(req: Req, res: Res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Use POST' });
  }
  let body: ChatBody = {};
  try {
    body = (typeof req.body === 'string' ? JSON.parse(req.body) : req.body) as ChatBody;
  } catch {
    return res.status(400).json({ error: 'Bad JSON' });
  }
  const out = await handleChat(body ?? {}, process.env);
  return res.status(out.status).json(out.json);
}

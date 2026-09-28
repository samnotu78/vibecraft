// Shared by the Vercel function (api/chat.ts) and the Vite dev server (vite.config.ts).
// The Groq key lives only here, on the server. It is never sent to the browser.
import { TOOL_SCHEMAS, getSection, isISO, offlineAnswer, runTool, systemPrompt, type AdvisorContext } from '../src/utils/advisorEngine';

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MAX_ROUNDS = 6;

type Msg =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: ToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string };
interface ToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export interface ChatBody {
  kind?: 'advisor' | 'rooms';
  messages?: { role: 'user' | 'assistant'; content: string }[];
  context?: AdvisorContext;
  prompt?: string; // rooms: full prompt built in the browser from live room data
}

export interface ChatReply {
  reply: string;
  mode: 'ai' | 'offline';
  model?: string;
  tools?: string[];
  note?: string;
}

async function groq(key: string, model: string, body: Record<string, unknown>) {
  const res = await fetch(GROQ_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model, temperature: 0.2, max_tokens: 700, ...body }),
    signal: AbortSignal.timeout(25000),
  });
  if (!res.ok) throw new Error(`Groq ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  const msg = data.choices?.[0]?.message;
  if (!msg) throw new Error('Empty Groq response');
  return msg as { content: string | null; tool_calls?: ToolCall[] };
}

export async function handleChat(body: ChatBody, env: Record<string, string | undefined>): Promise<{ status: number; json: ChatReply | { error: string } }> {
  const key = env.GROQ_API_KEY;
  const model = env.GROQ_MODEL || 'llama-3.3-70b-versatile';

  // ---- Classroom finder: single prompt, no tools ----
  if (body.kind === 'rooms') {
    if (!body.prompt) return { status: 400, json: { error: 'Missing prompt' } };
    if (!key) return { status: 200, json: { reply: '', mode: 'offline', note: 'GROQ_API_KEY not set' } };
    try {
      const msg = await groq(key, model, { messages: [{ role: 'user', content: body.prompt }], max_tokens: 400 });
      return { status: 200, json: { reply: String(msg.content ?? '').trim(), mode: 'ai', model } };
    } catch (e) {
      console.error('[rooms] Groq failed', e);
      return { status: 200, json: { reply: '', mode: 'offline', note: 'AI unavailable' } };
    }
  }

  // ---- Attendance advisor: tool-calling loop ----
  const ctx = body.context;
  const messages = (body.messages ?? []).filter(m => m && typeof m.content === 'string').slice(-10);
  const last = [...messages].reverse().find(m => m.role === 'user');
  if (!ctx || !last || !getSection(ctx.sectionId) || !isISO(ctx.today)) return { status: 400, json: { error: 'Missing section, date or question' } };

  if (!key) return { status: 200, json: { reply: offlineAnswer(last.content, ctx), mode: 'offline', note: 'GROQ_API_KEY not set' } };

  const convo: Msg[] = [{ role: 'system', content: systemPrompt(ctx) }, ...messages.map(m => ({ role: m.role, content: m.content }) as Msg)];
  const used: string[] = [];
  try {
    for (let round = 0; round < MAX_ROUNDS; round++) {
      const msg = await groq(key, model, { messages: convo, tools: TOOL_SCHEMAS, tool_choice: 'auto' });
      if (msg.tool_calls?.length) {
        convo.push({ role: 'assistant', content: msg.content ?? null, tool_calls: msg.tool_calls });
        for (const call of msg.tool_calls) {
          let args: Record<string, unknown> = {};
          try {
            args = call.function.arguments ? JSON.parse(call.function.arguments) : {};
          } catch {
            /* keep empty args */
          }
          used.push(call.function.name);
          convo.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(runTool(call.function.name, args, ctx)) });
        }
        continue;
      }
      const reply = String(msg.content ?? '').trim();
      if (!reply) throw new Error('No content');
      return { status: 200, json: { reply, mode: 'ai', model, tools: [...new Set(used)] } };
    }
    throw new Error('Too many tool rounds');
  } catch (e) {
    console.error('[advisor] Groq failed, answering offline', e);
    return { status: 200, json: { reply: offlineAnswer(last.content, ctx), mode: 'offline', note: 'AI unavailable, answered with offline maths' } };
  }
}

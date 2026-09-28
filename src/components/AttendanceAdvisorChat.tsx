import { useState, useRef, useEffect } from 'react';
import { type ClassSection } from '../data/timetables';
import { type SemesterCalculationResult } from '../utils/calculator';
import { offlineAnswer, type AdvisorContext } from '../utils/advisorEngine';
import { 
  X, 
  ArrowUp, 
  Minimize2,
  Sparkles
} from 'lucide-react';

interface Props {
  section: ClassSection;
  results: SemesterCalculationResult;
  planningDate: string;
}

interface Message {
  id: string;
  sender: 'user' | 'bot';
  text: string;
  timestamp: string;
  isAi?: boolean;
  modelTag?: string;
}

const AI_TAG = 'Groq · Llama 3.3';

export default function AttendanceAdvisorChat({ section, results, planningDate }: Props) {
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [input, setInput] = useState<string>('');
  const [isTyping, setIsTyping] = useState<boolean>(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      sender: 'bot',
      text: `Hello. I am your Attendance Advisor for ${section.name}. I analyze your section's official timetable and live attendance records to simulate leaves, calculate safe skips, and prevent detention. How may I assist your planning?`,
      timestamp: 'Now',
      isAi: true,
      modelTag: AI_TAG
    }
  ]);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  // Live dashboard state sent with every question, so answers always match what's on screen
  const context: AdvisorContext = {
    sectionId: section.id,
    inputs: Object.fromEntries(results.subjectResults.map(s => [s.code, s.currentPercentage])),
    today: planningDate,
  };

  // Server function (/api/chat) runs Groq with tool-calling over the real timetable maths.
  // If it's unreachable, the same maths answers offline in the browser.
  const askAdvisor = async (query: string, history: Message[]): Promise<{ text: string; ai: boolean }> => {
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'advisor',
          context,
          messages: [
            ...history.filter(m => m.id !== 'welcome').slice(-8).map(m => ({ role: m.sender === 'user' ? 'user' : 'assistant', content: m.text })),
            { role: 'user', content: query },
          ],
        }),
      });
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      if (!data.reply) throw new Error('empty');
      return { text: data.reply, ai: data.mode === 'ai' };
    } catch {
      return { text: offlineAnswer(query, context), ai: false };
    }
  };

  const handleSend = async (textToSend?: string) => {
    const query = (textToSend || input).trim();
    if (!query || isTyping) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      sender: 'user',
      text: query,
      timestamp: 'Now'
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsTyping(true);

    try {
      const { text, ai } = await askAdvisor(query, messages);
      const botMsg: Message = {
        id: (Date.now() + 1).toString(),
        sender: 'bot',
        text,
        isAi: ai,
        modelTag: ai ? AI_TAG : 'Offline calculation',
        timestamp: 'Just now'
      };
      setMessages(prev => [...prev, botMsg]);
    } finally {
      setIsTyping(false);
    }
  };

  return (
    <>
      {/* Apple-style Floating Advisor Trigger */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-6 right-6 z-50 px-4 py-2.5 rounded-full bg-white/90 dark:bg-zinc-900/90 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-900 dark:text-white shadow-xl dark:shadow-2xl border border-black/[0.08] dark:border-white/[0.12] backdrop-blur-2xl transition-all transform hover:scale-[1.02] active:scale-[0.98] flex items-center gap-2.5"
        >
          <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
          <span className="text-xs font-medium text-zinc-800 dark:text-zinc-200">Attendance Advisor</span>
          <span className="text-[10px] text-zinc-400 dark:text-zinc-500 font-normal">AI</span>
        </button>
      )}

      {/* Apple Intelligence Style Dialog Window */}
      {isOpen && (
        <div className="fixed bottom-6 right-6 z-50 w-full max-w-md bg-white/95 dark:bg-zinc-950/90 border border-black/[0.08] dark:border-white/[0.12] rounded-3xl shadow-2xl backdrop-blur-2xl overflow-hidden flex flex-col h-[560px] max-h-[85vh] transition-all">
          
          {/* Chat Header */}
          <div className="p-4 border-b border-black/[0.06] dark:border-white/[0.06] flex items-center justify-between bg-black/[0.01] dark:bg-white/[0.02]">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-xl bg-black/[0.04] dark:bg-white/[0.06] border border-black/[0.06] dark:border-white/[0.08] flex items-center justify-center text-zinc-700 dark:text-zinc-300">
                <Sparkles className="w-3.5 h-3.5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="font-semibold text-xs text-zinc-900 dark:text-white">
                    Attendance Advisor
                  </h4>
                  <span className="text-[10px] text-zinc-400 dark:text-zinc-500">{AI_TAG}</span>
                </div>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400">{section.name}</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setIsOpen(false)}
                className="p-1.5 rounded-lg hover:bg-black/[0.04] dark:hover:bg-white/[0.06] text-zinc-400 hover:text-zinc-700 dark:hover:text-white transition"
              >
                <Minimize2 className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1.5 rounded-lg hover:bg-black/[0.04] dark:hover:bg-white/[0.06] text-zinc-400 hover:text-zinc-700 dark:hover:text-white transition"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Quick Action Chips */}
          <div className="px-3 py-2 border-b border-black/[0.04] dark:border-white/[0.04] flex gap-1.5 overflow-x-auto text-[11px] no-scrollbar bg-black/[0.02] dark:bg-black/20">
            <button
              onClick={() => handleSend("What if I miss 20 classes?")}
              className="px-2.5 py-1 rounded-full bg-black/[0.04] dark:bg-white/[0.04] hover:bg-black/[0.08] dark:hover:bg-white/[0.08] border border-black/[0.06] dark:border-white/[0.06] text-zinc-700 dark:text-zinc-300 whitespace-nowrap transition"
            >
              Miss 20 classes?
            </button>
            <button
              onClick={() => handleSend("What if I miss all remaining classes?")}
              className="px-2.5 py-1 rounded-full bg-black/[0.04] dark:bg-white/[0.04] hover:bg-black/[0.08] dark:hover:bg-white/[0.08] border border-black/[0.06] dark:border-white/[0.06] text-zinc-700 dark:text-zinc-300 whitespace-nowrap transition"
            >
              Miss all classes?
            </button>
            <button
              onClick={() => handleSend("If I take a 3-day sick leave starting tomorrow, will my attendance drop below 75%?")}
              className="px-2.5 py-1 rounded-full bg-black/[0.04] dark:bg-white/[0.04] hover:bg-black/[0.08] dark:hover:bg-white/[0.08] border border-black/[0.06] dark:border-white/[0.06] text-zinc-700 dark:text-zinc-300 whitespace-nowrap transition"
            >
              3-day leave impact
            </button>
            <button
              onClick={() => handleSend("How many classes can I safely bunk?")}
              className="px-2.5 py-1 rounded-full bg-black/[0.04] dark:bg-white/[0.04] hover:bg-black/[0.08] dark:hover:bg-white/[0.08] border border-black/[0.06] dark:border-white/[0.06] text-zinc-700 dark:text-zinc-300 whitespace-nowrap transition"
            >
              Safe bunk allowance
            </button>
          </div>

          {/* Chat Messages Body */}
          <div className="flex-1 p-4 overflow-y-auto space-y-3 text-xs">
            {messages.map(msg => (
              <div
                key={msg.id}
                className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}
              >
                <div
                  className={`p-3 rounded-2xl max-w-[88%] leading-relaxed ${
                    msg.sender === 'user'
                      ? 'bg-blue-600 text-white rounded-tr-sm'
                      : 'bg-black/[0.03] dark:bg-white/[0.04] border border-black/[0.06] dark:border-white/[0.06] text-zinc-800 dark:text-zinc-200 rounded-tl-sm whitespace-pre-line'
                  }`}
                >
                  {msg.sender === 'bot'
                    ? msg.text.split('\n').map((line, i) => (
                        <span
                          key={i}
                          className={/^\s*-?\s*(warning|irreversible)/i.test(line) ? 'block font-medium text-rose-600 dark:text-rose-400' : 'block'}
                        >
                          {line.replace(/\*\*/g, '')}
                        </span>
                      ))
                    : msg.text}
                </div>
                {msg.modelTag && (
                  <span className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-1 px-1">{msg.modelTag}</span>
                )}
              </div>
            ))}

            {isTyping && (
              <div className="flex items-center gap-2 text-zinc-500 p-2 text-xs">
                <div className="w-1.5 h-1.5 rounded-full bg-zinc-400 animate-pulse"></div>
                <div className="w-1.5 h-1.5 rounded-full bg-zinc-400 animate-pulse delay-150"></div>
                <div className="w-1.5 h-1.5 rounded-full bg-zinc-400 animate-pulse delay-300"></div>
                <span className="text-zinc-400">Calculating timetable projection...</span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Box */}
          <form
            onSubmit={e => {
              e.preventDefault();
              handleSend();
            }}
            className="p-3 border-t border-black/[0.06] dark:border-white/[0.06] bg-black/[0.01] dark:bg-black/40 flex items-center gap-2"
          >
            <div className="flex-1 relative flex items-center">
              <input
                type="text"
                placeholder="Ask about skips, leaves, or subjects..."
                value={input}
                onChange={e => setInput(e.target.value)}
                className="w-full bg-white dark:bg-zinc-900/90 border border-black/[0.1] dark:border-white/[0.1] rounded-full pl-3.5 pr-10 py-2 text-xs text-zinc-900 dark:text-white focus:outline-none focus:border-zinc-400 dark:focus:border-white/30 transition placeholder:text-zinc-400 dark:placeholder:text-zinc-500 shadow-xs dark:shadow-none"
              />
              <button
                type="submit"
                disabled={!input.trim()}
                className="absolute right-1.5 w-6 h-6 rounded-full bg-zinc-900 text-white dark:bg-white dark:text-black hover:bg-zinc-700 dark:hover:bg-zinc-200 disabled:opacity-30 flex items-center justify-center transition"
              >
                <ArrowUp className="w-3.5 h-3.5 stroke-[2.5]" />
              </button>
            </div>
          </form>

        </div>
      )}
    </>
  );
}

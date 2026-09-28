// Attendance Advisor engine: pure functions shared by the browser (offline answers)
// and the /api/chat server function (tools the AI calls). The AI never does maths itself;
// every number comes from here, which uses the same timetable + calculator as the dashboard.
import { CLASS_SECTIONS, SEMESTER_CONFIG, type ClassSection } from '../data/timetables';
import { calculateAttendance } from './calculator';

export type LeaveType = 'ABSENT' | 'MEDICAL' | 'OD';

export interface AdvisorContext {
  sectionId: string;
  inputs: Record<string, number>; // subject code -> current %
  today: string; // the dashboard's planning date (YYYY-MM-DD)
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const SEM_START = SEMESTER_CONFIG.startDate;
const SEM_END = SEMESTER_CONFIG.endDate;

// ---------- dates (UTC so no time zone ever shifts a day) ----------
const toDate = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};
const toISO = (d: Date) => d.toISOString().slice(0, 10);
export const addDays = (iso: string, n: number) => {
  const d = toDate(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return toISO(d);
};
export const isISO = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && toISO(toDate(s)) === s;
export const dayName = (iso: string) => DAY_NAMES[toDate(iso).getUTCDay()];
export const fmtDay = (iso: string) => {
  const d = toDate(iso);
  return `${DAY_NAMES[d.getUTCDay()].slice(0, 3)} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()][0].toUpperCase()}${MONTHS[d.getUTCMonth()].slice(1)}`;
};
function* eachDay(from: string, to: string) {
  for (let d = from; d <= to; d = addDays(d, 1)) yield d;
}

/** "tomorrow", "next friday", "5 oct", "oct 5th", "5/10", "2026-10-05", "in 3 days" -> ISO */
export function resolveDate(text: string, today: string): string | null {
  const t = text.toLowerCase();
  const iso = t.match(/\d{4}-\d{2}-\d{2}/);
  if (iso && isISO(iso[0])) return iso[0];
  if (/day after tomorrow/.test(t)) return addDays(today, 2);
  if (/\b(tomorrow|tmrw|tmr|tmrrw)\b/.test(t)) return addDays(today, 1);
  if (/\btoday\b/.test(t)) return today;
  const inN = t.match(/\bin (\d+) days?\b/);
  if (inN) return addDays(today, Number(inN[1]));
  const year = Number(today.slice(0, 4));
  const mon = MONTHS.join('|');
  const dm = t.match(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s*(?:of\\s+)?(${mon})[a-z]*\\b`));
  const md = t.match(new RegExp(`\\b(${mon})[a-z]*\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`));
  if (dm || md) {
    const day = Number(dm ? dm[1] : md![2]);
    const m = MONTHS.indexOf((dm ? dm[2] : md![1]).slice(0, 3));
    const c = `${year}-${String(m + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    if (isISO(c)) return c;
  }
  const sl = t.match(/\b(\d{1,2})[/.](\d{1,2})\b/);
  if (sl) {
    const c = `${year}-${sl[2].padStart(2, '0')}-${sl[1].padStart(2, '0')}`; // Indian D/M
    if (isISO(c)) return c;
  }
  for (let i = 0; i < 7; i++) {
    const n = DAY_NAMES[i].toLowerCase();
    const m = t.match(new RegExp(`\\b(next |this |coming )?(${n}|${n.slice(0, 3)})\\b`));
    if (m) {
      const cur = toDate(today).getUTCDay();
      let delta = (i - cur + 7) % 7 || 7;
      if (/next week/.test(t)) delta += delta < 7 ? 7 : 0;
      return addDays(today, delta);
    }
  }
  if (/next week/.test(t)) {
    const cur = toDate(today).getUTCDay();
    return addDays(today, (1 - cur + 7) % 7 || 7);
  }
  return null;
}

// ---------- timetable ----------
export const getSection = (id: string) => CLASS_SECTIONS.find(s => s.id === id);

/** Subject codes for every period held that day (repeats = multiple periods). */
export function periodsOn(section: ClassSection, iso: string): string[] {
  if (iso < SEM_START || iso > SEM_END) return [];
  return (section.schedule[dayName(iso)] ?? []).filter(Boolean);
}

// ---------- subject matching ----------
const ALIASES: [RegExp, RegExp][] = [
  [/\bmaths?\b|mathematics|\bdm\b/, /mathemat|calculus|transforms|probability|statistics/i],
  [/\bchem\b|chemistry/, /chemistry/i],
  [/\bpps\b|programming/, /programming/i],
  [/\bml\b|machine learning/, /machine learning/i],
  [/\bvlsi\b/, /vlsi/i],
  [/\bmpmc\b|microprocessor|microcontroller/, /micro/i],
  [/\bdbms\b|database/, /database/i],
  [/\bcoa\b|computer org/, /computer organi/i],
  [/\bdld\b|digital logic/, /digital logic/i],
  [/\bemt\b|electromagnetic/, /electromagnetic/i],
  [/\bssd\b|solid state/, /solid state/i],
  [/\buhv\b|human values/, /human values/i],
  [/\bcdc\b|aptitude|verbal|analytical/, /aptitude|verbal|analytical/i],
  [/\blab\b|laboratory|practical/, /lab/i],
  [/\bdsp\b|signal processing/, /signal processing/i],
  [/\bethics\b/, /ethics/i],
  [/\bwireless\b|antenna/, /wireless/i],
  [/\bpsychology\b/, /psychology/i],
  [/\bbiology\b|\bbio\b/, /biology/i],
  [/\bgerman\b/, /german/i],
  [/\bworkshop\b/, /workshop/i],
  [/\bphysics\b/, /physics/i],
];

export function matchSubjects(section: ClassSection, text: string) {
  const t = text.toLowerCase();
  const exact = [...section.subjects].sort((a, b) => b.name.length - a.name.length).find(s => t.includes(s.name.toLowerCase()));
  if (exact) return [exact];
  const out = new Map<string, ClassSection['subjects'][number]>();
  for (const [q, target] of ALIASES) if (q.test(t)) section.subjects.forEach(s => target.test(s.name) && out.set(s.code, s));
  for (const s of section.subjects) {
    if (t.includes(s.code.toLowerCase())) out.set(s.code, s);
    if (new RegExp(`\\bslot ${s.slot.toLowerCase()}\\b|\\b${s.slot.toLowerCase()} slot\\b`).test(t)) out.set(s.code, s);
    const words = s.name.toLowerCase().split(/[^a-z]+/).filter(w => w.length > 5);
    if (words.some(w => t.includes(w))) out.set(s.code, s);
  }
  return [...out.values()];
}

function pickCodes(section: ClassSection, names?: unknown): string[] | undefined {
  if (!Array.isArray(names) || !names.length) return undefined;
  const codes = new Set<string>();
  for (const n of names.map(String)) {
    const direct = section.subjects.find(s => s.code.toLowerCase() === n.toLowerCase() || s.slot.toLowerCase() === n.toLowerCase().trim());
    if (direct) codes.add(direct.code);
    else matchSubjects(section, n).forEach(s => codes.add(s.code));
  }
  return codes.size ? [...codes] : undefined;
}

// ---------- core maths ----------
const r1 = (n: number) => Math.round(n * 10) / 10;
const pct = (a: number, h: number) => (h > 0 ? (a / h) * 100 : 100);
const need = (attended: number, total: number, target: number) => Math.max(0, Math.ceil(target * total - attended - 1e-9));

export function dashboard(ctx: AdvisorContext) {
  const section = getSection(ctx.sectionId);
  if (!section) return null;
  return { section, results: calculateAttendance(section, ctx.inputs, ctx.today) };
}

export interface LeaveImpact {
  subject: string;
  code: string;
  periodsMissed: number;
  datesWithClasses: string[];
  percentNow: number;
  percentRightAfter: number; // attending everything else until the leave ends
  percentRightAfterIfAbsent: number; // same, if the leave is not approved
  dropsBelow75: boolean;
  dropsBelow75IfAbsent: boolean;
  canStillSkipAfter: number; // remaining classes they can still miss and finish >= 75%
  bestPossibleAtSemesterEnd: number;
  irreversibleAfter: boolean;
}

/** What happens to each subject if the student takes this leave. OD / approved medical count as present. */
export function simulateLeave(ctx: AdvisorContext, from: string, to: string, type: LeaveType, codes?: string[]) {
  const d = dashboard(ctx);
  if (!d) return null;
  const { section, results } = d;
  const start = from < ctx.today ? ctx.today : from;
  const impacts: LeaveImpact[] = results.subjectResults
    .filter(s => !codes?.length || codes.includes(s.code))
    .map(s => {
      let missed = 0;
      const dates: string[] = [];
      for (const day of eachDay(start, to > SEM_END ? SEM_END : to)) {
        const n = periodsOn(section, day).filter(c => c === s.code).length;
        if (n) {
          missed += n;
          dates.push(fmtDay(day));
        }
      }
      // walk from "today" to the end of the leave
      let h = s.classesHeld;
      let a = s.classesAttended;
      let aAbsent = s.classesAttended;
      for (const day of eachDay(ctx.today, to > SEM_END ? SEM_END : to)) {
        const inLeave = day >= start && day <= to;
        for (const c of periodsOn(section, day)) {
          if (c !== s.code) continue;
          h++;
          if (!inLeave || type !== 'ABSENT') a++;
          if (!inLeave) aAbsent++;
        }
      }
      const lost = type === 'ABSENT' ? missed : 0;
      const total = s.totalSemesterClasses;
      const bestEnd = pct(s.classesAttended + s.classesRemaining - lost, total);
      const need75 = need(s.classesAttended + (type === 'ABSENT' ? 0 : missed), total, 0.75);
      const free = s.classesRemaining - missed;
      return {
        subject: s.name,
        code: s.code,
        periodsMissed: missed,
        datesWithClasses: dates,
        percentNow: r1(s.currentPercentage),
        percentRightAfter: r1(pct(a, h)),
        percentRightAfterIfAbsent: r1(pct(aAbsent, h)),
        dropsBelow75: pct(a, h) < 75,
        dropsBelow75IfAbsent: pct(aAbsent, h) < 75,
        canStillSkipAfter: Math.max(0, free - need75),
        bestPossibleAtSemesterEnd: r1(bestEnd),
        irreversibleAfter: bestEnd < 75,
      };
    });
  return { from: start, to, type, impacts };
}

export function classesNeeded(ctx: AdvisorContext, subject: string, targetPct: number) {
  const d = dashboard(ctx);
  if (!d) return null;
  const target = Math.min(100, Math.max(1, targetPct)) / 100;
  const { section, results } = d;
  const rows = /overall|all|total/i.test(subject)
    ? [{ name: 'Overall', attended: results.overallAttended, held: results.totalClassesHeld, remaining: results.totalClassesRemaining, now: results.overallCurrentPercentage }]
    : (pickCodes(section, [subject]) ?? []).map(code => {
        const s = results.subjectResults.find(x => x.code === code)!;
        return { name: s.name, attended: s.classesAttended, held: s.classesHeld, remaining: s.classesRemaining, now: s.currentPercentage };
      });
  return rows.map(r => {
    const n = need(r.attended, r.held + r.remaining, target);
    return {
      subject: r.name,
      target_percent: target * 100,
      current_percent: r1(r.now),
      remaining_classes: r.remaining,
      must_attend: n,
      possible: n <= r.remaining,
      can_skip: Math.max(0, r.remaining - n),
      best_possible_percent: r1(pct(r.attended + r.remaining, r.held + r.remaining)),
    };
  });
}

export function daySchedule(ctx: AdvisorContext, iso: string) {
  const section = getSection(ctx.sectionId);
  if (!section) return null;
  const row = iso >= SEM_START && iso <= SEM_END ? section.schedule[dayName(iso)] ?? [] : [];
  const periods = row
    .map((code, i) => (code ? { time: SEMESTER_CONFIG.periods[i]?.time ?? `P${i + 1}`, subject: section.subjects.find(s => s.code === code)?.name ?? code } : null))
    .filter(Boolean);
  return { date: iso, day: fmtDay(iso), periods, note: periods.length ? null : 'No classes (weekend or outside the semester)' };
}

// ---------- tools for the AI (OpenAI/Groq format) ----------
export const TOOL_SCHEMAS = [
  {
    type: 'function',
    function: {
      name: 'get_dashboard',
      description: "The student's current attendance per subject: held, attended, %, classes remaining, classes needed for 75% and 90%, safe skips, max achievable, irreversible detention flag.",
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'simulate_leave',
      description: "Simulate a leave or absence over a date range using the real timetable. Returns per subject: periods missed, % right after the leave (approved and if marked absent), whether it drops below 75%, safe skips left, best possible % at semester end. Use for ANY 'what if I miss/skip/take leave' question.",
      parameters: {
        type: 'object',
        properties: {
          start_date: { type: 'string', description: 'YYYY-MM-DD' },
          end_date: { type: 'string', description: 'YYYY-MM-DD inclusive. An N-day leave starting X ends on X + N - 1.' },
          leave_type: { type: 'string', enum: ['ABSENT', 'MEDICAL', 'OD'], description: 'ABSENT = bunk / unexcused (default). MEDICAL = sick leave with certificate. OD = on duty.' },
          subjects: { type: 'array', items: { type: 'string' }, description: 'Only when skipping specific subjects; omit for whole days off.' },
        },
        required: ['start_date', 'end_date'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'classes_needed',
      description: "How many remaining classes of a subject (or 'overall') must be attended to finish the semester at or above a target %.",
      parameters: {
        type: 'object',
        properties: { subject: { type: 'string' }, target_percent: { type: 'number' } },
        required: ['subject', 'target_percent'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'day_schedule',
      description: "The student's classes on a date.",
      parameters: { type: 'object', properties: { date: { type: 'string', description: 'YYYY-MM-DD' } }, required: ['date'] },
    },
  },
];

export function runTool(name: string, args: Record<string, unknown>, ctx: AdvisorContext): unknown {
  const d = dashboard(ctx);
  if (!d) return { error: 'Unknown section' };
  const date = (v: unknown) => (isISO(v) ? v : typeof v === 'string' ? resolveDate(v, ctx.today) : null);
  switch (name) {
    case 'get_dashboard': {
      const r = d.results;
      return {
        section: d.section.name,
        today: ctx.today,
        semester_end: SEM_END,
        overall: { attended: r.overallAttended, held: r.totalClassesHeld, percent: r.overallCurrentPercentage, remaining: r.totalClassesRemaining, need_for_75: r.overallToAttend75, need_for_90: r.overallToAttend90, max_achievable: r.overallMaxAchievable, irreversible: r.isOverallIrreversible },
        subjects: r.subjectResults.map(s => ({
          subject: s.name,
          slot: s.slot,
          attended: s.classesAttended,
          held: s.classesHeld,
          percent: s.currentPercentage,
          remaining: s.classesRemaining,
          need_for_75: s.canAchieve75 ? s.classesToAttend75 : 'impossible',
          need_for_90: s.canAchieve90 ? s.classesToAttend90 : 'impossible',
          safe_skips_75: s.bunkBudget75,
          max_achievable: s.maxAchievablePercentage,
          irreversible_detention: s.isIrreversibleDetention,
        })),
      };
    }
    case 'simulate_leave': {
      const from = date(args.start_date);
      const to = date(args.end_date ?? args.start_date);
      if (!from || !to) return { error: 'Could not read the dates; use YYYY-MM-DD' };
      const type = (['ABSENT', 'MEDICAL', 'OD'].includes(String(args.leave_type)) ? args.leave_type : 'ABSENT') as LeaveType;
      return simulateLeave(ctx, from <= to ? from : to, from <= to ? to : from, type, pickCodes(d.section, args.subjects));
    }
    case 'classes_needed':
      return classesNeeded(ctx, String(args.subject ?? 'overall'), Number(args.target_percent) || 75);
    case 'day_schedule': {
      const iso = date(args.date);
      return iso ? daySchedule(ctx, iso) : { error: 'Bad date' };
    }
    default:
      return { error: `Unknown tool ${name}` };
  }
}

export function systemPrompt(ctx: AdvisorContext) {
  const d = dashboard(ctx);
  const next = Array.from({ length: 14 }, (_, i) => addDays(ctx.today, i + 1)).map(x => `${fmtDay(x)} = ${x}`).join('; ');
  return `You are the Attendance Advisor inside a college attendance dashboard.
Today is ${fmtDay(ctx.today)} (${ctx.today}). The semester ends ${SEM_END}. Next 14 days: ${next}.
Section: ${d?.section.name}. Subjects: ${d?.section.subjects.map(s => `${s.slot}: ${s.name}`).join('; ')}.
75% is the detention line. 90% is the distinction target. OD and approved medical leave count as attended.

Rules:
- NEVER calculate numbers yourself. Call the tools, then answer only with numbers from tool results.
- "N-day leave starting X": start_date = X, end_date = X + N - 1 calendar days.
- "Sick leave": use leave_type MEDICAL; the result also contains the "if marked absent" figures, mention both briefly.
- Skipping one subject: pass it in "subjects". Whole days off: omit "subjects".
- Start with a clear Yes or No for yes/no questions. Then give the key numbers (periods missed, % now, % right after, safe skips left).
- If a subject drops below 75% or becomes irreversible, start that line with "Warning:".
- End with one short practical tip.
- Plain text, short lines, simple "-" bullets allowed, no markdown headings or tables, no emoji. Under 130 words.`;
}

// ---------- offline answers (no API key / network down) ----------
const WORDS: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, couple: 2 };

export function offlineAnswer(question: string, ctx: AdvisorContext): string {
  const d = dashboard(ctx);
  if (!d) return 'Pick your section first, then ask me again.';
  const { section, results } = d;
  const t = question.toLowerCase();
  const subs = matchSubjects(section, t);

  // "miss all" / "miss N classes"
  if (/\b(all (of )?(them|em|classes|remaining))\b/.test(t) && /miss|skip|bunk/.test(t)) {
    const worst = results.totalClassesHeld + results.totalClassesRemaining;
    const p = pct(results.overallAttended, worst);
    return `If you miss every one of the ${results.totalClassesRemaining} remaining classes, your overall attendance ends at ${r1(p)}%.\nWarning: that is detention in every subject.\nTip: you need to attend at least ${results.overallToAttend75} of them to finish at 75%.`;
  }

  // leave / skip over dates
  const dur = t.match(/\b(\d+|a|an|one|two|three|four|five|six|seven|couple)(?: of)?[\s-]*(day|days|week|weeks)\b/);
  const startDate = resolveDate(t, ctx.today);
  if (/\b(leave|sick|absent|skip|bunk|miss|off|od|on[- ]duty|medical|fever|trip)\b/.test(t) && (dur || startDate) && !/how many/.test(t)) {
    const n = dur ? (WORDS[dur[1]] ?? Number(dur[1])) * (/week/.test(dur[2]) ? 7 : 1) : 1;
    const from = startDate ?? addDays(ctx.today, 1);
    const to = addDays(from, n - 1);
    const type: LeaveType = /\bod\b|on[- ]duty/.test(t) ? 'OD' : /sick|medical|fever|hospital/.test(t) ? 'MEDICAL' : 'ABSENT';
    const onlyThose = /\b(skip|bunk|miss)\b/.test(t) && subs.length > 0 && !dur;
    const sim = simulateLeave(ctx, from, to, type, onlyThose ? subs.map(s => s.code) : undefined)!;
    const span = from === to ? fmtDay(from) : `${fmtDay(from)} to ${fmtDay(to)}`;
    const focus = (subs.length ? sim.impacts.filter(i => subs.some(s => s.code === i.code)) : sim.impacts).filter(i => i.periodsMissed > 0);
    if (!focus.length) return `No ${subs.map(s => s.name).join(' or ') || ''} classes fall on ${span}, so this costs you nothing.`;
    const risky = focus.filter(i => (type === 'ABSENT' ? i.dropsBelow75 : i.dropsBelow75IfAbsent));
    const asks = subs.length === 1 && /below|drop|fall|under/.test(t);
    const one = focus[0];
    const head = !asks
      ? ''
      : type === 'MEDICAL'
        ? one.dropsBelow75
          ? 'Yes. '
          : one.dropsBelow75IfAbsent
            ? "Not if the medical leave is approved. If it's marked absent, yes. "
            : 'No. '
        : risky.length
          ? 'Yes. '
          : 'No. ';
    const lines = focus.map(i => {
      const warn = i.irreversibleAfter || (type === 'ABSENT' ? i.dropsBelow75 : false);
      let line = `${warn ? 'Warning: ' : ''}${i.subject}: miss ${i.periodsMissed} period${i.periodsMissed > 1 ? 's' : ''}. ${i.percentNow}% now, ${i.percentRightAfter}% right after.`;
      if (type === 'MEDICAL') line += ` If the medical isn't approved: ${i.percentRightAfterIfAbsent}%${i.dropsBelow75IfAbsent ? ' (below 75%)' : ''}.`;
      line += i.irreversibleAfter ? ' 75% becomes impossible this semester.' : ` You can still skip ${i.canStillSkipAfter} more.`;
      return line;
    });
    const tip = risky.length ? `Tip: ${type === 'MEDICAL' ? 'get the medical certificate approved, and ' : ''}attend ${risky.length > 2 ? 'every class' : `every ${risky.map(r => r.subject).join(' and ')} class`} once you're back.` : 'Tip: you have room for this; keep the buffer for emergencies.';
    return `${head}${span}${type === 'MEDICAL' ? ' as medical leave' : type === 'OD' ? ' as on-duty' : ''}:\n${lines.join('\n')}\n${tip}`;
  }

  // "miss N classes"
  const nMiss = t.match(/(?:miss|skip|bunk)\s*(\d+)/) || t.match(/(\d+)\s*(?:classes|periods)/);
  if (nMiss && !subs.length) {
    const n = Number(nMiss[1]);
    const total = results.totalClassesHeld + results.totalClassesRemaining;
    const end = pct(results.overallAttended + Math.max(0, results.totalClassesRemaining - n), total);
    return `If you miss ${n} of the ${results.totalClassesRemaining} remaining classes and attend the rest, you finish at ${r1(end)}% overall.${end < 75 ? '\nWarning: that is below 75%.' : ''}\nYou can safely miss ${Math.max(0, results.totalClassesRemaining - results.overallToAttend75)} in total.`;
  }

  // how many can I skip / need for X%
  if (/how many|can i (skip|bunk|miss)|safe(ly)? bunk|need|reach|get to|\b90\b|\b80\b|\b85\b/.test(t)) {
    const tm = t.match(/\b(7[5-9]|8\d|9\d)\s*%?/);
    const target = tm ? Number(tm[1]) : 75;
    const rows = classesNeeded(ctx, subs.length ? subs[0].name : 'overall', target) ?? [];
    const extra = subs.slice(1).flatMap(s => classesNeeded(ctx, s.name, target) ?? []);
    return [...rows, ...extra]
      .map(r => (r.possible ? `${r.subject} (${r.current_percent}% now): attend ${r.must_attend} of the remaining ${r.remaining_classes} to finish at ${target}%. You can skip ${r.can_skip}.` : `Warning: ${r.subject} can't reach ${target}%. Even attending all ${r.remaining_classes} gets you ${r.best_possible_percent}%.`))
      .join('\n');
  }

  // schedule
  if (/schedule|timetable|classes (on|for|tomorrow|today)|what.*(tomorrow|today)/.test(t)) {
    const day = daySchedule(ctx, startDate ?? ctx.today)!;
    return day.periods.length ? `${day.day}:\n${day.periods.map(p => `- ${p!.time}  ${p!.subject}`).join('\n')}` : `${day.day}: ${day.note}.`;
  }

  // status summary
  const bad = results.subjectResults.filter(s => s.status === 'critical' || s.status === 'irreversible');
  const pick = subs.length ? results.subjectResults.filter(s => subs.some(x => x.code === s.code)) : bad;
  if (!pick.length) return `Overall you're at ${results.overallCurrentPercentage}% with ${results.totalClassesRemaining} classes left. No subject is below 75% right now. You can safely miss ${Math.max(0, results.totalClassesRemaining - results.overallToAttend75)} classes overall.`;
  return pick
    .map(s => (s.isIrreversibleDetention ? `Warning: ${s.name} is at ${s.currentPercentage}%. Even attending everything gets you ${s.maxAchievablePercentage}%. Talk to your faculty advisor now.` : `${s.name}: ${s.currentPercentage}%. Attend ${s.classesToAttend75} of the remaining ${s.classesRemaining} for 75%; you can skip ${s.bunkBudget75}.`))
    .join('\n');
}

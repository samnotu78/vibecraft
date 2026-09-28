import { type DayOfWeek } from '../data/rooms';
import { getAllFloorsStatus, parseNaturalLanguageQuery, type SearchResult } from './roomFinder';

export interface AiRoomRecommendation {
  explanation: string;
  recommendedRoomCodes: string[];
  searchResult: SearchResult;
}

export async function askGeminiRoomLocator(
  userPrompt: string,
  day: DayOfWeek = 'Monday',
  currentPeriod: number = 1
): Promise<AiRoomRecommendation> {
  // First, get instant deterministic matches
  const searchResult = parseNaturalLanguageQuery(userPrompt, day, currentPeriod);

  // Get floor summary
  const floors = getAllFloorsStatus(day, currentPeriod);
  const freeRoomsSummary = floors.map(f => {
    const freeInFloor = f.rooms
      .filter(r => r.isFree)
      .map(r => `${r.room.code} (${r.room.type}, Cap: ${r.room.capacity}, ${r.room.isAC ? 'AC' : 'Non-AC'}, Free for ${(r.freeDurationMinutes / 60).toFixed(1)} hrs until ${r.freeUntilTime})`)
      .join('; ');
    return `${f.floor} (Total ${f.totalRooms} rooms, ${f.freeRoomsCount} free): ${freeInFloor || 'None currently free'}`;
  }).join('\n');

  const systemPrompt = `You are the Campus Room Finder AI.
Current Day: ${day}, Current Period: ${currentPeriod} (09:00 - 16:50 schedule).
Below is the live status of all rooms in the campus based on the 10 timetable schedules:

${freeRoomsSummary}

USER QUERY: "${userPrompt}"

TASK:
1. Explain concisely which room(s) best match their exact request, why they fit (mention floor, AC, seating, free duration, and what time the room must be vacated).
2. Explicitly cite the room codes (e.g. TB 106, IST 602, IST 418).
3. Warn them if any class is scheduled later so they know their deadline.
Keep response direct, polished, and student-focused (under 120 words).`;

  try {
    // Server function (/api/chat) holds the Groq key; the browser never sees it.
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'rooms', prompt: systemPrompt })
    });

    if (!res.ok) {
      throw new Error(`AI error: ${res.status}`);
    }

    const data = await res.json();
    const text: string | undefined = data.reply;

    if (!text) throw new Error('Empty response');

    return {
      explanation: text,
      recommendedRoomCodes: searchResult.matchedRooms.slice(0, 3).map(m => m.room.code),
      searchResult
    };
  } catch {
    return {
      explanation: generateFallbackExplanation(userPrompt, searchResult),
      recommendedRoomCodes: searchResult.matchedRooms.slice(0, 3).map(m => m.room.code),
      searchResult
    };
  }
}

function generateFallbackExplanation(_userPrompt: string, searchResult: SearchResult): string {
  if (searchResult.matchedRooms.length === 0) {
    return `No rooms currently match all specified criteria. Try broadening your duration or selecting another floor.`;
  }

  const top = searchResult.matchedRooms[0];
  const count = searchResult.matchedRooms.length;
  const reasons = top.matchReasons.join(', ');

  return `Found ${count} matching room${count > 1 ? 's' : ''}. Top match is **${top.room.name} (${top.room.code})** on the **${top.room.floor}**. ${reasons}. It is guaranteed free until **${top.freeUntilTime}** (${(top.freeDurationMinutes / 60).toFixed(1)} hrs continuous work time).`;
}

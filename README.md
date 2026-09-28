# Attendance Intelligence & Academic Leave Simulator

> **Smart Attendance Predictor, Timetable Intelligence & Leave Simulator**  
> **Repository:** [aaditya079/Vibecraft-Anti](https://github.com/aaditya079/Vibecraft-Anti)

---

## 🎯 Academic Scenario
College students constantly stress over their attendance and fall into detention (<75%) when it is mathematically too late to recover.  
* **Semester Duration:** 29th August 2026 → 29th November 2026 (93 calendar days / 13 academic weeks).
* **Timetables Ingested:** 10 full class sections from department schedule datasets.
* **Design Philosophy:** Minimalist, Apple-inspired interface with seamless Light and Dark mode switching, frosted acrylic glass, and iOS segmented pill navigation.

---

## 🚀 Unified Features

### 1. Core Mathematical Engine
* **10 Section Timetables Ingested:** II BME, II ECE-DS A & B, III BME, III ECE A & B, III ECE-DS, IV ECE A & B, I ECE A.
* **Date Intelligence:** Auto-detects reference planning date (`Sep 28, 2026`) with dynamic target planning horizon selector.
* **Safe 75% vs Distinction 90%:** Exact count of remaining classes required to attend:
  $$\text{Classes To Attend}_{75} = \max\left(0, \lceil 0.75 \times T_{\text{total}} \rceil - A_{\text{attended}}\right)$$
* **🚨 Critical Detention Warning:** Mathematically detects when $(A + R) < 0.75 \times T_{\text{total}}$ with high-clarity Apple Critical Alert banners and Web Audio API acoustic cues.
* **Interactive Bunk Margin Simulator & Timetable View.**

### 2. Visuals, Leaves, & The AI Assistant
* 📊 **Visual Attendance Health Profiles:**
  * Interactive Bar Chart with Recharts showing current attendance vs mandatory 75% floor and 90% distinction lines.
  * Status health distribution donut chart (Compliant, Borderline, Deficit, Detention Precluded).
* 🩺 **The OD & Medical Leave Simulator:**
  * Input On-Duty (OD), Medical Leave (ML), or Unexcused Leave date ranges.
  * Ingests the timetable to identify exact classes occurring in the leave window.
  * Instant recalculation showing $\Delta\%$ shift before and after leave.
  * One-click "Apply Simulation to Dashboard".
* 🤖 **Attendance Advisor AI Assistant:**
  * Always-accessible floating assistant dialog powered by Groq (Llama 3.3 70B) through a server function, with tool-calling over the real timetable maths.
  * Handles natural language queries like:  
    *"If I take a 3-day sick leave starting tomorrow, will my attendance drop below 75%?"*
  * Simulates upcoming classes day-by-day, computes exact drops, warns of risk subjects, and advises on On-Duty/medical submission.
  * Dual-engine resilience: Groq AI first, then the same maths answering offline if the key is missing or the API fails.
* 🌓 **Dynamic Light & Dark Mode:**
  * Native theme toggle with system preference detection and localStorage persistence.

---

## 🔑 AI setup (Groq)

The AI key is kept on the server, never in the browser bundle.

1. Get a free key at https://console.groq.com/keys
2. Local: create `.env.local` in the project root with `GROQ_API_KEY=your_key` (no `VITE_` prefix), then `npm run dev`. The dev server serves `/api/chat` itself.
3. Vercel: Project → Settings → Environment Variables → add `GROQ_API_KEY`, then redeploy. `api/chat.ts` is deployed automatically as a serverless function.

Optional: `GROQ_MODEL` (default `llama-3.3-70b-versatile`; any Groq model with tool calling works).

Without a key the advisor still answers, using offline calculation (labelled under each reply).

## 🏢 3D campus model

- Click any floor (on the model or in the floor list) to show only that floor. The camera flies to it and room codes appear.
- On an isolated floor, click a room for its live countdown and squad invite.
- "All floors", the reset button or Esc brings the whole building back.

## 🛠️ Quick Start

```bash
# Clone the repository
git clone https://github.com/aaditya079/Vibecraft-Anti.git
cd Vibecraft-Anti

# Install dependencies (Bun or npm)
bun install
# or: npm install

# Start development server
bun dev
# or: npm run dev
```

App runs locally on `http://localhost:5173`.

---

## 🌐 Production Build
```bash
bun run build
# output generated in dist/
```

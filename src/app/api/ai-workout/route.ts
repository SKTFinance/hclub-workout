import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { AI_SYSTEM_PROMPT, AI_WORKOUT_SCHEMA, DISCIPLINE_PROMPT, applyExplicitTiming, sanitizeDraft, withDefaults } from '@/lib/aiWorkout';

type Discipline = 'hyrox' | 'crossfit';

// KI-Workout-Baukasten: Freitext → strukturierter Entwurf (Gemini, JSON-Schema).
// ⛔ Nur für angemeldete Trainer — sonst kann jeder fremd auf unsere Rechnung generieren.
// ⛔ Der Schlüssel liegt NUR als Server-Variable GEMINI_API_KEY vor, nie im Browser.
// Schreibt NICHTS in die Datenbank; gespeichert wird erst in der Oberfläche.

export const runtime = 'nodejs';
export const maxDuration = 60;

const MODELS = [process.env.GEMINI_MODEL, 'gemini-flash-latest', 'gemini-2.5-flash'].filter(Boolean) as string[];

interface Audio { mime: string; data: string }

async function callGemini(model: string, key: string, text: string, discipline: Discipline | null, audio: Audio | null) {
  const sys = discipline ? `${AI_SYSTEM_PROMPT}\n\n${DISCIPLINE_PROMPT[discipline]}` : AI_SYSTEM_PROMPT;
  const parts: object[] = [];
  if (audio) {
    // Gesprochene Notizen (MediaRecorder): Gemini hört direkt zu, keine eigene Transkription.
    parts.push({ inlineData: { mimeType: audio.mime, data: audio.data } });
    parts.push({ text: `The coach SPOKE the workout notes in the audio above${text ? ' and also typed:\n"""\n' + text + '\n"""' : ''}. Build the workout from it.` });
  } else {
    parts.push({ text: `Coach notes:\n"""\n${text}\n"""` });
  }
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: sys }] },
        contents: [{ role: 'user', parts }],
        generationConfig: {
          temperature: 0.2,
          responseMimeType: 'application/json',
          responseSchema: AI_WORKOUT_SCHEMA,
        },
      }),
      signal: AbortSignal.timeout(27000),
    },
  );
  if (!res.ok) throw new Error(`AI ${res.status}`);
  const data = await res.json();
  const out = data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text || '').join('') || '';
  return JSON.parse(out);
}

// Anonyme Anfragen: höchstens 10 je Stunde und Adresse (pro Serverinstanz, bewusst einfach).
const hits = new Map<string, number[]>();
function freeAllowed(request: Request): boolean {
  const ip = (request.headers.get('x-forwarded-for') || 'x').split(',')[0].trim();
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((t) => now - t < 3600_000);
  if (list.length >= 10) { hits.set(ip, list); return false; }
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 500) hits.clear();
  return true;
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    // Freies Training am TV: kurze anonyme Sitzung mit TV-Code, dafür streng begrenzt.
    const code = request.headers.get('x-free-code') || '';
    if (!/^[A-Z2-9]{4,12}$/.test(code)) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 });
    if (!freeAllowed(request)) return NextResponse.json({ error: 'Too many requests, try again in a few minutes.' }, { status: 429 });
  }

  const key = process.env.GEMINI_API_KEY;
  if (!key) return NextResponse.json({ error: 'AI is not configured on this server.' }, { status: 503 });

  let text = '';
  let discipline: Discipline | null = null;
  let audio: Audio | null = null;
  try {
    const body = await request.json();
    text = String(body?.text || '').slice(0, 4000).trim();
    if (body?.discipline === 'hyrox' || body?.discipline === 'crossfit') discipline = body.discipline;
    const a = body?.audio;
    if (a && typeof a.data === 'string' && typeof a.mime === 'string' && /^audio\/[a-z0-9.+-]+/i.test(a.mime)) {
      if (a.data.length > 3_000_000) return NextResponse.json({ error: 'Recording is too long. Keep it under a minute.' }, { status: 413 });
      audio = { mime: a.mime.split(';')[0], data: a.data };
    }
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }
  if (!audio && text.length < 3) return NextResponse.json({ error: 'Describe the workout in a few words.' }, { status: 400 });

  let lastErr: unknown = null;
  for (const model of MODELS) {
    try {
      const raw = await callGemini(model, key, text, discipline, audio);
      const draft = withDefaults(applyExplicitTiming(sanitizeDraft(raw), text));
      if (discipline) draft.discipline = discipline;
      if (draft.blocks.length === 0) throw new Error('empty');
      return NextResponse.json({ draft });
    } catch (e) {
      lastErr = e;
    }
  }
  console.error('[ai-workout] failed', lastErr instanceof Error ? lastErr.message : lastErr);
  return NextResponse.json({ error: 'The AI could not read these notes. Try one movement per line.' }, { status: 502 });
}

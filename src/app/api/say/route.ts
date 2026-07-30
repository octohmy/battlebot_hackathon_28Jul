import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { NextRequest } from "next/server";
import { isKnownVoice } from "@/lib/voices";

/**
 * Live ElevenLabs read-out of a line the AI just wrote.
 *
 * The pre-generated banks (`/audio/announcer`, `/audio/stingers`) cover the
 * reusable moments at zero latency and zero cost. This route covers the one
 * thing they cannot: speaking a sentence that did not exist until two seconds
 * ago.
 *
 * That is metered, so three things guard it:
 *
 *  1. **Cache.** Keyed on the exact text, on disk and in memory. Demoing the
 *     same matchup twice costs once. Cache survives a dev-server restart.
 *  2. **Budget.** The free tier has a few thousand characters on it. We hold a
 *     reserve back and refuse below it, so the voice degrades to the clip bank
 *     mid-show instead of erroring out on stage.
 *  3. **Truncation.** Long lines are cut at a sentence boundary — a stadium
 *     reaction is one or two sentences anyway.
 *
 * Failure is always soft: any problem returns a status the client treats as
 * "no live voice this time", and the pre-generated stinger still fires.
 */

export const runtime = "nodejs";

/** Characters of quota to keep in hand so the demo never runs fully dry. */
const RESERVE = 220;
/** Longest line we will pay to voice. */
const MAX_CHARS = 260;

const CACHE_DIR = process.env.VERCEL
  ? "/tmp/rcbb-tts"
  : join(process.cwd(), ".tts-cache");

const memory = new Map<string, Buffer>();

/** Crude per-IP limiter — this endpoint spends money. */
const HITS = new Map<string, number[]>();
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 12;

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (HITS.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  HITS.set(ip, recent);
  return recent.length > MAX_PER_WINDOW;
}

/** Quota lookups are slow; a minute of staleness is fine for a guard rail. */
let quotaCache: { left: number; at: number } | null = null;

async function charactersLeft(key: string): Promise<number | null> {
  if (quotaCache && Date.now() - quotaCache.at < 60_000) return quotaCache.left;
  try {
    const res = await fetch("https://api.elevenlabs.io/v1/user/subscription", {
      headers: { "xi-api-key": key },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const d = (await res.json()) as {
      character_count: number;
      character_limit: number;
    };
    const left = d.character_limit - d.character_count;
    quotaCache = { left, at: Date.now() };
    return left;
  } catch {
    return null;
  }
}

/** Trim to the last sentence that fits, so we never pay for a cut-off word. */
function clamp(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= MAX_CHARS) return clean;
  const cut = clean.slice(0, MAX_CHARS);
  const stop = Math.max(cut.lastIndexOf("."), cut.lastIndexOf("!"), cut.lastIndexOf("?"));
  return stop > 60 ? cut.slice(0, stop + 1) : `${cut.slice(0, cut.lastIndexOf(" "))}.`;
}

async function fromCache(hash: string): Promise<Buffer | null> {
  const hit = memory.get(hash);
  if (hit) return hit;
  try {
    const buf = await readFile(join(CACHE_DIR, `${hash}.mp3`));
    memory.set(hash, buf);
    return buf;
  } catch {
    return null;
  }
}

async function toCache(hash: string, buf: Buffer): Promise<void> {
  memory.set(hash, buf);
  try {
    await mkdir(CACHE_DIR, { recursive: true });
    await writeFile(join(CACHE_DIR, `${hash}.mp3`), buf);
  } catch {
    // A read-only filesystem just means we fall back to the memory cache.
  }
}

function audio(buf: Buffer, headers: Record<string, string>) {
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "audio/mpeg",
      "Cache-Control": "no-store",
      ...headers,
    },
  });
}

/** Budget readout, so the UI can show what is left before it runs out. */
export async function GET() {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) return Response.json({ available: false, left: 0 });
  const left = await charactersLeft(key);
  return Response.json({
    available: left === null ? true : left > RESERVE,
    left: left ?? null,
    reserve: RESERVE,
  });
}

export async function POST(req: NextRequest) {
  const key = process.env.ELEVENLABS_API_KEY;
  const voice = process.env.ELEVENLABS_VOICE_ID;
  if (!key || !voice) {
    return Response.json({ error: "ElevenLabs is not configured" }, { status: 503 });
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (rateLimited(ip)) {
    return Response.json({ error: "Slow down a moment." }, { status: 429 });
  }

  let body: { text?: string; voice?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Bad JSON" }, { status: 400 });
  }

  const text = clamp(String(body.text ?? ""));
  if (text.length < 4) {
    return Response.json({ error: "Nothing to say" }, { status: 400 });
  }

  // Each bot speaks in its own voice, but only from the pool this app knows
  // about. An arbitrary id off the wire would let a caller bill the account
  // for any voice on it, so an unrecognised one falls back rather than being
  // passed through.
  const chosen =
    typeof body.voice === "string" && isKnownVoice(body.voice) ? body.voice : voice;

  const hash = createHash("sha1").update(`${chosen}:${text}`).digest("hex").slice(0, 24);

  const cached = await fromCache(hash);
  if (cached) return audio(cached, { "X-Tts-Cache": "hit" });

  const left = await charactersLeft(key);
  if (left !== null && left - text.length < RESERVE) {
    return Response.json(
      { error: "Live voice budget exhausted", left },
      { status: 402 },
    );
  }

  let res: Response;
  try {
    res = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${chosen}?output_format=mp3_44100_64`,
      {
        method: "POST",
        headers: { "xi-api-key": key, "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          model_id: "eleven_turbo_v2_5",
          voice_settings: {
            stability: 0.34,
            similarity_boost: 0.75,
            style: 0.65,
            speed: 1.06,
          },
        }),
      },
    );
  } catch {
    return Response.json({ error: "ElevenLabs unreachable" }, { status: 502 });
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    return Response.json(
      { error: "ElevenLabs error", status: res.status, detail: detail.slice(0, 200) },
      { status: 502 },
    );
  }

  const buf = Buffer.from(await res.arrayBuffer());
  // Optimistically debit the cached figure so bursts cannot outrun the guard.
  if (quotaCache) quotaCache.left -= text.length;
  await toCache(hash, buf);

  return audio(buf, { "X-Tts-Cache": "miss" });
}

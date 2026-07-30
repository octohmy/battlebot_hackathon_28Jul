import { NextRequest } from "next/server";
import { getBots } from "@/lib/bbpl/client";
import { buildMessages, type AiMode } from "@/lib/ai/prompts";
import type { TrumpKey } from "@/lib/scoring";

/**
 * Streaming AI endpoint.
 *
 * The API key never leaves the server: the browser posts two bot slugs and a
 * mode, and we do the OpenRouter call. Bot data is looked up server-side from
 * our own dataset rather than trusted from the request, so a caller can't
 * inject fake stats into the prompt.
 */

export const runtime = "nodejs";

const MODES: AiMode[] = ["taunt", "analyse", "predict", "roast"];

/** Crude per-IP limiter — enough to stop a public URL draining the key. */
const HITS = new Map<string, number[]>();
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 20;

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (HITS.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  HITS.set(ip, recent);
  return recent.length > MAX_PER_WINDOW;
}

export async function POST(req: NextRequest) {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) {
    return Response.json({ error: "OPENROUTER_API_KEY is not set" }, { status: 500 });
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (rateLimited(ip)) {
    return Response.json({ error: "Slow down a moment." }, { status: 429 });
  }

  let body: { a?: string; b?: string; mode?: string; stat?: string; target?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Bad JSON" }, { status: 400 });
  }

  const mode = body.mode as AiMode;
  if (!MODES.includes(mode)) {
    return Response.json({ error: "Unknown mode" }, { status: 400 });
  }

  const { bots } = await getBots();
  const a = bots.find((x) => x.slug === body.a);
  const b = bots.find((x) => x.slug === body.b);
  if (!a || !b) {
    return Response.json({ error: "Unknown bot" }, { status: 400 });
  }

  const messages = buildMessages({
    a,
    b,
    mode,
    stat: (body.stat as TrumpKey) ?? null,
    target: body.target === "a" || body.target === "b" ? body.target : null,
  });

  const upstream = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://red-corner-blue-bot.vercel.app",
      // ASCII only: HTTP header values are latin-1, an em-dash here throws.
      "X-Title": "Red Corner Blue Bot - BattleBots Card Arena",
    },
    body: JSON.stringify({
      model: process.env.OPENROUTER_MODEL ?? "google/gemini-3.5-flash-lite",
      messages,
      stream: true,
      temperature: mode === "analyse" || mode === "predict" ? 0.4 : 0.95,
      max_tokens: 220,
    }),
  });

  if (!upstream.ok || !upstream.body) {
    const detail = await upstream.text().catch(() => "");
    return Response.json(
      { error: "Upstream AI error", status: upstream.status, detail: detail.slice(0, 300) },
      { status: 502 },
    );
  }

  // Unwrap OpenRouter's SSE into a plain text stream — simpler for the client.
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = upstream.body!.getReader();
      const decoder = new TextDecoder();
      const encoder = new TextEncoder();
      let buffer = "";

      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data:")) continue;
            const payload = trimmed.slice(5).trim();
            if (payload === "[DONE]") {
              controller.close();
              return;
            }
            try {
              const json = JSON.parse(payload);
              const delta = json.choices?.[0]?.delta?.content;
              if (delta) controller.enqueue(encoder.encode(delta));
            } catch {
              // Keep-alive comment or split frame — ignore.
            }
          }
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

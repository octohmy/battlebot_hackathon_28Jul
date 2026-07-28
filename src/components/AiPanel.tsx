"use client";

import { useCallback, useRef, useState } from "react";
import type { Bot } from "@/lib/bbpl/client";
import type { TrumpKey } from "@/lib/scoring";
import { useArena, type AiMode } from "@/lib/store";

/**
 * The AI pill rack.
 *
 * Streams plain text from /api/ai and types it out. Roasts and taunts also cost
 * the target bot emotional HP — this is the "hurt the robot's feelings" loop,
 * and the damage scales with how long and specific the burn was.
 */

const PILLS: { mode: AiMode; label: string; hint: string; aimed: boolean }[] = [
  { mode: "taunt", label: "Trash talk", hint: "Cocky smack talk, aimed at one bot", aimed: true },
  { mode: "roast", label: "Roast", hint: "Savage burn using its real failures", aimed: true },
  { mode: "analyse", label: "Analyse", hint: "Dry breakdown of who the numbers favour", aimed: false },
  { mode: "predict", label: "Predict", hint: "Call a winner with a reason", aimed: false },
];

export default function AiPanel({
  a,
  b,
  stat,
}: {
  a: Bot;
  b: Bot;
  stat: TrumpKey | null;
}) {
  const { aiText, aiMode, aiLoading, aiTarget, setAi, hurtFeelings, bumpDamage } =
    useArena();
  const [target, setTarget] = useState<"a" | "b">("b");
  const abort = useRef<AbortController | null>(null);

  const run = useCallback(
    async (mode: AiMode, aimed: boolean) => {
      abort.current?.abort();
      const ctl = new AbortController();
      abort.current = ctl;

      setAi({ aiMode: mode, aiLoading: true, aiText: "", aiTarget: aimed ? target : null });

      try {
        const res = await fetch("/api/ai", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            a: a.slug,
            b: b.slug,
            mode,
            stat,
            target: aimed ? target : null,
          }),
          signal: ctl.signal,
        });

        if (!res.ok || !res.body) {
          const msg =
            res.status === 429
              ? "Easy — too many requests. Give it a second."
              : "The AI is down. The numbers on the cards are still real.";
          setAi({ aiText: msg, aiLoading: false });
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let acc = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          acc += decoder.decode(value, { stream: true });
          setAi({ aiText: acc });
        }

        setAi({ aiLoading: false });

        // A landed insult costs feelings. Longer, more specific burns hurt more.
        if (aimed && acc.length > 20) {
          const victim = target === "a" ? a : b;
          const sting = Math.min(22, 8 + Math.round(acc.length / 22));
          hurtFeelings(victim.slug, mode === "roast" ? sting : Math.round(sting * 0.6));
          bumpDamage(0.06);
        }
      } catch (e) {
        if ((e as Error).name !== "AbortError") {
          setAi({ aiText: "Connection dropped.", aiLoading: false });
        }
      }
    },
    [a, b, stat, target, setAi, hurtFeelings, bumpDamage],
  );

  return (
    <section className="plate mt-6 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="display text-2xl">Ringside AI</h2>
          <p className="text-[11px] text-bb-chrome">
            Grounded in real stats and prior-season fight logs. It cannot make
            numbers up.
          </p>
        </div>

        {/* Who to aim at */}
        <div className="flex items-center gap-2">
          <span className="label">Aim at</span>
          <div className="flex border border-bb-steel">
            {(["a", "b"] as const).map((side) => {
              const bot = side === "a" ? a : b;
              const on = target === side;
              return (
                <button
                  key={side}
                  onClick={() => setTarget(side)}
                  className="display px-3 py-1.5 text-sm transition-colors"
                  style={{
                    background: on ? (side === "a" ? "#e10600" : "#3aa0dc") : "transparent",
                    color: on ? "#fff" : "#9aa4b0",
                  }}
                >
                  {bot.name}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {PILLS.map((p) => (
          <button
            key={p.mode}
            onClick={() => run(p.mode, p.aimed)}
            disabled={aiLoading}
            title={p.hint}
            className={[
              "display border px-4 py-2 text-lg transition-all",
              aiMode === p.mode
                ? "border-bb-red bg-bb-red text-white"
                : "border-bb-steel hover:border-bb-chrome hover:bg-white/5",
              aiLoading ? "cursor-wait opacity-60" : "",
            ].join(" ")}
          >
            {p.label}
          </button>
        ))}
      </div>

      {(aiText || aiLoading) && (
        <blockquote
          className="mt-4 border-l-2 pl-4 text-[15px] leading-relaxed"
          style={{
            borderColor:
              aiTarget === "a" ? "#e10600" : aiTarget === "b" ? "#3aa0dc" : "#2a3038",
          }}
        >
          {aiText}
          {aiLoading && (
            <span className="ml-0.5 inline-block h-4 w-2 translate-y-0.5 animate-pulse bg-bb-red" />
          )}
        </blockquote>
      )}
    </section>
  );
}

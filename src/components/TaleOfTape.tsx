"use client";

import type { Bot } from "@/lib/bbpl/client";
import type { Fight } from "@/lib/fights";

/**
 * Centre-column dossier: the prior-season fight record behind the matchup.
 *
 * This is the receipts panel — the same facts the AI is given, shown to the
 * user so they can check its work. Everything is labelled as prior-season so
 * it's never confused with the Pro League 2026 record on the cards.
 */

export interface TapeData {
  headToHead: Fight[];
  common: string[];
  aHistory: Fight[];
  bHistory: Fight[];
  seasonLabel: string;
}

function mmss(secs: number | null) {
  if (!secs) return "";
  return ` ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
}

function FightRow({ f, accent }: { f: Fight; accent: string }) {
  const won = f.result === "WIN";
  return (
    <li className="flex items-baseline justify-between gap-2 py-0.5 text-[11px]">
      <span className="truncate text-bb-chrome">
        <span
          className="mr-1.5 font-bold"
          style={{ color: won ? "#33d17a" : "#e10600" }}
        >
          {won ? "W" : "L"}
        </span>
        {f.opponent}
      </span>
      <span className="shrink-0 stencil text-bb-steel" style={{ color: accent }}>
        {f.method}
        {mmss(f.timeSecs)}
      </span>
    </li>
  );
}

export default function TaleOfTape({
  a,
  b,
  data,
}: {
  a: Bot;
  b: Bot;
  data: TapeData;
}) {
  const { headToHead, common, aHistory, bHistory, seasonLabel } = data;
  const nothing = !headToHead.length && !aHistory.length && !bHistory.length;

  if (nothing) {
    return (
      <div className="plate w-64 px-4 py-3 text-center">
        <div className="label">Tale of the tape</div>
        <p className="mt-2 text-[11px] text-bb-chrome">
          Neither bot appears in the {seasonLabel} fight log. The cards above are
          still live Pro League data.
        </p>
      </div>
    );
  }

  return (
    <div className="plate w-64 px-4 py-3">
      <div className="label">Tale of the tape</div>
      <p className="mt-1 text-[10px] leading-snug text-bb-steel">
        Prior season · {seasonLabel}
      </p>

      {headToHead.length > 0 ? (
        <div className="mt-3 border border-bb-red/40 bg-bb-red/10 p-2">
          <div className="label !text-[9px] !text-bb-red">They have met</div>
          <ul className="mt-1">
            {headToHead.map((f, i) => (
              <li key={i} className="text-[11px] leading-snug">
                <span className="display">
                  {f.result === "WIN" ? a.name : b.name}
                </span>{" "}
                <span className="text-bb-chrome">
                  beat {f.result === "WIN" ? b.name : a.name}{" "}
                  {f.method === "KO"
                    ? `by KO${mmss(f.timeSecs)}`
                    : "on a decision"}{" "}
                  (ep {f.episode})
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="mt-3 border border-bb-steel p-2 text-[10px] text-bb-chrome">
          Never met in {seasonLabel}.
        </p>
      )}

      {common.length > 0 && (
        <p className="mt-2 text-[10px] leading-snug text-bb-chrome">
          <span className="label !text-[9px]">Common foes </span>
          {common.join(", ")}
        </p>
      )}

      <div className="mt-3 grid grid-cols-2 gap-3">
        <div>
          <div className="label !text-[9px] !text-bb-red">{a.name}</div>
          <ul className="mt-0.5">
            {aHistory.map((f, i) => (
              <FightRow key={i} f={f} accent="#e10600" />
            ))}
            {!aHistory.length && (
              <li className="py-0.5 text-[10px] text-bb-steel">No log</li>
            )}
          </ul>
        </div>
        <div>
          <div className="label !text-[9px] !text-bb-blue">{b.name}</div>
          <ul className="mt-0.5">
            {bHistory.map((f, i) => (
              <FightRow key={i} f={f} accent="#3aa0dc" />
            ))}
            {!bHistory.length && (
              <li className="py-0.5 text-[10px] text-bb-steel">No log</li>
            )}
          </ul>
        </div>
      </div>
    </div>
  );
}

"use client";

import { DOMINANT, severityOf, TRUMP_BY_KEY } from "@/lib/scoring";
import { SIDE } from "@/lib/theme";
import { MAX_ROUNDS, type RoundLog, type Side } from "@/lib/store";

/**
 * The judges' scorecard.
 *
 * Scored the way boxing scores: ten points to the round winner, nine to the
 * loser, ten apiece on an even round. That is not decoration — it is a second,
 * finer-grained reading of the same rounds the pip column already shows. Two
 * bots can be level at 3 rounds each and still be nowhere near level on the
 * card, because a stat taken by a mile and a stat squeaked are the same single
 * round but not the same fight.
 *
 * The margin is what separates them: a round won by more than 40% of the
 * leading value is a 10-8, the same way a knockdown is.
 */

export interface ScoredRound {
  round: number;
  stat: string;
  a: number;
  b: number;
  winner: Side | null;
  chosenBy: Side;
}

/** Ten-point-must, with a 10-8 for a dominant round. */
export function scoreRounds(rounds: RoundLog[]): ScoredRound[] {
  return rounds.map((r, i) => {
    const low = severityOf(r.result) > DOMINANT ? 8 : 9;
    return {
      round: i + 1,
      stat: TRUMP_BY_KEY[r.stat].short,
      a: r.winner === null ? 10 : r.winner === "a" ? 10 : low,
      b: r.winner === null ? 10 : r.winner === "b" ? 10 : low,
      winner: r.winner,
      chosenBy: r.chosenBy,
    };
  });
}

export function cardTotals(scored: ScoredRound[]): Record<Side, number> {
  return {
    a: scored.reduce((n, r) => n + r.a, 0),
    b: scored.reduce((n, r) => n + r.b, 0),
  };
}

export default function Scorecard({ rounds }: { rounds: RoundLog[] }) {
  const scored = scoreRounds(rounds);
  const totals = cardTotals(scored);

  return (
    <div className="border border-bb-steel bg-bb-black/40">
      <div className="flex items-center justify-between border-b border-bb-steel px-2 py-1">
        <span className="label !text-[9px]">Judges&apos; card</span>
        <span className="label !text-[8px] !tracking-normal text-bb-steel">
          10-point must
        </span>
      </div>

      <table className="w-full border-collapse text-[10px]">
        <caption className="sr-only">
          Round-by-round scorecard, ten points to the winner of each round
        </caption>
        <thead>
          <tr className="text-bb-steel">
            <th className="w-6 py-0.5 font-normal">R</th>
            <th className="py-0.5 text-left font-normal">Stat</th>
            <th className="w-7 py-0.5 font-normal" style={{ color: SIDE.a.color }}>
              R
            </th>
            <th className="w-7 py-0.5 font-normal" style={{ color: SIDE.b.color }}>
              B
            </th>
          </tr>
        </thead>
        <tbody>
          {scored.map((r) => (
            <tr key={r.round} className="border-t border-bb-steel/40">
              <td className="stencil py-0.5 text-center text-bb-chrome">{r.round}</td>
              <td
                className="truncate py-0.5 text-bb-chrome"
                title={`${SIDE[r.chosenBy].corner} chose this round`}
              >
                <span style={{ color: SIDE[r.chosenBy].color }}>
                  {r.chosenBy === "a" ? "◀" : "▶"}
                </span>{" "}
                {r.stat}
              </td>
              {(["a", "b"] as const).map((side) => (
                <td
                  key={side}
                  className="stencil py-0.5 text-center tabular-nums"
                  style={{
                    color: r.winner === side ? SIDE[side].color : "#5a5f66",
                    fontWeight: r.winner === side ? 800 : 400,
                  }}
                >
                  {side === "a" ? r.a : r.b}
                </td>
              ))}
            </tr>
          ))}
          {/* Rounds still to come, so the card reads as a full bout. */}
          {Array.from({ length: Math.max(0, MAX_ROUNDS - scored.length) }, (_, i) => (
            <tr key={`empty-${i}`} className="border-t border-bb-steel/20">
              <td className="stencil py-0.5 text-center text-bb-steel/50">
                {scored.length + i + 1}
              </td>
              <td className="py-0.5 text-bb-steel/40">—</td>
              <td className="py-0.5 text-center text-bb-steel/40">·</td>
              <td className="py-0.5 text-center text-bb-steel/40">·</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-bb-steel">
            <td colSpan={2} className="label py-1 pl-1 !text-[9px]">
              Total
            </td>
            {(["a", "b"] as const).map((side) => (
              <td
                key={side}
                className="stencil py-1 text-center text-sm tabular-nums"
                style={{
                  color:
                    totals[side] > totals[side === "a" ? "b" : "a"]
                      ? SIDE[side].color
                      : "#9aa4b0",
                }}
              >
                {totals[side]}
              </td>
            ))}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

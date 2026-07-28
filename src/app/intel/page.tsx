import Link from "next/link";
import Image from "next/image";
import { getBots, snapshotFetchedAt } from "@/lib/bbpl/client";
import { hasHistory, SEASON_LABEL } from "@/lib/fights";
import { powerRank, weaponMeta } from "@/lib/scoring";

export const revalidate = 3600;

/**
 * The substance tab: power rankings and weapon meta.
 *
 * Charts are deliberately single-hue with direct labels rather than a
 * colour-per-category scheme — one measure is being compared (win rate), the
 * bars are already named, and an 8-colour categorical palette failed
 * colour-blind separation. One hue + labels is both more accurate and more
 * legible on a projector.
 */

export default async function IntelPage() {
  const { bots, source } = await getBots();
  const competitors = bots.filter((b) => !b.isAlternate);
  const ranked = powerRank(competitors);
  const meta = weaponMeta(competitors);
  const maxWinRate = Math.max(...meta.map((m) => m.winRate), 1);
  const fetchedAt = snapshotFetchedAt();

  return (
    <main className="mx-auto max-w-6xl px-5 py-8">
      <div className="mb-6 flex items-center justify-between border-b border-bb-steel pb-3">
        <Link href="/" className="display text-2xl">
          WRECK<span className="text-bb-red">ED</span>
        </Link>
        <Link href="/arena" className="label hover:text-bb-bone">
          Arena
        </Link>
      </div>

      <h1 className="display text-6xl">Intel</h1>
      <p className="mt-2 max-w-2xl text-sm text-bb-chrome">
        Pro League 2026, all {competitors.length} competitors. Sourced from the
        BattleBots standings and robot-stats APIs
        {source === "snapshot" && fetchedAt
          ? `, snapshotted ${new Date(fetchedAt).toLocaleString("en-GB", {
              dateStyle: "medium",
              timeStyle: "short",
            })}`
          : " live"}
        .
      </p>

      {/* ── Power rankings ── */}
      <section className="mt-10">
        <h2 className="display text-3xl">Power rankings</h2>
        <p className="mt-1 text-xs text-bb-chrome">
          Composite score: 50% season win rate, 30% career win rate, 20% career
          KO rate. Simple on purpose — every input is on the card.
        </p>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[46rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-bb-steel text-left">
                <th className="label py-2 pr-2">#</th>
                <th className="label py-2 pr-2">Bot</th>
                <th className="label py-2 pr-2">Weapon</th>
                <th className="label py-2 pr-2 text-right">Season</th>
                <th className="label py-2 pr-2 text-right">Career</th>
                <th className="label py-2 pr-2 text-right">KO%</th>
                <th className="label py-2 pl-2">Power</th>
              </tr>
            </thead>
            <tbody>
              {ranked.map(({ bot, power, seasonWinRate }, i) => (
                <tr
                  key={bot.slug}
                  className="border-b border-bb-steel/40 transition-colors hover:bg-white/5"
                >
                  <td className="stencil py-2 pr-2 text-lg text-bb-chrome">
                    {i + 1}
                  </td>
                  <td className="py-2 pr-2">
                    <div className="flex items-center gap-2">
                      <Image
                        src={bot.image}
                        alt=""
                        width={36}
                        height={26}
                        className="h-6 w-9 object-contain"
                      />
                      <div>
                        <span className="display text-lg">{bot.name}</span>
                        {hasHistory(bot.name) && (
                          <span
                            className="ml-1.5 text-[9px] text-bb-steel"
                            title={`Has ${SEASON_LABEL} fight history`}
                          >
                            ●
                          </span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="py-2 pr-2 text-xs text-bb-chrome">
                    {bot.weapon.label}
                    {bot.weapon.source === "editorial" && (
                      <span title="Not listed on battlebots.com — best guess">*</span>
                    )}
                  </td>
                  <td className="stencil py-2 pr-2 text-right">
                    {bot.season.wins}-{bot.season.losses}
                    <span className="ml-1 text-[10px] text-bb-steel">
                      {seasonWinRate.toFixed(0)}%
                    </span>
                  </td>
                  <td className="stencil py-2 pr-2 text-right">
                    {bot.career ? `${bot.career.winRate}%` : "—"}
                  </td>
                  <td className="stencil py-2 pr-2 text-right">
                    {bot.career?.koPct !== null && bot.career?.koPct !== undefined
                      ? `${bot.career.koPct}%`
                      : "—"}
                  </td>
                  <td className="py-2 pl-2">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-32 bg-bb-black">
                        <div
                          className="h-full rounded-r-[2px] bg-bb-red"
                          style={{ width: `${Math.min(100, power)}%` }}
                        />
                      </div>
                      <span className="stencil w-10 text-right">{power}</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Weapon meta ── */}
      <section className="mt-12">
        <h2 className="display text-3xl">Weapon meta</h2>
        <p className="mt-1 text-xs text-bb-chrome">
          Season win rate by weapon class. Bars share one hue because a single
          measure is being compared — the class names label them directly.
        </p>

        <ul className="mt-5 space-y-3">
          {meta.map((row) => (
            <li key={row.weapon} className="grid grid-cols-[10rem_1fr_auto] items-center gap-3">
              <span className="display truncate text-lg">
                {row.label}
                {row.hasEditorial && (
                  <span
                    className="text-bb-steel"
                    title="Bucket contains at least one best-guess classification"
                  >
                    *
                  </span>
                )}
              </span>
              <div className="h-6 bg-bb-panel">
                <div
                  className="flex h-full items-center justify-end rounded-r-[4px] bg-bb-red pr-2"
                  style={{ width: `${Math.max(4, (row.winRate / maxWinRate) * 100)}%` }}
                >
                  <span className="stencil text-xs text-white">
                    {row.winRate.toFixed(0)}%
                  </span>
                </div>
              </div>
              <span className="text-[11px] text-bb-chrome">
                {row.botCount} bot{row.botCount === 1 ? "" : "s"} · {row.wins}W-
                {row.losses}L · {row.koWins} KO
              </span>
            </li>
          ))}
        </ul>
      </section>

      {/* ── Provenance ── */}
      <section className="mt-12 border-t border-bb-steel pt-5">
        <h2 className="label">Where this comes from</h2>
        <ul className="mt-2 space-y-1 text-xs text-bb-chrome">
          <li>
            Standings and career stats:{" "}
            <code className="text-bb-bone">battlebots.com/wp-json/bbpl/v1/</code>{" "}
            (<code>standings</code>, <code>robot-stats</code>).
          </li>
          <li>
            Fight-by-fight history: the {SEASON_LABEL} match schedule, a published
            Google Sheet embedded on{" "}
            <code className="text-bb-bone">battlebots.com/match-schedule/</code>.
            100 matches, each independently confirmed from both bots&apos; rows.
          </li>
          <li>
            Weapon types: scraped from each bot&apos;s{" "}
            <code className="text-bb-bone">battlebots.com/robot/</code> page.
            Entries marked <span className="text-bb-bone">*</span> are left blank
            at source and are our best guess, flagged everywhere they appear.
          </li>
          <li>
            Career stats are unavailable at source for Calypso and Death Roll;
            those cards show <span className="text-bb-bone">NO DATA</span> rather
            than a fabricated number.
          </li>
        </ul>
      </section>
    </main>
  );
}

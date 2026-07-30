import Image from "next/image";
import BroadcastLink from "@/components/BroadcastLink";
import Wordmark from "@/components/Wordmark";
import FormScatter from "@/components/FormScatter";
import { getBots, snapshotFetchedAt } from "@/lib/bbpl/client";
import { hasHistory, SEASON_LABEL } from "@/lib/fights";
import { POWER_WEIGHTS, powerRank, weaponMeta } from "@/lib/scoring";
import { dataDepth } from "@/lib/telemetry";

export const revalidate = 3600;

/**
 * The substance tab: power rankings, form, and weapon meta.
 *
 * Charting choices worth stating, because they were choices:
 *
 *  - The rankings bar is **stacked**, not a single length, so the composite
 *    score is shown being assembled from its three weighted parts rather than
 *    asserted. Three categorical hues, validated as a set against this
 *    surface, with a 2px gap between segments and a legend that names them.
 *  - The form chart is a **scatter**, because win rate and KO rate are two
 *    measures — putting them on one axis would need two scales, which is the
 *    one thing a chart must never do. Bubble area carries sample size.
 *  - The weapon bars are **single-hue** with direct labels: one measure is
 *    being compared and the class names already identify the rows, so an
 *    eight-colour categorical scheme would add no information and would not
 *    survive colour-blind separation.
 */

export default async function IntelPage() {
  const { bots, source } = await getBots();
  const competitors = bots.filter((b) => !b.isAlternate);
  const ranked = powerRank(competitors);
  const meta = weaponMeta(competitors);
  const maxWinRate = Math.max(...meta.map((m) => m.winRate), 1);
  const maxPower = Math.max(...ranked.map((r) => r.power), 1);
  const fetchedAt = snapshotFetchedAt();
  const depth = dataDepth(competitors);
  const top3 = ranked.slice(0, 3).map((r) => r.bot.slug);
  const withHistory = competitors.filter((b) => hasHistory(b.name)).length;

  return (
    <main className="mx-auto max-w-6xl px-5 py-8">
      <div className="mb-6 flex items-center justify-between border-b border-bb-steel pb-3">
        <BroadcastLink href="/" label="Red Corner Blue Bot" className="text-xl">
          <Wordmark />
        </BroadcastLink>
        <BroadcastLink
          href="/arena"
          kind="slam"
          label="Ringside"
          className="label hover:text-bb-bone"
        >
          Arena
        </BroadcastLink>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <h1 className="display text-6xl">Intel</h1>
          <p className="mt-2 max-w-2xl text-sm text-bb-chrome">
            Pro League 2026, all {competitors.length} competitors. Sourced from
            the BattleBots standings and robot-stats APIs
            {source === "snapshot" && fetchedAt
              ? `, snapshotted ${new Date(fetchedAt).toLocaleString("en-GB", {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}`
              : " live"}
            .
          </p>
        </div>

        <dl className="flex flex-wrap gap-3">
          {(
            [
              [depth.fields, "data fields"],
              [withHistory, `in the ${SEASON_LABEL} log`],
              [meta.length, "weapon classes"],
            ] as const
          ).map(([value, label]) => (
            <div key={label} className="plate px-4 py-2">
              <dd className="stencil text-3xl text-bb-red">{value}</dd>
              <dt className="label !text-[9px]">{label}</dt>
            </div>
          ))}
        </dl>
      </div>

      {/* ── Podium ── */}
      <section className="mt-9">
        <div className="grid gap-3 sm:grid-cols-3">
          {ranked.slice(0, 3).map(({ bot, power }, i) => (
            <article
              key={bot.slug}
              className="plate relative flex items-center gap-3 overflow-hidden px-4 py-3"
              style={{
                borderColor: i === 0 ? "#e10600" : undefined,
                boxShadow: i === 0 ? "0 0 40px -18px #e10600" : undefined,
              }}
            >
              <span
                aria-hidden
                className="stencil absolute -right-3 -top-5 text-[6rem] leading-none text-white/5"
              >
                {i + 1}
              </span>
              <span className="stencil text-4xl text-bb-red">{i + 1}</span>
              <Image
                src={bot.image}
                alt=""
                width={72}
                height={52}
                className="h-13 w-18 shrink-0 object-contain"
              />
              <div className="min-w-0">
                <div className="display truncate text-2xl">{bot.name}</div>
                <div className="label !text-[9px]">Power {power}</div>
                <div className="mt-0.5 text-[11px] text-bb-chrome">
                  {bot.season.wins}W-{bot.season.losses}L ·{" "}
                  {bot.career ? `${bot.career.winRate}% career` : "no career data"}
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* ── Power rankings ── */}
      <section className="mt-11">
        <h2 className="display text-3xl">Power rankings</h2>
        <p className="mt-1 max-w-3xl text-xs text-bb-chrome">
          Composite score out of 100. Every bar is the score being built: the
          three weighted parts are drawn separately so you can see which of them
          is carrying a bot, rather than taking one number on trust.
        </p>

        {/* Legend — three series, so identity is never colour alone. */}
        <ul className="mt-3 flex flex-wrap gap-4">
          {POWER_WEIGHTS.map((w) => (
            <li key={w.key} className="flex items-center gap-1.5 text-[11px] text-bb-chrome">
              <span
                className="inline-block h-2.5 w-2.5"
                style={{ background: w.color }}
              />
              {w.label}
              <span className="text-bb-steel">×{w.weight}</span>
            </li>
          ))}
        </ul>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[52rem] border-collapse text-sm">
            <caption className="sr-only">
              Power rankings for all {competitors.length} Pro League competitors
            </caption>
            <thead>
              <tr className="border-b border-bb-steel text-left">
                <th className="label py-2 pr-2">#</th>
                <th className="label py-2 pr-2">Bot</th>
                <th className="label py-2 pr-2">Weapon</th>
                <th className="label py-2 pr-2 text-right">Season</th>
                <th className="label py-2 pr-2 text-right">Career</th>
                <th className="label py-2 pr-2 text-right">KO%</th>
                <th className="label py-2 pl-2">Power composition</th>
              </tr>
            </thead>
            <tbody>
              {ranked.map(({ bot, power, seasonWinRate, parts, careerImputed }, i) => (
                <tr
                  key={bot.slug}
                  className="border-b border-bb-steel/40 transition-colors hover:bg-white/5"
                >
                  <td className="stencil py-2 pr-2 text-lg text-bb-chrome">{i + 1}</td>
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
                      {/* Stacked composition. A 2px surface gap separates the
                          segments so adjacent hues never touch. */}
                      <div
                        className="flex h-2.5 w-44 gap-[2px] bg-bb-black"
                        title={POWER_WEIGHTS.map(
                          (w) => `${w.label}: ${parts[w.key].toFixed(1)}`,
                        ).join(" · ")}
                      >
                        {POWER_WEIGHTS.map((w) => (
                          <span
                            key={w.key}
                            style={{
                              width: `${(parts[w.key] / maxPower) * 100}%`,
                              background: w.color,
                            }}
                          />
                        ))}
                      </div>
                      <span className="stencil w-10 text-right">{power}</span>
                      {careerImputed && (
                        <span
                          className="text-[10px] text-bb-amber"
                          title="No career record at source — the season record stands in for it"
                        >
                          †
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[11px] text-bb-steel">
          <span className="text-bb-amber">†</span> Career figures are unavailable
          at source for Calypso and Death Roll; their season record substitutes,
          so their composite leans entirely on this year.
        </p>
      </section>

      {/* ── Form ── */}
      <section className="mt-12">
        <h2 className="display text-3xl">Form</h2>
        <p className="mt-1 max-w-3xl text-xs text-bb-chrome">
          Who wins, against how they win. Top right is the dangerous quadrant —
          a bot that wins often <em>and</em> finishes what it starts.
        </p>
        <div className="mt-4">
          <FormScatter bots={competitors} highlight={top3} />
        </div>
      </section>

      {/* ── Weapon meta ── */}
      <section className="mt-12">
        <h2 className="display text-3xl">Weapon meta</h2>
        <p className="mt-1 max-w-3xl text-xs text-bb-chrome">
          Season win rate by weapon class. Bars share one hue because a single
          measure is being compared — the class names label them directly.
        </p>

        <ul className="mt-5 space-y-3">
          {meta.map((row) => (
            <li
              key={row.weapon}
              className="grid grid-cols-[10rem_1fr_auto] items-center gap-3"
            >
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

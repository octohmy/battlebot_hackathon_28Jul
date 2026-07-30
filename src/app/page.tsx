import Image from "next/image";
import BroadcastLink from "@/components/BroadcastLink";
import Wordmark from "@/components/Wordmark";
import HeroMesh from "@/components/HeroMesh";
import RosterStrip from "@/components/RosterStrip";
import SoundPrompt from "@/components/SoundPrompt";
import ThemeAudio from "@/components/ThemeAudio";
import { getBots } from "@/lib/bbpl/client";
import { SEASON_LABEL } from "@/lib/fights";
import { powerRank } from "@/lib/scoring";
import { dataDepth } from "@/lib/telemetry";

export const revalidate = 3600;

export default async function Home() {
  const { bots, source } = await getBots();
  const competitors = bots.filter((b) => !b.isAlternate);
  const ranked = powerRank(competitors);
  const top = ranked.slice(0, 3);
  /** The hero cycles the front of the power rankings. */
  const featured = ranked.slice(0, 5).map((r) => r.bot);
  const power = Object.fromEntries(ranked.map((r) => [r.bot.slug, r.power]));
  const depth = dataDepth(competitors);

  return (
    <main className="relative min-h-screen overflow-hidden">
      <ThemeAudio />

      {/* Arena floor */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            "linear-gradient(#ffffff10 1px, transparent 1px), linear-gradient(90deg, #ffffff10 1px, transparent 1px)",
          backgroundSize: "60px 60px",
          maskImage: "radial-gradient(70% 60% at 50% 45%, #000, transparent)",
          WebkitMaskImage: "radial-gradient(70% 60% at 50% 45%, #000, transparent)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(50% 40% at 25% 30%, #e1060022, transparent 70%), radial-gradient(50% 40% at 75% 60%, #2f8fc922, transparent 70%)",
        }}
      />

      <div className="relative mx-auto max-w-[1500px] px-6 py-10">
        <div className="grid items-center gap-10 lg:grid-cols-[1.05fr_1fr]">
          {/* ── Copy ── */}
          <div>
            <p className="label mb-4">
              <span
                className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle"
                style={{ background: source === "live" ? "#33d17a" : "#f5a623" }}
              />
              BattleBots Pro League 2026 · {competitors.length} competitors ·{" "}
              {source === "live" ? "live API" : "snapshot"}
            </p>

            {/* The poster lockup: two corners, stacked, with the bout line
                between them the way a fight bill is set. */}
            <h1 className="sr-only">Red Corner Blue Bot</h1>
            <div aria-hidden>
              <Wordmark stacked className="text-[15vw] sm:text-[8.5rem]" />
            </div>

            <div className="mt-4 flex items-center gap-3">
              <span className="h-px flex-1 bg-bb-steel" />
              <span className="label !text-[10px] whitespace-nowrap">
                Twenty-four machines · two corners · six rounds
              </span>
              <span className="h-px flex-1 bg-bb-steel" />
            </div>

            <p className="mt-5 max-w-xl text-lg text-bb-chrome">
              A top-trumps card arena for the Pro League. Make the match, trump a
              stat, and let an AI that has actually read their fight record ruin
              their day.
              <span className="text-bb-bone"> Every number is real.</span>
            </p>

            <div className="mt-7 flex flex-wrap items-center gap-4">
              <BroadcastLink
                href="/arena"
                kind="slam"
                label="Ringside"
                sub="Pro League 2026"
                className="brackets display bg-bb-red px-9 py-4 text-3xl text-white transition-transform hover:scale-[1.04] active:scale-95"
              >
                Enter the ring
              </BroadcastLink>
              <BroadcastLink
                href="/intel"
                label="Intel"
                sub="Power rankings · weapon meta"
                className="display border border-bb-steel px-7 py-4 text-2xl transition-colors hover:bg-white/10"
              >
                Power rankings
              </BroadcastLink>
            </div>

            <div className="mt-6 max-w-2xl">
              <SoundPrompt compact />
            </div>

            {/* What is actually behind the cards */}
            <dl className="mt-8 grid max-w-2xl grid-cols-3 gap-3">
              {(
                [
                  [
                    depth.fields,
                    "live data fields",
                    "Populated stats across the field, from three sources",
                  ],
                  [
                    100,
                    "scraped matches",
                    `${SEASON_LABEL}, via the Bright Data Scraping Browser`,
                  ],
                  [
                    competitors.length,
                    "machines",
                    "Every Pro League competitor, none invented",
                  ],
                ] as const
              ).map(([value, label, hint]) => (
                <div key={label} className="plate px-3 py-2" title={hint}>
                  <dd className="stencil text-3xl text-bb-red">{value}</dd>
                  <dt className="label !text-[9px] leading-tight">{label}</dt>
                </div>
              ))}
            </dl>
          </div>

          {/* ── Hero mesh ── */}
          <div className="flex justify-center lg:justify-end">
            <HeroMesh bots={featured} power={power} />
          </div>
        </div>

        {/* ── Top 3 ── */}
        <div className="mt-12 grid max-w-4xl gap-3 sm:grid-cols-3">
          {top.map(({ bot, power: p }, i) => (
            <BroadcastLink
              key={bot.slug}
              href="/intel"
              label="Intel"
              className="plate group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-white/5"
            >
              <span className="stencil text-4xl text-bb-red">{i + 1}</span>
              <Image
                src={bot.image}
                alt=""
                width={56}
                height={40}
                className="h-10 w-14 shrink-0 object-contain transition-transform duration-300 group-hover:scale-110"
              />
              <div className="min-w-0">
                <div className="display truncate text-xl">{bot.name}</div>
                <div className="label !text-[9px]">
                  Power {p} · {bot.season.wins}W-{bot.season.losses}L
                </div>
              </div>
            </BroadcastLink>
          ))}
        </div>
      </div>

      <RosterStrip bots={competitors} />

      <p className="px-6 py-4 text-center text-[11px] text-bb-steel">
        Bot images and all statistics © BattleBots Inc. Fight history scraped
        with the Bright Data Scraping Browser. Voice by ElevenLabs.
      </p>
    </main>
  );
}

import Link from "next/link";
import ThemeAudio from "@/components/ThemeAudio";
import { getBots } from "@/lib/bbpl/client";
import { powerRank } from "@/lib/scoring";

export const revalidate = 3600;

export default async function Home() {
  const { bots, source } = await getBots();
  const competitors = bots.filter((b) => !b.isAlternate);
  const top = powerRank(competitors).slice(0, 3);

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
            "radial-gradient(50% 40% at 30% 30%, #e1060022, transparent 70%), radial-gradient(50% 40% at 70% 60%, #3aa0dc22, transparent 70%)",
        }}
      />

      <div className="relative mx-auto flex min-h-screen max-w-6xl flex-col justify-center px-6 py-16">
        <p className="label mb-4">
          <span
            className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle"
            style={{ background: source === "live" ? "#33d17a" : "#f5a623" }}
          />
          BattleBots Pro League 2026 · {competitors.length} competitors ·{" "}
          {source === "live" ? "live API" : "snapshot"}
        </p>

        <h1 className="display text-[18vw] leading-[0.8] sm:text-[13rem]">
          WRECK<span className="text-bb-red">ED</span>
        </h1>

        <p className="mt-6 max-w-2xl text-lg text-bb-chrome">
          A top-trumps card arena for the Pro League. Draw two bots, trump a stat,
          then let an AI that has actually read their fight record ruin their day.
          <span className="text-bb-bone"> Every number is real.</span>
        </p>

        <div className="mt-9 flex flex-wrap items-center gap-4">
          <Link
            href="/arena"
            className="brackets display bg-bb-red px-10 py-5 text-3xl text-white transition-transform hover:scale-[1.04] active:scale-95"
          >
            Enter the arena
          </Link>
          <Link
            href="/intel"
            className="display border border-bb-steel px-8 py-5 text-2xl transition-colors hover:bg-white/10"
          >
            Power rankings
          </Link>
        </div>

        {/* Top 3 teaser */}
        <div className="mt-14 grid max-w-3xl gap-3 sm:grid-cols-3">
          {top.map(({ bot, power }, i) => (
            <div key={bot.slug} className="plate flex items-center gap-3 px-4 py-3">
              <span className="stencil text-3xl text-bb-red">{i + 1}</span>
              <div className="min-w-0">
                <div className="display truncate text-xl">{bot.name}</div>
                <div className="label !text-[9px]">Power {power}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}

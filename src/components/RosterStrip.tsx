import Image from "next/image";
import type { Bot } from "@/lib/bbpl/client";
import { WEAPON_COLORS } from "@/lib/weapons";

/**
 * The whole field, scrolling past. Every machine in the Pro League, so the
 * front page states the size of the dataset rather than describing it.
 *
 * The list is rendered twice and the track translated by exactly -50%, which
 * is what makes the loop seamless; the duplicate is `aria-hidden` so a screen
 * reader hears the roster once.
 */
export default function RosterStrip({ bots }: { bots: Bot[] }) {
  const row = (hidden: boolean) => (
    <ul className="flex shrink-0 items-end gap-8 px-4" aria-hidden={hidden}>
      {bots.map((bot) => (
        <li key={bot.slug} className="group flex w-24 flex-col items-center gap-1">
          <Image
            src={bot.image}
            alt={hidden ? "" : bot.name}
            width={96}
            height={64}
            className="h-16 w-24 object-contain opacity-55 transition-all duration-300 group-hover:scale-110 group-hover:opacity-100"
          />
          <span
            className="label w-full truncate text-center !text-[8px] !tracking-wider transition-colors"
            style={{ color: WEAPON_COLORS[bot.weapon.class] }}
          >
            {bot.name}
          </span>
        </li>
      ))}
    </ul>
  );

  return (
    <div
      className="relative flex overflow-hidden border-y border-bb-steel bg-bb-panel/40 py-3"
      style={{
        maskImage: "linear-gradient(90deg, transparent, #000 8%, #000 92%, transparent)",
        WebkitMaskImage:
          "linear-gradient(90deg, transparent, #000 8%, #000 92%, transparent)",
      }}
    >
      <div className="marquee flex">
        {row(false)}
        {row(true)}
      </div>
    </div>
  );
}

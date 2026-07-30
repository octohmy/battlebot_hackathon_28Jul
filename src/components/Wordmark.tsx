/**
 * RED CORNER BLUE BOT.
 *
 * The mark is the premise: two corners, and the colour of each word is the
 * colour of the side it names. Those two hexes are the same pair used by the
 * fighters, the meters, the radar and the announcer, so the logo is not
 * decoration sitting on top of the app — it is the app's own colour system
 * spelled out.
 *
 * Defined once here because it appears in four places (nav, hero, stinger,
 * icon) and a logo that drifts between them stops reading as a logo.
 */

import { SIDE } from "@/lib/theme";

export default function Wordmark({
  stacked = false,
  className,
}: {
  /** Two lines, corner over corner. The poster lockup. */
  stacked?: boolean;
  className?: string;
}) {
  return (
    <span
      className={["display inline-block leading-[0.86]", className]
        .filter(Boolean)
        .join(" ")}
    >
      <span className="whitespace-nowrap">
        <span style={{ color: SIDE.a.color }}>Red</span> Corner
      </span>
      {stacked ? <br /> : " "}
      <span className="whitespace-nowrap">
        <span style={{ color: SIDE.b.color }}>Blue</span> Bot
      </span>
    </span>
  );
}

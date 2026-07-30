"use client";

import { useEffect } from "react";
import type { Bot } from "@/lib/bbpl/client";
import { SEASON_LABEL } from "@/lib/fights";
import { SIDE } from "@/lib/theme";
import {
  compareTelemetry,
  ORIGIN_COLORS,
  ORIGIN_LABELS,
  type Origin,
} from "@/lib/telemetry";

/**
 * Every field we hold on the two bots in the ring, side by side.
 *
 * The six trump stats on the cards are a fraction of what is actually loaded —
 * this is the rest of it: the full career block, the full season block, the
 * season list, and the scraped fight log, each row tagged with which source it
 * came from. Nothing here is derived for show; it is the same data the AI is
 * handed, which is the point.
 */

const ORIGINS: Origin[] = ["season", "career", "fights", "roster"];

export default function TelemetryDrawer({
  a,
  b,
  open,
  onClose,
}: {
  a: Bot;
  b: Bot;
  open: boolean;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const rows = compareTelemetry(a, b);
  const live = rows.filter((r) => !r.a?.missing || !r.b?.missing).length;

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-[2px]"
          onClick={onClose}
          aria-hidden
        />
      )}

      <aside
        aria-hidden={!open}
        className={[
          "fixed right-0 top-0 z-[71] flex h-full w-[min(29rem,100vw)] flex-col border-l border-bb-steel bg-bb-panel transition-transform duration-300 ease-out",
          open ? "translate-x-0" : "translate-x-full",
        ].join(" ")}
      >
        <header className="flex items-start justify-between gap-3 border-b border-bb-steel px-4 py-3">
          <div>
            <h2 className="display text-3xl">Live data feed</h2>
            <p className="mt-1 text-[11px] leading-snug text-bb-chrome">
              {live} populated fields across both machines, from three sources.
              This is the same block the AI is grounded on.
            </p>
          </div>
          <button
            onClick={onClose}
            className="label border border-bb-steel px-2 py-1 hover:bg-white/10"
            aria-label="Close the data feed"
          >
            Esc
          </button>
        </header>

        {/* Source legend — every row is tagged, so the key is not optional. */}
        <div className="flex flex-wrap gap-x-3 gap-y-1 border-b border-bb-steel px-4 py-2">
          {ORIGINS.map((o) => (
            <span
              key={o}
              className="flex items-center gap-1.5 text-[10px] text-bb-chrome"
              title={ORIGIN_LABELS[o]}
            >
              <span
                className="inline-block h-2 w-2"
                style={{ background: ORIGIN_COLORS[o] }}
              />
              {o === "fights" ? SEASON_LABEL : o}
            </span>
          ))}
        </div>

        <div className="grid grid-cols-[1fr_auto_1fr] items-baseline gap-2 border-b border-bb-steel px-4 py-2">
          <span
            className="display truncate text-lg"
            style={{ color: SIDE.a.color }}
          >
            {a.name}
          </span>
          <span className="label !text-[9px]">vs</span>
          <span
            className="display truncate text-right text-lg"
            style={{ color: SIDE.b.color }}
          >
            {b.name}
          </span>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <table className="w-full border-collapse text-[12px]">
            <caption className="sr-only">
              Head-to-head field comparison for {a.name} and {b.name}
            </caption>
            <tbody>
              {rows.map((row) => (
                <tr key={row.label} className="border-b border-bb-steel/40">
                  <td
                    className={[
                      "stencil w-[38%] px-4 py-1.5 text-right tabular-nums",
                      row.a?.missing ? "text-bb-steel" : "",
                      row.leader === "a" ? "text-bb-bone" : "text-bb-chrome",
                    ].join(" ")}
                  >
                    {row.leader === "a" && (
                      <span className="mr-1" style={{ color: SIDE.a.color }}>
                        ◀
                      </span>
                    )}
                    {row.a?.value ?? "—"}
                  </td>
                  <td className="px-1 py-1.5 text-center">
                    <span
                      className="label block !text-[9px] !tracking-normal"
                      title={ORIGIN_LABELS[row.origin]}
                    >
                      <span
                        className="mr-1 inline-block h-1.5 w-1.5 align-middle"
                        style={{ background: ORIGIN_COLORS[row.origin] }}
                      />
                      {row.label}
                    </span>
                  </td>
                  <td
                    className={[
                      "stencil w-[38%] px-4 py-1.5 tabular-nums",
                      row.b?.missing ? "text-bb-steel" : "",
                      row.leader === "b" ? "text-bb-bone" : "text-bb-chrome",
                    ].join(" ")}
                  >
                    {row.b?.value ?? "—"}
                    {row.leader === "b" && (
                      <span className="ml-1" style={{ color: SIDE.b.color }}>
                        ▶
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <footer className="border-t border-bb-steel px-4 py-2 text-[10px] leading-snug text-bb-steel">
          <span className="text-bb-bone">NO DATA</span> means the figure is
          absent at source, not zero. Weapon types marked{" "}
          <span className="text-bb-bone">*</span> are left blank by
          battlebots.com and are our classification.
        </footer>
      </aside>
    </>
  );
}

"use client";

import { useEffect, useRef } from "react";
import { useArena } from "@/lib/store";

/**
 * The UI takes damage.
 *
 * As rounds resolve, the page itself degrades: cracks spider across the glass,
 * the whole frame kicks, chromatic fringing creeps in, and scanlines thicken.
 * Everything is driven by the single `damage` value (0→1) in the store.
 *
 * Cracks are drawn once to a canvas at full intensity and then revealed
 * progressively by clip-height, so nothing re-renders per frame.
 */

const CRACK_SEED = 20260728;

/** Deterministic PRNG so the crack pattern is stable across re-renders. */
function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

function drawCracks(canvas: HTMLCanvasElement) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = window.innerWidth;
  const h = window.innerHeight;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, h);

  const rand = rng(CRACK_SEED);

  // A few impact points, each throwing out branching fractures.
  const impacts = [
    { x: w * 0.28, y: h * 0.42 },
    { x: w * 0.72, y: h * 0.55 },
    { x: w * 0.5, y: h * 0.2 },
  ];

  for (const impact of impacts) {
    const spokes = 7 + Math.floor(rand() * 5);
    for (let i = 0; i < spokes; i++) {
      const angle = (i / spokes) * Math.PI * 2 + rand() * 0.5;
      let x = impact.x;
      let y = impact.y;
      let a = angle;

      ctx.beginPath();
      ctx.moveTo(x, y);
      const segments = 5 + Math.floor(rand() * 5);
      for (let s = 0; s < segments; s++) {
        const len = 40 + rand() * 90;
        a += (rand() - 0.5) * 0.7;
        x += Math.cos(a) * len;
        y += Math.sin(a) * len;
        ctx.lineTo(x, y);

        // Occasional splinter off the main fracture.
        if (rand() > 0.65) {
          const bx = x + Math.cos(a + 1.1) * (20 + rand() * 45);
          const by = y + Math.sin(a + 1.1) * (20 + rand() * 45);
          ctx.moveTo(x, y);
          ctx.lineTo(bx, by);
          ctx.moveTo(x, y);
        }
      }
      ctx.strokeStyle = "rgba(255,255,255,0.5)";
      ctx.lineWidth = 0.6 + rand() * 1.1;
      ctx.stroke();

      // Dark inner line gives the crack depth.
      ctx.strokeStyle = "rgba(0,0,0,0.55)";
      ctx.lineWidth = 2.5;
      ctx.globalAlpha = 0.25;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // Impact bloom
    const g = ctx.createRadialGradient(impact.x, impact.y, 0, impact.x, impact.y, 90);
    g.addColorStop(0, "rgba(255,255,255,0.16)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(impact.x - 90, impact.y - 90, 180, 180);
  }
}

export default function DamageOverlay() {
  const damage = useArena((s) => s.damage);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const prev = useRef(0);
  const shellRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    drawCracks(canvas);
    const onResize = () => drawCracks(canvas);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Kick the page whenever damage jumps.
  useEffect(() => {
    if (damage > prev.current + 0.01) {
      const el = document.body;
      el.classList.remove("shake");
      // Force reflow so the animation restarts even on rapid hits.
      void el.offsetWidth;
      el.classList.add("shake");
      const t = setTimeout(() => el.classList.remove("shake"), 600);
      prev.current = damage;
      return () => clearTimeout(t);
    }
    prev.current = damage;
  }, [damage]);

  return (
    <div
      ref={shellRef}
      aria-hidden
      className="pointer-events-none fixed inset-0 z-50"
      style={{ opacity: damage > 0.02 ? 1 : 0, transition: "opacity 400ms" }}
    >
      {/* Cracks, revealed from the top as damage climbs */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 transition-[clip-path] duration-700 ease-out"
        style={{
          opacity: Math.min(1, damage * 1.3),
          clipPath: `inset(0 0 ${Math.max(0, 100 - damage * 130)}% 0)`,
        }}
      />

      {/* Chromatic fringe at the edges */}
      <div
        className="absolute inset-0 mix-blend-screen transition-opacity duration-500"
        style={{
          opacity: damage * 0.5,
          background:
            "radial-gradient(120% 100% at 0% 50%, #e1060033, transparent 45%), radial-gradient(120% 100% at 100% 50%, #3aa0dc33, transparent 45%)",
        }}
      />

      {/* Vignette closes in as things get bad */}
      <div
        className="absolute inset-0 transition-opacity duration-700"
        style={{
          opacity: damage * 0.85,
          background: `radial-gradient(${110 - damage * 35}% ${
            100 - damage * 30
          }% at 50% 50%, transparent 40%, #000 100%)`,
        }}
      />

      {/* Heavier scanlines under load */}
      <div
        className="absolute inset-0 transition-opacity duration-700"
        style={{
          opacity: damage * 0.4,
          background:
            "repeating-linear-gradient(180deg, rgba(0,0,0,0.5) 0 1px, transparent 1px 4px)",
        }}
      />
    </div>
  );
}

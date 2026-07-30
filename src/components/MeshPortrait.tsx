"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

/**
 * The bot photo, rebuilt as a rotating volumetric point cloud.
 *
 * The transparent cutouts are sampled on an offscreen canvas, then given real
 * thickness: a distance transform of the alpha mask says how far each pixel is
 * from the silhouette edge, and that drives how far the point is pushed out of
 * the picture plane. Points are emitted on a front *and* a back shell, so the
 * result is a closed volume — it survives a full 360° turn instead of going
 * paper-thin edge-on, which is what a flat scatter does.
 *
 * Everything animated lives in the shader: two position attributes (scattered
 * and resolved) are uploaded once and a `uProgress` uniform lerps between them,
 * so morphing costs nothing per frame on the CPU.
 *
 * Interaction (auto-spin, pointer parallax, drag-to-orbit with inertia) is held
 * in a mutable ref rather than React state — at 60fps a setState per pointer
 * event would re-render the whole card.
 */

/**
 * Points per shell, doubled across front+back for the real total.
 *
 * Sized against how much of the frame a bot fills once cropped: at ~380px
 * across, anything under about fifteen thousand reads as a sparse stipple
 * rather than a surface. It is still one draw call either way.
 */
const TARGET_POINTS = 20000;
/** Working resolution of the offscreen sample. Caps the point budget. */
const SAMPLE_PX = 320;
/** Half-thickness of the volume, in world units against a 2.2-unit height. */
const DEPTH = 0.52;
/**
 * Share of samples that also get an interior point at a random depth.
 *
 * Front and back shells alone are hollow, and side-on during the turn you see
 * straight through the gap between them — two curved sheets, not a machine.
 * Scattering some points through the middle closes it into a solid body for
 * the price of a third of the point count.
 */
const FILL_RATE = 0.4;
/** Radians per second of idle rotation — one full turn every ~26s. */
const SPIN_SPEED = 0.24;
/** Velocity retained per frame after a throw. */
const FRICTION = 0.93;

const vertexShader = /* glsl */ `
  uniform float uProgress;
  uniform float uTime;
  uniform float uSize;
  uniform float uDamage;
  uniform float uHover;
  uniform vec3  uAccent;

  attribute vec3  aScatter;
  attribute vec3  aColor;
  attribute float aSeed;
  /** 1 at the silhouette edge, 0 at the core — drives the rim light. */
  attribute float aEdge;
  /** +1 front shell, -1 back shell, 0 interior fill. */
  attribute float aFace;

  varying vec3 vColor;
  varying float vFade;

  void main() {
    // Ease so points arrive at slightly different times — reads as assembly
    // rather than a uniform slide.
    float stagger = clamp((uProgress - aSeed * 0.35) / 0.65, 0.0, 1.0);
    float e = stagger * stagger * (3.0 - 2.0 * stagger);

    vec3 pos = mix(aScatter, position, e);

    // Idle drift while scattered, plus a shake that grows with damage.
    float idle = (1.0 - e) * 0.12;
    pos.x += sin(uTime * 0.7 + aSeed * 40.0) * idle;
    pos.y += cos(uTime * 0.9 + aSeed * 33.0) * idle;
    pos.z += sin(uTime * 0.5 + aSeed * 21.0) * idle;

    if (uDamage > 0.0) {
      float j = uDamage * 0.06;
      pos.x += sin(uTime * 28.0 + aSeed * 90.0) * j;
      pos.y += cos(uTime * 31.0 + aSeed * 70.0) * j;
    }

    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mv;

    // uSize is in "pixels at one unit of depth" — dividing by depth gives true
    // perspective falloff. Scattered points render larger so the cloud reads as
    // volume before it collapses into the image.
    gl_PointSize = (uSize * (1.0 + (1.0 - e) * 1.1)) / -mv.z;

    // Depth cue: the camera sits at z=3.4, so view-space z runs roughly
    // -2.4 (near) to -4.4 (far). Near points stay bright, far ones sink into
    // the dark — this is what actually sells the rotation as solid.
    float near = smoothstep(-4.3, -2.5, mv.z);
    vFade = 0.35 + 0.65 * near;

    // Front shell is lit, back shell is the machine's dark side, and the
    // interior sits between the two so the body has no visible hollow.
    float lit = aFace > 0.5 ? 1.0 : (aFace < -0.5 ? 0.34 : 0.6);

    vec3 base = mix(vec3(1.0, 0.15, 0.0), aColor * lit, e);
    // Rim light along the silhouette, hotter on hover.
    base += uAccent * aEdge * aEdge * (0.5 + 0.6 * uHover) * e;
    vColor = base;
  }
`;

const fragmentShader = /* glsl */ `
  varying vec3 vColor;
  varying float vFade;

  void main() {
    // Hard round points. Opaque on purpose: the depth buffer has to do real
    // occlusion or the back shell shows straight through the front one.
    vec2 d = gl_PointCoord - vec2(0.5);
    if (dot(d, d) > 0.24) discard;
    gl_FragColor = vec4(vColor * vFade, 1.0);
  }
`;

interface Sampled {
  positions: Float32Array;
  scatter: Float32Array;
  colors: Float32Array;
  seeds: Float32Array;
  edges: Float32Array;
  faces: Float32Array;
  count: number;
}

/**
 * Two-pass chamfer distance transform over the alpha mask: how far is each
 * opaque pixel from the nearest transparent one. Cheap (two linear sweeps) and
 * plenty accurate at the 220px working size.
 */
function distanceField(mask: Uint8Array, w: number, h: number): Float32Array {
  const INF = 1e9;
  const d = new Float32Array(w * h);
  for (let i = 0; i < d.length; i++) d[i] = mask[i] ? INF : 0;

  const A = 1;
  const B = Math.SQRT2;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (d[i] === 0) continue;
      let m = d[i];
      if (x > 0) m = Math.min(m, d[i - 1] + A);
      if (y > 0) m = Math.min(m, d[i - w] + A);
      if (x > 0 && y > 0) m = Math.min(m, d[i - w - 1] + B);
      if (x < w - 1 && y > 0) m = Math.min(m, d[i - w + 1] + B);
      d[i] = m;
    }
  }
  for (let y = h - 1; y >= 0; y--) {
    for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x;
      if (d[i] === 0) continue;
      let m = d[i];
      if (x < w - 1) m = Math.min(m, d[i + 1] + A);
      if (y < h - 1) m = Math.min(m, d[i + w] + A);
      if (x < w - 1 && y < h - 1) m = Math.min(m, d[i + w + 1] + B);
      if (x > 0 && y < h - 1) m = Math.min(m, d[i + w - 1] + B);
      d[i] = m;
    }
  }
  return d;
}

async function sampleImage(src: string, height: number): Promise<Sampled | null> {
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.src = src;
  try {
    await img.decode();
  } catch {
    return null;
  }

  // Draw small — we only need one sample per emitted point.
  const scale = Math.min(1, SAMPLE_PX / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);

  // Alpha mask → distance field → per-pixel thickness. The bounding box of
  // the opaque pixels is tracked at the same time: the source cutouts carry
  // wildly different amounts of transparent margin, and mapping the whole
  // image would render one bot full-frame and the next one as a stamp in the
  // middle of an empty canvas.
  const mask = new Uint8Array(w * h);
  let opaque = 0;
  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x;
      if (data[p * 4 + 3] <= 40) continue;
      mask[p] = 1;
      opaque++;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (!opaque) return null;

  const df = distanceField(mask, w, h);
  let maxD = 0;
  for (let p = 0; p < df.length; p++) if (df[p] > maxD) maxD = df[p];
  // Normalise against a fraction of the peak so slim parts (weapons, wheels)
  // still get thickness instead of collapsing flat next to the chassis.
  const norm = Math.max(1, maxD * 0.7);

  const stride = Math.max(1, Math.round(opaque / TARGET_POINTS));

  const positions: number[] = [];
  const scatter: number[] = [];
  const colors: number[] = [];
  const seeds: number[] = [];
  const edges: number[] = [];
  const faces: number[] = [];

  // Fit the subject's bounding box inside a `height`-sided square, so every
  // bot arrives at the same on-screen size whatever its source framing. The
  // long edge sets the scale; the short one is whatever it is.
  const boxW = maxX - minX + 1;
  const boxH = maxY - minY + 1;
  const unitsPerPixel = height / Math.max(boxW, boxH);
  const planeW = boxW * unitsPerPixel;
  const planeH = boxH * unitsPerPixel;

  let seen = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x;
      if (!mask[p]) continue;
      if (seen++ % stride !== 0) continue;

      const i = p * 4;
      const r = data[i] / 255;
      const g = data[i + 1] / 255;
      const bl = data[i + 2] / 255;

      const dn = Math.min(1, df[p] / norm);
      // sqrt gives a rounded, ellipsoidal cross-section rather than a wedge.
      const thickness = Math.sqrt(dn) * DEPTH;
      const edge = Math.pow(1 - dn, 2.2);

      // Bright pixels bulge toward the camera. The photo is lit from the
      // front, so luminance is a usable stand-in for "this part sticks out",
      // and it breaks the otherwise perfectly symmetric lens into a shape.
      const luma = 0.299 * r + 0.587 * g + 0.114 * bl;
      const front = thickness * (0.7 + 0.6 * luma);
      const back = -thickness * 0.8;

      const px = ((x - minX) / boxW - 0.5) * planeW;
      const py = -((y - minY) / boxH - 0.5) * planeH;

      const shells: [number, number][] = [
        [front, 1],
        [back, -1],
      ];
      if (Math.random() < FILL_RATE) {
        shells.push([back + (front - back) * Math.random(), 0]);
      }

      for (const [z, face] of shells) {
        positions.push(px, py, z);

        // Scatter origin: a shell around the subject.
        const theta = Math.random() * Math.PI * 2;
        const radius = 1.6 + Math.random() * 2.4;
        scatter.push(
          Math.cos(theta) * radius,
          (Math.random() - 0.5) * planeH * 2.6,
          Math.sin(theta) * radius - 1.0,
        );

        colors.push(r, g, bl);
        seeds.push(Math.random());
        edges.push(edge);
        faces.push(face);
      }
    }
  }

  return {
    positions: new Float32Array(positions),
    scatter: new Float32Array(scatter),
    colors: new Float32Array(colors),
    seeds: new Float32Array(seeds),
    edges: new Float32Array(edges),
    faces: new Float32Array(faces),
    count: seeds.length,
  };
}

/**
 * Sampled clouds, kept between mounts.
 *
 * Sampling is the expensive half of this component: decode the image, run a
 * distance transform over it, then walk every opaque pixel emitting points.
 * Doing that again every time a bot enters the ring is what made the first
 * frame of a fight feel like a page load.
 *
 * The cache is small and deliberately capped — one entry is roughly two
 * megabytes of typed arrays, so a handful is a fair trade and the whole roster
 * is not. Eviction is oldest-first, which matches how the app is used: you
 * come back to the bots you just fought with, not the ones from ten fights ago.
 */
const CACHE_LIMIT = 6;
const meshCache = new Map<string, Sampled>();

const cacheKey = (src: string, height: number) => `${src}|${height}`;

function remember(key: string, data: Sampled): void {
  meshCache.set(key, data);
  while (meshCache.size > CACHE_LIMIT) {
    const oldest = meshCache.keys().next().value;
    if (oldest === undefined) break;
    meshCache.delete(oldest);
  }
}

/**
 * Samples a bot ahead of time, so the cloud is ready the moment it is needed.
 *
 * Called while a broadcast stinger is covering the screen: the work happens
 * during the ~500ms nobody can see, and the fight opens with the machines
 * already assembled instead of resolving out of nothing.
 */
export async function prewarmMesh(src: string, height = 2.2): Promise<void> {
  const key = cacheKey(src, height);
  if (meshCache.has(key)) return;
  const data = await sampleImage(src, height);
  if (data) remember(key, data);
}

/**
 * Live pointer/orbit state.
 *
 * Deliberately a plain mutable object behind a ref rather than React state:
 * it is touched on every pointer move and integrated every frame, and a
 * setState at that rate would re-render the whole card sixty times a second in
 * order to move a camera.
 *
 * It is owned entirely by `MeshPortrait`, which is also the only place that
 * writes to it. The cloud inside the canvas never sees it — it is handed an
 * `advance(dt)` function and gets back a read-only pose.
 */
interface Control {
  dragging: boolean;
  yaw: number;
  pitch: number;
  /** Throw velocity, radians per frame. */
  vx: number;
  vy: number;
  /** Eased pointer position over the element, -0.5→0.5. */
  px: number;
  py: number;
  targetPx: number;
  targetPy: number;
  hover: number;
  targetHover: number;
  /** Set by a double-click to ease everything back to the front view. */
  recentring: boolean;
}

/** What the renderer needs out of a frame of input. */
interface Pose {
  yaw: number;
  pitch: number;
  hover: number;
}

function Cloud({
  src,
  resolved,
  damage,
  height,
  accent,
  advance,
}: {
  src: string;
  resolved: boolean;
  damage: number;
  height: number;
  accent: string;
  /** Steps the input model by `dt` and reports where the camera should be. */
  advance: (dt: number) => Pose;
}) {
  const matRef = useRef<THREE.ShaderMaterial>(null);
  const groupRef = useRef<THREE.Group>(null);
  const { invalidate } = useThree();

  // A prewarmed bot is already in the cache, so it renders on the first frame
  // with no assembly gap. State here exists only to re-render once an
  // un-cached sample finishes.
  const key = cacheKey(src, height);
  const [, bump] = useState(0);
  const data = meshCache.get(key) ?? null;

  useEffect(() => {
    if (meshCache.has(key)) return;
    let live = true;
    void sampleImage(src, height).then((d) => {
      if (!live || !d) return;
      remember(key, d);
      bump((n) => n + 1);
      invalidate();
    });
    return () => {
      live = false;
    };
  }, [key, src, height, invalidate]);

  const geometry = useMemo(() => {
    if (!data) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(data.positions, 3));
    g.setAttribute("aScatter", new THREE.BufferAttribute(data.scatter, 3));
    g.setAttribute("aColor", new THREE.BufferAttribute(data.colors, 3));
    g.setAttribute("aSeed", new THREE.BufferAttribute(data.seeds, 1));
    g.setAttribute("aEdge", new THREE.BufferAttribute(data.edges, 1));
    g.setAttribute("aFace", new THREE.BufferAttribute(data.faces, 1));
    return g;
  }, [data]);

  const uniforms = useMemo(
    () => ({
      uProgress: { value: 0 },
      uTime: { value: 0 },
      uSize: { value: 13 },
      uDamage: { value: 0 },
      uHover: { value: 0 },
      uAccent: { value: new THREE.Color(accent) },
    }),
    // Accent is pushed in useFrame; rebuilding uniforms would drop uProgress.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useEffect(() => {
    uniforms.uAccent.value.set(accent);
  }, [accent, uniforms]);

  useFrame((state, delta) => {
    const m = matRef.current;
    const g = groupRef.current;
    if (!m || !g) return;

    // Clamp: a backgrounded tab hands back a huge delta on return.
    const dt = Math.min(delta, 0.05);

    m.uniforms.uTime.value = state.clock.elapsedTime;
    const target = resolved ? 1 : 0;
    const cur = m.uniforms.uProgress.value as number;
    m.uniforms.uProgress.value = cur + (target - cur) * Math.min(1, dt * 3.2);
    m.uniforms.uDamage.value = damage;

    const pose = advance(dt);
    m.uniforms.uHover.value = pose.hover;
    g.rotation.y = pose.yaw;
    g.rotation.x = pose.pitch;
  });

  // Note: no dispose-on-unmount. The BufferAttributes wrap arrays owned by the
  // cache, and a cached bot is expected to come straight back — freeing the
  // GPU buffers here would throw away exactly what the cache is holding.
  // Geometry is rebuilt per mount from the same arrays, which is cheap.

  if (!geometry) return null;

  return (
    <group ref={groupRef}>
      <points geometry={geometry} frustumCulled={false}>
        <shaderMaterial
          ref={matRef}
          uniforms={uniforms}
          vertexShader={vertexShader}
          fragmentShader={fragmentShader}
          transparent={false}
          depthWrite
          depthTest
        />
      </points>
    </group>
  );
}

export default function MeshPortrait({
  src,
  resolved = true,
  damage = 0,
  accent = "#e10600",
  spin = true,
  interactive = true,
  height = 2.2,
  distance = 3.4,
  showHint = false,
  className,
}: {
  src: string;
  /** False scatters the points; true assembles the image. */
  resolved?: boolean;
  damage?: number;
  /** Rim-light colour along the silhouette. */
  accent?: string;
  /** Slow idle rotation. */
  spin?: boolean;
  /** Pointer parallax and drag-to-orbit. */
  interactive?: boolean;
  height?: number;
  /** Camera distance; raise it to fit a taller subject. */
  distance?: number;
  /** Shows a "drag to spin" affordance until the user first drags. */
  showHint?: boolean;
  className?: string;
}) {
  const [everDragged, setEverDragged] = useState(false);

  const control = useRef<Control>({
    dragging: false,
    yaw: 0,
    pitch: 0,
    vx: 0,
    vy: 0,
    px: 0,
    py: 0,
    targetPx: 0,
    targetPy: 0,
    hover: 0,
    targetHover: 0,
    recentring: false,
  });
  const last = useRef({ x: 0, y: 0 });

  /**
   * One step of the input model, called from inside the render loop.
   *
   * Integration lives here, next to the handlers that feed it, so the whole
   * mutable story is in one component — the canvas only ever reads the result.
   */
  const advance = useCallback(
    (dt: number): Pose => {
      const c = control.current;

      c.hover += (c.targetHover - c.hover) * Math.min(1, dt * 6);

      if (c.recentring) {
        c.yaw += (0 - c.yaw) * Math.min(1, dt * 4);
        c.pitch += (0 - c.pitch) * Math.min(1, dt * 4);
        c.vx = 0;
        c.vy = 0;
        if (Math.abs(c.yaw) < 0.01 && Math.abs(c.pitch) < 0.01) {
          c.yaw = 0;
          c.pitch = 0;
          c.recentring = false;
        }
      } else if (!c.dragging) {
        // Coast from a throw, then fall back to the idle turn.
        c.yaw += c.vx;
        c.pitch += c.vy;
        c.vx *= FRICTION;
        c.vy *= FRICTION;
        if (Math.abs(c.vx) < 0.0004) c.vx = 0;
        if (Math.abs(c.vy) < 0.0004) c.vy = 0;
        if (spin) c.yaw += SPIN_SPEED * dt;
        // Pitch always settles back to level; yaw is free to keep turning.
        c.pitch += (0 - c.pitch) * Math.min(1, dt * 1.2);
      }

      c.px += (c.targetPx - c.px) * Math.min(1, dt * 5);
      c.py += (c.targetPy - c.py) * Math.min(1, dt * 5);

      return {
        yaw: c.yaw + c.px * 0.5,
        pitch: Math.max(-0.7, Math.min(0.7, c.pitch + c.py * 0.3)),
        hover: c.hover,
      };
    },
    [spin],
  );

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!interactive) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    const c = control.current;
    c.dragging = true;
    c.recentring = false;
    c.vx = 0;
    c.vy = 0;
    last.current = { x: e.clientX, y: e.clientY };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!interactive) return;
    const c = control.current;
    const r = e.currentTarget.getBoundingClientRect();
    c.targetPx = (e.clientX - r.left) / r.width - 0.5;
    c.targetPy = (e.clientY - r.top) / r.height - 0.5;
    c.targetHover = 1;

    if (!c.dragging) return;
    // Keep the drag to ourselves — the card underneath also tilts on move.
    e.stopPropagation();
    const yawStep = ((e.clientX - last.current.x) / r.width) * 3.4;
    const pitchStep = ((e.clientY - last.current.y) / r.height) * 2.0;
    last.current = { x: e.clientX, y: e.clientY };
    c.yaw += yawStep;
    c.pitch += pitchStep;
    // Remember the last motion as throw velocity.
    c.vx = yawStep;
    c.vy = pitchStep;
    if (!everDragged) setEverDragged(true);
  };

  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    const c = control.current;
    if (!c.dragging) return;
    c.dragging = false;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  return (
    // The caller owns the outer box's position and size; we never merge our own
    // positioning into their class list. `relative` and `absolute inset-0` in
    // one string is not a last-one-wins fight — Tailwind emits `relative`
    // after `absolute`, so it silently won and collapsed the canvas to its
    // 300x150 default. The positioning context the hint needs is a wrapper.
    <div
      className={className}
      style={{ touchAction: "none" }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onPointerLeave={(e) => {
        const c = control.current;
        c.targetPx = 0;
        c.targetPy = 0;
        c.targetHover = 0;
        endDrag(e);
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        control.current.recentring = true;
      }}
    >
      <div
        className={[
          "relative h-full w-full",
          interactive ? "cursor-grab active:cursor-grabbing" : "",
        ].join(" ")}
      >
        <Canvas
          dpr={[1, 1.75]}
          gl={{ antialias: false, alpha: true, powerPreference: "high-performance" }}
          camera={{ position: [0, 0, distance], fov: 45 }}
          style={{ background: "transparent" }}
        >
          <Cloud
            src={src}
            resolved={resolved}
            damage={damage}
            height={height}
            accent={accent}
            advance={advance}
          />
        </Canvas>

        {showHint && interactive && !everDragged && (
          <span className="label pointer-events-none absolute bottom-1 left-1/2 -translate-x-1/2 !text-[8px] !tracking-[0.2em] text-bb-steel opacity-70">
            drag to spin · double-click to reset
          </span>
        )}
      </div>
    </div>
  );
}

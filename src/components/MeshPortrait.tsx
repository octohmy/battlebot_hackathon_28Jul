"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

/**
 * The bot photo, rendered as a GPU point cloud that resolves out of a chaotic
 * 3D scatter into the image.
 *
 * The transparent PNG cutouts are sampled on an offscreen canvas: every
 * sufficiently opaque pixel becomes one point carrying its own colour. Two
 * position attributes are uploaded once (scattered and resolved) and a single
 * `uProgress` uniform lerps between them on the GPU, so morphing costs nothing
 * per frame on the CPU.
 *
 * Sampling stride adapts to the image so the count lands near TARGET_POINTS,
 * which keeps this at 60fps on a laptop even with two portraits on screen.
 */

const TARGET_POINTS = 14000;

const vertexShader = /* glsl */ `
  uniform float uProgress;
  uniform float uTime;
  uniform float uSize;
  uniform float uDamage;

  attribute vec3 aScatter;
  attribute vec3 aColor;
  attribute float aSeed;

  varying vec3 vColor;
  varying float vAlpha;

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

    vColor = aColor;
    // Scattered points glow hot; resolved points settle to true colour.
    vAlpha = 0.35 + e * 0.65;
  }
`;

const fragmentShader = /* glsl */ `
  uniform float uProgress;
  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    // Round, soft-edged points.
    vec2 d = gl_PointCoord - vec2(0.5);
    float r = dot(d, d);
    if (r > 0.25) discard;
    float edge = smoothstep(0.25, 0.05, r);

    // Unresolved points lean toward the brand red, so the assembly reads hot.
    vec3 hot = mix(vec3(1.0, 0.15, 0.0), vColor, uProgress);
    gl_FragColor = vec4(hot, vAlpha * edge);
  }
`;

interface Sampled {
  positions: Float32Array;
  scatter: Float32Array;
  colors: Float32Array;
  seeds: Float32Array;
  count: number;
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
  const scale = Math.min(1, 220 / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);

  // Count opaque pixels first so the stride can hit the point budget.
  let opaque = 0;
  for (let i = 3; i < data.length; i += 4) if (data[i] > 40) opaque++;
  const stride = Math.max(1, Math.round(opaque / TARGET_POINTS));

  const positions: number[] = [];
  const scatter: number[] = [];
  const colors: number[] = [];
  const seeds: number[] = [];

  const aspect = w / h;
  const planeH = height;
  const planeW = height * aspect;

  let seen = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (data[i + 3] <= 40) continue;
      if (seen++ % stride !== 0) continue;

      positions.push(
        (x / w - 0.5) * planeW,
        -(y / h - 0.5) * planeH,
        // Slight depth jitter stops it looking like a flat decal.
        (Math.random() - 0.5) * 0.04,
      );

      // Scatter origin: a shell around the subject.
      const theta = Math.random() * Math.PI * 2;
      const radius = 1.6 + Math.random() * 2.4;
      scatter.push(
        Math.cos(theta) * radius,
        (Math.random() - 0.5) * planeH * 2.6,
        Math.sin(theta) * radius - 1.0,
      );

      colors.push(data[i] / 255, data[i + 1] / 255, data[i + 2] / 255);
      seeds.push(Math.random());
    }
  }

  return {
    positions: new Float32Array(positions),
    scatter: new Float32Array(scatter),
    colors: new Float32Array(colors),
    seeds: new Float32Array(seeds),
    count: seeds.length,
  };
}

function Points({
  src,
  resolved,
  damage,
  height,
}: {
  src: string;
  resolved: boolean;
  damage: number;
  height: number;
}) {
  const [data, setData] = useState<Sampled | null>(null);
  const matRef = useRef<THREE.ShaderMaterial>(null);
  const { invalidate } = useThree();

  useEffect(() => {
    let live = true;
    void sampleImage(src, height).then((d) => {
      if (live) {
        setData(d);
        invalidate();
      }
    });
    return () => {
      live = false;
    };
  }, [src, height, invalidate]);

  const geometry = useMemo(() => {
    if (!data) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(data.positions, 3));
    g.setAttribute("aScatter", new THREE.BufferAttribute(data.scatter, 3));
    g.setAttribute("aColor", new THREE.BufferAttribute(data.colors, 3));
    g.setAttribute("aSeed", new THREE.BufferAttribute(data.seeds, 1));
    return g;
  }, [data]);

  const uniforms = useMemo(
    () => ({
      uProgress: { value: 0 },
      uTime: { value: 0 },
      // ~3.5px at the camera's 3.4-unit distance.
      uSize: { value: 12 },
      uDamage: { value: 0 },
    }),
    [],
  );

  useFrame((state, delta) => {
    const m = matRef.current;
    if (!m) return;
    m.uniforms.uTime.value = state.clock.elapsedTime;
    const target = resolved ? 1 : 0;
    const cur = m.uniforms.uProgress.value as number;
    // Critically-damped-ish approach; fast enough to feel snappy on flip.
    m.uniforms.uProgress.value = cur + (target - cur) * Math.min(1, delta * 3.2);
    m.uniforms.uDamage.value = damage;
  });

  useEffect(() => () => geometry?.dispose(), [geometry]);

  if (!geometry) return null;

  return (
    <points geometry={geometry} frustumCulled={false}>
      <shaderMaterial
        ref={matRef}
        uniforms={uniforms}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        transparent
        depthWrite={false}
        blending={THREE.NormalBlending}
      />
    </points>
  );
}

export default function MeshPortrait({
  src,
  resolved = true,
  damage = 0,
  className,
}: {
  src: string;
  /** False scatters the points; true assembles the image. */
  resolved?: boolean;
  damage?: number;
  className?: string;
}) {
  return (
    <div className={className}>
      <Canvas
        dpr={[1, 1.75]}
        gl={{ antialias: false, alpha: true, powerPreference: "high-performance" }}
        camera={{ position: [0, 0, 3.4], fov: 45 }}
        style={{ background: "transparent" }}
      >
        <Points src={src} resolved={resolved} damage={damage} height={2.2} />
      </Canvas>
    </div>
  );
}

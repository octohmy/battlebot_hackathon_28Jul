"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect } from "react";
import { cut, type Stinger } from "@/lib/broadcast";
import { unlockAudio } from "@/lib/audio";

/**
 * A link that cuts to the next page like a broadcast rather than loading it.
 *
 * The two halves matter equally:
 *
 *  - **Prefetch.** `next/link` already prefetches on viewport, and we prefetch
 *    again on mount and on pointer-enter. By the time the wipe is covering the
 *    screen the route is sitting in the router cache, so `push` resolves inside
 *    the covered window instead of after it.
 *  - **Cover.** Navigation happens at the point the stinger is fully opaque,
 *    so no amount of layout settling on the new page is ever visible.
 *
 * It stays a real `<a>`: middle-click, cmd-click and "open in new tab" all
 * behave normally, because those never reach the custom handler.
 */
export default function BroadcastLink({
  href,
  label,
  sub,
  kind = "wipe",
  className,
  children,
  onNavigate,
}: {
  href: string;
  /** Big type on the covering panel, e.g. "INTEL". */
  label?: string;
  sub?: string;
  kind?: Stinger;
  className?: string;
  children: React.ReactNode;
  onNavigate?: () => void;
}) {
  const router = useRouter();

  useEffect(() => {
    router.prefetch(href);
  }, [router, href]);

  const go = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>) => {
      // Leave the browser's own affordances alone.
      if (
        e.defaultPrevented ||
        e.metaKey ||
        e.ctrlKey ||
        e.shiftKey ||
        e.altKey ||
        e.button !== 0
      ) {
        return;
      }
      e.preventDefault();
      unlockAudio();
      onNavigate?.();
      void cut({
        kind,
        label: label ?? null,
        sub: sub ?? null,
        onCovered: () => router.push(href),
      });
    },
    [router, href, kind, label, sub, onNavigate],
  );

  return (
    <Link
      href={href}
      prefetch
      className={className}
      onClick={go}
      onPointerEnter={() => router.prefetch(href)}
    >
      {children}
    </Link>
  );
}

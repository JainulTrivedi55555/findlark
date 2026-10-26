'use client';
// A living background: warm light on paper. Mounted once in app/providers.tsx.
//
// Layers, back to front: paper gradient (the root's own background), light
// pools that drift slowly (CSS keyframes, transform only; the radial gradients
// fade to transparent themselves, so no blur filter), a static grain/fibre
// tile, a soft vignette. Two of the layers (far and near) also follow the
// pointer by a few px on desktop, for depth.
//
// Everything is in app/globals.css (.backdrop, .bd-*). This file only decides
// the intensity per screen and drives the pointer parallax and the pause.
import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { useBackdropState } from '@/lib/backdrop-store';

// Full strength where nobody is reading; calmer (40%, set in CSS) elsewhere.
const RICH_PATHS = new Set(['/', '/login']);

const FAR_PX = 6;
const NEAR_PX = 10;
const SMOOTHING = 0.08;

export function Backdrop() {
  const pathname = usePathname();
  const { rich, busy } = useBackdropState();
  const root = useRef<HTMLDivElement>(null);
  const far = useRef<HTMLDivElement>(null);
  const near = useRef<HTMLDivElement>(null);
  const mood = RICH_PATHS.has(pathname) || rich > 0 ? 'rich' : 'calm';

  // Stop the drift while the tab is hidden.
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const sync = () => el.setAttribute('data-paused', String(document.hidden));
    sync();
    document.addEventListener('visibilitychange', sync);
    return () => document.removeEventListener('visibilitychange', sync);
  }, []);

  // Pointer parallax: fine pointers on wide screens, never under reduced motion.
  useEffect(() => {
    const allowed = window.matchMedia('(pointer: fine) and (min-width: 641px) and (prefers-reduced-motion: no-preference)');
    if (!allowed.matches) return;

    let targetX = 0;
    let targetY = 0;
    let x = 0;
    let y = 0;
    let frame = 0;

    const tick = () => {
      x += (targetX - x) * SMOOTHING;
      y += (targetY - y) * SMOOTHING;
      // Opposite signs: the far layer drifts with the pointer, the near one against it.
      if (far.current) far.current.style.transform = `translate3d(${(x * FAR_PX).toFixed(2)}px, ${(y * FAR_PX).toFixed(2)}px, 0)`;
      if (near.current) near.current.style.transform = `translate3d(${(-x * NEAR_PX).toFixed(2)}px, ${(-y * NEAR_PX).toFixed(2)}px, 0)`;
      // Stop the loop once it has settled; the next move restarts it.
      frame = Math.abs(targetX - x) + Math.abs(targetY - y) > 0.002 ? requestAnimationFrame(tick) : 0;
    };
    const start = () => {
      if (!frame) frame = requestAnimationFrame(tick);
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      targetX = (e.clientX / window.innerWidth) * 2 - 1;
      targetY = (e.clientY / window.innerHeight) * 2 - 1;
      start();
    };
    const onLeave = () => {
      targetX = 0;
      targetY = 0;
      start();
    };

    window.addEventListener('pointermove', onMove, { passive: true });
    document.documentElement.addEventListener('pointerleave', onLeave, { passive: true });
    return () => {
      window.removeEventListener('pointermove', onMove);
      document.documentElement.removeEventListener('pointerleave', onLeave);
      cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div ref={root} className="backdrop" data-mood={mood} data-busy={busy} aria-hidden>
      <div ref={far} className="bd-layer">
        <i className="bd-pool p1" />
        <i className="bd-pool p2" />
      </div>
      <div ref={near} className="bd-layer">
        <i className="bd-pool p3" />
        <i className="bd-pool p4" />
      </div>
      <div className="bd-grain" />
      <div className="bd-vignette" />
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';

type Options = {
  minScale?: number
  maxScale?: number
  step?: number
}

export function useZoomPan({ minScale = 1, maxScale = 6, step = 0.2 }: Options = {}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ active: boolean; x: number; y: number } | null>(null);

  // mouse/touch drag
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onPointerDown = (e: PointerEvent) => {
      if (scale === 1) return;
      el.setPointerCapture(e.pointerId);
      dragRef.current = { active: true, x: e.clientX - pos.x, y: e.clientY - pos.y };
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!dragRef.current?.active) return;
      setPos({ x: e.clientX - dragRef.current.x, y: e.clientY - dragRef.current.y });
    };
    const end = (e: PointerEvent) => {
      if (dragRef.current) dragRef.current.active = false;
      try { el.releasePointerCapture(e.pointerId); } catch {}
    };
    el.addEventListener('pointerdown', onPointerDown);
    el.addEventListener('pointermove', onPointerMove);
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    return () => {
      el.removeEventListener('pointerdown', onPointerDown);
      el.removeEventListener('pointermove', onPointerMove);
      el.removeEventListener('pointerup', end);
      el.removeEventListener('pointercancel', end);
    };
  }, [scale, pos.x, pos.y]);

  // wheel zoom
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && Math.abs(e.deltaY) < 1) return;
      e.preventDefault();
      setScale(prev => {
        const next = Math.min(maxScale, Math.max(minScale, prev + (e.deltaY < 0 ? step : -step)));
        if (next === 1) setPos({ x: 0, y: 0 });
        return next;
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [minScale, maxScale, step]);

  const reset = () => { setScale(1); setPos({ x: 0, y: 0 }); };

  return {
    containerRef,
    style: { transform: `translate(${pos.x}px, ${pos.y}px) scale(${scale})`, willChange: 'transform' as const },
    scale,
    reset
  };
}

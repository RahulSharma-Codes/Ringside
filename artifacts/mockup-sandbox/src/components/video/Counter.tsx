import { useEffect, useState } from 'react';

export function Counter({ to, delay = 0, duration = 1.4 }: { to: number; delay?: number; duration?: number }) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    let raf: number;
    let start: number | null = null;
    const delayMs = delay * 1000;
    const durationMs = duration * 1000;
    const step = (ts: number) => {
      if (!start) start = ts;
      const elapsed = ts - start - delayMs;
      if (elapsed < 0) { raf = requestAnimationFrame(step); return; }
      const t = Math.min(elapsed / durationMs, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setVal(Math.round(eased * to));
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [to, delay, duration]);
  return <>{val}</>;
}

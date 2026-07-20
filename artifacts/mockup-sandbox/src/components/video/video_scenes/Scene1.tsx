import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 24 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1], delay },
});

export function Scene1() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 300),
      setTimeout(() => setPhase(2), 1000),
      setTimeout(() => setPhase(3), 2200),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div
      className="absolute inset-0 flex items-center justify-center z-10"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.03 }}
      transition={{ duration: 0.8, ease: 'easeInOut' }}
    >
      <div className="text-center px-8 max-w-4xl">
        {phase >= 1 && (
          <motion.div {...fadeUp(0)}
            className="inline-flex items-center gap-2 mb-8 px-4 py-1.5 rounded-full border border-blue-500/30 bg-blue-500/10 text-blue-300 uppercase tracking-[0.2em] text-[11px] font-semibold"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
            The Manipal Group · Corporate Development &amp; Strategy
          </motion.div>
        )}

        {phase >= 2 && (
          <motion.h1 {...fadeUp(0)}
            className="font-bold tracking-[-0.02em] text-white leading-[1.1]"
            style={{ fontSize: 'clamp(32px, 5vw, 72px)' }}
          >
            Every great acquisition
            <br />
            <span className="text-slate-400">starts with the right intelligence.</span>
          </motion.h1>
        )}

        {phase >= 3 && (
          <motion.p {...fadeUp(0.1)}
            className="mt-6 text-slate-500 tracking-widest uppercase text-[11px] font-mono"
          >
            Ringside — M&amp;A Deal Intelligence Platform
          </motion.p>
        )}
      </div>
    </motion.div>
  );
}

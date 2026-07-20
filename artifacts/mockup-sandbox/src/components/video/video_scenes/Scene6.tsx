import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

export function Scene6() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 400),
      setTimeout(() => setPhase(2), 1600),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div
      className="absolute inset-0 flex items-center justify-center z-10"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 1 }}
    >
      <div className="text-center relative z-20 px-8">
        <motion.div
          className="text-[10px] font-mono uppercase tracking-[0.3em] text-slate-600 mb-6"
          initial={{ opacity: 0 }}
          animate={phase >= 1 ? { opacity: 1 } : { opacity: 0 }}
          transition={{ duration: 0.8 }}
        >
          The Manipal Group · Corporate Development &amp; Strategy
        </motion.div>

        <motion.h1
          className="font-bold tracking-[-0.03em] text-white"
          style={{ fontSize: 'clamp(48px, 8vw, 96px)' }}
          initial={{ opacity: 0, scale: 0.92 }}
          animate={phase >= 1 ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.92 }}
          transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
        >
          Ringside.
        </motion.h1>

        <motion.p
          className="mt-4 text-slate-400 tracking-wide"
          style={{ fontSize: 'clamp(13px, 1.6vw, 20px)' }}
          initial={{ opacity: 0, y: 12 }}
          animate={phase >= 2 ? { opacity: 1, y: 0 } : { opacity: 0, y: 12 }}
          transition={{ duration: 0.8 }}
        >
          Deal intelligence for the Manipal Group.
        </motion.p>

        <motion.div
          className="mt-6 text-[10px] uppercase tracking-[0.25em] text-blue-400/70 font-mono"
          initial={{ opacity: 0 }}
          animate={phase >= 2 ? { opacity: 1 } : { opacity: 0 }}
          transition={{ duration: 0.8, delay: 0.3 }}
        >
          M&amp;A Intelligence · Diligence · AI Insights
        </motion.div>

        {/* Horizontal rule */}
        <motion.div
          className="mt-8 mx-auto h-[1px] bg-blue-500/20"
          initial={{ width: 0 }}
          animate={phase >= 2 ? { width: '60%' } : { width: 0 }}
          transition={{ duration: 1.5, delay: 0.4, ease: [0.22, 1, 0.36, 1] }}
        />
      </div>
    </motion.div>
  );
}

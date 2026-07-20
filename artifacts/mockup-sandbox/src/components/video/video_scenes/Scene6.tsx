import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

const E = [0.22, 1, 0.36, 1] as const;

const LETTERS = 'RINGSIDE.'.split('');

const FEATURES = [
  'Pipeline Kanban',
  'Diligence Workspace',
  'AI Copilot',
  'IC Management',
  'Stakeholders & Advisors',
  'Compliance & NDA',
  'Notifications',
  'Access Control',
];

export function Scene6() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 200),
      setTimeout(() => setPhase(2), 1600),
      setTimeout(() => setPhase(3), 2400),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div
      className="absolute inset-0 flex flex-col items-center justify-center z-10"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.8, ease: E }}
    >
      {/* Org label */}
      <motion.p
        className="mb-6 text-[10px] font-mono uppercase tracking-[0.3em] text-white/25"
        initial={{ opacity: 0 }}
        animate={phase >= 1 ? { opacity: 1 } : { opacity: 0 }}
        transition={{ duration: 0.7, ease: E }}
      >
        The Manipal Group · Corporate Development &amp; Strategy
      </motion.p>

      {/* RINGSIDE. letter reveal */}
      <div className="flex items-end justify-center mb-2" style={{ gap: '0.01em' }}>
        {LETTERS.map((l, i) => (
          <div key={i} style={{ overflow: 'hidden', lineHeight: 1 }}>
            <motion.span
              style={{
                display: 'inline-block',
                fontSize: 'clamp(52px, 9vw, 108px)',
                fontWeight: 800,
                letterSpacing: l === '.' ? '-0.05em' : '-0.025em',
                color: l === '.' ? 'rgba(59,130,246,0.7)' : '#fff',
                lineHeight: 1,
              }}
              initial={{ y: '105%' }}
              animate={phase >= 1 ? { y: 0 } : { y: '105%' }}
              transition={{ duration: 0.7, delay: 0.1 + i * 0.065, ease: E }}
            >
              {l}
            </motion.span>
          </div>
        ))}
      </div>

      {/* Tagline */}
      <motion.p
        className="text-[12px] font-mono tracking-[0.15em] uppercase text-white/30 mb-10"
        initial={{ opacity: 0, y: 8 }}
        animate={phase >= 2 ? { opacity: 1, y: 0 } : { opacity: 0, y: 8 }}
        transition={{ duration: 0.7, ease: E }}
      >
        Deal intelligence for the Manipal Group
      </motion.p>

      {/* Feature chips */}
      <motion.div
        className="flex flex-wrap items-center justify-center gap-2 max-w-2xl"
        initial={{ opacity: 0, y: 10 }}
        animate={phase >= 3 ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 }}
        transition={{ duration: 0.6, ease: E }}
      >
        {FEATURES.map((f, i) => (
          <motion.span
            key={f}
            className="px-3 py-1.5 rounded-full border border-white/12 bg-white/[0.04] text-[10px] font-mono text-white/45 tracking-wider"
            initial={{ opacity: 0, scale: 0.92 }}
            animate={phase >= 3 ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.92 }}
            transition={{ duration: 0.4, delay: i * 0.06, ease: E }}
          >
            {f}
          </motion.span>
        ))}
      </motion.div>

      {/* Divider */}
      <motion.div
        className="mt-10 h-[1px] bg-blue-500/20"
        initial={{ width: 0 }}
        animate={phase >= 2 ? { width: '240px' } : { width: 0 }}
        transition={{ duration: 1.2, delay: 0.3, ease: E }}
      />
    </motion.div>
  );
}

import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

const E = [0.22, 1, 0.36, 1] as const;

const LETTERS = 'RINGSIDE'.split('');

const FEATURES = [
  'Pipeline Kanban',
  'Diligence Workspace',
  'AI Copilot',
  'IC Management',
  'Stakeholders & Advisors',
  'NDA & Compliance',
  'Notifications',
  'Per-User Access Control',
];

export function Scene6() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const t1 = setTimeout(() => setPhase(1), 300);
    const t2 = setTimeout(() => setPhase(2), 1800);
    const t3 = setTimeout(() => setPhase(3), 2600);
    const t4 = setTimeout(() => setPhase(4), 3400);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(t4); };
  }, []);

  return (
    <motion.div
      className="absolute inset-0 flex flex-col items-center justify-center z-10 text-center px-12"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.8, ease: E }}
    >
      {/* Tagline */}
      <motion.div
        className="mb-8"
        initial={{ opacity: 0, y: 10 }}
        animate={phase >= 1 ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.7, ease: E }}
      >
        <div style={{ overflow: 'hidden' }}>
          <motion.p
            style={{ fontSize: 'clamp(14px, 2vw, 24px)', fontWeight: 600, color: 'rgba(255,255,255,0.4)', letterSpacing: '-0.01em', lineHeight: 1.3 }}
            initial={{ y: '105%' }}
            animate={phase >= 1 ? { y: 0 } : {}}
            transition={{ duration: 0.65, delay: 0.1, ease: E }}
          >
            Deal intelligence, built for the
          </motion.p>
        </div>
        <div style={{ overflow: 'hidden' }}>
          <motion.p
            style={{ fontSize: 'clamp(14px, 2vw, 24px)', fontWeight: 600, color: 'rgba(255,255,255,0.7)', letterSpacing: '-0.01em', lineHeight: 1.3 }}
            initial={{ y: '105%' }}
            animate={phase >= 1 ? { y: 0 } : {}}
            transition={{ duration: 0.65, delay: 0.22, ease: E }}
          >
            Manipal Group Corporate Development team.
          </motion.p>
        </div>
      </motion.div>

      {/* RINGSIDE letter reveal */}
      <div className="flex items-end justify-center mb-2" style={{ gap: '0.01em' }}>
        {LETTERS.map((l, i) => (
          <div key={i} style={{ overflow: 'hidden', lineHeight: 1 }}>
            <motion.span
              style={{
                display: 'inline-block',
                fontSize: 'clamp(52px, 9vw, 108px)',
                fontWeight: 900,
                letterSpacing: '-0.025em',
                color: '#fff',
                lineHeight: 1,
              }}
              initial={{ y: '105%' }}
              animate={phase >= 2 ? { y: 0 } : {}}
              transition={{ duration: 0.7, delay: i * 0.06, ease: E }}
            >
              {l}
            </motion.span>
          </div>
        ))}
        {/* Blue period */}
        <div style={{ overflow: 'hidden', lineHeight: 1 }}>
          <motion.span
            style={{ display: 'inline-block', fontSize: 'clamp(52px, 9vw, 108px)', fontWeight: 900, color: 'rgba(59,130,246,0.75)', lineHeight: 1 }}
            initial={{ y: '105%' }}
            animate={phase >= 2 ? { y: 0 } : {}}
            transition={{ duration: 0.7, delay: LETTERS.length * 0.06, ease: E }}
          >
            .
          </motion.span>
        </div>
      </div>

      {/* Divider */}
      <motion.div
        className="my-8 h-[1px] bg-blue-500/25"
        initial={{ width: 0 }}
        animate={phase >= 3 ? { width: '240px' } : {}}
        transition={{ duration: 1.0, ease: E }}
      />

      {/* Feature chips */}
      <motion.div
        className="flex flex-wrap items-center justify-center gap-2 max-w-2xl"
        initial={{ opacity: 0, y: 8 }}
        animate={phase >= 4 ? { opacity: 1, y: 0 } : { opacity: 0, y: 8 }}
        transition={{ duration: 0.6, ease: E }}
      >
        {FEATURES.map((f, i) => (
          <motion.span
            key={f}
            className="px-3 py-1.5 rounded-full border border-white/10 bg-white/[0.04] text-[10px] font-mono text-white/40 tracking-wide"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={phase >= 4 ? { opacity: 1, scale: 1 } : {}}
            transition={{ duration: 0.35, delay: i * 0.05, ease: E }}
          >
            {f}
          </motion.span>
        ))}
      </motion.div>
    </motion.div>
  );
}

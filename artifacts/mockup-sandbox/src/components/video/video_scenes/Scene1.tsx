import { motion } from 'framer-motion';
import { Counter } from '../Counter';

const E = [0.22, 1, 0.36, 1] as const;

const LETTERS = 'RINGSIDE'.split('');

const STATS = [
  { label: 'Active Deals',  value: 24, suffix: '' },
  { label: 'Open Actions',  value: 143, suffix: '' },
  { label: 'Must-Win',      value: 4,  suffix: '' },
];

export function Scene1() {
  return (
    <motion.div
      className="absolute inset-0 flex flex-col items-center justify-center z-10"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.02 }}
      transition={{ duration: 0.7, ease: E }}
    >
      {/* Org label */}
      <motion.p
        className="mb-5 text-[10px] font-mono uppercase tracking-[0.3em] text-white/30"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, delay: 0.1, ease: E }}
      >
        The Manipal Group · Corporate Development &amp; Strategy
      </motion.p>

      {/* RINGSIDE — letter-by-letter clip reveal */}
      <div className="flex items-end justify-center" style={{ gap: '0.01em' }}>
        {LETTERS.map((l, i) => (
          <div key={i} style={{ overflow: 'hidden', lineHeight: 1 }}>
            <motion.span
              style={{
                display: 'inline-block',
                fontSize: 'clamp(56px, 9.5vw, 112px)',
                fontWeight: 800,
                letterSpacing: '-0.025em',
                color: '#fff',
                lineHeight: 1,
              }}
              initial={{ y: '105%' }}
              animate={{ y: 0 }}
              transition={{ duration: 0.75, delay: 0.35 + i * 0.07, ease: E }}
            >
              {l}
            </motion.span>
          </div>
        ))}
      </div>

      {/* Tagline */}
      <motion.p
        className="mt-5 text-[13px] font-mono tracking-[0.18em] uppercase text-white/35"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8, delay: 1.0, ease: E }}
      >
        M&amp;A Deal Intelligence Platform
      </motion.p>

      {/* Divider */}
      <motion.div
        className="mt-10 mb-10 h-[1px] bg-white/10"
        initial={{ width: 0 }}
        animate={{ width: '220px' }}
        transition={{ duration: 0.9, delay: 1.3, ease: E }}
      />

      {/* Stats */}
      <motion.div
        className="flex items-center gap-12"
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 1.4, ease: E }}
      >
        {STATS.map((s, i) => (
          <div key={s.label} className="text-center">
            <div
              className="font-bold text-white tabular-nums"
              style={{ fontSize: 'clamp(28px, 3.5vw, 48px)', letterSpacing: '-0.02em', lineHeight: 1 }}
            >
              <Counter to={s.value} delay={1.5 + i * 0.15} duration={1.3} />{s.suffix}
            </div>
            <div className="mt-1.5 text-[10px] font-mono uppercase tracking-wider text-white/35">
              {s.label}
            </div>
          </div>
        ))}
      </motion.div>
    </motion.div>
  );
}

import { motion } from 'framer-motion';
import { Counter } from '../Counter';

const E = [0.22, 1, 0.36, 1] as const;

function LineReveal({ text, delay, size = '5vw', color = '#fff', weight = 800 }: {
  text: string; delay: number; size?: string; color?: string; weight?: number;
}) {
  return (
    <div style={{ overflow: 'hidden', lineHeight: 1.15 }}>
      <motion.p
        style={{
          fontSize: `clamp(28px, ${size}, 72px)`,
          fontWeight: weight,
          color,
          letterSpacing: '-0.025em',
          lineHeight: 1.15,
          display: 'block',
        }}
        initial={{ y: '105%' }}
        animate={{ y: 0 }}
        transition={{ duration: 0.75, delay, ease: E }}
      >
        {text}
      </motion.p>
    </div>
  );
}

export function Scene1() {
  return (
    <motion.div
      className="absolute inset-0 flex flex-col items-center justify-center z-10 text-center px-12"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.015 }}
      transition={{ duration: 0.7, ease: E }}
    >
      {/* Org tag */}
      <motion.p
        className="mb-8 text-[10px] font-mono uppercase tracking-[0.3em] text-white/25"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.15, ease: E }}
      >
        The Manipal Group · Corporate Development &amp; Strategy
      </motion.p>

      {/* Hook copy */}
      <LineReveal text="Every great acquisition" delay={0.3} size="4.8vw" color="rgba(255,255,255,0.55)" weight={700} />
      <LineReveal text="starts with the right intelligence." delay={0.45} size="4.8vw" color="#fff" weight={800} />

      {/* Divider */}
      <motion.div
        className="my-8 h-[1px] bg-white/12"
        initial={{ width: 0 }}
        animate={{ width: '200px' }}
        transition={{ duration: 0.9, delay: 1.15, ease: E }}
      />

      {/* RINGSIDE brand */}
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.8, delay: 1.3, ease: E }}
      >
        <p
          style={{
            fontSize: 'clamp(52px, 8.5vw, 100px)',
            fontWeight: 900,
            letterSpacing: '-0.03em',
            color: '#fff',
            lineHeight: 1,
          }}
        >
          RINGSIDE
        </p>
      </motion.div>

      <motion.p
        className="mt-4 text-[11px] font-mono tracking-[0.22em] uppercase text-white/30"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.7, delay: 1.9, ease: E }}
      >
        M&amp;A Deal Intelligence Platform
      </motion.p>

      {/* Stats */}
      <motion.div
        className="mt-10 flex items-center gap-10"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 2.2, ease: E }}
      >
        {[
          { value: 24,  label: 'Active Deals' },
          { value: 143, label: 'Open Actions' },
          { value: 4,   label: 'Must-Win' },
        ].map((s, i) => (
          <div key={s.label} className="text-center">
            <div className="font-bold text-white tabular-nums" style={{ fontSize: 'clamp(26px, 3.2vw, 42px)', letterSpacing: '-0.02em', lineHeight: 1 }}>
              <Counter to={s.value} delay={2.3 + i * 0.12} duration={1.2} />
            </div>
            <div className="mt-1 text-[9px] font-mono uppercase tracking-wider text-white/30">{s.label}</div>
          </div>
        ))}
      </motion.div>
    </motion.div>
  );
}

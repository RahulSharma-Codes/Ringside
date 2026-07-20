import { motion } from 'framer-motion';
import { Counter } from '../Counter';

const E = [0.22, 1, 0.36, 1] as const;

const KPIS = [
  { label: 'Total Pipeline', value: 24,  sub: '↑3 this month',   subColor: 'text-emerald-400', border: 'border-blue-500/25' },
  { label: 'Active Deals',   value: 18,  sub: '4 Must-Win · 8 P1', subColor: 'text-slate-400', border: 'border-emerald-500/25' },
  { label: 'Open Actions',   value: 143, sub: '12 overdue',       subColor: 'text-red-400',     border: 'border-amber-500/25' },
  { label: 'Avg Score',      value: 76,  sub: 'composite pts',    subColor: 'text-slate-400',   border: 'border-violet-500/25' },
];

const STAGES = [
  { name: 'Sourcing',          n: 6, w: 55 },
  { name: 'Initial Screening', n: 4, w: 37 },
  { name: 'In Diligence',      n: 5, w: 46 },
  { name: 'Term Sheet',        n: 3, w: 28 },
  { name: 'Closing',           n: 2, w: 19 },
];

export function Scene2() {
  return (
    <motion.div
      className="absolute inset-0 z-10 flex flex-col px-12 pt-9 pb-5"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.65, ease: E }}
    >
      {/* Headline block — the message comes first */}
      <div className="mb-7">
        <motion.p
          className="text-[9px] font-mono uppercase tracking-[0.28em] text-white/25 mb-3"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.1 }}
        >
          Pipeline Intelligence
        </motion.p>
        <div style={{ overflow: 'hidden' }}>
          <motion.h2
            style={{ fontSize: 'clamp(22px, 3.2vw, 44px)', fontWeight: 800, letterSpacing: '-0.025em', color: 'rgba(255,255,255,0.55)', lineHeight: 1.15 }}
            initial={{ y: '105%' }}
            animate={{ y: 0 }}
            transition={{ duration: 0.65, delay: 0.15, ease: E }}
          >
            Your entire pipeline —
          </motion.h2>
        </div>
        <div style={{ overflow: 'hidden' }}>
          <motion.h2
            style={{ fontSize: 'clamp(22px, 3.2vw, 44px)', fontWeight: 800, letterSpacing: '-0.025em', color: '#fff', lineHeight: 1.15 }}
            initial={{ y: '105%' }}
            animate={{ y: 0 }}
            transition={{ duration: 0.65, delay: 0.28, ease: E }}
          >
            scored, staged, and surfaced instantly.
          </motion.h2>
        </div>
      </div>

      {/* KPI tiles */}
      <div className="grid grid-cols-4 gap-3 mb-4">
        {KPIS.map((k, i) => (
          <motion.div
            key={k.label}
            className={`bg-white/[0.04] border rounded-2xl px-4 pt-3.5 pb-3 ${k.border}`}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.55 + i * 0.08, ease: E }}
          >
            <p className="text-[8px] font-mono uppercase tracking-wider text-white/30 mb-1.5">{k.label}</p>
            <p className="font-bold text-white tabular-nums" style={{ fontSize: 'clamp(22px, 2.8vw, 34px)', letterSpacing: '-0.02em', lineHeight: 1 }}>
              <Counter to={k.value} delay={0.7 + i * 0.1} duration={1.0} />
            </p>
            <p className={`mt-1 text-[10px] font-mono ${k.subColor}`}>{k.sub}</p>
          </motion.div>
        ))}
      </div>

      {/* Needs-attention */}
      <motion.div
        className="flex items-center gap-2.5 px-4 py-2 rounded-xl border border-red-500/25 bg-red-500/[0.07] mb-4"
        initial={{ opacity: 0, x: -10 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.45, delay: 0.95, ease: E }}
      >
        <div className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
        <span className="text-[10px] font-mono text-red-400">
          3 deals flagged — overdue actions, stale stages, or Must-Win without recent interaction
        </span>
      </motion.div>

      {/* Stage bars */}
      <motion.div
        className="flex-1 bg-white/[0.03] border border-white/8 rounded-2xl px-5 py-3.5"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: 1.1, ease: E }}
      >
        <p className="text-[8px] font-mono uppercase tracking-wider text-white/25 mb-3">Stage Distribution</p>
        <div className="flex flex-col gap-2.5">
          {STAGES.map((s, i) => (
            <div key={s.name} className="flex items-center gap-3">
              <span className="text-[9px] font-mono text-white/35 w-32 shrink-0 truncate">{s.name}</span>
              <div className="flex-1 bg-white/8 rounded-full h-1.5 overflow-hidden">
                <motion.div
                  className="h-full rounded-full bg-blue-500/70"
                  initial={{ width: 0 }}
                  animate={{ width: `${s.w}%` }}
                  transition={{ duration: 0.9, delay: 1.2 + i * 0.09, ease: E }}
                />
              </div>
              <span className="text-[9px] font-mono font-bold text-white/50 w-3 text-right">{s.n}</span>
            </div>
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
}

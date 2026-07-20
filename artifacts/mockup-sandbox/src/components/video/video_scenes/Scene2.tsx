import { motion } from 'framer-motion';
import { Counter } from '../Counter';

const E = [0.22, 1, 0.36, 1] as const;

const KPIS = [
  { label: 'Total Pipeline', value: 24, sub: '↑ 3 this month',  subColor: 'text-emerald-400', accent: 'border-blue-500/30' },
  { label: 'Active Deals',   value: 18, sub: '4 Must-Win · 8 P1', subColor: 'text-slate-400',   accent: 'border-emerald-500/30' },
  { label: 'Open Actions',   value: 143, sub: '12 overdue',      subColor: 'text-red-400',      accent: 'border-amber-500/30' },
  { label: 'Avg Score',      value: 76,  sub: 'composite pts',   subColor: 'text-slate-400',    accent: 'border-violet-500/30' },
];

const STAGES = [
  { name: 'Sourcing',           n: 6,  w: 55 },
  { name: 'Initial Screening',  n: 4,  w: 37 },
  { name: 'In Diligence',       n: 5,  w: 46 },
  { name: 'Term Sheet',         n: 3,  w: 28 },
  { name: 'Closing',            n: 2,  w: 19 },
];

export function Scene2() {
  return (
    <motion.div
      className="absolute inset-0 z-10 flex flex-col px-12 py-10"
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -18 }}
      transition={{ duration: 0.65, ease: E }}
    >
      {/* Header */}
      <motion.div
        className="flex items-center justify-between mb-7"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1, ease: E }}
      >
        <div>
          <p className="text-[9px] font-mono uppercase tracking-[0.25em] text-white/30 mb-1">Ringside</p>
          <h2 className="font-bold text-white" style={{ fontSize: 'clamp(18px, 2.6vw, 34px)', letterSpacing: '-0.02em' }}>
            Dashboard Intelligence
          </h2>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-emerald-500/25 bg-emerald-500/8">
          <span className="relative flex h-1.5 w-1.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
          </span>
          <span className="text-[10px] font-mono text-emerald-400/80 uppercase tracking-wider">Live</span>
        </div>
      </motion.div>

      {/* KPI tiles */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        {KPIS.map((k, i) => (
          <motion.div
            key={k.label}
            className={`bg-white/[0.04] border rounded-2xl px-4 pt-4 pb-3 ${k.accent}`}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 + i * 0.08, ease: E }}
          >
            <p className="text-[9px] font-mono uppercase tracking-wider text-white/35 mb-2">{k.label}</p>
            <p className="font-bold text-white tabular-nums" style={{ fontSize: 'clamp(24px, 3vw, 36px)', letterSpacing: '-0.02em', lineHeight: 1 }}>
              <Counter to={k.value} delay={0.4 + i * 0.1} duration={1.1} />
            </p>
            <p className={`mt-1.5 text-[10px] font-mono ${k.subColor}`}>{k.sub}</p>
          </motion.div>
        ))}
      </div>

      {/* Needs-attention banner */}
      <motion.div
        className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl border border-red-500/25 bg-red-500/8 mb-6"
        initial={{ opacity: 0, x: -12 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.5, delay: 0.65, ease: E }}
      >
        <div className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
        <span className="text-[11px] font-mono text-red-400">
          3 deals flagged — overdue actions, stale stages, or Must-Win without recent activity
        </span>
      </motion.div>

      {/* Stage distribution */}
      <motion.div
        className="flex-1 bg-white/[0.03] border border-white/8 rounded-2xl px-5 py-4"
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.8, ease: E }}
      >
        <p className="text-[9px] font-mono uppercase tracking-wider text-white/30 mb-4">Pipeline Stage Distribution</p>
        <div className="flex flex-col gap-3">
          {STAGES.map((s, i) => (
            <div key={s.name} className="flex items-center gap-3">
              <span className="text-[10px] font-mono text-white/40 w-36 shrink-0 truncate">{s.name}</span>
              <div className="flex-1 bg-white/8 rounded-full h-2 overflow-hidden">
                <motion.div
                  className="h-full rounded-full bg-blue-500"
                  style={{ opacity: 0.5 + i * 0.1 }}
                  initial={{ width: 0 }}
                  animate={{ width: `${s.w}%` }}
                  transition={{ duration: 0.9, delay: 0.9 + i * 0.1, ease: E }}
                />
              </div>
              <span className="text-[10px] font-mono font-bold text-white/60 w-4 text-right">{s.n}</span>
            </div>
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
}

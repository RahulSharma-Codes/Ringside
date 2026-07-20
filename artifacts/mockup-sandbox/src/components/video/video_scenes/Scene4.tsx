import { motion } from 'framer-motion';

const E = [0.22, 1, 0.36, 1] as const;

const WORKSTREAMS = [
  { name: 'Commercial',  pct: 85, status: 'On Track',  color: 'bg-emerald-500' },
  { name: 'Financial',   pct: 72, status: 'On Track',  color: 'bg-emerald-500' },
  { name: 'Legal',       pct: 60, status: 'Watch',     color: 'bg-amber-500' },
  { name: 'Tax',         pct: 25, status: 'Blocked',   color: 'bg-red-500' },
  { name: 'HR',          pct: 90, status: 'On Track',  color: 'bg-emerald-500' },
  { name: 'Technology',  pct: 55, status: 'Watch',     color: 'bg-amber-500' },
  { name: 'Operations',  pct: 78, status: 'On Track',  color: 'bg-emerald-500' },
  { name: 'Integration', pct: 20, status: 'Blocked',   color: 'bg-red-500' },
];

const STATUS_CLS: Record<string, string> = {
  'On Track': 'text-emerald-400',
  'Watch':    'text-amber-400',
  'Blocked':  'text-red-400',
};
const CARD_CLS: Record<string, string> = {
  'On Track': 'bg-white/[0.04] border-white/8',
  'Watch':    'bg-amber-500/[0.05] border-amber-500/20',
  'Blocked':  'bg-red-500/[0.08] border-red-500/30',
};

export function Scene4() {
  const readiness = Math.round(
    WORKSTREAMS.reduce((s, w) => s + w.pct, 0) / WORKSTREAMS.length
  );

  return (
    <motion.div
      className="absolute inset-0 z-10 flex flex-col px-10 py-10"
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 1.01 }}
      transition={{ duration: 0.65, ease: E }}
    >
      {/* Header row */}
      <motion.div
        className="flex items-start justify-between mb-6"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1, ease: E }}
      >
        <div>
          <p className="text-[9px] font-mono uppercase tracking-[0.25em] text-white/30 mb-1">
            Project Orion · OR-003 · In Diligence
          </p>
          <h2 className="font-bold text-white" style={{ fontSize: 'clamp(18px, 2.6vw, 34px)', letterSpacing: '-0.02em' }}>
            Diligence Workspace
          </h2>
        </div>

        {/* Readiness score */}
        <div className="text-right">
          <div className="text-[9px] font-mono uppercase tracking-wider text-white/30 mb-1">Readiness Score</div>
          <div className="font-bold text-white" style={{ fontSize: 'clamp(28px, 3.5vw, 44px)', letterSpacing: '-0.02em' }}>
            {readiness}<span className="text-white/30 text-[0.55em]">%</span>
          </div>
          <div className="text-[10px] font-mono text-red-400 mt-0.5">2 workstreams blocked</div>
        </div>
      </motion.div>

      {/* Readiness bar */}
      <motion.div
        className="mb-6"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
      >
        <div className="w-full bg-white/8 rounded-full h-1.5 overflow-hidden">
          <motion.div
            className="h-full rounded-full bg-blue-500"
            initial={{ width: 0 }}
            animate={{ width: `${readiness}%` }}
            transition={{ duration: 1.2, delay: 0.4, ease: E }}
          />
        </div>
      </motion.div>

      {/* Workstream grid */}
      <div className="grid grid-cols-4 gap-3 flex-1">
        {WORKSTREAMS.map((ws, i) => (
          <motion.div
            key={ws.name}
            className={`border rounded-2xl p-4 flex flex-col justify-between ${CARD_CLS[ws.status]}`}
            initial={{ opacity: 0, scale: 0.93 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.45, delay: 0.35 + i * 0.07, ease: E }}
          >
            <div>
              <div className="text-[12px] font-semibold text-white mb-1 leading-tight">{ws.name}</div>
              <div className={`text-[10px] font-mono ${STATUS_CLS[ws.status]}`}>{ws.status}</div>
            </div>
            <div className="mt-3">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[9px] font-mono text-white/30">Complete</span>
                <span className="text-[11px] font-mono font-bold text-white/70">{ws.pct}%</span>
              </div>
              <div className="w-full bg-white/10 rounded-full h-1.5 overflow-hidden">
                <motion.div
                  className={`h-full rounded-full ${ws.color}`}
                  initial={{ width: 0 }}
                  animate={{ width: `${ws.pct}%` }}
                  transition={{ duration: 1, delay: 0.5 + i * 0.07, ease: E }}
                />
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}

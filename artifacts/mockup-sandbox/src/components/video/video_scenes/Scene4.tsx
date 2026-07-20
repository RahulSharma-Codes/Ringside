import { motion } from 'framer-motion';

const E = [0.22, 1, 0.36, 1] as const;

const WORKSTREAMS = [
  { name: 'Commercial',  pct: 85, status: 'On Track', color: 'bg-emerald-500' },
  { name: 'Financial',   pct: 72, status: 'On Track', color: 'bg-emerald-500' },
  { name: 'Legal',       pct: 60, status: 'Watch',    color: 'bg-amber-500' },
  { name: 'Tax',         pct: 25, status: 'Blocked',  color: 'bg-red-500' },
  { name: 'HR',          pct: 90, status: 'On Track', color: 'bg-emerald-500' },
  { name: 'Technology',  pct: 55, status: 'Watch',    color: 'bg-amber-500' },
  { name: 'Operations',  pct: 78, status: 'On Track', color: 'bg-emerald-500' },
  { name: 'Integration', pct: 20, status: 'Blocked',  color: 'bg-red-500' },
];

const STATUS: Record<string, string> = {
  'On Track': 'text-emerald-400',
  'Watch':    'text-amber-400',
  'Blocked':  'text-red-400',
};
const CARD: Record<string, string> = {
  'On Track': 'bg-white/[0.04] border-white/8',
  'Watch':    'bg-amber-500/[0.05] border-amber-500/20',
  'Blocked':  'bg-red-500/[0.08] border-red-500/28',
};

export function Scene4() {
  const readiness = Math.round(WORKSTREAMS.reduce((s, w) => s + w.pct, 0) / WORKSTREAMS.length);

  return (
    <motion.div
      className="absolute inset-0 z-10 flex flex-col px-10 pt-9 pb-5"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.65, ease: E }}
    >
      {/* Headline */}
      <div className="mb-6">
        <motion.p
          className="text-[9px] font-mono uppercase tracking-[0.28em] text-white/25 mb-3"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.1 }}
        >
          Diligence Workspace · Project Orion
        </motion.p>
        <div style={{ overflow: 'hidden' }}>
          <motion.h2
            style={{ fontSize: 'clamp(22px, 3.2vw, 44px)', fontWeight: 800, letterSpacing: '-0.025em', color: 'rgba(255,255,255,0.55)', lineHeight: 1.15 }}
            initial={{ y: '105%' }}
            animate={{ y: 0 }}
            transition={{ duration: 0.65, delay: 0.15, ease: E }}
          >
            8 workstreams, one view.
          </motion.h2>
        </div>
        <div style={{ overflow: 'hidden' }}>
          <motion.h2
            style={{ fontSize: 'clamp(22px, 3.2vw, 44px)', fontWeight: 800, letterSpacing: '-0.025em', color: '#fff', lineHeight: 1.15 }}
            initial={{ y: '105%' }}
            animate={{ y: 0 }}
            transition={{ duration: 0.65, delay: 0.28, ease: E }}
          >
            Nothing falls through the cracks.
          </motion.h2>
        </div>
      </div>

      {/* Readiness bar */}
      <motion.div
        className="flex items-center gap-4 mb-5"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: 0.55, ease: E }}
      >
        <span className="text-[10px] font-mono text-white/30 shrink-0">Readiness</span>
        <div className="flex-1 bg-white/8 rounded-full h-1.5 overflow-hidden">
          <motion.div
            className="h-full rounded-full bg-blue-500"
            initial={{ width: 0 }}
            animate={{ width: `${readiness}%` }}
            transition={{ duration: 1.1, delay: 0.6, ease: E }}
          />
        </div>
        <span className="text-[13px] font-mono font-bold text-white/70 shrink-0">{readiness}%</span>
        <span className="text-[10px] font-mono text-red-400 shrink-0">2 blocked</span>
      </motion.div>

      {/* Workstream grid */}
      <div className="grid grid-cols-4 gap-2.5 flex-1">
        {WORKSTREAMS.map((ws, i) => (
          <motion.div
            key={ws.name}
            className={`border rounded-2xl p-3.5 flex flex-col justify-between ${CARD[ws.status]}`}
            initial={{ opacity: 0, scale: 0.93 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4, delay: 0.65 + i * 0.065, ease: E }}
          >
            <div>
              <div className="text-[12px] font-semibold text-white mb-1 leading-tight">{ws.name}</div>
              <div className={`text-[9px] font-mono ${STATUS[ws.status]}`}>{ws.status}</div>
            </div>
            <div className="mt-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[8px] font-mono text-white/25">Done</span>
                <span className="text-[11px] font-mono font-bold text-white/65">{ws.pct}%</span>
              </div>
              <div className="w-full bg-white/10 rounded-full h-1.5 overflow-hidden">
                <motion.div
                  className={`h-full rounded-full ${ws.color}`}
                  initial={{ width: 0 }}
                  animate={{ width: `${ws.pct}%` }}
                  transition={{ duration: 0.9, delay: 0.75 + i * 0.065, ease: E }}
                />
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}

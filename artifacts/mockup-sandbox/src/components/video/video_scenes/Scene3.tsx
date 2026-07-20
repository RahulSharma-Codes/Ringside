import { motion } from 'framer-motion';

const WORKSTREAMS = [
  { name: 'Commercial',   pct: 85, status: 'On Track',  color: 'bg-emerald-500' },
  { name: 'Financial',    pct: 72, status: 'On Track',  color: 'bg-emerald-500' },
  { name: 'Legal',        pct: 60, status: 'Watch',     color: 'bg-amber-500' },
  { name: 'Tax',          pct: 40, status: 'Blocked',   color: 'bg-red-500' },
  { name: 'HR',           pct: 90, status: 'On Track',  color: 'bg-emerald-500' },
  { name: 'Technology',   pct: 55, status: 'Watch',     color: 'bg-amber-500' },
  { name: 'Operations',   pct: 78, status: 'On Track',  color: 'bg-emerald-500' },
  { name: 'Integration',  pct: 30, status: 'Blocked',   color: 'bg-red-500' },
];

const statusColor: Record<string, string> = {
  'On Track': 'text-emerald-400',
  'Watch':    'text-amber-400',
  'Blocked':  'text-red-400',
};

export function Scene3() {
  return (
    <motion.div
      className="absolute inset-0 z-10 flex flex-col items-center justify-center px-10 py-10"
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 1.02 }}
      transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
    >
      <motion.h2
        className="font-bold text-white text-center mb-8 tracking-tight"
        style={{ fontSize: 'clamp(20px, 3vw, 42px)' }}
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
      >
        Structured diligence. Zero blind spots.
      </motion.h2>

      <div className="grid grid-cols-4 gap-4 w-full max-w-4xl" style={{ height: '58%' }}>
        {WORKSTREAMS.map((ws, i) => (
          <motion.div
            key={ws.name}
            className="bg-white/[0.04] border border-white/10 rounded-2xl p-4 flex flex-col justify-between"
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.45, delay: i * 0.07 + 0.25, ease: [0.22, 1, 0.36, 1] }}
          >
            <div>
              <div className="text-[12px] font-semibold text-white mb-1">{ws.name}</div>
              <div className={`text-[10px] font-mono ${statusColor[ws.status]}`}>{ws.status}</div>
            </div>
            <div className="mt-auto">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] text-slate-500">Complete</span>
                <span className="text-[11px] font-mono font-bold text-slate-300">{ws.pct}%</span>
              </div>
              <div className="w-full bg-white/10 rounded-full h-1.5 overflow-hidden">
                <motion.div
                  className={`h-full rounded-full ${ws.color}`}
                  initial={{ width: 0 }}
                  animate={{ width: `${ws.pct}%` }}
                  transition={{ duration: 1.1, delay: i * 0.07 + 0.6, ease: [0.22, 1, 0.36, 1] }}
                />
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}

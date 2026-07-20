import { motion } from 'framer-motion';

const STAGES = [
  {
    label: 'Sourcing',
    color: 'text-slate-400',
    dot: 'bg-slate-500',
    deals: [
      { name: 'Project Atlas', tier: 'Must-Win', score: 84 },
      { name: 'Greenfield Health', tier: 'Priority 1', score: 71 },
    ],
  },
  {
    label: 'Diligence',
    color: 'text-blue-400',
    dot: 'bg-blue-500',
    deals: [
      { name: 'Project Orion', tier: 'Must-Win', score: 91 },
      { name: 'Coastal Med', tier: 'Priority 2', score: 63 },
    ],
  },
  {
    label: 'IOI',
    color: 'text-amber-400',
    dot: 'bg-amber-500',
    deals: [
      { name: 'StellarPath', tier: 'Priority 1', score: 77 },
    ],
  },
  {
    label: 'Closing',
    color: 'text-emerald-400',
    dot: 'bg-emerald-500',
    deals: [
      { name: 'Project Nova', tier: 'Must-Win', score: 96 },
    ],
  },
];

const tierColor: Record<string, string> = {
  'Must-Win':   'bg-red-500/15 text-red-400 border-red-500/25',
  'Priority 1': 'bg-amber-500/15 text-amber-400 border-amber-500/25',
  'Priority 2': 'bg-blue-500/15 text-blue-400 border-blue-500/25',
};

export function Scene2() {
  return (
    <motion.div
      className="absolute inset-0 z-10 flex flex-col items-center justify-center px-10 py-10"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
    >
      <motion.h2
        className="font-bold text-white text-center mb-8 tracking-tight"
        style={{ fontSize: 'clamp(20px, 3vw, 42px)' }}
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
      >
        See your entire pipeline at a glance.
      </motion.h2>

      <div className="flex gap-4 w-full" style={{ height: '58%' }}>
        {STAGES.map((stage, i) => (
          <motion.div
            key={stage.label}
            className="flex-1 bg-white/[0.04] border border-white/10 rounded-2xl p-4 flex flex-col gap-3 overflow-hidden"
            initial={{ opacity: 0, y: 32 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: i * 0.12 + 0.2, ease: [0.22, 1, 0.36, 1] }}
          >
            {/* Column header */}
            <div className="flex items-center gap-2 pb-2 border-b border-white/8">
              <span className={`w-2 h-2 rounded-full shrink-0 ${stage.dot}`} />
              <span className={`text-[11px] font-semibold uppercase tracking-wider ${stage.color}`}>{stage.label}</span>
              <span className="ml-auto text-[10px] text-slate-600 font-mono">{stage.deals.length}</span>
            </div>

            {/* Deal cards */}
            {stage.deals.map((deal, j) => (
              <motion.div
                key={deal.name}
                className="bg-white/[0.05] border border-white/10 rounded-xl p-3 flex flex-col gap-2"
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.4, delay: i * 0.12 + j * 0.1 + 0.5 }}
              >
                <div className="text-[12px] font-medium text-white leading-tight">{deal.name}</div>
                <div className="flex items-center justify-between">
                  <span className={`text-[9px] font-mono uppercase border rounded px-1.5 py-0.5 ${tierColor[deal.tier]}`}>{deal.tier === 'Must-Win' ? 'MW' : deal.tier === 'Priority 1' ? 'P1' : 'P2'}</span>
                  <span className="text-[11px] font-mono font-bold text-slate-300">{deal.score} <span className="text-slate-600 text-[9px]">pts</span></span>
                </div>
              </motion.div>
            ))}
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}

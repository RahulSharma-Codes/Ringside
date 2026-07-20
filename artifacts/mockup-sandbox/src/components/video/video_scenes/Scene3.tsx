import { motion } from 'framer-motion';

const E = [0.22, 1, 0.36, 1] as const;

const COLUMNS = [
  {
    label: 'Sourcing', dot: 'bg-slate-500', color: 'text-slate-400',
    deals: [
      { name: 'Greenfield Health', code: 'GH-012', tier: 'P1', score: 71 },
      { name: 'MedTech Ventures', code: 'MT-019', tier: 'P2', score: 58 },
    ],
  },
  {
    label: 'In Diligence', dot: 'bg-blue-500', color: 'text-blue-400',
    deals: [
      { name: 'Project Orion', code: 'OR-003', tier: 'MW', score: 91 },
      { name: 'Coastal Med', code: 'CM-007', tier: 'P1', score: 68 },
    ],
  },
  {
    label: 'Term Sheet', dot: 'bg-amber-500', color: 'text-amber-400',
    deals: [
      { name: 'StellarPath', code: 'SP-022', tier: 'P1', score: 77 },
    ],
    highlight: true,
  },
  {
    label: 'Closing', dot: 'bg-emerald-500', color: 'text-emerald-400',
    deals: [
      { name: 'Project Nova', code: 'NV-001', tier: 'MW', score: 96 },
    ],
  },
];

const TIER_CLS: Record<string, string> = {
  MW: 'bg-red-500/15 text-red-400 border-red-500/30',
  P1: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  P2: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
};

export function Scene3() {
  return (
    <motion.div
      className="absolute inset-0 z-10 flex flex-col px-10 py-10"
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -18 }}
      transition={{ duration: 0.65, ease: E }}
    >
      {/* Header */}
      <motion.div
        className="mb-7"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1, ease: E }}
      >
        <p className="text-[9px] font-mono uppercase tracking-[0.25em] text-white/30 mb-1">Pipeline</p>
        <h2 className="font-bold text-white" style={{ fontSize: 'clamp(18px, 2.6vw, 34px)', letterSpacing: '-0.02em' }}>
          Kanban Pipeline View
        </h2>
      </motion.div>

      {/* Kanban columns */}
      <div className="flex gap-4 flex-1 min-h-0">
        {COLUMNS.map((col, ci) => (
          <motion.div
            key={col.label}
            className="flex-1 flex flex-col bg-white/[0.03] border border-white/8 rounded-2xl overflow-hidden"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.2 + ci * 0.1, ease: E }}
          >
            {/* Column header */}
            <div className="flex items-center gap-2 px-4 py-3 border-b border-white/8 shrink-0">
              <span className={`w-2 h-2 rounded-full ${col.dot}`} />
              <span className={`text-[11px] font-semibold uppercase tracking-wider ${col.color}`}>{col.label}</span>
              <span className="ml-auto text-[10px] font-mono text-white/25">{col.deals.length}</span>
            </div>

            {/* Deal cards */}
            <div className="flex flex-col gap-2.5 p-3 flex-1">
              {col.deals.map((deal, di) => {
                const isHighlight = col.highlight && di === 0;
                return (
                  <motion.div
                    key={deal.code}
                    className={`rounded-xl p-3 border transition-shadow ${
                      isHighlight
                        ? 'bg-blue-500/10 border-blue-500/40 shadow-[0_0_0_1px_rgba(59,130,246,0.25),0_4px_20px_rgba(59,130,246,0.15)]'
                        : 'bg-white/[0.05] border-white/10'
                    }`}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.4, delay: 0.35 + ci * 0.1 + di * 0.08, ease: E }}
                  >
                    <div className="text-[12px] font-semibold text-white leading-tight mb-2">{deal.name}</div>
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] font-mono text-white/30">{deal.code}</span>
                      <div className="flex items-center gap-1.5">
                        <span className={`text-[9px] font-mono border rounded px-1.5 py-0.5 ${TIER_CLS[deal.tier]}`}>{deal.tier}</span>
                        <span className="text-[10px] font-mono font-bold text-white/50">{deal.score}</span>
                      </div>
                    </div>
                    {isHighlight && (
                      <motion.div
                        className="mt-2.5 pt-2 border-t border-blue-500/20 text-[9px] font-mono text-blue-400/70 flex items-center gap-1"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 1.2 }}
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                        Drag to update stage
                      </motion.div>
                    )}
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        ))}
      </div>

      {/* Drag hint */}
      <motion.p
        className="mt-4 text-center text-[10px] font-mono text-white/20 tracking-wider"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.8 }}
      >
        Drag cards between stages · Reason dialog appears on drop · Full audit trail recorded
      </motion.p>
    </motion.div>
  );
}

import { motion } from 'framer-motion';

const E = [0.22, 1, 0.36, 1] as const;

const COLUMNS = [
  {
    label: 'Sourcing', dot: 'bg-slate-500', color: 'text-slate-400',
    deals: [
      { name: 'Greenfield Health', code: 'GH-012', tier: 'P1', score: 71 },
      { name: 'MedTech Ventures',  code: 'MT-019', tier: 'P2', score: 58 },
    ],
  },
  {
    label: 'In Diligence', dot: 'bg-blue-500', color: 'text-blue-400',
    deals: [
      { name: 'Project Orion', code: 'OR-003', tier: 'MW', score: 91 },
      { name: 'Coastal Med',   code: 'CM-007', tier: 'P1', score: 68 },
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

const TIER: Record<string, string> = {
  MW: 'bg-red-500/15 text-red-400 border-red-500/30',
  P1: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  P2: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
};

export function Scene3() {
  return (
    <motion.div
      className="absolute inset-0 z-10 flex flex-col px-10 pt-9 pb-5"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.65, ease: E }}
    >
      {/* Headline — message first */}
      <div className="mb-7">
        <motion.p
          className="text-[9px] font-mono uppercase tracking-[0.28em] text-white/25 mb-3"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.1 }}
        >
          Kanban Pipeline
        </motion.p>
        <div style={{ overflow: 'hidden' }}>
          <motion.h2
            style={{ fontSize: 'clamp(22px, 3.2vw, 44px)', fontWeight: 800, letterSpacing: '-0.025em', color: 'rgba(255,255,255,0.55)', lineHeight: 1.15 }}
            initial={{ y: '105%' }}
            animate={{ y: 0 }}
            transition={{ duration: 0.65, delay: 0.15, ease: E }}
          >
            Move deals forward.
          </motion.h2>
        </div>
        <div style={{ overflow: 'hidden' }}>
          <motion.h2
            style={{ fontSize: 'clamp(22px, 3.2vw, 44px)', fontWeight: 800, letterSpacing: '-0.025em', color: '#fff', lineHeight: 1.15 }}
            initial={{ y: '105%' }}
            animate={{ y: 0 }}
            transition={{ duration: 0.65, delay: 0.28, ease: E }}
          >
            Drag, drop, and record your reasoning.
          </motion.h2>
        </div>
      </div>

      {/* Kanban board */}
      <div className="flex gap-3 flex-1 min-h-0">
        {COLUMNS.map((col, ci) => (
          <motion.div
            key={col.label}
            className="flex-1 flex flex-col bg-white/[0.03] border border-white/8 rounded-2xl overflow-hidden"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.5 + ci * 0.09, ease: E }}
          >
            <div className="flex items-center gap-2 px-3.5 py-2.5 border-b border-white/8 shrink-0">
              <span className={`w-1.5 h-1.5 rounded-full ${col.dot}`} />
              <span className={`text-[10px] font-semibold uppercase tracking-wider ${col.color}`}>{col.label}</span>
              <span className="ml-auto text-[9px] font-mono text-white/20">{col.deals.length}</span>
            </div>
            <div className="flex flex-col gap-2 p-2.5 flex-1">
              {col.deals.map((deal, di) => {
                const glow = col.highlight && di === 0;
                return (
                  <motion.div
                    key={deal.code}
                    className={`rounded-xl p-3 border ${glow
                      ? 'bg-blue-500/10 border-blue-500/35 shadow-[0_0_0_1px_rgba(59,130,246,0.2),0_4px_16px_rgba(59,130,246,0.12)]'
                      : 'bg-white/[0.04] border-white/10'}`}
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.4, delay: 0.6 + ci * 0.09 + di * 0.07, ease: E }}
                  >
                    <div className="text-[11px] font-semibold text-white leading-tight mb-2">{deal.name}</div>
                    <div className="flex items-center justify-between">
                      <span className="text-[8px] font-mono text-white/25">{deal.code}</span>
                      <div className="flex items-center gap-1.5">
                        <span className={`text-[8px] font-mono border rounded px-1.5 py-0.5 ${TIER[deal.tier]}`}>{deal.tier}</span>
                        <span className="text-[10px] font-mono font-bold text-white/45">{deal.score}</span>
                      </div>
                    </div>
                    {glow && (
                      <motion.div
                        className="mt-2 pt-2 border-t border-blue-500/20 text-[8px] font-mono text-blue-400/60"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 1.4 }}
                      >
                        ↗ Drag to Term Sheet · reason captured
                      </motion.div>
                    )}
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}

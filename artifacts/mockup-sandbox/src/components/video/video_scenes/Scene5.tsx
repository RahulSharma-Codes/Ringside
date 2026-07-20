import { motion } from 'framer-motion';

const FLAGS = [
  {
    deal: 'Project Atlas',
    code: 'AT-001',
    flag: 'No interaction in 18 days',
    tier: 'Must-Win',
    stage: 'Term Sheet',
    type: 'must_win_no_activity',
    color: 'border-red-500/30 bg-red-500/5',
    badge: 'bg-red-500/15 text-red-400',
    icon: '⚠',
  },
  {
    deal: 'Project Orion',
    code: 'OR-003',
    flag: '2 diligence workstreams blocked',
    tier: 'Must-Win',
    stage: 'Diligence',
    type: 'blocked',
    color: 'border-red-500/30 bg-red-500/5',
    badge: 'bg-red-500/15 text-red-400',
    icon: '⛔',
  },
  {
    deal: 'Coastal Med',
    code: 'CM-007',
    flag: 'NDA expiring in 11 days',
    tier: 'Priority 1',
    stage: 'Diligence',
    type: 'nda_expiry',
    color: 'border-amber-500/30 bg-amber-500/5',
    badge: 'bg-amber-500/15 text-amber-400',
    icon: '⏳',
  },
];

export function Scene5() {
  return (
    <motion.div
      className="absolute inset-0 z-10 flex flex-col items-center justify-center px-10 py-10"
      initial={{ opacity: 0, scale: 1.03 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
    >
      <motion.h2
        className="font-bold text-white text-center mb-8 tracking-tight"
        style={{ fontSize: 'clamp(20px, 3vw, 42px)' }}
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
      >
        Always know what needs attention.
      </motion.h2>

      <div className="w-[75%] flex flex-col gap-3">
        {FLAGS.map((item, i) => (
          <motion.div
            key={item.deal}
            className={`w-full border rounded-2xl p-4 flex items-center justify-between gap-4 ${item.color}`}
            initial={{ opacity: 0, x: -24 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: i * 0.18 + 0.4, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-base shrink-0 ${item.badge}`}>
                {item.icon}
              </div>
              <div className="min-w-0">
                <div className="text-[13px] font-semibold text-white truncate">{item.deal}</div>
                <div className="text-[11px] text-slate-400 mt-0.5">{item.flag}</div>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className={`text-[10px] font-mono border rounded px-1.5 py-0.5 ${item.badge} border-current/20`}>
                {item.tier === 'Must-Win' ? 'MW' : 'P1'}
              </span>
              <span className="text-[10px] text-slate-500 font-mono hidden sm:block">{item.stage}</span>
            </div>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}

import { motion } from 'framer-motion';

const MESSAGES = [
  { role: 'user', text: "What's the status of Project Orion?", delay: 0.8 },
  { role: 'ai',   text: 'Project Orion is in Diligence. Tax and Integration workstreams are blocked. 2 actions overdue. IC presentation due in 14 days.', delay: 2.0 },
  { role: 'user', text: 'Any Must-Win deals without recent activity?', delay: 4.2 },
  { role: 'ai',   text: 'Project Atlas has had no interaction in 18 days. Consider scheduling a check-in with the counterparty.', delay: 5.4 },
];

export function Scene4() {
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
        AI that knows your deals.
      </motion.h2>

      <motion.div
        className="w-[68%] bg-white/[0.04] border border-white/10 rounded-2xl p-6 flex flex-col gap-4"
        style={{ maxHeight: '60%', overflowY: 'hidden' }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3, duration: 0.5 }}
      >
        {MESSAGES.map((msg, i) => (
          <motion.div
            key={i}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            initial={{ opacity: 0, x: msg.role === 'user' ? 16 : -16 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: msg.delay }}
          >
            <div
              className={`max-w-[85%] px-4 py-3 rounded-2xl text-[12px] leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-blue-600/25 text-blue-200 rounded-tr-sm border border-blue-500/20'
                  : 'bg-white/[0.07] text-slate-200 rounded-tl-sm border border-white/10'
              }`}
            >
              {msg.role === 'ai' && (
                <div className="text-[9px] font-mono text-blue-400/70 uppercase tracking-wider mb-1">Ringside AI</div>
              )}
              {msg.text}
            </div>
          </motion.div>
        ))}
      </motion.div>
    </motion.div>
  );
}

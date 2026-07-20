import { motion, AnimatePresence } from 'framer-motion';
import { useEffect, useState } from 'react';

const E = [0.22, 1, 0.36, 1] as const;

function TypingDots() {
  return (
    <div className="flex items-center gap-1.5 px-4 py-3">
      {[0, 1, 2].map(i => (
        <motion.div
          key={i}
          className="w-2 h-2 rounded-full bg-slate-500"
          animate={{ opacity: [0.3, 1, 0.3], y: [0, -4, 0] }}
          transition={{ duration: 1, repeat: Infinity, delay: i * 0.22, ease: 'easeInOut' }}
        />
      ))}
    </div>
  );
}

const MESSAGES = [
  {
    role: 'user' as const,
    text: "What needs my attention across Must-Win deals today?",
    at: 1.0,
  },
  {
    role: 'ai' as const,
    text: "3 things need your attention:\n\n① Project Atlas — no interaction in 18 days. Must-Win at Term Sheet.\n\n② Project Orion — Tax and Integration workstreams blocked. IC presentation in 14 days.\n\n③ Project Nova (Closing) — NDA expires in 11 days. Renewal needed before close.",
    at: 3.2,
    typing: 2.0,
  },
];

export function Scene5() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), MESSAGES[0].at * 1000),
      setTimeout(() => setPhase(2), MESSAGES[1].at * 1000),
      setTimeout(() => setPhase(3), (MESSAGES[1].at + MESSAGES[1].typing!) * 1000),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div
      className="absolute inset-0 z-10 flex flex-col px-10 py-10"
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -18 }}
      transition={{ duration: 0.65, ease: E }}
    >
      {/* Header */}
      <motion.div className="mb-7" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.1, ease: E }}>
        <p className="text-[9px] font-mono uppercase tracking-[0.25em] text-white/30 mb-1">Ringside</p>
        <h2 className="font-bold text-white" style={{ fontSize: 'clamp(18px, 2.6vw, 34px)', letterSpacing: '-0.02em' }}>
          AI Copilot
        </h2>
      </motion.div>

      {/* Chat panel — fixed height, no overflow */}
      <div className="flex-1 bg-white/[0.03] border border-white/8 rounded-2xl flex flex-col overflow-hidden">

        {/* Chat header */}
        <div className="px-5 py-3.5 border-b border-white/8 flex items-center gap-2.5 shrink-0">
          <div className="w-2 h-2 rounded-full bg-blue-500" />
          <span className="text-[11px] font-semibold text-white/60">Ringside AI</span>
          <span className="ml-auto text-[9px] font-mono text-white/20">GPT-4o · Live DB context</span>
        </div>

        {/* Messages */}
        <div className="flex-1 flex flex-col justify-end gap-3 p-5 overflow-hidden">
          <AnimatePresence>
            {/* User message */}
            {phase >= 1 && (
              <motion.div
                key="user"
                className="self-end max-w-[70%] bg-blue-600/25 border border-blue-500/20 rounded-2xl rounded-tr-sm px-4 py-3"
                initial={{ opacity: 0, x: 16, scale: 0.97 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                transition={{ duration: 0.4, ease: E }}
              >
                <p className="text-[12px] text-blue-100 leading-relaxed">{MESSAGES[0].text}</p>
              </motion.div>
            )}

            {/* Typing dots */}
            {phase === 2 && (
              <motion.div
                key="typing"
                className="self-start bg-white/[0.06] border border-white/10 rounded-2xl rounded-tl-sm"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.3, ease: E }}
              >
                <TypingDots />
              </motion.div>
            )}

            {/* AI response */}
            {phase >= 3 && (
              <motion.div
                key="ai"
                className="self-start max-w-[85%] bg-white/[0.06] border border-white/10 rounded-2xl rounded-tl-sm px-4 py-3"
                initial={{ opacity: 0, x: -16, scale: 0.97 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                transition={{ duration: 0.45, ease: E }}
              >
                <p className="text-[9px] font-mono text-blue-400/70 uppercase tracking-wider mb-2">Ringside AI</p>
                <p className="text-[12px] text-slate-200 leading-relaxed" style={{ whiteSpace: 'pre-line' }}>
                  {MESSAGES[1].text}
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Input bar */}
        <div className="px-5 py-3.5 border-t border-white/8 flex items-center gap-3 shrink-0">
          <div className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2.5">
            <span className="text-[11px] text-white/20 font-mono">Ask about any deal, action, or milestone…</span>
          </div>
          <div className="w-8 h-8 rounded-xl bg-blue-600/40 border border-blue-500/30 flex items-center justify-center text-blue-300 text-[13px]">↑</div>
        </div>
      </div>
    </motion.div>
  );
}

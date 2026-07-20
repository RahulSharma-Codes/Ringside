import { motion, AnimatePresence } from 'framer-motion';
import { useEffect, useState } from 'react';

const E = [0.22, 1, 0.36, 1] as const;

function Dots() {
  return (
    <div className="flex items-center gap-1.5 px-4 py-3">
      {[0, 1, 2].map(i => (
        <motion.div
          key={i}
          className="w-2 h-2 rounded-full bg-slate-500"
          animate={{ opacity: [0.3, 1, 0.3], y: [0, -4, 0] }}
          transition={{ duration: 1, repeat: Infinity, delay: i * 0.2, ease: 'easeInOut' }}
        />
      ))}
    </div>
  );
}

export function Scene5() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const t1 = setTimeout(() => setPhase(1), 1200);
    const t2 = setTimeout(() => setPhase(2), 3000);
    const t3 = setTimeout(() => setPhase(3), 5200);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, []);

  return (
    <motion.div
      className="absolute inset-0 z-10 flex flex-col px-10 pt-9 pb-5"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.65, ease: E }}
    >
      {/* Headline */}
      <div className="mb-7">
        <motion.p
          className="text-[9px] font-mono uppercase tracking-[0.28em] text-white/25 mb-3"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.1 }}
        >
          AI Copilot
        </motion.p>
        <div style={{ overflow: 'hidden' }}>
          <motion.h2
            style={{ fontSize: 'clamp(22px, 3.2vw, 44px)', fontWeight: 800, letterSpacing: '-0.025em', color: 'rgba(255,255,255,0.55)', lineHeight: 1.15 }}
            initial={{ y: '105%' }}
            animate={{ y: 0 }}
            transition={{ duration: 0.65, delay: 0.15, ease: E }}
          >
            An AI advisor who has read
          </motion.h2>
        </div>
        <div style={{ overflow: 'hidden' }}>
          <motion.h2
            style={{ fontSize: 'clamp(22px, 3.2vw, 44px)', fontWeight: 800, letterSpacing: '-0.025em', color: '#fff', lineHeight: 1.15 }}
            initial={{ y: '105%' }}
            animate={{ y: 0 }}
            transition={{ duration: 0.65, delay: 0.28, ease: E }}
          >
            every deal, action, and interaction.
          </motion.h2>
        </div>
      </div>

      {/* Chat panel — flex-1 with fixed layout, no overflow */}
      <div className="flex-1 bg-white/[0.03] border border-white/8 rounded-2xl flex flex-col min-h-0">
        {/* Chat header */}
        <div className="px-5 py-3 border-b border-white/8 flex items-center gap-2.5 shrink-0">
          <div className="w-2 h-2 rounded-full bg-blue-500" />
          <span className="text-[11px] font-semibold text-white/55">Ringside AI</span>
          <span className="ml-auto text-[9px] font-mono text-white/18">GPT-4o · Live DB context · {new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
        </div>

        {/* Messages — fixed height, overflow visible but content sized to fit */}
        <div className="flex flex-col justify-end gap-3 px-5 pt-4 pb-4 flex-1 min-h-0">
          <AnimatePresence>
            {phase >= 1 && (
              <motion.div
                key="user"
                className="self-end bg-blue-600/22 border border-blue-500/20 rounded-2xl rounded-tr-sm px-4 py-2.5"
                style={{ maxWidth: '68%' }}
                initial={{ opacity: 0, x: 14, scale: 0.96 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                transition={{ duration: 0.4, ease: E }}
              >
                <p className="text-[12px] text-blue-100 leading-relaxed">
                  What needs my attention across Must-Win deals today?
                </p>
              </motion.div>
            )}
            {phase === 2 && (
              <motion.div
                key="dots"
                className="self-start bg-white/[0.06] border border-white/10 rounded-2xl rounded-tl-sm"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.3, ease: E }}
              >
                <Dots />
              </motion.div>
            )}
            {phase >= 3 && (
              <motion.div
                key="ai"
                className="self-start bg-white/[0.06] border border-white/10 rounded-2xl rounded-tl-sm px-4 py-3"
                style={{ maxWidth: '88%' }}
                initial={{ opacity: 0, x: -14, scale: 0.96 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                transition={{ duration: 0.45, ease: E }}
              >
                <p className="text-[9px] font-mono text-blue-400/65 uppercase tracking-wider mb-2">Ringside AI</p>
                <p className="text-[12px] text-slate-200 leading-relaxed">
                  3 things need your attention:<br/>
                  <br/>
                  <span className="text-white/80">① Project Atlas</span> — no interaction in 18 days. Must-Win at Term Sheet.<br/>
                  <span className="text-white/80">② Project Orion</span> — Tax &amp; Integration blocked. IC presentation in 14 days.<br/>
                  <span className="text-white/80">③ Project Nova</span> — NDA expires in 11 days. Renewal needed before close.
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Input bar */}
        <div className="px-5 py-3 border-t border-white/8 flex items-center gap-3 shrink-0">
          <div className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2">
            <span className="text-[10px] text-white/18 font-mono">Ask about any deal, action, or milestone…</span>
          </div>
          <div className="w-7 h-7 rounded-xl bg-blue-600/40 border border-blue-500/28 flex items-center justify-center text-blue-300 text-[12px]">↑</div>
        </div>
      </div>
    </motion.div>
  );
}

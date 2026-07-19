import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

export function Scene1() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 500),
      setTimeout(() => setPhase(2), 1500),
      setTimeout(() => setPhase(3), 3000),
      setTimeout(() => setPhase(4), 7000), // exit
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div 
      className="absolute inset-0 flex items-center justify-center z-10"
      initial={{ opacity: 0, clipPath: 'circle(0% at 50% 50%)' }}
      animate={{ opacity: 1, clipPath: 'circle(150% at 50% 50%)' }}
      exit={{ opacity: 0, scale: 1.1, filter: 'blur(20px)' }}
      transition={{ duration: 1.5, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="text-center">
        <motion.div 
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: phase >= 1 ? 0 : 20, opacity: phase >= 1 ? 1 : 0 }}
          transition={{ duration: 1 }}
          className="inline-block mb-6 px-4 py-1.5 rounded-full border border-primary/30 bg-primary/10 text-primary uppercase tracking-widest text-xs font-semibold"
        >
          Deal Intelligence Platform
        </motion.div>
        
        <h1 className="text-[5vw] font-display font-bold tracking-tight text-foreground leading-tight">
          {'Every great acquisition'.split(' ').map((word, i) => (
            <motion.span 
              key={i} 
              className="inline-block mr-[1.5vw]"
              initial={{ opacity: 0, y: 40, rotateX: -30 }}
              animate={phase >= 2 ? { opacity: 1, y: 0, rotateX: 0 } : { opacity: 0, y: 40, rotateX: -30 }}
              transition={{ type: 'spring', stiffness: 300, damping: 20, delay: i * 0.1 }}
            >
              {word}
            </motion.span>
          ))}
          <br />
          {'starts with the right intelligence.'.split(' ').map((word, i) => (
            <motion.span 
              key={i} 
              className="inline-block mr-[1.5vw] text-muted-foreground"
              initial={{ opacity: 0, y: 40, rotateX: -30 }}
              animate={phase >= 3 ? { opacity: 1, y: 0, rotateX: 0 } : { opacity: 0, y: 40, rotateX: -30 }}
              transition={{ type: 'spring', stiffness: 300, damping: 20, delay: i * 0.1 + 0.3 }}
            >
              {word}
            </motion.span>
          ))}
        </h1>
      </div>
    </motion.div>
  );
}

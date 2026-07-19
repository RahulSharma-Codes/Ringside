import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

export function Scene6() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 500),
      setTimeout(() => setPhase(2), 2000),
      setTimeout(() => setPhase(3), 11000), // exit
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div 
      className="absolute inset-0 flex items-center justify-center z-10 bg-background"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, filter: 'blur(20px)' }}
      transition={{ duration: 1.5 }}
    >
      <div className="text-center relative z-20">
        <motion.h2 
          className="text-[8vw] font-display font-bold tracking-tighter text-foreground"
          initial={{ scale: 0.8, opacity: 0 }}
          animate={phase >= 1 ? { scale: 1, opacity: 1 } : { scale: 0.8, opacity: 0 }}
          transition={{ duration: 1.2, ease: "easeOut" }}
        >
          Ringside.
        </motion.h2>
        
        <motion.div 
          className="mt-4 text-[1.5vw] font-body text-muted-foreground tracking-wide"
          initial={{ y: 20, opacity: 0 }}
          animate={phase >= 2 ? { y: 0, opacity: 1 } : { y: 20, opacity: 0 }}
          transition={{ duration: 1, delay: 0.2 }}
        >
          Deal intelligence for the Manipal Group.
        </motion.div>
        
        <motion.div 
          className="mt-8 text-xs uppercase tracking-[0.2em] text-primary"
          initial={{ opacity: 0 }}
          animate={phase >= 2 ? { opacity: 1 } : { opacity: 0 }}
          transition={{ duration: 1, delay: 0.8 }}
        >
          Corporate Development & Strategy
        </motion.div>
      </div>
      
      {/* Decorative line work */}
      <motion.div 
        className="absolute bottom-0 left-0 w-full h-[1px] bg-primary/20"
        initial={{ scaleX: 0 }}
        animate={{ scaleX: phase >= 2 ? 1 : 0 }}
        transition={{ duration: 2, ease: "easeInOut" }}
      />
    </motion.div>
  );
}

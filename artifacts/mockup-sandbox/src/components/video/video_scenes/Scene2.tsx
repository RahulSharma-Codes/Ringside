import { motion } from 'framer-motion';

export function Scene2() {
  return (
    <motion.div 
      className="absolute inset-0 z-10 flex flex-col items-center justify-center p-20"
      initial={{ opacity: 0, x: 100 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -100 }}
      transition={{ duration: 1 }}
    >
      <h2 className="text-[3vw] font-display font-bold text-white mb-10 text-center">
        See your entire pipeline at a glance.
      </h2>
      <div className="flex gap-4 w-full h-[60%]">
        {[1, 2, 3, 4].map((col, i) => (
          <motion.div 
            key={col} 
            className="flex-1 bg-card/50 border border-border rounded-xl p-4 flex flex-col gap-4"
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.2 + 0.5 }}
          >
            <div className="h-4 w-24 bg-muted rounded mb-4" />
            <motion.div className="h-20 bg-card rounded-lg border border-border" animate={{ y: [0, -5, 0] }} transition={{ repeat: Infinity, duration: 4, delay: i }} />
            <motion.div className="h-20 bg-card rounded-lg border border-border" animate={{ y: [0, -5, 0] }} transition={{ repeat: Infinity, duration: 4.5, delay: i }} />
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}

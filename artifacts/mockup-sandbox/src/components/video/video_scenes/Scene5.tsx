import { motion } from 'framer-motion';

export function Scene5() {
  return (
    <motion.div 
      className="absolute inset-0 z-10 flex flex-col items-center justify-center p-20"
      initial={{ opacity: 0, scale: 1.1 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ duration: 1 }}
    >
      <h2 className="text-[3vw] font-display font-bold text-white mb-10 text-center">
        Always know what needs attention.
      </h2>
      <div className="w-[80%] flex flex-col gap-4">
        {[1, 2, 3].map((item, i) => (
          <motion.div 
            key={item} 
            className="w-full bg-card/80 border border-warning/30 rounded-xl p-6 flex items-center justify-between"
            initial={{ opacity: 0, x: -50 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.2 + 0.5 }}
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-warning/20 flex items-center justify-center text-warning font-bold">!</div>
              <div className="h-4 w-48 bg-muted rounded" />
            </div>
            <div className="h-8 w-24 bg-primary/20 rounded-full" />
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}

import { motion } from 'framer-motion';

export function Scene3() {
  return (
    <motion.div 
      className="absolute inset-0 z-10 flex flex-col items-center justify-center p-20"
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 1.1 }}
      transition={{ duration: 1 }}
    >
      <h2 className="text-[3vw] font-display font-bold text-white mb-10 text-center">
        Structured diligence. Zero blind spots.
      </h2>
      <div className="grid grid-cols-4 gap-6 w-full h-[60%] max-w-5xl">
        {[1, 2, 3, 4, 5, 6, 7, 8].map((item, i) => (
          <motion.div 
            key={item} 
            className="bg-card/50 border border-border rounded-xl p-6 flex flex-col justify-end"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.1 + 0.5 }}
          >
            <div className="w-full bg-muted rounded-full h-2 mt-auto overflow-hidden">
              <motion.div 
                className="bg-secondary h-full"
                initial={{ width: 0 }}
                animate={{ width: `${60 + Math.random() * 40}%` }}
                transition={{ duration: 2, delay: i * 0.1 + 1 }}
              />
            </div>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}

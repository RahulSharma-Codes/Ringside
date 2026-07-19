import { motion } from 'framer-motion';

export function Scene4() {
  return (
    <motion.div 
      className="absolute inset-0 z-10 flex flex-col items-center justify-center p-20"
      initial={{ opacity: 0, y: 100 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -100 }}
      transition={{ duration: 1 }}
    >
      <h2 className="text-[3vw] font-display font-bold text-white mb-10 text-center">
        AI that knows your deals.
      </h2>
      <motion.div 
        className="w-[60%] h-[50%] bg-card rounded-2xl border border-border p-8 flex flex-col gap-6"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
      >
        <motion.div 
          className="self-end bg-primary/20 text-primary px-6 py-3 rounded-2xl rounded-tr-none max-w-[80%]"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 1 }}
        >
          Show me the status of Project Orion.
        </motion.div>
        <motion.div 
          className="self-start bg-muted/50 text-foreground px-6 py-3 rounded-2xl rounded-tl-none max-w-[80%]"
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 2.5 }}
        >
          Project Orion is currently in Diligence. 3 workstreams are blocked.
        </motion.div>
      </motion.div>
    </motion.div>
  );
}

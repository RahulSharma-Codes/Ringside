import { motion, AnimatePresence } from 'framer-motion';
import { useVideoPlayer } from '../../lib/video/hooks';
import { Scene1 } from './video_scenes/Scene1';
import { Scene2 } from './video_scenes/Scene2';
import { Scene3 } from './video_scenes/Scene3';
import { Scene4 } from './video_scenes/Scene4';
import { Scene5 } from './video_scenes/Scene5';
import { Scene6 } from './video_scenes/Scene6';

const SCENE_DURATIONS = { open: 8000, pipeline: 10000, diligence: 10000, ai: 10000, review: 10000, close: 12000 };

export default function VideoTemplate() {
  const { currentScene } = useVideoPlayer({ durations: SCENE_DURATIONS });

  return (
    <div className="relative w-full h-screen overflow-hidden bg-background text-foreground">
      {/* Persistent Background layers */}
      <div className="absolute inset-0 z-0">
        <motion.div 
          className="absolute inset-0 bg-cover bg-center opacity-30"
          style={{ backgroundImage: `url(${import.meta.env.BASE_URL}images/bg1.png)` }}
          animate={{ scale: [1, 1.1, 1.05], opacity: [0.2, 0.4, 0.3] }}
          transition={{ duration: 30, repeat: Infinity, ease: 'linear' }}
        />
        <motion.div 
          className="absolute inset-0 bg-cover bg-center mix-blend-screen opacity-40"
          style={{ backgroundImage: `url(${import.meta.env.BASE_URL}images/bg3.png)` }}
          animate={{ rotate: [0, 2, -2, 0] }}
          transition={{ duration: 40, repeat: Infinity, ease: 'linear' }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/80 to-transparent" />
      </div>

      <AnimatePresence mode="popLayout">
        {currentScene === 0 && <Scene1 key="open" />}
        {currentScene === 1 && <Scene2 key="pipeline" />}
        {currentScene === 2 && <Scene3 key="diligence" />}
        {currentScene === 3 && <Scene4 key="ai" />}
        {currentScene === 4 && <Scene5 key="review" />}
        {currentScene === 5 && <Scene6 key="close" />}
      </AnimatePresence>
    </div>
  );
}

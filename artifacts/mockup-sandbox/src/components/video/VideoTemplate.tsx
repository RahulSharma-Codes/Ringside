import { motion, AnimatePresence } from 'framer-motion';
import { useVideoPlayer } from '../../lib/video/hooks';
import { useEffect, useRef, useState } from 'react';
import { Scene1 } from './video_scenes/Scene1';
import { Scene2 } from './video_scenes/Scene2';
import { Scene3 } from './video_scenes/Scene3';
import { Scene4 } from './video_scenes/Scene4';
import { Scene5 } from './video_scenes/Scene5';
import { Scene6 } from './video_scenes/Scene6';

const SCENE_DURATIONS = {
  open:      9000,
  dashboard: 10000,
  pipeline:  10000,
  diligence: 10000,
  ai:        10000,
  close:     11000,
};
const TOTAL = Object.values(SCENE_DURATIONS).reduce((a, b) => a + b, 0);
const SCENE_NAMES = ['Opening', 'Dashboard', 'Pipeline', 'Diligence', 'AI Copilot', 'Closing'];

export default function VideoTemplate() {
  const { currentScene, elapsed } = useVideoPlayer({ durations: SCENE_DURATIONS });
  const audioRef = useRef<HTMLAudioElement>(null);
  const [muted, setMuted] = useState(false);
  const [audioReady, setAudioReady] = useState(false);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = 0.45;
    audio.play().then(() => {
      setAudioReady(true);
    }).catch(() => {
      setMuted(true);
    });
  }, []);

  const toggleMute = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (muted) {
      audio.muted = false;
      audio.play().catch(() => {});
      setMuted(false);
    } else {
      audio.muted = true;
      setMuted(true);
    }
  };

  const progress = elapsed / TOTAL;

  return (
    <div
      className="relative w-full h-screen overflow-hidden select-none"
      style={{ background: '#06090f', fontFamily: 'Inter, system-ui, sans-serif' }}
    >
      {/* Audio */}
      <audio
        ref={audioRef}
        src={`${import.meta.env.BASE_URL}audio/ringside_bg.mp3`}
        loop
        preload="auto"
      />

      {/* Static background */}
      <div className="absolute inset-0 pointer-events-none z-0">
        <div className="absolute inset-0 opacity-[0.055]"
          style={{
            backgroundImage: 'linear-gradient(to right,#fff 1px,transparent 1px),linear-gradient(to bottom,#fff 1px,transparent 1px)',
            backgroundSize: '72px 72px',
          }}
        />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[420px]"
          style={{ background: 'radial-gradient(ellipse at center,rgba(59,130,246,0.18) 0%,transparent 72%)', filter: 'blur(2px)' }}
        />
        <div className="absolute bottom-0 right-1/4 w-[400px] h-[250px]"
          style={{ background: 'radial-gradient(ellipse at center,rgba(139,92,246,0.09) 0%,transparent 70%)' }}
        />
      </div>

      {/* Scenes */}
      <AnimatePresence mode="popLayout">
        {currentScene === 0 && <Scene1 key="open" />}
        {currentScene === 1 && <Scene2 key="dashboard" />}
        {currentScene === 2 && <Scene3 key="pipeline" />}
        {currentScene === 3 && <Scene4 key="diligence" />}
        {currentScene === 4 && <Scene5 key="ai" />}
        {currentScene === 5 && <Scene6 key="close" />}
      </AnimatePresence>

      {/* Scene label — top right */}
      <motion.div
        key={currentScene}
        className="absolute top-5 right-5 z-50 flex items-center gap-2"
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-white/20">
          {SCENE_NAMES[currentScene]}
        </span>
        <span className="text-[10px] font-mono text-white/15">
          {currentScene + 1}/{SCENE_NAMES.length}
        </span>
      </motion.div>

      {/* Progress bar — bottom */}
      <div className="absolute bottom-0 left-0 w-full h-[2px] bg-white/5 z-50">
        <motion.div
          className="h-full bg-blue-500/60"
          style={{ width: `${progress * 100}%` }}
          transition={{ ease: 'linear' }}
        />
      </div>

      {/* Mute toggle — bottom right */}
      <button
        onClick={toggleMute}
        className="absolute bottom-4 right-4 z-50 w-7 h-7 rounded-full flex items-center justify-center text-white/25 hover:text-white/60 transition-colors text-[14px]"
        title={muted ? 'Unmute' : 'Mute'}
      >
        {muted ? '🔇' : '🔊'}
      </button>
    </div>
  );
}

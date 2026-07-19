import { useEffect, useState } from 'react';

export function useVideoPlayer({ durations }: { durations: Record<string, number> }) {
  const [currentScene, setCurrentScene] = useState(0);
  const durationValues = Object.values(durations);

  useEffect(() => {
    // @ts-ignore
    window.startRecording?.();

    let currentIndex = 0;
    let timeout: ReturnType<typeof setTimeout>;

    const playNext = () => {
      timeout = setTimeout(() => {
        currentIndex++;
        if (currentIndex === durationValues.length) {
          // @ts-ignore
          window.stopRecording?.();
          setCurrentScene(0); // loop
          currentIndex = 0;
        } else {
          setCurrentScene(currentIndex);
        }
        playNext();
      }, durationValues[currentIndex]);
    };

    playNext();

    return () => clearTimeout(timeout);
  }, []);

  return { currentScene };
}

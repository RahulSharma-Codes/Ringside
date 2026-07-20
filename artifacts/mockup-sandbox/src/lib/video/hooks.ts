import { useEffect, useRef, useState } from 'react';

export function useVideoPlayer({ durations }: { durations: Record<string, number> }) {
  const [currentScene, setCurrentScene] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const durationValues = Object.values(durations);
  const startRef = useRef(Date.now());

  useEffect(() => {
    startRef.current = Date.now();
    let currentIndex = 0;
    let timeout: ReturnType<typeof setTimeout>;

    const playNext = () => {
      timeout = setTimeout(() => {
        currentIndex = (currentIndex + 1) % durationValues.length;
        setCurrentScene(currentIndex);
        if (currentIndex === 0) {
          startRef.current = Date.now();
          setElapsed(0);
        }
        playNext();
      }, durationValues[currentIndex]);
    };

    playNext();

    const ticker = setInterval(() => {
      setElapsed(Date.now() - startRef.current);
    }, 80);

    return () => {
      clearTimeout(timeout);
      clearInterval(ticker);
    };
  }, []);

  return { currentScene, elapsed };
}

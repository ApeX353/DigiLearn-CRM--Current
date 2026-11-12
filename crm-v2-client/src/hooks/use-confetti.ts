import { useCallback, useRef, useEffect } from "react";
import confetti from "canvas-confetti";

type ConfettiType = "burst" | "cannon" | "celebration";

interface UseConfettiOptions {
  colors?: string[];
  particleCount?: number;
  spread?: number;
  startVelocity?: number;
  decay?: number;
  scalar?: number;
}

export function useConfetti() {
  const lastFiredRef = useRef<Record<string, number>>({});
  const cooldown = 2000; // Prevent rapid re-firing

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      confetti.reset();
    };
  }, []);

  const fire = useCallback(
    (type: ConfettiType, options?: UseConfettiOptions) => {
      const now = Date.now();
      const key = type + JSON.stringify(options || {});
      
      // Prevent rapid re-firing of same animation
      if (lastFiredRef.current[key] && now - lastFiredRef.current[key] < cooldown) {
        return;
      }
      lastFiredRef.current[key] = now;

      const defaultColors = ["#22c55e", "#16a34a", "#4ade80", "#86efac"];
      const colors = options?.colors || defaultColors;

      switch (type) {
        case "burst":
          // Small burst - for completing individual items
          confetti({
            particleCount: options?.particleCount || 30,
            spread: options?.spread || 60,
            startVelocity: options?.startVelocity || 25,
            decay: options?.decay || 0.94,
            scalar: options?.scalar || 0.8,
            colors,
            origin: { y: 0.7, x: 0.5 },
            disableForReducedMotion: true,
          });
          break;

        case "cannon":
          // Medium cannon - for completing a step
          confetti({
            particleCount: options?.particleCount || 60,
            spread: options?.spread || 70,
            startVelocity: options?.startVelocity || 40,
            decay: options?.decay || 0.92,
            scalar: options?.scalar || 1,
            colors,
            origin: { y: 0.6, x: 0.5 },
            disableForReducedMotion: true,
          });
          break;

        case "celebration":
          // Grand celebration - for completing everything
          const duration = 2000;
          const animationEnd = Date.now() + duration;

          const frame = () => {
            confetti({
              particleCount: 3,
              angle: 60,
              spread: 55,
              origin: { x: 0 },
              colors,
              disableForReducedMotion: true,
            });
            confetti({
              particleCount: 3,
              angle: 120,
              spread: 55,
              origin: { x: 1 },
              colors,
              disableForReducedMotion: true,
            });

            if (Date.now() < animationEnd) {
              requestAnimationFrame(frame);
            }
          };

          frame();
          break;
      }
    },
    []
  );

  const fireFromElement = useCallback(
    (element: HTMLElement | null, options?: UseConfettiOptions) => {
      if (!element) return;

      const rect = element.getBoundingClientRect();
      const x = (rect.left + rect.width / 2) / window.innerWidth;
      const y = (rect.top + rect.height / 2) / window.innerHeight;

      const defaultColors = ["#22c55e", "#16a34a", "#4ade80", "#86efac"];
      const colors = options?.colors || defaultColors;

      confetti({
        particleCount: options?.particleCount || 40,
        spread: options?.spread || 60,
        startVelocity: options?.startVelocity || 30,
        decay: options?.decay || 0.94,
        scalar: options?.scalar || 0.9,
        colors,
        origin: { x, y },
        disableForReducedMotion: true,
      });
    },
    []
  );

  return { fire, fireFromElement };
}

import { useCallback, useEffect, useState } from "react";
import { useSound } from "../context/SoundContext";

export function useInactivityNudge(canAct: boolean, decision: string) {
  const { play } = useSound();
  const [shaking, setShaking] = useState(false);
  const [activity, setActivity] = useState(0);
  const reset = useCallback(() => setActivity((value) => value + 1), []);

  useEffect(() => {
    if (!canAct) return;
    let end: ReturnType<typeof setTimeout> | undefined;
    const timer = setTimeout(() => {
      setShaking(true);
      play("notification");
      end = setTimeout(() => setShaking(false), 2000);
    }, 15000);
    return () => {
      clearTimeout(timer);
      clearTimeout(end);
      setShaking(false);
    };
  }, [canAct, decision, activity, play]);

  return { shaking, reset };
}

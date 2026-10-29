import { useEffect, useRef } from "react";
import { useSound } from "../context/SoundContext";
import { FOOT_GATHER_DELAY_MS } from "../lib/footMotion";
import { Icon } from "./Icons";
import "../foot-pickup-notice.css";

/** Golf's going-out notice, held by the foot pickup rather than a separate timer. */
export function FootPickupNotice({ playerName }: { playerName: string }) {
  const { play } = useSound();
  const sound = useRef(play);
  sound.current = play;
  useEffect(() => {
    const timer = window.setTimeout(
      () => sound.current("deal"),
      FOOT_GATHER_DELAY_MS,
    );
    return () => window.clearTimeout(timer);
  }, []);
  return (
    <div
      className="foot-pickup-announcer"
      role="status"
      aria-label="Foot pickup"
      aria-live="polite"
      aria-atomic="true"
    >
      <div className="foot-pickup-notice">
        <Icon name="cards" />
        <div>
          <strong>{playerName} picked up their foot!</strong>
        </div>
      </div>
    </div>
  );
}

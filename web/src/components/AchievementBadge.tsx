import { useId, useState } from "react";
import type { Achievement } from "../lib/achievements";
import { AchievementIcon } from "./AchievementIcon";
import { Sparkle } from "./Sparkle";

export function AchievementBadge({
  achievement,
}: {
  achievement: Achievement;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const hidden = achievement.secret && !achievement.earned;
  const name = hidden ? "????" : achievement.name;
  const description = hidden
    ? "This is a secret achievement"
    : achievement.description;
  const status = achievement.earned
    ? `Unlocked${achievement.tier ? ` · ${achievement.tier}` : ""}`
    : "Locked";
  return (
    <div
      className="achievement-item"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        className={`achievement-badge ${achievement.earned ? "earned" : "locked"} ${achievement.tier ?? ""}`}
        aria-label={
          hidden ? "Secret achievement: Locked" : `${name}: ${status}`
        }
        aria-describedby={open ? id : undefined}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={() => setOpen(true)}
        onKeyDown={(event) => {
          if (event.key === "Escape") setOpen(false);
        }}
      >
        {achievement.earned && (
          <Sparkle className="achievement-sparkle" fill="white" />
        )}
        {hidden ? (
          <span aria-hidden="true">?</span>
        ) : (
          <AchievementIcon name={achievement.icon} />
        )}
      </button>
      <span
        className={`achievement-label ${achievement.earned ? "" : "locked"}`}
      >
        {name}
      </span>
      {open && (
        <div className="achievement-tooltip" id={id} role="tooltip">
          {!hidden && achievement.tier && (
            <small className="achievement-tooltip-tier">
              {achievement.tier}
            </small>
          )}
          <strong>{name}</strong>
          <span>{description}</span>
          {!hidden && achievement.flavorText && (
            <span className="achievement-tooltip-flavor">
              {achievement.flavorText}
            </span>
          )}
          {!hidden && achievement.progress && (
            <small>{achievement.progress}</small>
          )}
        </div>
      )}
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "../context/AuthContext";
import { ACHIEVEMENT_EVENT } from "../lib/achievementEvents";
import {
  computeAchievements,
  type Achievement,
  type AccountSummary,
} from "../lib/achievements";
import { request } from "../lib/api";
import { readStorage, writeStorage } from "../lib/storage";
import { AchievementIcon } from "./AchievementIcon";
import "../achievement-notifications.css";

const MAX_VISIBLE_TOASTS = 3;
const unlockId = (badge: Achievement) =>
  badge.tier ? `${badge.id}_${badge.tier}` : badge.id;

export function AchievementNotifications() {
  const { user } = useAuth();
  return user ? <AccountNotifications key={user.id} userId={user.id} /> : null;
}

function AccountNotifications({ userId }: { userId: string }) {
  const [notice, setNotice] = useState<Achievement[]>([]);
  const [portalTarget, setPortalTarget] = useState<HTMLElement>(document.body);
  const seenRef = useRef<Set<string> | null>(null);

  useEffect(() => {
    // Native modal dialogs cover and disable content outside their top layer.
    let currentTarget: HTMLElement = document.body;
    const updateTarget = () => {
      const dialogs =
        document.querySelectorAll<HTMLDialogElement>("dialog[open]");
      const target = dialogs[dialogs.length - 1] ?? document.body;
      if (target === currentTarget) return;
      currentTarget = target;
      setPortalTarget(target);
    };
    const observer = new MutationObserver(updateTarget);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["open"],
    });
    updateTarget();
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const key = `handandfoot.achievements-seen.v1:${encodeURIComponent(userId)}`;
    let alive = true;
    let version = 0;
    const refresh = () => {
      const current = ++version;
      void request<AccountSummary>("/achievements")
        .then((summary) => {
          if (!alive || current !== version) return;
          const earned = computeAchievements(summary).filter(
            (badge) => badge.earned,
          );
          const raw = readStorage<unknown>(key, null);
          const initialized = seenRef.current !== null || Array.isArray(raw);
          // Keep a memory copy when browser storage is unavailable.
          const seen = new Set(seenRef.current);
          if (Array.isArray(raw))
            raw.forEach((id) => {
              if (typeof id === "string") seen.add(id);
            });
          const fresh = earned.filter((badge) => !seen.has(unlockId(badge)));
          earned.forEach((badge) => {
            seen.add(unlockId(badge));
            if (badge.tier) {
              for (const tier of ["bronze", "silver", "gold"]) {
                seen.add(`${badge.id}_${tier}`);
                if (tier === badge.tier) break;
              }
            }
          });
          seenRef.current = seen;
          writeStorage(key, [...seen]);
          // Seed historical achievements quietly on the first successful load.
          if (initialized && fresh.length)
            setNotice((previous) => [...previous, ...fresh]);
        })
        .catch(() => {
          // Retry on the next gameplay, settings, focus or reconnect event.
        });
    };
    const events = [ACHIEVEMENT_EVENT, "focus", "online"];
    events.forEach((event) => window.addEventListener(event, refresh));
    refresh();
    return () => {
      alive = false;
      events.forEach((event) => window.removeEventListener(event, refresh));
    };
  }, [userId]);

  useEffect(() => {
    if (!notice.length) return;
    const timer = window.setTimeout(
      () => setNotice((previous) => previous.slice(MAX_VISIBLE_TOASTS)),
      3000,
    );
    return () => window.clearTimeout(timer);
  }, [notice]);

  if (!notice.length) return null;
  const visible = notice.slice(0, MAX_VISIBLE_TOASTS);
  const extra = notice.length - visible.length;
  return createPortal(
    <div
      className="achievement-toast-stack"
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      {visible.map((badge, index) => (
        <div key={unlockId(badge)} className="achievement-toast">
          <span className="achievement-toast-icon" data-tier={badge.tier}>
            <AchievementIcon name={badge.icon} />
          </span>
          <div className="achievement-toast-text">
            <div className="achievement-toast-label">Achievement Unlocked!</div>
            <div className="achievement-toast-name">{badge.name}</div>
            {badge.tier && (
              <div className="achievement-toast-tier">{badge.tier}</div>
            )}
            {index === visible.length - 1 && extra > 0 && (
              <div className="achievement-toast-more">+{extra} more</div>
            )}
          </div>
          <button
            type="button"
            className="achievement-toast-dismiss"
            aria-label={`Dismiss ${badge.name} achievement notification`}
            onClick={() =>
              setNotice((previous) =>
                previous.filter((item) => unlockId(item) !== unlockId(badge)),
              )
            }
          >
            ×
          </button>
        </div>
      ))}
    </div>,
    portalTarget,
  );
}

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { ActiveTable } from "../hooks/useActiveTable";

export function TableDialog({
  title,
  message,
  children,
  focusKey = "",
  onEscape,
}: {
  title: string;
  message: string;
  children: ReactNode;
  focusKey?: string;
  onEscape?: () => void;
}) {
  const body = useRef<HTMLElement>(null);
  const id = useId();
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const buttons = () => [
      ...(body.current?.querySelectorAll<HTMLButtonElement>(
        "button:not(:disabled)",
      ) ?? []),
    ];
    const trap = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const items = buttons();
      const index = items.indexOf(document.activeElement as HTMLButtonElement);
      if (!items.length) {
        event.preventDefault();
        body.current?.focus();
      } else if (
        index < 0 ||
        (!event.shiftKey && index === items.length - 1) ||
        (event.shiftKey && index === 0)
      ) {
        event.preventDefault();
        items[event.shiftKey ? items.length - 1 : 0].focus();
      }
    };
    document.addEventListener("keydown", trap);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", trap);
      previous?.focus();
    };
  }, []);
  useEffect(() => {
    (
      body.current?.querySelector<HTMLElement>("[data-cancel]") ??
      body.current?.querySelector<HTMLElement>("button:not(:disabled)") ??
      body.current
    )?.focus();
  }, [focusKey]);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onEscape?.();
      }
    };
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [onEscape]);
  return createPortal(
    <div className="table-dialog-backdrop">
      <section
        ref={body}
        className="table-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-message`}
        tabIndex={-1}
      >
        <h2 id={`${id}-title`}>{title}</h2>
        <p id={`${id}-message`}>{message}</p>
        {children}
      </section>
    </div>,
    document.body,
  );
}

export function TableProgressDialog({
  table,
  busy,
  error,
  online,
  onContinue,
  onLeave,
}: {
  table: ActiveTable;
  busy: boolean;
  error: string;
  online: boolean;
  onContinue: () => void;
  onLeave: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const solo = table.playMode === "practice";
  const playing = !["lobby", "finished"].includes(table.phase);
  return (
    <TableDialog
      title={
        confirming
          ? "Are you sure?"
          : solo
            ? "Game In Progress"
            : playing
              ? "Multiplayer Game In Progress"
              : "Lobby In Progress"
      }
      message={
        confirming
          ? solo
            ? "Are you sure you wish to concede? Only finished games count toward your statistics."
            : playing
              ? "Concede this game? You’ll give up your saved seat and can start or join a new lobby."
              : "Are you sure you want to leave the lobby?"
          : solo
            ? "You have a game active. Do you wish to continue playing?"
            : playing
              ? "You have a multiplayer game in progress. Rejoin?"
              : table.phase === "finished"
                ? "Your online group is between games. Rejoin?"
                : "You have an active lobby. Rejoin?"
      }
      focusKey={String(confirming)}
      onEscape={() => {
        if (!busy) setConfirming(false);
      }}
    >
      <div className="button-stack">
        {confirming ? (
          <>
            <button
              className="button"
              disabled={busy || !online}
              onClick={onLeave}
            >
              {busy ? "Leaving…" : "Yes"}
            </button>
            <button
              className="button secondary"
              data-cancel
              disabled={busy}
              onClick={() => setConfirming(false)}
            >
              No
            </button>
          </>
        ) : (
          <>
            <button className="button" disabled={busy} onClick={onContinue}>
              {solo ? "Continue" : "Rejoin"}
            </button>
            <button
              className="button secondary"
              disabled={busy || !online}
              onClick={() => setConfirming(true)}
            >
              {solo || playing ? "Concede" : "Leave"}
            </button>
          </>
        )}
      </div>
      {(error || !online) && (
        <p className="error" role="alert">
          {error || "You’re offline. Reconnect to leave, or rejoin your table."}
        </p>
      )}
    </TableDialog>
  );
}

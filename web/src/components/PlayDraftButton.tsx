import { useId, useState } from "react";

export function PlayDraftButton({
  count,
  total,
  minimum,
  onPlay,
  showRequirement = false,
  blocked = false,
  blockedReason = null,
}: {
  count: number;
  total: number;
  minimum: number | null;
  onPlay: () => void;
  showRequirement?: boolean;
  blocked?: boolean;
  blockedReason?: string | null;
}) {
  const tooltipId = useId();
  const [open, setOpen] = useState(false);
  const belowMinimum = minimum !== null && total < minimum;
  const requirement = belowMinimum
    ? `Meld must be greater than or equal to ${minimum} points`
    : blockedReason;
  const disabled = count === 0 || Boolean(requirement) || blocked;
  return (
    <span
      className="play-draft-control"
      role="group"
      aria-label="Play draft"
      aria-describedby={requirement ? tooltipId : undefined}
      tabIndex={requirement ? 0 : undefined}
      data-opening-blocked={belowMinimum}
      data-requirement-blocked={Boolean(requirement)}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      onClick={() => requirement && setOpen(true)}
      onKeyDown={(event) => {
        if (event.key === "Escape") setOpen(false);
        if (requirement && ["Enter", " "].includes(event.key)) {
          event.preventDefault();
          setOpen(true);
        }
      }}
    >
      <button
        className="button small"
        disabled={disabled}
        aria-describedby={requirement ? tooltipId : undefined}
        onClick={() => {
          if (!disabled) onPlay();
        }}
      >
        Play draft
      </button>
      {requirement && (
        <span
          className="opening-requirement-tooltip"
          role="tooltip"
          id={tooltipId}
          hidden={!open && !showRequirement}
        >
          {requirement}
        </span>
      )}
    </span>
  );
}

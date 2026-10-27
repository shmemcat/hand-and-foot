import { useId, useState } from "react";

export function PlayDraftButton({
  count,
  total,
  minimum,
  onPlay,
  showRequirement = false,
  blocked = false,
}: {
  count: number;
  total: number;
  minimum: number | null;
  onPlay: () => void;
  showRequirement?: boolean;
  blocked?: boolean;
}) {
  const tooltipId = useId();
  const [open, setOpen] = useState(false);
  const belowMinimum = minimum !== null && total < minimum;
  const disabled = count === 0 || belowMinimum || blocked;
  return (
    <span
      className="play-draft-control"
      role="group"
      aria-label="Play draft"
      aria-describedby={belowMinimum ? tooltipId : undefined}
      tabIndex={belowMinimum ? 0 : undefined}
      data-opening-blocked={belowMinimum}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      onClick={() => belowMinimum && setOpen(true)}
      onKeyDown={(event) => {
        if (event.key === "Escape") setOpen(false);
        if (belowMinimum && ["Enter", " "].includes(event.key)) {
          event.preventDefault();
          setOpen(true);
        }
      }}
    >
      <button
        className="button small"
        disabled={disabled}
        aria-describedby={belowMinimum ? tooltipId : undefined}
        onClick={() => {
          if (!disabled) onPlay();
        }}
      >
        Play draft
      </button>
      {belowMinimum && (
        <span
          className="opening-requirement-tooltip"
          role="tooltip"
          id={tooltipId}
          hidden={!open && !showRequirement}
        >
          Meld must be greater than or equal to {minimum} points
        </span>
      )}
    </span>
  );
}

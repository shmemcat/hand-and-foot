import { useId, useState, type ReactNode } from "react";

export function DrawFirstHint({
  blocked,
  label,
  hint = "Draw your second card from the deck first.",
  children,
}: {
  blocked: boolean;
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  return (
    <span
      className="draw-first-control"
      data-blocked={blocked}
      role={blocked ? "group" : undefined}
      aria-label={blocked ? label : undefined}
      aria-describedby={blocked ? id : undefined}
      tabIndex={blocked ? 0 : undefined}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      onClick={() => blocked && setOpen(true)}
      onKeyDown={(event) => {
        if (event.key === "Escape" && blocked && open) {
          event.stopPropagation();
          setOpen(false);
        }
        if (blocked && ["Enter", " "].includes(event.key)) {
          event.preventDefault();
          setOpen(true);
        }
      }}
    >
      {children}
      {blocked && (
        <span
          className="draw-first-tooltip"
          role="tooltip"
          id={id}
          hidden={!open}
        >
          {hint}
        </span>
      )}
    </span>
  );
}

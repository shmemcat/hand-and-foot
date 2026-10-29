export function ResultsToggle({
  hidden,
  onToggle,
  controls,
}: {
  hidden: boolean;
  onToggle: () => void;
  controls: string;
}) {
  const label = `${hidden ? "Show" : "Hide"} results`;
  return (
    <button
      type="button"
      className="results-toggle"
      aria-label={label}
      title={label}
      aria-expanded={!hidden}
      aria-controls={controls}
      onClick={onToggle}
    >
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" />
        <circle cx="12" cy="12" r="3" />
        {!hidden && <path d="m3 3 18 18" />}
      </svg>
    </button>
  );
}

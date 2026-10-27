export function Book({
  className = "",
  decorative = true,
}: {
  className?: string;
  decorative?: boolean;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.1"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden={decorative}
    >
      <path d="M12 7v14" />
      <path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z" />
    </svg>
  );
}
export function Icon({ name }: { name: keyof typeof iconData }) {
  const icon = iconData[name];
  return (
    <svg
      width="21"
      height="21"
      viewBox={icon.viewBox}
      fill="currentColor"
      aria-hidden="true"
    >
      {icon.paths.map((path, index) => (
        <path key={index} d={path} />
      ))}
    </svg>
  );
}
import { iconData } from "./iconData";

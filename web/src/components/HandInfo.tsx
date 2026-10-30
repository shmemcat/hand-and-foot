/** The same compact title and count used in hand headings and partner tabs. */
export function HandInfo({ title, count }: { title: string; count: number }) {
  return (
    <span className="hand-info">
      <span className="eyebrow">{title}</span>
      <span>
        {count} {count === 1 ? "card" : "cards"}
      </span>
    </span>
  );
}

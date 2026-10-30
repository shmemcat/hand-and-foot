import { HandInfo } from "./HandInfo";

export function HandTabs({
  hands,
  selected,
  onSelect,
  disabled = false,
}: {
  hands: { id: string; title: string; count: number }[];
  selected?: string;
  onSelect: (id: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="hand-owner-tabs" role="group" aria-label="Player hands">
      {hands.map((hand) => (
        <button
          key={hand.id}
          type="button"
          className="hand-owner-tab"
          aria-pressed={hand.id === selected}
          aria-label={`View ${hand.title}, ${hand.count} ${hand.count === 1 ? "card" : "cards"}`}
          title={hand.title}
          disabled={disabled}
          onClick={() => onSelect(hand.id)}
        >
          <HandInfo title={hand.title} count={hand.count} />
        </button>
      ))}
    </div>
  );
}

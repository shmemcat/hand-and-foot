import type { BotDifficulty as Difficulty } from "../types";
import "../bot-difficulty.css";

const descriptions: Record<Difficulty, string> = {
  easy: "Straightforward play while you learn.",
  medium: "Balanced play with planned melds and discard pickups.",
  hard: "Plans further ahead and watches opponents’ open piles.",
};

export function BotDifficulty({
  value,
  onChange,
  disabled = false,
  className,
}: {
  value: Difficulty;
  onChange: (value: Difficulty) => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <fieldset className={className} disabled={disabled}>
      <legend>Bot difficulty</legend>
      <div className="setup-radio-choices">
        {(["easy", "medium", "hard"] as const).map((difficulty) => (
          <label key={difficulty}>
            <input
              type="radio"
              name="bot-difficulty"
              checked={value === difficulty}
              onChange={() => onChange(difficulty)}
            />
            <span>{difficulty[0].toUpperCase() + difficulty.slice(1)}</span>
          </label>
        ))}
      </div>
      <p className="bot-difficulty-hint">{descriptions[value]}</p>
    </fieldset>
  );
}

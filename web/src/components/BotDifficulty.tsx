import type { BotDifficulty as Difficulty } from "../types";

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
    </fieldset>
  );
}

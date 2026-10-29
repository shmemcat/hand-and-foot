import {
  CATEGORY_LABELS,
  type LeaderboardCategory,
} from "../lib/resultCategories";
import "../result-category-tabs.css";

export function ResultCategoryTabs<Category extends LeaderboardCategory>({
  categories,
  value,
  onChange,
  label,
}: {
  categories: readonly Category[];
  value: Category;
  onChange: (value: Category) => void;
  label: string;
}) {
  return (
    <div
      className="leaderboard-tabs result-category-tabs"
      role="group"
      aria-label={label}
    >
      {categories.map((category) => (
        <button
          key={category}
          type="button"
          aria-label={CATEGORY_LABELS[category]}
          aria-pressed={value === category}
          onClick={() => onChange(category)}
        >
          {category === "multiplayer" ? (
            <>
              <span className="result-category-desktop">Multiplayer</span>
              <span className="result-category-mobile" aria-hidden="true">
                Multi-
                <br />
                player
              </span>
            </>
          ) : (
            CATEGORY_LABELS[category]
          )}
        </button>
      ))}
    </div>
  );
}

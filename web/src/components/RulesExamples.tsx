import { Card } from "./Card";
import type { Card as Face } from "../types";
import "../rules-examples.css";

type CardSpec = readonly [rank: string, suit: string];
function faces(id: string, specs: readonly CardSpec[]): Face[] {
  return specs.map(([rank, suit], index) => {
    const redThree = rank === "3" && ["hearts", "diamonds"].includes(suit);
    return {
      id: `rules-${id}-${index}`,
      rank,
      suit,
      redThree,
      wild: rank === "2" || rank === "Joker",
      value:
        rank === "Joker"
          ? 50
          : rank === "3"
            ? redThree
              ? -300
              : -100
            : ["2", "A"].includes(rank)
              ? 20
              : ["4", "5", "6", "7", "8"].includes(rank)
                ? 5
                : 10,
    };
  });
}
const naturals = (rank: string, count: number): CardSpec[] =>
  Array.from({ length: count }, (_, i) => [
    rank,
    ["clubs", "diamonds", "hearts", "spades"][i % 4],
  ]);
function CardRow({ cards }: { cards: Face[] }) {
  return (
    <div className="rules-example-cards">
      {cards.map((card) => (
        <Card key={card.id} card={card} small />
      ))}
    </div>
  );
}
function Example({
  title,
  caption,
  cards,
}: {
  title: string;
  caption: string;
  cards: Face[];
}) {
  return (
    <figure className="rules-card-example" aria-label={title}>
      <CardRow cards={cards} />
      <figcaption>
        <strong>{title}</strong>
        <span>{caption}</span>
      </figcaption>
    </figure>
  );
}

export function RulesDealExample() {
  const piles = [
    faces("pile-a", [
      ["A", "spades"],
      ["7", "hearts"],
    ]),
    faces("pile-b", [
      ["K", "diamonds"],
      ["2", "clubs"],
    ]),
  ];
  return (
    <figure
      className="rules-card-example"
      aria-label="Two starting piles of eleven cards"
    >
      <div className="rules-deal-piles">
        {piles.map((pile, index) => (
          <div key={index}>
            <div className="pile-preview">
              <Card card={pile[0]} />
              <Card />
              <Card card={pile[1]} />
            </div>
            <span>Pile {index + 1} · 11 cards</span>
          </div>
        ))}
      </div>
      <figcaption>
        <strong>Choose your hand; save the other pile as your foot.</strong>
        <span>
          Only the top and bottom cards can be inspected before choosing. The
          other nine stay hidden.
        </span>
      </figcaption>
    </figure>
  );
}

export function RulesOpeningExample() {
  return (
    <figure
      className="rules-card-example"
      aria-label="Ninety-point opening example"
    >
      <div className="rules-example-equation">
        <div>
          <CardRow cards={faces("opening-aces", naturals("A", 3))} />
          <span>Three aces · 60 points</span>
        </div>
        <span className="rules-example-symbol" aria-hidden="true">
          +
        </span>
        <div>
          <CardRow cards={faces("opening-kings", naturals("K", 3))} />
          <span>Three kings · 30 points</span>
        </div>
      </div>
      <figcaption>
        <strong>A 90-point opening</strong>
        <span>
          Enough for a 50- or 90-point minimum. A 120-point minimum needs
          another 30 points.
        </span>
      </figcaption>
    </figure>
  );
}

export function RulesPickupExample() {
  return (
    <figure
      className="rules-card-example"
      aria-label="Legal discard pickup with two matching natural cards"
    >
      <div className="rules-example-equation">
        <div>
          <CardRow
            cards={faces("pickup-hand", [
              ["7", "clubs"],
              ["7", "spades"],
            ])}
          />
          <span>From your hand</span>
        </div>
        <span className="rules-example-symbol" aria-hidden="true">
          +
        </span>
        <div>
          <CardRow cards={faces("pickup-discard", [["7", "hearts"]])} />
          <span>Top discard</span>
        </div>
      </div>
      <figcaption>
        <strong>Two natural sevens + the discard = a new meld</strong>
        <span>
          Once your side is open, play all three together, then draw one card
          from the deck before continuing.
        </span>
      </figcaption>
    </figure>
  );
}

export function RulesBooksExamples() {
  return (
    <div className="rules-book-examples">
      <Example
        title="Clean book · +500 bonus"
        caption="Seven matching natural cards. No wilds."
        cards={faces("clean-book", naturals("K", 7))}
      />
      <Example
        title="Dirty book · +300 bonus"
        caption="Four natural queens and three wilds. Naturals must always outnumber wilds."
        cards={faces("dirty-book", [
          ...naturals("Q", 4),
          ["2", "clubs"],
          ["2", "spades"],
          ["Joker", "joker"],
        ])}
      />
    </div>
  );
}

export function RulesStraightExample() {
  return (
    <Example
      title="Straight flush · +1,300 bonus"
      caption="Seven consecutive natural cards in one suit. Each extra card adds another +50 bonus points."
      cards={faces(
        "straight",
        ["4", "5", "6", "7", "8", "9", "10"].map((rank) => [rank, "hearts"]),
      )}
    />
  );
}

export function RulesThreesExamples() {
  return (
    <div className="rules-threes-examples">
      <Example
        title="Three exposed reds"
        caption="+900 bonus and 15 card points, if the pile survives scoring."
        cards={faces("qualified-reds", [
          ["3", "hearts"],
          ["3", "diamonds"],
          ["3", "hearts"],
        ])}
      />
      <Example
        title="Only two exposed reds"
        caption="−600 penalty. No card points."
        cards={faces("short-reds", [
          ["3", "hearts"],
          ["3", "diamonds"],
        ])}
      />
      <Example
        title="Two leftover black threes"
        caption="−200 in hand or foot debt. Black threes cannot be melded."
        cards={faces("black-threes", [
          ["3", "clubs"],
          ["3", "spades"],
        ])}
      />
    </div>
  );
}

export function RulesCardValues() {
  const values: { label: string; points: string; cards: CardSpec[] }[] = [
    { label: "Jokers", points: "50", cards: [["Joker", "joker"]] },
    {
      label: "Twos & aces",
      points: "20",
      cards: [
        ["2", "clubs"],
        ["A", "hearts"],
      ],
    },
    {
      label: "Fours through eights",
      points: "5",
      cards: [
        ["4", "diamonds"],
        ["8", "spades"],
      ],
    },
    {
      label: "Nines through kings",
      points: "10",
      cards: [
        ["9", "hearts"],
        ["K", "clubs"],
      ],
    },
    {
      label: "Leftover black threes",
      points: "−100",
      cards: [
        ["3", "clubs"],
        ["3", "spades"],
      ],
    },
    {
      label: "Leftover red threes",
      points: "−300",
      cards: [
        ["3", "hearts"],
        ["3", "diamonds"],
      ],
    },
  ];
  return (
    <div className="rule-card-values rule-card-values-illustrated">
      {values.map((item, index) => (
        <div key={item.label}>
          <CardRow cards={faces(`values-${index}`, item.cards)} />
          <span>{item.label}</span>
          <strong>{item.points}</strong>
          <small>per card</small>
        </div>
      ))}
    </div>
  );
}

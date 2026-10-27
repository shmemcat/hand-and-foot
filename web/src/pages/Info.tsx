import { useState } from "react";
import { Link } from "react-router-dom";
import { PageTitle } from "../components/PageTitle";

export function Rules() {
  const [section, setSection] = useState("setup");
  return (
    <div className="page info-page rules-page">
      <PageTitle>RULES</PageTitle>
      <div className="rules-layout page-body">
        <nav className="rules-nav" aria-label="Rules sections">
          {[
            ["setup", "The Deal"],
            ["turn", "Your Turn"],
            ["piles", "Piles & Books"],
            ["scoring", "Scoring"],
          ].map(([id, label]) => (
            <button
              key={id}
              type="button"
              aria-pressed={section === id}
              aria-controls={`rules-${id}`}
              onClick={() => setSection(id)}
            >
              {label}
            </button>
          ))}
        </nav>
        <article className="prose">
          <section id="rules-setup" hidden={section !== "setup"}>
            <h2 id="setup">The Deal</h2>
            <p>
              Play individually with 2–6 people, or in two-person partnerships
              with 4, 6, or 8 people. Bot seats count as players. Use one more
              deck than the number of players, with two Jokers per deck.
            </p>
            <p>
              Each player receives two piles of 11 cards. Inspect the top and
              bottom card of each, then choose which pile to play first. That is
              your <strong>hand</strong>; the other pile is your{" "}
              <strong>foot</strong>. Your foot stays face-down until you finish
              your hand. Everyone else’s cards remain private.
            </p>
            <p>
              A random dealer is chosen for the first round. The player to the
              dealer’s left leads; the dealer rotates each new round. Play
              toward <strong>10,000 points</strong> by default. The highest
              score at the end of the round wins once a side reaches the target;
              equal highest scores share the win.
            </p>
          </section>
          <section id="rules-turn" hidden={section !== "turn"}>
            <h2 id="turn">Your turn</h2>
            <ol>
              <li>
                <strong>Draw two</strong> from the stack, or take just the top
                discard and play it immediately in a legal pile. You do not draw
                two as well.
              </li>
              <li>
                <strong>Play your cards.</strong> Start matching piles, build
                straight flushes, or add to your side’s existing piles. Partners
                share piles; either partner can add to either lane on their own
                turn.
              </li>
              <li>
                <strong>Discard one card</strong> to finish. You must also
                discard a final card when going out.
              </li>
            </ol>
            <div className="rule-callout">
              <strong>Catch-up draw:</strong> if your side is more than 5,000
              points behind the lowest-scoring other side, draw{" "}
              <strong>three</strong> cards from the stack instead of two.
              Partners use their shared score. A gap of exactly 5,000 does not
              qualify. The extra card applies to the normal stack draw;
              top-discard pickup and red-three replacements stay the same.
            </div>
            <p>
              When your side opens, stage all qualifying piles and play them
              together. The total must be{" "}
              <strong>strictly more than 50 points</strong>, more than{" "}
              <strong>90</strong> once your cumulative score exceeds 3,000, and
              more than <strong>120</strong> at 6,000 or above. Red threes do
              not count toward opening and can only be laid down after your side
              has opened.
            </p>
            <div className="rule-callout">
              <strong>The sixth-card rule:</strong> when a pile already has six
              cards, play the seventh card from your hand. You cannot take the
              top discard to finish that book. The bottom card turns sideways,
              or tilts when space is tight, to mark this restriction.
            </div>
            <p>
              To start a matching pile with the discard, play it with two
              matching natural cards from your hand. A wild or a three cannot be
              picked up. Taking the discard and playing it is one move: a
              rejected pickup leaves all your cards where they were.
            </p>
          </section>
          <section id="rules-piles" hidden={section !== "piles"}>
            <h2 id="piles">Piles &amp; books</h2>
            <p>
              Start a pile with at least three cards of the same rank. A{" "}
              <strong>clean book</strong> has at least seven natural cards and
              earns a 500-point bonus. A <strong>dirty book</strong> has at
              least seven cards, including wilds, and earns 300. Natural cards
              must always outnumber wilds, from the initial meld through the
              completed book; equal counts are never allowed. For example, two
              naturals and one wild can start a pile. Twos and Jokers are wild
              in ordinary piles. A pile of twos treats the twos as naturals:
              seven twos make a clean book, and twos with Jokers make a dirty
              book if the twos outnumber the Jokers. Joker-only piles and
              matching piles of threes are not allowed.
            </p>
            <p>
              A matching book is complete at seven cards. Keep adding legal
              cards to it, or start another pile of the same rank. A{" "}
              <strong>straight flush</strong> is consecutive natural cards in
              one suit, starting no lower than four and ending no higher than
              ace. You can build it from three cards; seven completes it for a{" "}
              <strong>1,300-point bonus</strong>. Each card beyond seven adds{" "}
              <strong>50 more bonus points</strong>. Straight flushes cannot
              contain wilds.
            </p>
            <h3>Into your foot</h3>
            <p>
              Play the last card in your hand and you pick up your foot
              immediately, continuing the same turn. Discard the last card
              instead and your turn ends, then you pick up your foot. A side
              needs at least one clean and one dirty matching book before a
              player can go out. Going out first earns 100 points.
            </p>
            <h3>Threes</h3>
            <p>
              After drawing, you can replace a red three from the stack, without
              ending the turn. It is set aside rather than left for someone to
              pick up. Replacement is allowed before opening. Once your side has
              completed its opening meld, you can instead lay it down for your
              side without replacement. Select any number of red threes to lay
              them down together. A shared pile of at least three red threes is
              worth <strong>+300 each</strong>; fewer than three is{" "}
              <strong>−300 each</strong>. Replacing a red three and laying one
              down are separate choices. Black threes are discard-only and cost
              100 points if left unplayed.
            </p>
          </section>
          <section id="rules-scoring" hidden={section !== "scoring"}>
            <h2 id="scoring">Scoring</h2>
            <div className="rule-card-values">
              <div>
                <span>Jokers</span>
                <strong>50</strong>
              </div>
              <div>
                <span>Twos & aces</span>
                <strong>20</strong>
              </div>
              <div>
                <span>Fours through eights</span>
                <strong>5</strong>
              </div>
              <div>
                <span>Nines through kings</span>
                <strong>10</strong>
              </div>
              <div>
                <span>Leftover black threes</span>
                <strong>−100</strong>
              </div>
              <div>
                <span>Leftover red threes</span>
                <strong>−300</strong>
              </div>
            </div>
            <p>
              A round ends when someone goes out or the stack can no longer
              supply a draw. Both the remaining hand and the unplayed foot
              become debt. First use the value of played cards to cover that
              debt, then add the bonuses from books that survived.
            </p>
            <ol>
              <li>
                <strong>Choose which piles pay.</strong> Each side gets an
                interactive scoring review. Unfinished piles have no book bonus
                to risk. Using any card from a complete book breaks that book’s
                bonus. Keep choosing piles until the debt is covered, or there
                are no piles left.
              </li>
              <li>
                <strong>Watch the count.</strong> Used cards are marked,
                remaining debt counts down, and the bonus total updates. When a
                card is worth more than the last bit of debt, only the debt owed
                is deducted, but its book still breaks.
              </li>
              <li>
                <strong>Count red threes again.</strong> Red threes used to pay
                debt contribute only 5 points each. If fewer than three remain
                afterward, each remaining red three scores −300.
              </li>
              <li>
                <strong>Confirm the score.</strong> Played card points minus all
                leftover-card debt, plus red-three debt credits, remaining book
                bonuses, remaining red-three points, and the going-out bonus
                make the round total. Uncovered debt stays a deduction. Either
                teammate can settle the shared score; the round commits when
                every side confirms.
              </li>
            </ol>
            <p className="fine-print">
              Family preset v1. Foundational reference:{" "}
              <a
                href="https://bicyclecards.com/how-to-play/hand-and-foot"
                target="_blank"
                rel="noreferrer"
              >
                Bicycle’s Hand and Foot rules
              </a>
              . Our family’s scoring, opening thresholds, deal choice, top-card
              pickup, and straight flushes take precedence.
            </p>
          </section>
        </article>
      </div>
      <div className="button-stack">
        <Link className="button" to="/">
          Home
        </Link>
      </div>
    </div>
  );
}

export function About() {
  return (
    <div className="page info-page">
      <PageTitle>ABOUT</PageTitle>
      <article className="prose about-body page-body">
        <p>
          Play Hand &amp; Foot with friends or bots, using our family rules.
          Choose individual scoring or two-person partnerships.
        </p>
        <p>
          See the <Link to="/leaderboard">Leaderboard</Link> for the top
          players.
        </p>
        <h2>Credits</h2>
        <p>
          All seven jazz tracks are by{" "}
          <a
            href="https://pixabay.com/users/alex-morgan-54692529/"
            target="_blank"
            rel="noreferrer"
          >
            Alex Morgan on Pixabay
          </a>
          , from the same rotation as Golf.
        </p>
        <p>
          Titles use{" "}
          <a
            href="https://github.com/google/fonts/tree/main/ofl/bitter"
            target="_blank"
            rel="noreferrer"
          >
            Bitter
          </a>
          ; the rest uses{" "}
          <a
            href="https://github.com/google/fonts/tree/main/ofl/figtree"
            target="_blank"
            rel="noreferrer"
          >
            Figtree
          </a>
          . Both fonts use the SIL Open Font License. The book motif includes
          Lucide artwork under its ISC license.
        </p>
        <p>
          Find the other games at <a href="https://cards.shmem.dev">Cards</a>.
        </p>
      </article>
      <div className="button-stack">
        <Link className="button" to="/">
          Home
        </Link>
      </div>
    </div>
  );
}

export function NotFound() {
  return (
    <div className="page narrow-page">
      <PageTitle>PAGE NOT FOUND</PageTitle>
      <p className="page-intro page-body">We couldn’t find that page.</p>
      <Link className="button" to="/">
        Home
      </Link>
    </div>
  );
}

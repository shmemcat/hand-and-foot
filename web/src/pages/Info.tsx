import { useState } from "react";
import { Link } from "react-router-dom";
import { PageTitle } from "../components/PageTitle";
import { Sparkle } from "../components/Sparkle";
import "../about.css";
import {
  RulesDealExample,
  RulesOpeningExample,
  RulesPickupExample,
  RulesBooksExamples,
  RulesStraightExample,
  RulesThreesExamples,
  RulesCardValues,
} from "../components/RulesExamples";

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
              Play individually with 2–6 people, or with 4 or 6 people in teams
              of 2. Bot seats count as players. Use one more deck than the
              number of players, with two Jokers per deck.
            </p>
            <p>
              Each player receives two piles of 11 cards. Inspect the top and
              bottom card of each, then choose which pile to play first. That is
              your <strong>hand</strong>; the other pile is your{" "}
              <strong>foot</strong>. You can see its top card and hover over the
              foot to preview it. The remaining cards stay face-down until you
              finish your hand. Everyone else’s cards remain private.
            </p>
            <RulesDealExample />
            <p>
              A random dealer is chosen for the first round. The player to the
              dealer’s left leads; the dealer rotates each new round. Play
              toward <strong>10,000 points</strong>. The highest score at the
              end of the round wins once a side reaches the target; equal
              highest scores share the win.
            </p>
          </section>
          <section id="rules-turn" hidden={section !== "turn"}>
            <h2 id="turn">Your turn</h2>
            <ol>
              <li>
                <strong>Draw two</strong> from the stack, or take just the top
                discard and play it immediately in a legal meld. After playing
                the discard, draw one card from the deck before playing more
                cards or discarding.
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
              together. The total must be <strong>at least 50 points</strong>,
              at least <strong>90</strong> once your cumulative score exceeds
              3,000, and at least <strong>120</strong> at 6,000 or above. Red
              threes do not count toward opening and can only be laid down after
              your side has opened.
            </p>
            <RulesOpeningExample />
            <div className="rule-callout">
              <strong>The sixth-card rule:</strong> when a pile already has six
              cards, play the seventh card from your hand. You cannot take the
              top discard to finish that book. The bottom card turns sideways,
              or tilts when space is tight, to mark this restriction.
            </div>
            <p>
              To start a matching pile with the discard, combine it with cards
              from your hand to make a valid meld. One matching natural card
              plus a joker or a two is enough: the discard counts toward the
              required natural majority. A wild or a three cannot be picked up.
              Taking the discard and playing it is one move: a rejected pickup
              leaves all your cards where they were.
            </p>
            <RulesPickupExample />
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
            <RulesBooksExamples />
            <p>
              A matching book is complete at seven cards. You may keep adding
              cards that preserve its type, or start another pile of the same
              rank. A completed clean book only accepts matching natural cards;
              adding a wild cannot turn it dirty. A completed dirty book accepts
              matching naturals or wilds, as long as naturals still outnumber
              wilds. Twos remain natural in a book of twos, so a completed clean
              book of twos accepts more twos but no Jokers. A{" "}
              <strong>straight flush</strong> is consecutive natural cards in
              one suit, starting no lower than four and ending no higher than
              ace. You can build it from three cards; seven completes it for a{" "}
              <strong>1,300-point bonus</strong>. Each card beyond seven adds{" "}
              <strong>50 more bonus points</strong>. Straight flushes cannot
              contain wilds.
            </p>
            <RulesStraightExample />
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
              ending the turn. Put the red three on the discard pile, draw its
              replacement, and keep playing. Your final discard covers it when
              you end the turn. Red threes cannot be picked up. Replacement is
              allowed before opening. Once your side has completed its opening
              meld, you can instead lay it down for your side without
              replacement. Select any number of red threes to lay them down
              together. A shared pile with at least three red threes at round
              end qualifies for <strong>+300 each</strong> and 5 raw points
              each. Breaking that pile for reconciliation loses the entire
              bonus; its reds still count as 5 each and cannot become penalties.
              A pile with fewer than three at round end costs{" "}
              <strong>−300 each</strong>. Replacing a red three and laying one
              down are separate choices. Black threes are discard-only and cost
              100 points if left unplayed.
            </p>
            <RulesThreesExamples />
          </section>
          <section id="rules-scoring" hidden={section !== "scoring"}>
            <h2 id="scoring">Scoring</h2>
            <RulesCardValues />
            <p>
              A round ends when someone goes out or the stack can no longer
              supply a draw. Both the remaining hand and the unplayed foot
              become debt. First use the value of played cards to cover that
              debt, then add the bonuses from books that survived.
            </p>
            <ol>
              <li>
                <strong>Debt is covered automatically.</strong> Scoring uses
                public piles to cover as much debt as possible while losing the
                fewest points. Unfinished piles have no book bonus to risk.
                Using any card from a complete book breaks that book’s bonus, so
                scoring compares the combined loss across books, straight
                flushes, and red threes before opening them.
              </li>
              <li>
                <strong>Watch the count.</strong> Your foot joins your hand,
                cards reconcile into the settlement pile, then surviving books
                and card values are counted. Cards keep their normal appearance.
                When a card is worth more than the last bit of debt, only the
                debt owed is deducted, but its book still breaks.
              </li>
              <li>
                <strong>Settle red threes.</strong> Qualification is fixed at
                round end, before reconciliation. If at least three were
                exposed, breaking the pile forfeits its entire +300-per-red
                bonus. The reds remain worth 5 each toward debt or the raw card
                count, even if fewer than three remain. A pile that started
                scoring with only one or two reds still has a −300-per-red
                penalty and no raw card value. Red threes left in your hand or
                foot still create 300 points of debt each. An ace left in hand
                costs 20: break three qualified reds for 15, forfeit their +900
                bonus, and finish at −5 with no red penalties.
              </li>
              <li>
                <strong>See the score.</strong> Played card points minus all
                leftover-card debt, plus red-three debt credits, remaining book
                bonuses, remaining red-three points, and the going-out bonus
                make the round total. Uncovered debt stays a deduction. Shared
                scores settle automatically too. The count finishes and opens
                the round results without scoring choices or confirmation.
              </li>
            </ol>
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
          Welcome to my <strong className="bold">Hand and Foot</strong> web app!
          I’m <strong className="bold">Emily</strong>, aka{" "}
          <strong className="bold">
            <span className="sparkle-container">
              <Sparkle className="sparkle-svg" />
              <Sparkle className="sparkle-svg" />
              <Sparkle className="sparkle-svg" />
              <Sparkle className="sparkle-svg" />
              <Sparkle className="sparkle-svg" />
              <span className="sparkle">shmemcat</span>
            </span>
          </strong>
          .
        </p>
        <p>
          Hand and foot is THE game of choice for my family. We absolutely love
          playing it together, in fact it's usually the activity of choice when
          we all get together for an entire day. It's hard to pick a favorite
          bit, but I think it's either when my Mom starts getting sick of her
          rotten luck and draws one card from each pile in efforts to get into
          her foot as quickly as possible (and proceeds to have absolutely no
          poker face about the result) or when my sister sandbags and puts her
          entire hand down at once and starts immediately playing into her foot.
        </p>
        <p>
          Hand and Foot is part of my{" "}
          <a className="cards-link" href="https://cards.shmem.dev/">
            Cards
          </a>{" "}
          project, alongside{" "}
          <a className="cards-link" href="https://cards.shmem.dev/hearts/">
            Hearts
          </a>
          ,{" "}
          <a className="cards-link" href="https://cards.shmem.dev/euchre/">
            Euchre
          </a>
          , and{" "}
          <a className="cards-link" href="https://cards.shmem.dev/golf/">
            Golf
          </a>
          . Find the code on my{" "}
          <a
            className="cards-link"
            href="https://github.com/shmemcat/hand-and-foot"
            target="_blank"
            rel="noreferrer"
          >
            GitHub
          </a>
          !
        </p>
        <p>
          Credit for this snazzy music you’re listening to
          <br />
          goes to{" "}
          <a
            className="cards-link"
            href="https://pixabay.com/users/alex-morgan-54692529/"
            target="_blank"
            rel="noreferrer"
          >
            alex-morgan
          </a>
          !
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

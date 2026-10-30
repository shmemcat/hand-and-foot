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
            ["melds", "Melds & Books"],
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
              The goal is to score points by playing cards from your hand, then
              your foot. Build melds into books, and try to empty both before
              the other players do. Play individually with 2–6 players, or in
              teams of two with 4 or 6 players. The deck uses one more deck than
              the number of players, including two Jokers in each deck.
            </p>
            <p>
              Each player is dealt two groups of 11 cards. Look at the top and
              bottom card of each group and choose one as your{" "}
              <strong>hand</strong>. Set the other aside as your{" "}
              <strong>foot</strong>; you will play it after emptying your hand.
              Your cards are private, except for the top card of your foot. The
              undealt cards form the draw deck, with a face-up discard beside
              it.
            </p>
            <RulesDealExample />
            <p>
              In a partnership game, you and your partner share an opening meld,
              melds, books, red threes, and a score. You each keep your own hand
              and foot, and take separate turns. Your team’s score includes both
              partners’ played cards and leftover cards.
            </p>
            <p>
              The player to the dealer’s left goes first, and play continues
              around the table. The dealer moves one seat each round. Keep
              playing rounds until a player or team reaches{" "}
              <strong>10,000 points</strong>. Finish that round, then the
              highest score wins. A tie for the highest score is a shared win.
            </p>
          </section>
          <section id="rules-turn" hidden={section !== "turn"}>
            <h2 id="turn">Your turn</h2>
            <ol>
              <li>
                <strong>Draw.</strong> Take two cards from the deck. Or take
                just the top discard, play it immediately in a valid meld, then
                draw one card from the deck before continuing.
              </li>
              <li>
                <strong>Play cards if you can.</strong> Start new melds or add
                cards to your existing melds and books. In a partnership game,
                either partner can add to the team’s melds on their own turn.
                You may also replace or play red threes, as explained under
                Melds &amp; Books.
              </li>
              <li>
                <strong>Discard one card</strong> to end your turn. Keep a card
                for this, even when going out. You may not discard a red three.
              </li>
            </ol>
            <div className="rule-callout">
              <strong>Catch-up draw:</strong> if you are more than 5,000 points
              behind every opponent, draw <strong>three</strong> cards from the
              deck instead of two. Teams compare their shared scores. You still
              draw only one card after taking the top discard.
            </div>
            <h3>Opening</h3>
            <p>
              Your first play each round is your <strong>opening</strong>. Play
              one or more valid melds together, with enough card points to meet
              your opening minimum. Use your score from the previous rounds:
            </p>
            <ul>
              <li>
                3,000 points or less: open with at least <strong>50</strong>.
              </li>
              <li>
                More than 3,000 but less than 6,000: at least{" "}
                <strong>90</strong>.
              </li>
              <li>
                6,000 or more: at least <strong>120</strong>.
              </li>
            </ul>
            <p>
              Only card values count toward this minimum, including a discard
              you pick up and play. Book bonuses and red threes do not count.
              After opening, you can play more melds without meeting another
              point minimum that round.
            </p>
            <p>
              <strong>In teams, only one partner needs to open.</strong> Once
              either partner meets the team’s opening minimum, both partners can
              play new melds, add to shared melds, and lay down red threes on
              their own turns. The other partner does not need a separate
              opening.
            </p>
            <RulesOpeningExample />
            <h3>Taking the discard</h3>
            <p>
              You may take the top discard only if you play it right away,
              either in a new meld of at least three cards or in an existing
              meld. Threes cannot be picked up. If you have not opened yet, your
              play must also meet the opening minimum. You take only the top
              card, leaving the rest of the discard behind.
            </p>
            <div className="rule-callout">
              <strong>The seventh card must come from your hand.</strong> If a
              meld already has six cards, you cannot add the top discard to it.
              Complete that book with a card from your hand.
            </div>
            <RulesPickupExample />
            <h3>Going out</h3>
            <p>
              To go out, empty your foot by playing your cards and discarding
              your last card. You must have at least one clean matching book and
              one dirty matching book. Partners can build these together; either
              partner can then go out. Straight flushes do not replace either
              required book. Going out ends the round and earns
              <strong> 100 bonus points</strong>.
            </p>
          </section>
          <section id="rules-melds" hidden={section !== "melds"}>
            <h2 id="melds">Melds &amp; books</h2>
            <p>
              <strong>A valid meld contains at least 3 cards.</strong> A
              matching meld uses cards of the same rank, such as three kings.
              Twos and Jokers are <strong>wild</strong> and can stand in for
              matching cards. The matching cards, called naturals, must always
              outnumber the wilds in the meld’s current count. Two kings and one
              Joker are valid; one king and two Jokers are not.
            </p>
            <p>
              A matching meld becomes a <strong>book</strong> at seven cards. A{" "}
              <strong>clean book</strong> contains only naturals and earns a
              <strong> 500-point bonus</strong>. A <strong>dirty book</strong>{" "}
              contains at least one wild and earns a
              <strong> 300-point bonus</strong>. Naturals must still outnumber
              wilds in a dirty book.
            </p>
            <RulesBooksExamples />
            <p>
              You may add cards to a completed book, or start another meld of
              the same rank. A completed clean book accepts only matching
              naturals; you cannot turn it dirty by adding a wild. A dirty book
              accepts matching naturals or wilds, as long as naturals still
              outnumber wilds.
            </p>
            <p>
              You can also make a meld of twos. In that meld, twos count as
              naturals and Jokers are wild. Seven twos make a clean book. Add
              Jokers and it is dirty, with more twos than Jokers required. A
              completed clean book of twos accepts more twos, but no Jokers. You
              cannot make a meld of only Jokers or a matching meld of threes.
            </p>
            <h3>Straight flushes</h3>
            <p>
              A <strong>straight flush</strong> is a meld of consecutive cards
              in one suit, such as the four, five, and six of hearts. Start with
              at least three cards and extend it at either end, from four up to
              ace. No wilds, gaps, or repeated ranks are allowed. Seven cards
              earn a <strong>1,300-point bonus</strong>, with
              <strong> 50 more bonus points</strong> for each card beyond seven.
            </p>
            <RulesStraightExample />
            <h3>Into your foot</h3>
            <p>
              If you play every card in your hand, pick up your foot and keep
              playing on the same turn. If you discard your last hand card, pick
              up your foot and wait until your next turn to play it. After
              taking the top discard, draw the required deck card before moving
              on to your foot.
            </p>
            <h3>Red threes</h3>
            <p>
              After drawing for your turn, choose whether to replace a red three
              from your hand or play it.{" "}
              <strong>You may not discard red threes.</strong>
            </p>
            <ul>
              <li>
                <strong>Replace it:</strong> put it on the discard and draw a
                replacement card from the deck. This does not end your turn. You
                may replace red threes even before opening.
              </li>
              <li>
                <strong>Play it:</strong> once you or your partner has opened,
                lay it face up with your played red threes. You do not draw a
                replacement. You may play them one at a time or together;
                partners combine their red threes.
              </li>
            </ul>
            <p>
              Every played red three is worth <strong>5 card points</strong>.
              Its bonus or penalty is separate: if you have at least three
              played at the end of the round, add <strong>+300 each</strong>. If
              you have only one or two, each has a <strong>−300 penalty</strong>
              . The 5 card points still count in either case. Any red three left
              in your hand or foot is <strong>−300</strong> and earns no card
              points.
            </p>
            <p>
              If played red threes are used to cover leftover cards during
              scoring, a group of three or more loses its entire red-three
              bonus. Those reds still have a value of 5 each and do not turn
              into penalties. For a group of only one or two, each red used
              removes its −300 penalty.
            </p>
            <h3>Black threes</h3>
            <p>
              <strong>Black threes can only be discarded.</strong> You cannot
              meld them or use them for anything else. Each black three left in
              your hand or foot costs <strong>100 points</strong>.
            </p>
            <RulesThreesExamples />
          </section>
          <section id="rules-scoring" hidden={section !== "scoring"}>
            <h2 id="scoring">Scoring</h2>
            <p>
              A round ends when someone goes out or the deck runs out of cards
              needed for a draw. Cards you played earn points; cards left in
              your hand or foot count against you. Partners count their cards
              together.
            </p>
            <RulesCardValues />
            <p>
              <strong>Played red threes count in two ways.</strong> Each is
              worth 5 card points, plus a separate bonus or penalty. Those 5
              points can cover leftover cards or add to your card total, whether
              the red three has a +300 bonus, a −300 penalty, or neither.
            </p>
            <p>
              For example, two played red threes with no other cards on the
              board and nothing left in your hand or foot give you
              <strong> 10 card points − 600 penalty = −590 points</strong>.
            </p>
            <ol>
              <li>
                <strong>Count your leftover cards.</strong> Add the values of
                every card left in your hand and foot. Red threes are −300 each
                and black threes are −100 each.
              </li>
              <li>
                <strong>Cover those points with your melds.</strong> Match the
                points from leftover cards against card points you played,
                including 5 points for each played red three. Using a red three
                removes its −300 penalty, or loses the whole group’s bonus if
                you played three or more. Using any card from a book breaks the
                book and loses its entire bonus, even if seven or more cards
                remain. This also applies to straight flushes. A partly used
                card keeps its unused points, but its book still breaks.
              </li>
              <li>
                <strong>Count what is left.</strong> Add your unused card points
                and the bonuses for unbroken books, then include your red-three
                points or penalties. Subtract any leftover-card points you could
                not cover. Add 100 if you or your partner went out.
              </li>
              <li>
                <strong>Add the round total to your score.</strong> Your total
                can be negative. Keep playing rounds until someone reaches
                10,000, then the highest score wins.
              </li>
            </ol>
            <p>
              The game handles the count automatically, covering as many
              leftover points as possible while keeping the most bonus points.
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

# Family preset v1

Confirmed with Emily during implementation on October 25, 2026, with red-three and matching-pile clarifications on October 26, 2026. These decisions supersede conflicting rules in the original investigation and implementation plan. Bicycle fills gaps only where the family did not specify a different rule.

## Confirmed match setup

- Individual scoring: 2–6 players. Partnerships: 4, 6, or 8 people in two-person teams. Team membership and roster size stay fixed after the start.
- Decks = seated players + 1, including bots. Each deck contains 52 cards and two Jokers.
- Two piles of 11 per player. Inspect the top/bottom cards of both, then choose which is the hand. The other is the foot. No other foot faces are sent to the browser.
- Play toward 10,000 by default, with 15,000/20,000 available at table creation. Finish the current round before deciding the winner. Highest score wins; exact ties share the win.
- The first dealer is randomly chosen. Lead starts to the dealer’s left. Dealer rotates between rounds.

## Card values and bonuses

- Joker: 50; twos and aces: 20; fours through eights: 5; nines through kings: 10.
- Leftover black three: 100-point debt. Leftover red three: 300-point debt.
- A clean matching book of at least seven cards: 500 bonus. A dirty matching book of at least seven cards: 300 bonus.
- A natural straight flush, consecutive in one suit, four or higher through ace: complete at seven for 1,300 bonus; +50 for every card beyond seven. Played base card values also count. It can be built from three cards and cannot contain wilds.
- Going out first: +100, with a final discard and at least one clean and one dirty matching book for that scoring side.

The family’s “Jokers -50” notation is interpreted as “Jokers — 50 points,” consistently with the single dash for twos and the double minus notation for negative three penalties.

## Turn and opening

- Draw two from the stack, or take **only the top discard** and play it immediately. A pickup replaces the normal stack draw, following Bicycle’s alternative-draw structure.
- If the acting side is **strictly more than 5,000 points behind the lowest-scoring other side**, draw three instead of two. Partnership scores are shared. Exactly a 5,000-point gap does not qualify. This extra card applies only to the stack draw, not discard pickup or red-three replacement.
- Opening totals are **strictly over 50**, **strictly over 90 once the side exceeds 3,000**, and **strictly over 120 at 6,000 or higher**. Multiple piles can be staged and committed together. Red threes cannot be part of the opening or contribute to its points; they can only be laid down after the scoring side has completed its opening meld.
- Start matching piles with at least three cards. Natural cards must **always outnumber wilds**, including in the initial meld and every addition; equal counts are never legal. Two naturals and one wild can start a pile. Twos/Jokers are wild in ordinary matching piles. In a pile of twos, twos count as naturals and only Jokers count as wilds: seven twos form a clean book; twos with Jokers form a dirty book when twos outnumber Jokers. Joker-only piles and matching piles of threes are excluded.
- Start a matching pile using the top discard with two matching natural hand cards, or immediately extend an existing legal pile. Wilds and threes cannot be picked up. If a pile already has six cards, its seventh card must be played from your hand: you cannot take the top discard to finish that book. A sideways bottom card marks a six-card pile; crowded rows use a slight tilt instead.
- Matching books are complete at seven and can keep accepting legal additions, with the same single book bonus. A second pile of the same rank is also allowed. Straight flushes can extend beyond seven.
- Play out of your hand: take the foot and continue. Discard out of your hand: end the turn, then take the foot. Keep a final discard in the foot; moves that would leave an impossible mandatory discard are rejected before committing.
- After the normal draw, red threes can be replaced from the stack without ending the turn, even before opening. Only after the scoring side has opened may they instead be laid down without replacement for the shared red-three total. Any number of selected red threes can be laid down together; they are not subject to the three-card minimum for matching piles. The usual final-discard requirement still applies in the foot. Replaced reds are set aside, not added to another player’s pickup opportunity. Replacement can be repeated when another red three arrives.
- If the stack cannot supply the required draw, end the round and settle scores. No partial draw is committed.

## Interactive scoring

1. Compute the scoring side’s debt from **both remaining hands and unplayed feet**, using normal card values and the special three penalties above. The review lists hand/foot subtotals without exposing hidden faces.
2. Players choose which public piles pay the debt. Cards in a chosen pile are used from smaller values upward. Using any card from a completed book/flush breaks its bonus. Choose more piles until the debt is paid or there are no table cards left to use.
3. A partly spent final card loses its book bonus, but only the amount still owed is deducted. Unspent points remain in the arithmetic total. This avoids accidentally deducting more debt than the leftover cards created.
4. Red threes used for debt are worth **5 each**. Count the remaining exposed red threes across the team: at least three gives **+300 each**; fewer than three gives **−300 each**.
5. Round total = all played ordinary card values − full hand/foot debt + red-three debt credits + surviving book/flush bonuses + remaining exposed-red-three score + going-out bonus. Uncovered debt remains a deduction.
6. Either human teammate can make shared scoring choices, with concurrent changes guarded by a per-side decision token. Bots only settle sides without a present human. Every side must confirm before totals commit, then present humans acknowledge the next round.

The interface animates debt and bonus changes, logs accepted payments, marks used cards, and supports reduced motion. Accepted choices survive refresh and service restart. Animations never authorize a move or score transition.

## Baseline interpretations retained for v1

The family explicitly confirmed the target, cumulative-score opening thresholds, pile inspection/choice, single-card discard pickup, catch-up reference side, hand-plus-foot debt, red-three opening restriction, strict natural-card majority, and clean/dirty books of twos. The remaining gap-fillers are recorded rather than attributed to the family: one clean and one dirty matching book before going out (Bicycle); four-through-ace natural straight-flush range, duplicate-rank books, whole-round target evaluation, shared ties, stack-exhaustion ending, and dealer rotation. The UI Rules page states the implemented behavior.

Reference: https://bicyclecards.com/how-to-play/hand-and-foot

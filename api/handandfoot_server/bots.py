"""Deterministic difficulty profiles using only a human's private projection.

Easy uses a greedy planner. Medium and hard compare bounded combinations of
legal melds; hard searches more alternatives and considers public threats.
No profile receives the stock, another hand, or the concealed part of a foot.
"""
from collections import Counter, defaultdict
from .rules import RANKS, meld_details

DIFFICULTIES = ("easy", "medium", "hard")
DEFAULT_DIFFICULTY = "medium"


def validate_difficulty(value):
    if not isinstance(value, str) or value not in DIFFICULTIES:
        raise ValueError("Choose Easy, Medium, or Hard bots.")
    return value


def _context(view):
    player = next(p for p in view["players"] if p["id"] == view["viewerId"])
    return player, view["sides"][player["team"]]


def _urgent(view, player):
    if view["stockCount"] <= view.get("drawCount", 2) * len(view["players"]):
        return True
    return any(p["team"] != player["team"] and p["inFoot"] and p["handCount"] <= 3
               and view["sides"][p["team"]]["clean"] and view["sides"][p["team"]]["dirty"]
               for p in view["players"])


def choose_pile(view):
    previews = view["footPreview"]
    def value(cards):
        return sum(max(card["value"], 0) for card in cards) + (20 if cards[0]["rank"] == cards[-1]["rank"] else 0)
    return {"type": "choose", "pile": max(range(2), key=lambda i: value(previews[i]))}


def _simple_plan_melds(view):
    player, side = _context(view)
    hand = view["hand"][:]
    reserve = 0 if not player["inFoot"] else 1 if side["clean"] and side["dirty"] else 2
    remaining = {card["id"]: card for card in hand}
    groups = []
    def stage(cards, **target):
        if not cards or len(remaining) - len(cards) < reserve:
            return False
        groups.append({"cardIds": [card["id"] for card in cards], **target})
        for card in cards:
            del remaining[card["id"]]
        return True
    def add_wilds(cards, rank, existing=()):
        naturals = sum(card["rank"] == rank for card in [*existing, *cards])
        wild_count = len(existing) + len(cards) - naturals
        limit = naturals - wild_count - 1
        if len(existing) < 7:
            limit = min(7 - len(existing) - len(cards), limit)
        wilds = [card for card in remaining.values() if card["wild"] and card["rank"] != rank]
        return [*cards, *wilds[:max(0, limit)]]
    # Prefer completing existing books, including the other teammate's lane.
    for meld in sorted(side["melds"], key=lambda m: -len(m["cards"])):
        if meld["kind"] != "set":
            continue
        naturals = [card for card in remaining.values() if card["rank"] == meld["rank"]]
        extras = naturals if meld["complete"] else naturals[:7 - len(meld["cards"])]
        if not meld["complete"] or meld["dirty"]:
            extras = add_wilds(extras, meld["rank"], meld["cards"])
        while extras and len(remaining) - len(extras) < reserve:
            extras.pop()
        if extras:
            stage(extras, meldId=meld["id"])
    # Use natural runs when there is a long, promising same-suit sequence.
    for suit in ("clubs", "diamonds", "hearts", "spades"):
        by_rank = {card["rank"]: card for card in remaining.values() if card["suit"] == suit and card["rank"] in RANKS}
        run = []
        for rank in [*RANKS, None]:
            if rank in by_rank:
                run.append(by_rank[rank])
            else:
                if len(run) >= 7:
                    while len(run) >= 7 and len(remaining) - len(run) < reserve:
                        run.pop()
                    if len(run) >= 7:
                        stage(run, kind="run")
                run = []
    by_rank = defaultdict(list)
    for card in remaining.values():
        if card["rank"] in [*RANKS, "2"]:
            by_rank[card["rank"]].append(card)
    for rank, candidates in sorted(by_rank.items(), key=lambda item: (-len(item[1]), item[0])):
        cards = [card for card in candidates if card["id"] in remaining][:7]
        cards = add_wilds(cards, rank)
        while cards and len(remaining) - len(cards) < reserve:
            cards.pop()
        if len(cards) >= 3:
            try:
                meld_details(cards)
                stage(cards, kind="set")
            except ValueError:
                pass
    if not side["opened"]:
        total = sum(card["value"] for group in groups for card in hand if card["id"] in group["cardIds"])
        if total < side["opening"]:
            return []
    return groups


def _potential(details, size, kind):
    if details["complete"]:
        return details["bonus"]
    if kind == "run":
        return max(0, size - 2) ** 2 * 12
    return size * size * (3 if details["dirty"] else 5)


def _meld_options(view, hand, difficulty, pickup, *, finish=False):
    """One bucket per destination, plus alternative new sets and natural runs.

    Physical-card masks enforce that overlapping set/run choices cannot reuse
    a card. Prefixes bound the search rather than enumerating every suit swap.
    """
    player, side = _context(view)
    urgent = _urgent(view, player)
    index = {card["id"]: i for i, card in enumerate(hand)}
    buckets = []

    def bucket(selections, *, target=None, kind="set"):
        options = []
        seen = set()
        existing = target["cards"] if target else []
        before = _potential(target, len(existing), kind) if target else 0
        for cards in selections:
            mask = sum(1 << index[card["id"]] for card in cards)
            if not cards or mask in seen:
                continue
            seen.add(mask)
            if pickup and target and len(existing) == 6 and any(c["id"] == pickup for c in cards):
                continue
            try:
                details = meld_details([*existing, *cards], kind, existing=target)
            except ValueError:
                continue
            clean = kind == "set" and details["complete"] and not details["dirty"]
            dirty = kind == "set" and details["complete"] and details["dirty"]
            points = sum(c["value"] for c in cards)
            quality = points * 2 + len(cards) * 10 + _potential(details, len(existing) + len(cards), kind) - before
            # A wildcard's flexibility matters until it completes a book.
            if not details["complete"]:
                quality -= sum(2 * c["value"] + (20 if difficulty == "hard" else 5)
                               for c in cards if c["wild"] and c["rank"] != details["rank"])
            # Keep a promising natural pile available for the required clean book.
            if (difficulty == "hard" and not urgent and not side["clean"] and target
                    and kind == "set" and not target["dirty"] and details["dirty"]):
                quality -= 500
            if clean and not side["clean"]:
                quality += 180
            if dirty and not side["dirty"]:
                quality += 180
            group = {"cardIds": [c["id"] for c in cards]}
            group.update({"meldId": target["id"]} if target else {"kind": kind})
            options.append((mask, group, points, quality, bool(clean), bool(dirty)))
        if options:
            buckets.append(options)

    def run_selections(existing=()):
        suit = existing[0]["suit"] if existing else None
        for candidate_suit in ([suit] if suit else ("clubs", "diamonds", "hearts", "spades")):
            ranks = {c["rank"]: c for c in hand if c["suit"] == candidate_suit and c["rank"] in RANKS}
            if existing:
                low = min(RANKS.index(c["rank"]) for c in existing)
                high = max(RANKS.index(c["rank"]) for c in existing)
                left, right = [], []
                for i in range(low - 1, -1, -1):
                    if RANKS[i] not in ranks:
                        break
                    left.append(ranks[RANKS[i]])
                for i in range(high + 1, len(RANKS)):
                    if RANKS[i] not in ranks:
                        break
                    right.append(ranks[RANKS[i]])
                for a in range(len(left) + 1):
                    for b in range(len(right) + 1):
                        if a or b:
                            yield [*left[:a], *right[:b]]
            else:
                minimum = 5 if difficulty == "hard" else 7
                for start in range(len(RANKS)):
                    cards = []
                    for rank in RANKS[start:]:
                        if rank not in ranks:
                            break
                        cards.append(ranks[rank])
                        if len(cards) >= minimum:
                            yield cards[:]

    # Consider runs before sets so the search can preserve their physical cards.
    bucket(run_selections(), kind="run")
    for target in side["melds"]:
        if target["kind"] == "run":
            bucket(run_selections(target["cards"]), target=target, kind="run")

    def set_selections(rank, target=None):
        naturals = sorted((c for c in hand if c["rank"] == rank), key=lambda c: c["id"] != pickup)
        wilds = sorted((c for c in hand if c["wild"] and c["rank"] != rank), key=lambda c: -c["value"])
        existing = target["cards"] if target else []
        old_naturals = sum(c["rank"] == rank for c in existing)
        old_wilds = len(existing) - old_naturals
        for n in range(min(len(naturals), 7) + 1):
            limit = max(0, old_naturals + n - old_wilds - 1)
            if target and target["complete"]:
                # A closed dirty book earns no new bonus. Save its wildcard
                # capacity for clearing the hand or avoiding imminent debt.
                if not target["dirty"] or not (urgent or finish):
                    limit = 0
            # Extra naturals on an existing book remain playable on later actions.
            room = 3 if target and target["complete"] and target["dirty"] else max(0, 7 - len(existing) - n)
            limit = min(limit, len(wilds), room)
            for w in range(limit + 1):
                if n + w and (target or n + w >= 3):
                    yield [*naturals[:n], *wilds[:w]]

    for target in sorted(side["melds"], key=lambda m: (m["complete"], -len(m["cards"]))):
        if target["kind"] == "set":
            bucket(set_selections(target["rank"], target), target=target)
    for rank in [*RANKS, "2"]:
        bucket(set_selections(rank))
    return buckets


def _search_plan(view, difficulty, pickup=None, *, finish=False):
    player, side = _context(view)
    hand = view["hand"] + ([view["discard"]] if pickup else [])
    if not hand:
        return []
    required = 1 << (len(hand) - 1) if pickup else 0
    # mask, groups, opening points, quality, clean book, dirty book
    beam = [(0, [], 0, 0, bool(side["clean"]), bool(side["dirty"]))]
    width = 24 if difficulty == "hard" else 8

    def rank(plan):
        mask, groups, points, quality, clean, dirty = plan
        remaining = len(hand) - mask.bit_count() + bool(pickup)
        if groups:
            if not side["opened"] and points >= side["opening"]:
                quality += 120
            if not player["inFoot"] and len(hand) == mask.bit_count():
                quality += 180  # Playing into the foot preserves this turn.
            elif player["inFoot"] and remaining == 1 and clean and dirty:
                quality += 250
        if difficulty == "hard":
            quality += sum(35 for i, card in enumerate(hand) if not mask & (1 << i) and card["wild"])
        # Preserve opening/pickup candidates even when an attractive partial plan
        # cannot meet those mandatory constraints.
        return (not required or bool(mask & required), side["opened"] or points >= side["opening"], quality, points)

    for options in _meld_options(view, hand, difficulty, pickup, finish=finish):
        expanded = list(beam)
        for mask, groups, points, quality, clean, dirty in beam:
            for used, group, value, gain, new_clean, new_dirty in options:
                if mask & used:
                    continue
                combined = mask | used
                has_clean, has_dirty = clean or new_clean, dirty or new_dirty
                remaining = len(hand) - combined.bit_count() + bool(pickup)
                if player["inFoot"] and (remaining < 1 or (remaining == 1 and not (has_clean and has_dirty))):
                    continue
                expanded.append((combined, [*groups, group], points + value, quality + gain, has_clean, has_dirty))
        unique = {}
        for plan in sorted(expanded, key=rank, reverse=True):
            key = (plan[0], plan[4], plan[5])
            if key not in unique:
                unique[key] = plan
            if len(unique) == width:
                break
        beam = list(unique.values())
    def eligible(plan):
        mask, _, points, _, clean, dirty = plan
        remaining = len(hand) - mask.bit_count() + bool(pickup)
        if required and not mask & required:
            return False
        if not side["opened"] and points < side["opening"]:
            return False
        # The second pass may use a closed book only to reach the foot (by
        # playing or discarding out) or leave a legal going-out discard.
        return not finish or (remaining <= 1 and (not player["inFoot"] or (remaining == 1 and clean and dirty)))

    valid = [plan for plan in beam if eligible(plan)]
    return max(valid, key=rank)[1] if valid else []


def plan_melds(view, difficulty=DEFAULT_DIFFICULTY):
    validate_difficulty(difficulty)
    if difficulty == "easy":
        return _simple_plan_melds(view)
    groups = _search_plan(view, difficulty)
    if groups:
        return groups
    _, side = _context(view)
    if (any(c["wild"] for c in view["hand"])
            and any(m["kind"] == "set" and m["complete"] and m["dirty"] for m in side["melds"])):
        return _search_plan(view, difficulty, finish=True)
    return []


def decide(view, difficulty=DEFAULT_DIFFICULTY):
    validate_difficulty(difficulty)
    if view["phase"] == "choose":
        return choose_pile(view)
    if view["phase"] == "draw":
        top = view.get("discard")
        if (difficulty != "easy" and not view.get("pickupDrawPending")
                and top and not top["wild"] and top["rank"] != "3"
                and view["stockCount"] >= view.get("drawCount", 2)):
            groups = _search_plan(view, difficulty, pickup=top["id"])
            if groups and (difficulty != "hard" or sum(len(g["cardIds"]) for g in groups) >= 3):
                return {"type": "pickup", "groups": groups}
        return {"type": "draw"}
    player, side = _context(view)
    red = [card for card in view["hand"] if card["redThree"]]
    exposed = sum(len(p["redThrees"]) for p in view["players"] if p["team"] == player["team"])
    if red and len(view["hand"]) > 1:
        if difficulty != "easy" and not side["opened"] and exposed + len(red) >= 3:
            groups = plan_melds(view, difficulty)
            if groups:
                return {"type": "meld", "groups": groups}
        reserve = 0 if not player["inFoot"] else 1 if side["clean"] and side["dirty"] else 2
        exposable = min(len(red), max(0, len(view["hand"]) - reserve))
        may_expose = side["opened"] and exposable > 0 and exposed + exposable >= 3
        if may_expose and not player["inFoot"] and len(red) == len(view["hand"]):
            return {"type": "red_three", "cardIds": [c["id"] for c in red], "expose": True}
        return {"type": "red_three", "cardId": red[0]["id"], "expose": bool(may_expose)}
    groups = plan_melds(view, difficulty)
    if groups:
        return {"type": "meld", "groups": groups}
    counts = Counter(card["rank"] for card in view["hand"])
    own_melds = view["sides"][player["team"]]["melds"]
    useful = {m["rank"] for m in own_melds if m["kind"] == "set"}
    seat = next(i for i, p in enumerate(view["players"]) if p["id"] == player["id"])
    next_player = view["players"][(seat + 1) % len(view["players"])]
    next_side = view["sides"][next_player["team"]]
    urgent = difficulty == "hard" and _urgent(view, player)
    def discard_value(card):
        if card["rank"] == "3":
            return 1000 - card["value"]
        if card["wild"] and not urgent:
            return -100
        value = card["value"] if urgent else card["value"] - 15 * counts[card["rank"]] - (30 if card["rank"] in useful else 0)
        if difficulty == "hard":
            if next_player["team"] != player["team"] and next_side["opened"]:
                for meld in next_side["melds"]:
                    if len(meld["cards"]) == 6:
                        continue  # The discard cannot be used as a seventh card.
                    try:
                        meld_details([*meld["cards"], card], meld["kind"], existing=meld)
                    except ValueError:
                        continue
                    value -= 10 if not meld["complete"] else 0
            # Preserve adjacent cards for a future natural straight flush.
            if card["rank"] in RANKS:
                position = RANKS.index(card["rank"])
                value -= 12 * sum(c["suit"] == card["suit"] and c["rank"] in RANKS
                                  and abs(RANKS.index(c["rank"]) - position) == 1 for c in view["hand"])
        return value
    return {"type": "discard", "cardId": max(view["hand"], key=discard_value)["id"]}

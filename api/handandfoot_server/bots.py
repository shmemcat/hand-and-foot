"""Bots receive the same private projection as a human, never the hidden deck."""
from collections import Counter, defaultdict
from .rules import RANKS, meld_details


def choose_pile(view):
    previews = view["footPreview"]
    def value(cards):
        return sum(max(card["value"], 0) for card in cards) + (20 if cards[0]["rank"] == cards[-1]["rank"] else 0)
    return {"type": "choose", "pile": max(range(2), key=lambda i: value(previews[i]))}


def plan_melds(view):
    player = next(p for p in view["players"] if p["id"] == view["viewerId"])
    side = view["sides"][player["team"]]
    hand = view["hand"][:]
    reserve = 1 if not player["inFoot"] or (side["clean"] and side["dirty"]) else 2
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
        if total <= side["opening"]:
            return []
    return groups


def decide(view):
    if view["phase"] == "choose":
        return choose_pile(view)
    if view["phase"] == "draw":
        return {"type": "draw"}
    player = next(p for p in view["players"] if p["id"] == view["viewerId"])
    red = [card for card in view["hand"] if card["redThree"]]
    exposed = sum(len(p["redThrees"]) for p in view["players"] if p["team"] == player["team"])
    if red and len(view["hand"]) > 1:
        side = view["sides"][player["team"]]
        may_expose = side["opened"] and (not player["inFoot"] or len(view["hand"]) > 2 or (side["clean"] and side["dirty"]))
        return {"type": "red_three", "cardId": red[0]["id"], "expose": bool(may_expose and exposed + len(red) >= 3)}
    groups = plan_melds(view)
    if groups:
        return {"type": "meld", "groups": groups}
    counts = Counter(card["rank"] for card in view["hand"])
    own_melds = view["sides"][player["team"]]["melds"]
    useful = {m["rank"] for m in own_melds if m["kind"] == "set"}
    def discard_value(card):
        if card["rank"] == "3":
            return 1000 - card["value"]
        if card["wild"]:
            return -100
        return card["value"] - 15 * counts[card["rank"]] - (30 if card["rank"] in useful else 0)
    return {"type": "discard", "cardId": max(view["hand"], key=discard_value)["id"]}

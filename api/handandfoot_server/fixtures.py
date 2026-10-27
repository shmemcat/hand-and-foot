"""Development-only table, hand, and interactive scoring fixtures."""
from . import engine
from .rules import RANKS, meld_details

HAND_FIXTURES = {"hand-20": 20, "hand-32": 32, "hand-45": 45}
BOARD_FIXTURES = {"full-board": 8, "open-9": 9, "open-10": 10, "open-13": 13, "open-14": 14, "six-card": 3}
OPENING_FIXTURES = ("opening", "next-round-opening")


def populate(game, fixture):
    if fixture in OPENING_FIXTURES:
        if fixture == "next-round-opening":
            game["dealer"] = (game["dealer"] + 1) % len(game["players"])
            engine.deal_round(game)
        return
    if fixture == "six-card":
        populate(game, "full-board")
        side = game["sides"][0]
        opened = [meld for meld in side["melds"] if not meld["complete"]]
        keep = {meld["id"] for meld in [*opened[:2], next(meld for meld in opened if meld["kind"] == "run")]}
        for meld in side["melds"]:
            if not meld["complete"] and meld["id"] not in keep:
                game["stock"].extend(meld["cardIds"])
        side["melds"] = [meld for meld in side["melds"] if meld["complete"] or meld["id"] in keep]
        engine.assert_conservation(game)
        return
    game.update(stock=list(game["cards"]), discard=[], replaced=[], phase="play", actor=0, openingComplete=True)
    for player in game["players"]:
        player.update(hand=[], foot=[], piles=[], chosen=True, inFoot=False, redThrees=[])

    def take(rank, count=1, suit=None):
        ids = [i for i in game["stock"] if game["cards"][i]["rank"] == rank and (suit is None or game["cards"][i]["suit"] == suit)][:count]
        if len(ids) != count:
            raise ValueError("Fixture exhausted a rank.")
        for card_id in ids:
            game["stock"].remove(card_id)
        return ids

    def meld(team, creator, ids, kind="set"):
        game["sides"][team]["opened"] = True
        game["sides"][team]["melds"].append({"id": engine.uid(), "creator": creator, "kind": kind, "cardIds": ids,
                                          **meld_details([game["cards"][i] for i in ids], kind)})

    if fixture in BOARD_FIXTURES:
        creator = game["players"][0]["id"]
        # Keep the same eight completed books while comparing open-pile wrapping.
        for rank, naturals, twos, jokers in [
            ("A", 7, 0, 0), ("K", 4, 2, 1), ("Q", 7, 0, 0),
            ("J", 5, 0, 2), ("10", 7, 0, 0), ("9", 4, 3, 0),
            ("8", 6, 0, 0), ("7", 3, 2, 0), ("6", 5, 0, 0),
            ("5", 3, 0, 1), ("4", 3, 0, 0), ("2", 3, 0, 0),
        ]:
            meld(0, creator, [*take(rank, naturals), *take("2", twos), *take("Joker", jokers)])
        for suit, ranks in [
            ("spades", RANKS), ("diamonds", RANKS[:7]),
            ("clubs", RANKS[:5]), ("hearts", RANKS[3:8]),
        ]:
            meld(0, creator, [take(rank, suit=suit)[0] for rank in ranks], "run")
        for rank, count in [("A", 3), ("K", 4), ("Q", 3), ("J", 3), ("9", 3), ("8", 3)][:BOARD_FIXTURES[fixture] - 8]:
            meld(0, creator, take(rank, count))
        for player in game["players"][1:]:
            for rank in ("9", "10", "J"):
                meld(player["team"], player["id"], take(rank, 3))
        game["players"][0]["hand"] = [take(rank)[0] for rank in ("A", "K", "Q", "8", "7", "6", "5", "4", "2", "Joker")]
        game["players"][0]["redThrees"] = [*take("3", suit="diamonds"), *take("3", suit="hearts")]
        game["discard"] = take("8")
        for index, player in enumerate(game["players"]):
            player["foot"] = [game["stock"].pop() for _ in range(11)]
            if index:
                player["hand"] = [game["stock"].pop() for _ in range(11)]
        game["message"] = "Your turn. Build your melds, then discard to finish."
        engine.assert_conservation(game)
        return

    if fixture in HAND_FIXTURES:
        count = HAND_FIXTURES[fixture]
        # Alternating suits and pairs keep the hand from forming straight flushes
        # or matching piles. The extreme case's three small triples total only 45.
        ranks = RANKS[:8] if count == 20 else RANKS
        hand = []
        for index, rank in enumerate(ranks):
            hand.extend(take(rank, 2, "clubs" if index % 2 == 0 else "diamonds"))
        if count == 45:
            for index, rank in enumerate(RANKS[:3]):
                hand.extend(take(rank, suit="clubs" if index % 2 == 0 else "diamonds"))
        hand.extend(take("3", count - len(hand)))
        game["players"][0]["hand"] = hand
        for index, player in enumerate(game["players"]):
            player["foot"] = [game["stock"].pop() for _ in range(11)]
            if index:
                player["hand"] = [game["stock"].pop() for _ in range(11)]
        game["discard"] = take("8")
        game["message"] = "Your turn. A full hand, still waiting to open."
        engine.assert_conservation(game)
        return

    run = [take(rank, suit="spades")[0] for rank in RANKS]
    meld(0, game["players"][0]["id"], run, "run")
    for side in game["sides"]:
        members = [player for player in game["players"] if player["team"] == side["id"]]
        meld(side["id"], members[-1]["id"], take("K", 7))
        meld(side["id"], members[0]["id"], [*take("Q", 4), *take("2", 3)])
        meld(side["id"], members[-1]["id"], take("9", 3))
    game["players"][0]["hand"] = [*take("3", 1, "clubs"), *take("Joker", 2), *take("2", 2)]
    game["players"][0]["foot"] = take("A", 3)
    if fixture == "dense":
        game["players"][0]["hand"] += [game["stock"].pop() for _ in range(25)]
    for player in game["players"][1:]:
        player["hand"] = [game["stock"].pop() for _ in range(5)]
        player["foot"] = [game["stock"].pop() for _ in range(11)]
    game["discard"] = take("8")
    if fixture == "scoring":
        for player in [p for p in game["players"] if p["team"] == 0]:
            game["stock"].extend([*player["hand"], *player["foot"]])
            player.update(hand=[], foot=[])
        game["players"][0]["hand"] = take("3", 1, "clubs") + take("A")
        partner = next(p for p in game["players"] if p["team"] == 0 and p["id"] != game["players"][0]["id"])
        partner["hand"] = take("4")
        engine.finish_round(game, None, "The round is over. Choose which books cover your debt.")
    elif fixture == "catchup":
        game["sides"][0]["score"] = -6000
        game["phase"] = "draw"
    else:
        game["message"] = "Your turn. Try adding to your partner’s upper lane."
    engine.assert_conservation(game)

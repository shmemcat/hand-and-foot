"""Scoring states used only by the engine regression tests."""
from handandfoot_server import engine
from handandfoot_server.rules import meld_details

SCORING_CASES = ("score-choreography", "score-reds", "score-exhausted", "score-finish")


def populate_scoring_case(game, fixture):
    game.update(stock=list(game["cards"]), discard=[], discardFaceDown=False, tableEvents=[], replaced=[], phase="play", actor=0, openingComplete=True)
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

    owner = game["players"][0]
    owner["redThrees"] = take("3", 3, "hearts")
    if fixture == "score-reds":
        owner.update(hand=take("A"), inFoot=True)
    else:
        meld(0, owner["id"], take("K", 7))
        meld(0, owner["id"], [*take("Q", 4), *take("2", 2), *take("Joker")])
        meld(0, owner["id"], take("7", 7))
        for rank in ("10", "5", "9"):
            meld(0, owner["id"], take(rank, 3))
        owner["hand"] = [*take("A"), *take("4"), *take("9"), *take("K")]
        owner["foot"] = [take(rank)[0] for rank in ("Joker", "2", "A", "K", "Q", "J", "9", "8", "7", "6", "4")]
    for index, player in enumerate(game["players"][1:], 1):
        player.update(hand=take("4"), inFoot=True)
        game["sides"][index]["score"] = 2400 - index * 100
    game["sides"][0]["score"] = 19000 if fixture == "score-finish" else 2850
    game["discard"] = take("8")
    if fixture == "score-exhausted":
        game["replaced"].extend(game["stock"])
        game["stock"] = []
    engine.finish_round(game, None if fixture == "score-exhausted" else 1,
                        "The stack ran out." if fixture == "score-exhausted" else "Poppy went out.")
    engine.assert_conservation(game)
    return

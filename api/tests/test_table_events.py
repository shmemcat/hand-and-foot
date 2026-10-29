import copy
import pytest
from handandfoot_server import engine
from test_engine import rig, take, book


def test_stock_draw_cues_expose_count_but_no_private_card_identities():
    game = rig()
    game.update(phase="draw", openingComplete=True)
    game = engine.apply(game, 0, {"type": "draw"})
    for viewer in ("0", "1"):
        event = engine.project(game, viewer)["tableEvents"][-1]
        assert event["kind"] == "draw" and event["count"] == 2
        assert event["playerId"] == "0" and event["card"] is None
        assert not any(card_id in str(event) for card_id in game["players"][0]["hand"])


def test_ordinary_discard_cues_are_public_and_survive_later_bot_actions():
    game = rig()
    game["players"][0]["hand"] = take(game, "5", 2)
    discarded = game["players"][0]["hand"][0]
    game = engine.apply(game, 0, {"type": "discard", "cardId": discarded})
    event = copy.deepcopy(engine.project(game, "1")["tableEvents"][-1])
    assert event["card"]["id"] == discarded and not event["faceDown"]
    game = engine.apply(game, 1, {"type": "draw"})
    assert engine.project(game, "0")["tableEvents"][-2] == event


def test_going_out_hides_the_final_discard_from_every_viewer_and_resets_next_round():
    game = rig()
    player = game["players"][0]
    player.update(hand=take(game, "5"), inFoot=True)
    final = player["hand"][0]
    book(game, "K")
    book(game, "Q", dirty=True)
    game = engine.apply(game, 0, {"type": "discard", "cardId": final})
    assert game["discard"][-1] == final and game["discardFaceDown"]
    for viewer in ("0", "1", "2", "3"):
        view = engine.project(game, viewer)
        assert view["discard"] is None and view["discardFaceDown"]
        event = view["tableEvents"][-1]
        assert event["faceDown"] and event["card"] is None
        assert final not in str(view)
    engine.assert_conservation(game)
    engine.deal_round(game)
    assert not game["discardFaceDown"] and not game["tableEvents"]


def test_failed_actions_leave_no_motion_event_or_partial_book():
    game = rig()
    player = game["players"][0]
    player.update(hand=take(game, "A", 3), inFoot=True)
    original = copy.deepcopy(game)
    with pytest.raises(ValueError, match="final card"):
        engine.apply(game, 0, {"type": "meld", "groups": [{"cardIds": player["hand"]}]})
    assert game == original


def test_event_history_is_bounded():
    game = rig()
    for _ in range(40):
        engine.table_event(game, game["players"][0], "draw", count=2)
    assert len(game["tableEvents"]) == 32
    assert len({event["id"] for event in game["tableEvents"]}) == 32


@pytest.mark.parametrize("action", ["discard", "meld"])
def test_foot_pickup_announcements_reach_every_viewer_without_private_cards(action):
    game = rig()
    player = game["players"][0]
    player.update(hand=take(game, "A", 1 if action == "discard" else 3), foot=take(game, "8", 11))
    private = list(player["foot"])
    game["sides"][0]["opened"] = True
    move = {"type": action}
    if action == "discard":
        move["cardId"] = player["hand"][0]
    else:
        move["groups"] = [{"cardIds": list(player["hand"])}]
    game = engine.apply(game, 0, move)
    for viewer in game["players"]:
        event = engine.project(game, viewer["id"])["tableEvents"][-1]
        assert event["kind"] == "foot" and event["playerId"] == "0"
        assert event["count"] == 11 and event["card"] is None
        assert not any(card_id in str(event) for card_id in private)
    engine.enter_foot(game, game["players"][0])
    assert sum(event["kind"] == "foot" for event in game["tableEvents"]) == 1
    engine.assert_conservation(game)

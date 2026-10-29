import copy
import pytest
from handandfoot_server import engine
from test_engine import rig, take


@pytest.mark.parametrize("count", [1, 2, 4])
def test_replaced_reds_stay_on_discard_until_a_final_discard_covers_them(count):
    game = rig()
    previous = take(game, "9")
    reds = take(game, "3", count, "hearts")
    tail = take(game, "4", 3)
    game["discard"] = previous
    game["players"][0]["hand"] = [*reds, *tail]
    result = engine.apply(game, 0, {"type": "red_three", "cardIds": reds, "expose": False})
    assert result["discard"] == previous + reds
    assert result["phase"] == "play" and result["actor"] == 0
    assert len(result["players"][0]["hand"]) == count + len(tail)
    assert not result["discardFaceDown"] and not result["replaced"]
    public = engine.project(result, "1")
    assert public["discard"]["id"] == reds[-1]
    assert public["discardCount"] == count + 1
    # A red three is never a legal pickup, even if a client submits it directly.
    attempted = copy.deepcopy(result)
    attempted.update(phase="draw", actor=1, openingComplete=True)
    with pytest.raises(ValueError, match="three or a wild card"):
        engine.apply(attempted, 1, {"type": "pickup", "groups": []})
    covered = engine.apply(result, 0, {"type": "discard", "cardId": tail[0]})
    assert covered["discard"] == previous + reds + [tail[0]]
    assert covered["phase"] == "draw" and covered["actor"] == 1
    assert engine.project(covered, "1")["discard"]["id"] == tail[0]
    engine.assert_conservation(result)
    engine.assert_conservation(covered)


def test_replacement_events_show_only_the_discarded_reds_and_keep_drawn_faces_private():
    game = rig()
    reds = take(game, "3", 2, "hearts")
    game["players"][0]["hand"] = [*reds, *take(game, "4", 3)]
    drawn = game["stock"][-2:]
    result = engine.apply(game, 0, {"type": "red_three", "cardIds": reds, "expose": False})
    for player in result["players"]:
        events = engine.project(result, player["id"])["tableEvents"]
        assert [event["kind"] for event in events] == ["replace", "replace", "draw"]
        assert [event["card"]["id"] for event in events[:-1]] == reds
        assert events[-1]["card"] is None and events[-1]["count"] == 2
        assert not any(card_id in str(events) for card_id in drawn)

import copy
import random
import pytest
from handandfoot_server import bots, engine, scoring
from handandfoot_server.rules import FAMILY, RANKS, card_value, make_deck, meld_details, opening_for, validate_setup, draw_count


def players(count, bot=True):
    return [{"id": str(i), "name": f"Player {i}", "bot": bot, "key": f"key-{i}", "away": False, "lastSeen": 0} for i in range(count)]


def fresh(count=6, mode="partnership", seed=1):
    return engine.new_game(players(count), mode, seed=seed)


def chosen(game):
    for seat in range(len(game["players"])):
        game = engine.apply(game, seat, {"type": "choose", "pile": 0})
    return game


def rig(count=6, mode="partnership"):
    game = fresh(count, mode)
    game.update(stock=list(game["cards"]), discard=[], replaced=[], actor=0, phase="play")
    for player in game["players"]:
        player.update(hand=[], foot=[], piles=[], chosen=True, inFoot=False, redThrees=[])
    return game


def take(game, rank, count=1, suit=None):
    found = [i for i in game["stock"] if game["cards"][i]["rank"] == rank and (not suit or game["cards"][i]["suit"] == suit)][:count]
    assert len(found) == count
    for card_id in found:
        game["stock"].remove(card_id)
    return found


def book(game, rank, *, team=0, creator="0", dirty=False):
    ids = take(game, rank, 4 if dirty else 7)
    if dirty:
        ids += take(game, "2", 3)
    details = meld_details([game["cards"][i] for i in ids])
    meld = {"id": engine.uid(), "creator": creator, "kind": "set", "cardIds": ids, **details}
    game["sides"][team]["melds"].append(meld)
    return meld


@pytest.mark.parametrize("mode,count", [("individual", n) for n in range(2, 7)] + [("partnership", 4), ("partnership", 6)])
def test_setup_and_physical_cards(mode, count):
    validate_setup(mode, count, "practice")
    game = fresh(count, mode)
    assert game["targetScore"] == 10000
    side_count = count if mode == "individual" else count // 2
    assert [p["team"] for p in game["players"]] == [i % side_count for i in range(count)]
    assert len(game["cards"]) == (count + 1) * 54
    engine.assert_conservation(game)
    for player in game["players"]:
        view = engine.project(game, player["id"])
        assert len(view["footPreview"]) == 2
        assert [len(pile) for pile in view["footPreview"]] == [2, 2]
        assert view["hand"] == []
        assert view["dealerId"] == game["players"][game["dealer"]]["id"]
        assert "cards" not in view and "stock" not in view
    game = chosen(game)
    engine.assert_conservation(game)
    assert game["phase"] == "draw"
    assert all(len(p["hand"]) == len(p["foot"]) == 11 for p in game["players"])


@pytest.mark.parametrize("count", [4, 6])
def test_partner_turns_alternate_teams_and_start_after_the_dealer(count):
    game = chosen(fresh(count, "partnership"))
    first = (game["dealer"] + 1) % count
    assert game["actor"] == first
    seats = []
    teams = []
    for _ in range(count * 2):
        seat = game["actor"]
        view = engine.project(game, "0")
        assert view["actorId"] == game["players"][seat]["id"]
        seats.append(seat)
        teams.append(game["players"][seat]["team"])
        game = engine.apply(game, seat, {"type": "draw"})
        card_id = next(i for i in game["players"][seat]["hand"] if not game["cards"][i]["redThree"])
        game = engine.apply(game, seat, {"type": "discard", "cardId": card_id})
        engine.assert_conservation(game)
    assert seats == [(first + i) % count for i in range(count * 2)]
    assert teams == [(first + i) % (count // 2) for i in range(count * 2)]
    assert game["actor"] == first


@pytest.mark.parametrize("mode", ["individual", "partnership"])
@pytest.mark.parametrize("count", [0, 1, 7, 8, 9, True, 6.0, "6", None])
def test_invalid_rosters(mode, count):
    with pytest.raises(ValueError):
        validate_setup(mode, count, "online")


@pytest.mark.parametrize("mode,count", [
    (mode, count) for mode in ("individual", "partnership") for count in (0, 1, 7, 8)
] + [("partnership", count) for count in (2, 3, 5)])
def test_engine_rejects_unsupported_rosters(mode, count):
    with pytest.raises(ValueError, match="players"):
        fresh(count, mode)


@pytest.mark.parametrize("target", [5000, 15000, 20000, True, 10000.0, "10000", None])
def test_engine_rejects_other_winning_scores(target):
    with pytest.raises(ValueError, match="10,000"):
        engine.new_game(players(6), "individual", target_score=target)


@pytest.mark.parametrize("count", range(2, 7))
def test_public_dealer_marker_rotates_with_the_round(count):
    game = fresh(count, "individual")
    dealer = game["dealer"]
    assert engine.project(game, "0")["dealerId"] == game["players"][dealer]["id"]
    game["phase"] = "round_over"
    next_round = engine.apply(game, 0, {"type": "next_round"})
    assert next_round["round"] == 2
    assert engine.project(next_round, "0")["dealerId"] == game["players"][(dealer + 1) % count]["id"]
    assert len(next_round["cards"]) == (count + 1) * 54
    engine.assert_conservation(next_round)


def test_family_values_and_opening_thresholds():
    assert card_value("8", "clubs") == 5
    assert card_value("9", "clubs") == 10
    assert card_value("3", "clubs") == -100
    assert card_value("3", "hearts") == -300
    assert card_value("Joker", "joker") == 50
    assert [opening_for(score) for score in (0, 3000, 3001, 5999, 6000)] == [50, 50, 90, 90, 120]
    assert not FAMILY.opening_is_strict
    game = rig()
    game["players"][0]["hand"] = take(game, "9", 4) + take(game, "4")
    before = copy.deepcopy(game)
    with pytest.raises(ValueError, match="at least 50"):
        engine.apply(game, 0, {"type": "meld", "groups": [{"cardIds": game["players"][0]["hand"][:4]}]})
    assert game == before


@pytest.mark.parametrize("mode", ["individual", "partnership"])
@pytest.mark.parametrize("score,minimum,first_rank,first_count,second_rank,second_count", [
    (0, 50, "9", 3, "4", 4),
    (3001, 90, "A", 3, "10", 3),
    (6000, 120, "A", 3, "10", 6),
])
def test_humans_and_bots_can_open_at_the_exact_minimum(mode, score, minimum, first_rank, first_count, second_rank, second_count):
    game = rig(mode=mode)
    game["sides"][0]["score"] = score
    first = take(game, first_rank, first_count)
    second = take(game, second_rank, second_count)
    tail = take(game, "K")
    game["players"][0]["hand"] = [*first, *second, *tail]
    before = copy.deepcopy(game)
    with pytest.raises(ValueError, match=f"at least {minimum}"):
        engine.apply(game, 0, {"type": "meld", "groups": [{"cardIds": first}]})
    assert game == before
    groups = [{"cardIds": first}, {"cardIds": second}]
    planned = bots.plan_melds({**engine.project(game, "0"), "viewerId": "0"})
    assert sum(game["cards"][card_id]["value"] for group in planned for card_id in group["cardIds"]) == minimum
    for opening_groups in (groups, planned):
        moved = engine.apply(game, 0, {"type": "meld", "groups": opening_groups})
        assert moved["sides"][0]["opened"]
        assert moved["players"][0]["hand"] == tail
        engine.assert_conservation(moved)


@pytest.mark.parametrize("scores,expected", [([0,5000,9000],2),([0,5001,9000],3),([0,100,9000],2),([5000,0,9000],2),([-6000,0,1000],3),([0,0,9000],2)])
def test_catch_up_uses_next_lowest_side_strictly_over_5000(scores, expected):
    sides = [{"id": i, "score": score} for i,score in enumerate(scores)]
    assert draw_count(sides, 0) == expected


def test_catch_up_draw_changes_private_count_and_conserves_cards():
    game = chosen(fresh(6, "partnership"))
    game["actor"] = 0
    game["sides"][0]["score"] = -5001
    before = len(game["players"][0]["hand"])
    assert engine.project(game, "0")["drawCount"] == 3
    game = engine.apply(game, 0, {"type": "draw"})
    assert len(game["players"][0]["hand"]) == before + 3
    assert "Catch-up card" in game["message"]
    engine.assert_conservation(game)


def test_multi_pile_opening_and_atomic_failure():
    game = rig()
    nine = take(game, "9", 3)
    ten = take(game, "10", 3)
    tail = take(game, "4")
    game["players"][0]["hand"] = [*nine, *ten, *tail]
    before = copy.deepcopy(game)
    with pytest.raises(ValueError):
        engine.apply(game, 0, {"type": "meld", "groups": [{"cardIds": nine}, {"cardIds": [*ten[:2], *tail]}]})
    assert game == before
    moved = engine.apply(game, 0, {"type": "meld", "groups": [{"cardIds": nine}, {"cardIds": ten}]})
    assert moved["sides"][0]["opened"]
    assert moved["players"][0]["hand"] == tail
    assert len(moved["sides"][0]["melds"]) == 2


@pytest.mark.parametrize("rank,wild_rank", [("9", "2"), ("9", "Joker"), ("2", "Joker")])
@pytest.mark.parametrize("natural_count,wild_count", [
    (3, 0), (7, 0), (8, 0), (5, 3), (9, 4), (2, 1), (3, 1), (3, 2), (4, 3),
    (1, 2), (2, 2), (3, 3), (3, 4), (4, 4),
])
def test_matching_pile_majority_and_book_classification(rank, wild_rank, natural_count, wild_count):
    game = rig()
    ids = take(game, rank, natural_count) + take(game, wild_rank, wild_count)
    cards = [game["cards"][i] for i in ids]
    if natural_count <= wild_count:
        with pytest.raises(ValueError):
            meld_details(cards)
    else:
        details = meld_details(cards)
        assert details == {
            "rank": rank, "complete": len(cards) >= 7, "dirty": wild_count > 0,
            "bonus": (300 if wild_count else 500) if len(cards) >= 7 else 0,
        }


def test_joker_only_pile_is_not_a_matching_meld():
    game = rig()
    ids = take(game, "Joker", 3)
    with pytest.raises(ValueError, match="Joker-only"):
        meld_details([game["cards"][i] for i in ids])


@pytest.mark.parametrize("rank", ["9", "2"])
def test_two_naturals_and_one_joker_can_open(rank):
    game = rig()
    ids = take(game, rank, 2) + take(game, "Joker")
    tail = take(game, "4")
    game["players"][0]["hand"] = ids + tail
    result = engine.apply(game, 0, {"type": "meld", "groups": [{"cardIds": ids}]})
    assert result["sides"][0]["opened"]
    assert result["sides"][0]["melds"][0]["rank"] == rank
    assert result["sides"][0]["melds"][0]["dirty"]
    assert result["players"][0]["hand"] == tail


@pytest.mark.parametrize("rank,wild_rank", [("9", "2"), ("2", "Joker")])
def test_extensions_cannot_equalize_naturals_and_wilds(rank, wild_rank):
    game = rig()
    ids = take(game, rank, 2) + take(game, wild_rank)
    target = {"id": "majority-pile", "creator": "2", "kind": "set", "cardIds": ids,
              **meld_details([game["cards"][i] for i in ids])}
    game["sides"][0].update(opened=True, melds=[target])
    natural = take(game, rank)
    wild = take(game, wild_rank)
    tail = take(game, "4")
    game["players"][0]["hand"] = natural + wild + tail
    before = copy.deepcopy(game)
    with pytest.raises(ValueError, match="outnumber"):
        engine.apply(game, 0, {"type": "meld", "groups": [{"meldId": target["id"], "cardIds": wild}]})
    assert game == before
    result = engine.apply(game, 0, {"type": "meld", "groups": [
        {"meldId": target["id"], "cardIds": natural},
        {"meldId": target["id"], "cardIds": wild},
    ]})
    assert len(result["sides"][0]["melds"][0]["cardIds"]) == 5
    assert result["players"][0]["hand"] == tail


def test_red_threes_require_a_completed_opening_and_cannot_join_the_opening():
    game = rig()
    nine, ten = take(game, "9", 3), take(game, "10", 3)
    red = take(game, "3", 1, "hearts")[0]
    tail = take(game, "4")
    game["players"][0]["hand"] = nine + ten + [red] + tail
    groups = [{"cardIds": nine}, {"cardIds": ten}]
    before = copy.deepcopy(game)
    with pytest.raises(ValueError, match="opening meld"):
        engine.apply(game, 0, {"type": "red_three", "cardId": red, "expose": True})
    assert game == before
    with pytest.raises(ValueError):
        engine.apply(game, 0, {"type": "meld", "groups": [*groups, {"cardIds": [red]}]})
    assert game == before
    opened = engine.apply(game, 0, {"type": "meld", "groups": groups})
    exposed = engine.apply(opened, 0, {"type": "red_three", "cardId": red, "expose": True})
    assert exposed["players"][0]["redThrees"] == [red]
    assert exposed["players"][0]["hand"] == tail


def test_teammate_can_lay_down_red_threes_after_shared_opening():
    game = rig()
    aces = take(game, "A", 3)
    game["players"][0]["hand"] = aces + take(game, "4")
    red = take(game, "3", 1, "hearts")[0]
    game["players"][3]["hand"] = [red] + take(game, "5")
    opened = engine.apply(game, 0, {"type": "meld", "groups": [{"cardIds": aces}]})
    opened["actor"] = 3
    exposed = engine.apply(opened, 3, {"type": "red_three", "cardId": red, "expose": True})
    assert exposed["players"][3]["redThrees"] == [red]


@pytest.mark.parametrize("count", [1, 2, 3, 8, 10])
def test_any_number_of_red_threes_can_be_laid_down_together_after_opening(count):
    game = rig()
    game["sides"][0]["opened"] = True
    reds = take(game, "3", min(count, 5), "hearts") + take(game, "3", max(0, count - 5), "diamonds")
    tail = take(game, "4", 4)
    game["players"][0]["hand"] = reds + tail
    result = engine.apply(game, 0, {"type": "red_three", "cardIds": reds, "expose": True})
    assert result["players"][0]["redThrees"] == reds
    assert result["players"][0]["hand"] == tail
    assert result["phase"] == "play" and result["actor"] == 0
    assert game["players"][0]["hand"] == reds + tail
    engine.assert_conservation(result)


@pytest.mark.parametrize("selection", ["empty", "duplicate", "mixed", "black", "foreign", "unknown", "not-list", "non-string"])
def test_invalid_red_three_batches_are_rejected_atomically(selection):
    game = rig()
    game["sides"][0]["opened"] = True
    red, other_red = take(game, "3", 2, "hearts")
    black = take(game, "3", 1, "clubs")[0]
    normal = take(game, "4")[0]
    game["players"][0]["hand"] = [red, black, normal]
    game["players"][1]["hand"] = [other_red]
    ids = {
        "empty": [], "duplicate": [red, red], "mixed": [red, normal],
        "black": [red, black], "foreign": [red, other_red], "unknown": [red, "unknown"],
        "not-list": red, "non-string": [red, {}],
    }[selection]
    before = copy.deepcopy(game)
    with pytest.raises(ValueError, match="Select red threes"):
        engine.apply(game, 0, {"type": "red_three", "cardIds": ids, "expose": True})
    assert game == before


def test_red_three_batch_requires_opening_first():
    game = rig()
    reds = take(game, "3", 2, "hearts")
    game["players"][0]["hand"] = reds + take(game, "4", 4)
    before = copy.deepcopy(game)
    with pytest.raises(ValueError, match="opening meld"):
        engine.apply(game, 0, {"type": "red_three", "cardIds": reds, "expose": True})
    assert game == before


@pytest.mark.parametrize("count", [1, 2, 3, 8])
def test_red_threes_can_be_staged_in_a_normal_draft(count):
    game = rig()
    game["sides"][0]["opened"] = True
    reds = take(game, "3", min(count, 5), "hearts") + take(game, "3", max(0, count - 5), "diamonds")
    tail = take(game, "4", 3)
    game["players"][0]["hand"] = reds + tail
    result = engine.apply(game, 0, {"type": "meld", "groups": [{"cardIds": reds, "redThree": True}]})
    assert result["players"][0]["redThrees"] == reds
    assert result["players"][0]["hand"] == tail
    assert result["sides"][0]["melds"] == []
    assert result["phase"] == "play" and result["actor"] == 0
    assert game["players"][0]["hand"] == reds + tail
    engine.assert_conservation(result)


@pytest.mark.parametrize("reds_first", [True, False])
def test_red_threes_and_ordinary_melds_commit_together(reds_first):
    game = rig()
    game["sides"][0]["opened"] = True
    red = take(game, "3", 1, "hearts")
    aces = take(game, "A", 3)
    tail = take(game, "4", 3)
    game["players"][0]["hand"] = red + aces + tail
    groups = [{"cardIds": red, "redThree": True}, {"cardIds": aces, "kind": "set"}]
    result = engine.apply(game, 0, {"type": "meld", "groups": groups if reds_first else groups[::-1]})
    assert result["players"][0]["redThrees"] == red
    assert result["players"][0]["hand"] == tail
    assert result["sides"][0]["melds"][0]["cardIds"] == aces
    engine.assert_conservation(result)


@pytest.mark.parametrize("invalid", ["normal", "black", "foreign", "duplicate", "already-used", "flag"])
def test_invalid_red_three_drafts_roll_back_every_group(invalid):
    game = rig()
    game["sides"][0]["opened"] = True
    red = take(game, "3", 1, "hearts")
    foreign = take(game, "3", 1, "diamonds")
    black = take(game, "3", 1, "clubs")
    aces = take(game, "A", 3)
    tail = take(game, "4", 3)
    game["players"][0]["hand"] = red + black + aces + tail
    game["players"][1]["hand"] = foreign
    ids = {"normal": tail[:1], "black": black, "foreign": foreign,
           "duplicate": red * 2, "already-used": red, "flag": red}[invalid]
    groups = [{"cardIds": aces}, {"cardIds": ids, "redThree": "yes" if invalid == "flag" else True}]
    if invalid == "already-used":
        groups.append({"cardIds": red, "redThree": True})
    before = copy.deepcopy(game)
    with pytest.raises(ValueError):
        engine.apply(game, 0, {"type": "meld", "groups": groups})
    assert game == before


def test_staged_red_threes_cannot_bypass_opening_or_the_pickup_followup_draw():
    game = rig()
    red = take(game, "3", 1, "hearts")
    aces = take(game, "A", 3)
    tail = take(game, "4", 3)
    game["players"][0]["hand"] = red + aces + tail
    before = copy.deepcopy(game)
    with pytest.raises(ValueError, match="opening meld"):
        engine.apply(game, 0, {"type": "meld", "groups": [{"cardIds": aces}, {"cardIds": red, "redThree": True}]})
    assert game == before
    game["sides"][0]["opened"] = True
    game["phase"] = "draw"
    top = take(game, "A")[0]
    game["discard"] = [top]
    before = copy.deepcopy(game)
    with pytest.raises(ValueError, match="second card"):
        engine.apply(game, 0, {"type": "pickup", "groups": [
            {"cardIds": [top, *aces[:2]]}, {"cardIds": red, "redThree": True},
        ]})
    assert game == before


def test_staging_the_last_hand_red_three_enters_the_foot():
    game = rig()
    game["sides"][0]["opened"] = True
    reds = take(game, "3", 1, "hearts")
    foot = take(game, "4", 11)
    game["players"][0].update(hand=reds, foot=foot)
    result = engine.apply(game, 0, {"type": "meld", "groups": [{"cardIds": reds, "redThree": True}]})
    assert result["players"][0]["hand"] == foot
    assert result["players"][0]["inFoot"]
    assert result["phase"] == "play" and result["actor"] == 0


@pytest.mark.parametrize("remaining", [0, 1])
def test_staged_red_threes_preserve_the_final_discard_rules(remaining):
    game = rig()
    game["sides"][0]["opened"] = True
    reds = take(game, "3", 1, "hearts")
    game["players"][0].update(hand=reds + take(game, "4", remaining), inFoot=True)
    before = copy.deepcopy(game)
    with pytest.raises(ValueError, match="final card|clean and a dirty book"):
        engine.apply(game, 0, {"type": "meld", "groups": [{"cardIds": reds, "redThree": True}]})
    assert game == before


@pytest.mark.parametrize("opened", [False, True])
def test_red_three_batches_can_be_replaced_without_ending_the_turn(opened):
    game = rig()
    game["sides"][0]["opened"] = opened
    reds = take(game, "3", 2, "hearts")
    tail = take(game, "4", 4)
    game["players"][0]["hand"] = reds + tail
    replacement = list(reversed(game["stock"][-2:]))
    result = engine.apply(game, 0, {"type": "red_three", "cardIds": reds, "expose": False})
    assert result["players"][0]["hand"] == tail + replacement
    assert result["players"][0]["redThrees"] == []
    assert result["discard"][-2:] == reds
    assert result["replaced"] == []
    assert result["sides"][0]["opened"] == opened
    assert result["phase"] == "play" and result["actor"] == 0
    engine.assert_conservation(result)


def test_red_three_batch_replacement_does_not_partially_draw_from_an_exhausted_stack():
    game = rig()
    reds = take(game, "3", 2, "hearts")
    game["players"][0]["hand"] = reds + take(game, "4", 4)
    game["players"][1]["hand"] = game["stock"][:-1]
    game["stock"] = game["stock"][-1:]
    result = engine.apply(game, 0, {"type": "red_three", "cardIds": reds, "expose": False})
    assert result["phase"] == "scoring"
    assert result["players"][0]["hand"] == game["players"][0]["hand"]
    assert result["stock"] == game["stock"]
    assert result["replaced"] == []
    engine.assert_conservation(result)


def test_laying_down_all_red_threes_in_hand_enters_the_foot_and_continues():
    game = rig()
    game["sides"][0]["opened"] = True
    reds = take(game, "3", 2, "hearts")
    foot = take(game, "4", 11)
    game["players"][0].update(hand=reds, foot=foot)
    result = engine.apply(game, 0, {"type": "red_three", "cardIds": reds, "expose": True})
    assert result["players"][0]["redThrees"] == reds
    assert result["players"][0]["hand"] == foot
    assert result["players"][0]["inFoot"]
    assert result["phase"] == "play" and result["actor"] == 0


@pytest.mark.parametrize("remaining", [0, 1])
def test_red_three_batches_preserve_the_final_discard_requirement_in_the_foot(remaining):
    game = rig()
    game["sides"][0]["opened"] = True
    reds = take(game, "3", 2, "hearts")
    game["players"][0].update(hand=reds + take(game, "4", remaining), inFoot=True)
    before = copy.deepcopy(game)
    with pytest.raises(ValueError, match="final card|Keep two cards"):
        engine.apply(game, 0, {"type": "red_three", "cardIds": reds, "expose": True})
    assert game == before


def test_can_extend_partner_lane_and_reject_opponent():
    game = rig()
    ids = take(game, "K", 3)
    target = {"id": "partner-pile", "creator": "3", "kind": "set", "cardIds": ids, **meld_details([game["cards"][i] for i in ids])}
    game["sides"][0].update(opened=True, melds=[target])
    extra = take(game, "K")
    game["players"][0]["hand"] = extra + take(game, "4")
    result = engine.apply(game, 0, {"type": "meld", "groups": [{"meldId": target["id"], "cardIds": extra}]})
    assert result["sides"][0]["melds"][0]["creator"] == "3"
    assert len(result["sides"][0]["melds"][0]["cardIds"]) == 4
    game["sides"][1]["melds"].append(target)
    game["sides"][0]["melds"] = []
    with pytest.raises(ValueError, match="does not belong"):
        engine.apply(game, 0, {"type": "meld", "groups": [{"meldId": target["id"], "cardIds": extra}]})


def test_top_discard_only_and_no_seventh_card():
    game = rig()
    game["phase"] = "draw"
    hand = take(game, "K", 5) + take(game, "4")
    game["players"][0]["hand"] = hand
    lower = take(game, "5")
    top = take(game, "K")[0]
    game["discard"] = lower + [top]
    result = engine.apply(game, 0, {"type": "pickup", "groups": [{"cardIds": [top, *hand[:5]]}]})
    assert result["discard"] == lower
    assert result["players"][0]["hand"] == hand[-1:]
    assert result["phase"] == "draw"
    assert result["pickupDrawPending"]
    result = engine.apply(result, 0, {"type": "draw"})
    assert result["phase"] == "play"
    result["phase"] = "draw"
    newtop = take(result, "K")[0]
    result["discard"].append(newtop)
    before = copy.deepcopy(result)
    with pytest.raises(ValueError, match="seventh card"):
        engine.apply(result, 0, {"type": "pickup", "groups": [{"meldId": result["sides"][0]["melds"][0]["id"], "cardIds": [newtop]}]})
    assert result == before
    result["phase"] = "play"
    from_hand = take(result, "K")
    result["players"][0]["hand"].extend(from_hand)
    completed = engine.apply(result, 0, {"type": "meld", "groups": [{"meldId": result["sides"][0]["melds"][0]["id"], "cardIds": from_hand}]})
    assert completed["sides"][0]["melds"][0]["complete"]
    assert len(completed["sides"][0]["melds"][0]["cardIds"]) == 7
    assert completed["discard"][-1] == newtop
    engine.assert_conservation(completed)


def test_straight_flush_natural_consecutive_and_extension():
    cards = make_deck(2)
    run = [next(card for card in cards.values() if card["rank"] == rank and card["suit"] == "spades") for rank in RANKS[:7]]
    assert meld_details(run, "run")["bonus"] == 1300
    run.append(next(card for card in cards.values() if card["rank"] == "J" and card["suit"] == "spades"))
    assert meld_details(run, "run")["bonus"] == 1350
    with pytest.raises(ValueError):
        meld_details([*run, run[-1]], "run")
    with pytest.raises(ValueError):
        meld_details([*run[:-1], next(card for card in cards.values() if card["rank"] == "2")], "run")


def test_both_foot_entry_paths_and_final_discard_required():
    game = rig()
    game["sides"][0]["opened"] = True
    player = game["players"][0]
    player["hand"] = take(game, "A", 3)
    player["foot"] = take(game, "4", 11)
    result = engine.apply(game, 0, {"type": "meld", "groups": [{"cardIds": player["hand"]}]})
    assert result["players"][0]["inFoot"] and len(result["players"][0]["hand"]) == 11
    assert result["phase"] == "play" and result["actor"] == 0
    game = rig()
    player = game["players"][0]
    player["hand"] = take(game, "4")
    player["foot"] = take(game, "5", 11)
    result = engine.apply(game, 0, {"type": "discard", "cardId": player["hand"][0]})
    assert result["players"][0]["inFoot"] and len(result["players"][0]["hand"]) == 11
    assert result["actor"] == 1 and result["phase"] == "draw"
    game = rig()
    game["sides"][0]["opened"] = True
    player = game["players"][0]
    player.update(hand=take(game, "A", 3), inFoot=True)
    with pytest.raises(ValueError, match="final card"):
        engine.apply(game, 0, {"type": "meld", "groups": [{"cardIds": player["hand"]}]})


def test_go_out_needs_both_books_and_scores_only_after_confirmation():
    game = rig()
    player = game["players"][0]
    player.update(hand=take(game, "5"), inFoot=True)
    with pytest.raises(ValueError, match="clean and one dirty"):
        engine.apply(game, 0, {"type": "discard", "cardId": player["hand"][0]})
    book(game, "K")
    book(game, "Q", dirty=True)
    game = engine.apply(game, 0, {"type": "discard", "cardId": player["hand"][0]})
    assert game["phase"] == "scoring" and game["sides"][0]["score"] == 0
    for seat in (0, 1, 2):
        game = engine.apply(game, seat, {"type": "score_confirm"})
    assert game["phase"] == "round_over"
    assert game["history"][-1]["scores"][0]["goingOut"] == 100


def test_interactive_debt_breaks_chosen_book_only_and_counts_foot():
    game = rig()
    clean = book(game, "K")
    dirty = book(game, "Q", dirty=True)
    game["players"][0]["hand"] = take(game, "9", 3)
    game["players"][0]["foot"] = take(game, "A", 2)
    engine.finish_round(game, None, "Test round")
    assert game["scoring"]["sides"][0]["debt"] == 70
    with pytest.raises(ValueError, match="another pile"):
        engine.apply(game, 0, {"type": "score_confirm"})
    game = engine.apply(game, 3, {"type": "score_pay", "pileId": dirty["id"]})
    review = scoring.project_review(game, 0)
    assert review["remaining"] == 0
    assert review["broken"] == [dirty["id"]]
    assert clean["id"] not in review["broken"]
    assert review["score"]["books"] == 500
    assert review["score"]["total"] == 70 + 100 - 70 + 500
    assert game["sides"][0]["score"] == 0
    engine.assert_conservation(game)


def test_red_three_qualification_survives_debt_reconciliation():
    game = rig()
    reds = take(game, "3", 3, "hearts")
    game["players"][0]["redThrees"] = reds
    game["players"][0]["hand"] = take(game, "4")
    engine.finish_round(game, None, "Test round")
    assert scoring.project_review(game, 0)["score"]["redThrees"] == 900
    assert scoring.project_review(game, 0)["score"]["cards"] == 15
    assert scoring.project_review(game, 0)["score"]["total"] == 910
    game = engine.apply(game, 0, {"type": "score_pay", "pileId": "reds:0"})
    review = scoring.project_review(game, 0)
    assert review["remaining"] == 0
    assert review["score"]["redCredit"] == 5
    assert review["redThreeQualified"] is True
    assert review["score"]["redThrees"] == 0
    assert review["score"]["cards"] == 10
    assert review["score"]["total"] == 10


@pytest.mark.parametrize("count", [1, 2, 3, 4])
def test_round_end_qualified_red_threes_add_raw_five_points(count):
    game = rig()
    game["players"][0]["redThrees"] = take(game, "3", count, "hearts")
    engine.finish_round(game, None, "Test round")
    score = scoring.project_review(game, 0)["score"]
    assert score["cards"] == (count * 5 if count >= 3 else 0)
    assert score["redThrees"] == count * (300 if count >= 3 else -300)
    assert score["total"] == score["cards"] + score["redThrees"]


@pytest.mark.parametrize("spent,remaining", [(1, 2), (2, 1)])
def test_breaking_qualified_red_threes_keeps_raw_value_without_penalties(spent, remaining):
    game = rig()
    game["players"][0]["redThrees"] = take(game, "3", 3, "hearts")
    game["players"][0]["hand"] = take(game, "4", spent)
    engine.finish_round(game, None, "Test round")
    game = engine.apply(game, 0, {"type": "score_pay", "pileId": "reds:0"})
    score = scoring.project_review(game, 0)["score"]
    assert score["redCredit"] == spent * 5
    assert score["cards"] == 5 * remaining
    assert score["redThrees"] == 0
    assert score["total"] == 5 * remaining


@pytest.mark.parametrize("automatic", [False, True])
def test_ace_in_hand_versus_three_qualified_red_threes_finishes_at_minus_five(automatic):
    game = rig(mode="individual")
    game["players"][0]["redThrees"] = take(game, "3", 3, "hearts")
    game["players"][0]["hand"] = take(game, "A")
    engine.finish_round(game, None, "Test round")
    command = {"type": "score_auto"} if automatic else {"type": "score_pay", "pileId": "reds:0"}
    game = engine.apply(game, 0, command)
    review = scoring.project_review(game, 0)
    assert review["remaining"] == 5
    assert review["score"]["redCredit"] == 15
    assert review["score"]["redThrees"] == 0
    assert review["score"]["cards"] == 0
    assert review["score"]["total"] == -5
    for seat in range(6):
        game = engine.apply(game, seat, {"type": "score_confirm"})
    assert game["history"][-1]["scores"][0]["total"] == -5
    assert game["sides"][0]["score"] == -5
    engine.assert_conservation(game)


def test_using_one_of_four_reds_forfeits_the_entire_bonus_even_with_three_remaining():
    game = rig()
    game["players"][0]["redThrees"] = take(game, "3", 4, "hearts")
    game["players"][0]["hand"] = take(game, "4")
    engine.finish_round(game, None, "Test round")
    assert scoring.project_review(game, 0)["score"]["redThrees"] == 1200
    game = engine.apply(game, 0, {"type": "score_pay", "pileId": "reds:0"})
    score = scoring.project_review(game, 0)["score"]
    assert score["cards"] == 15
    assert score["redThrees"] == 0
    assert score["total"] == 15


@pytest.mark.parametrize("location", ["hand", "foot"])
def test_private_red_threes_remain_300_point_debt_despite_a_qualified_public_pile(location):
    game = rig(mode="individual")
    game["players"][0]["redThrees"] = take(game, "3", 3, "hearts")
    game["players"][0][location] = take(game, "3", 1, "diamonds")
    engine.finish_round(game, None, "Test round")
    review = scoring.project_review(game, 0)
    assert review["redThreeQualified"] is True
    assert review["debt"] == 300
    game = engine.apply(game, 0, {"type": "score_pay", "pileId": "reds:0"})
    assert scoring.project_review(game, 0)["score"]["total"] == -285


def test_a_private_red_three_cannot_qualify_an_exposed_pile_of_two():
    game = rig(mode="individual")
    game["players"][0]["redThrees"] = take(game, "3", 2, "hearts")
    game["players"][0]["hand"] = take(game, "3", 1, "diamonds")
    engine.finish_round(game, None, "Test round")
    review = scoring.project_review(game, 0)
    assert review["redThreeQualified"] is False
    assert review["score"]["redThrees"] == -600
    assert review["score"]["total"] == -900


def test_older_scoring_records_use_the_original_public_red_count_for_qualification():
    game = rig()
    game["players"][0]["redThrees"] = take(game, "3", 3, "hearts")
    game["players"][0]["hand"] = take(game, "4")
    engine.finish_round(game, None, "Test round")
    del game["scoring"]["sides"][0]["redThreeQualified"]
    game = engine.apply(game, 0, {"type": "score_pay", "pileId": "reds:0"})
    score = scoring.project_review(game, 0)["score"]
    assert score["redThrees"] == 0
    assert score["total"] == 10


def test_auto_cover_compares_the_red_bonus_loss_without_an_extra_penalty():
    game = rig()
    game["players"][0]["redThrees"] = take(game, "3", 3, "hearts")
    game["players"][0]["hand"] = take(game, "4", 1, "clubs")
    ids = [take(game, rank, 1, "hearts")[0] for rank in ["4", "5", "6", "7", "8", "9", "10"]]
    game["sides"][0]["melds"].append({"id": "flush", "creator": "0", "kind": "run", "cardIds": ids, **meld_details([game["cards"][i] for i in ids], "run")})
    engine.finish_round(game, None, "Test round")
    assert scoring.auto_choice(game, 0) == "reds:0"
    game = engine.apply(game, 0, {"type": "score_auto"})
    assert scoring.project_review(game, 0)["score"]["books"] == 1300


def test_spent_red_threes_do_not_also_receive_retained_raw_card_points():
    game = rig()
    game["players"][0]["redThrees"] = take(game, "3", 3, "hearts")
    game["players"][0]["hand"] = take(game, "4", 3)
    engine.finish_round(game, None, "Test round")
    game = engine.apply(game, 0, {"type": "score_pay", "pileId": "reds:0"})
    score = scoring.project_review(game, 0)["score"]
    assert score["redCredit"] == 15
    assert score["cards"] == 0
    assert score["redThrees"] == 0
    assert score["total"] == 0


def test_auto_cover_breaks_dirty_before_clean_even_if_clean_alone_could_pay():
    game = rig()
    clean = book(game, "A")
    dirty = book(game, "Q", dirty=True)
    game["players"][0]["hand"] = take(game, "9", 12)
    engine.finish_round(game, None, "Test round")
    assert game["scoring"]["sides"][0]["debt"] == 120
    assert scoring.auto_choice(game, 0) == dirty["id"]
    game = engine.apply(game, 0, {"type": "score_auto"})
    assert game["scoring"]["sides"][0]["broken"] == [dirty["id"], clean["id"]]
    assert scoring.project_review(game, 0)["score"]["books"] == 0


def test_auto_cover_uses_open_piles_then_dirty_books_and_preserves_clean_when_possible():
    game = rig()
    clean = book(game, "A")
    dirty = book(game, "Q", dirty=True)
    ids = take(game, "5", 3)
    game["sides"][0]["melds"].append({"id": "open-fives", "creator": "0", "kind": "set", "cardIds": ids, **meld_details([game["cards"][i] for i in ids])})
    game["players"][0]["hand"] = take(game, "K", 8)
    engine.finish_round(game, None, "Test round")
    assert scoring.auto_choice(game, 0) == "open-fives"
    game = engine.apply(game, 0, {"type": "score_auto"})
    assert game["scoring"]["sides"][0]["usedPiles"] == ["open-fives", dirty["id"]]
    assert game["scoring"]["sides"][0]["broken"] == [dirty["id"]]
    assert scoring.project_review(game, 0)["score"]["books"] == clean["bonus"]


def test_red_replacement_conservation_and_penalties():
    game = rig()
    red = take(game, "3", 1, "hearts")[0]
    game["players"][0]["hand"] = [red, *take(game, "3", 1, "clubs")]
    result = engine.apply(game, 0, {"type": "red_three", "cardId": red, "expose": False})
    assert result["discard"][-1] == red and len(result["players"][0]["hand"]) == 2
    assert red not in result["replaced"]
    engine.assert_conservation(result)
    engine.finish_round(game, None, "Test round")
    assert game["scoring"]["sides"][0]["debt"] == 400


def test_target_score_and_ties_commit_once():
    game = rig()
    book(game, "K", team=0)
    book(game, "Q", team=1, creator="1")
    game["sides"][0]["score"] = 9500
    game["sides"][1]["score"] = 9500
    engine.finish_round(game, None, "Test round")
    for seat in (0, 1, 2):
        game = engine.apply(game, seat, {"type": "score_confirm"})
    assert game["phase"] == "finished" and game["winners"] == [0, 1]
    before = copy.deepcopy(game)
    with pytest.raises(ValueError):
        engine.apply(game, 0, {"type": "score_confirm"})
    assert game == before


def test_hidden_information_does_not_change_bot_decision():
    game = chosen(fresh())
    seat = game["actor"]
    view = engine.project(game, str(seat)) | {"viewerId": str(seat)}
    swapped = copy.deepcopy(game)
    swapped["stock"].reverse()
    for player in swapped["players"]:
        if player["id"] != str(seat):
            player["hand"].reverse()
            player["foot"].reverse()
        else:
            # The top foot card is visible to its owner; the rest stay hidden.
            player["foot"][1:] = reversed(player["foot"][1:])
    other_view = engine.project(swapped, str(seat)) | {"viewerId": str(seat)}
    assert view == other_view
    assert bots.decide(view) == bots.decide(other_view)


@pytest.mark.parametrize("opened", [False, True])
def test_bots_only_lay_down_red_threes_after_opening(opened):
    game = rig()
    game["sides"][0]["opened"] = opened
    reds = take(game, "3", 3, "hearts")
    game["players"][0]["hand"] = reds + take(game, "4")
    view = engine.project(game, "0") | {"viewerId": "0"}
    command = bots.decide(view)
    assert command == {"type": "red_three", "cardId": reds[0], "expose": opened}
    engine.apply(game, 0, command)


@pytest.mark.parametrize("rank,natural_count,wild_count", [("9", 2, 1), ("2", 2, 1), ("2", 7, 0), ("2", 4, 3)])
def test_bots_build_small_dirty_melds_and_books_of_twos(rank, natural_count, wild_count):
    game = rig()
    game["players"][0]["hand"] = take(game, rank, natural_count) + take(game, "Joker", wild_count) + take(game, "4")
    view = engine.project(game, "0") | {"viewerId": "0"}
    command = bots.decide(view)
    assert command["type"] == "meld"
    result = engine.apply(game, 0, command)
    meld = result["sides"][0]["melds"][0]
    assert meld["rank"] == rank
    assert len(meld["cardIds"]) == natural_count + wild_count
    assert meld["dirty"] == bool(wild_count)


@pytest.mark.parametrize("count,mode", [(n, "individual") for n in range(2, 7)] + [(4, "partnership"), (6, "partnership")])
def test_seeded_rounds_conserve_cards_and_reach_scoring(count, mode):
    for seed in (5, 11):
        game = fresh(count, mode, seed=seed)
        for _ in range(2500):
            if game["phase"] == "choose":
                seat = next(i for i,p in enumerate(game["players"]) if not p["chosen"])
            elif game["phase"] in ("draw", "play"):
                seat = game["actor"]
            else:
                break
            view = engine.project(game, str(seat)) | {"viewerId": str(seat)}
            game = engine.apply(game, seat, bots.decide(view))
        else:
            pytest.fail("Round did not terminate.")
        assert game["phase"] == "scoring"
        for team in range(len(game["sides"])):
            seat = next(i for i,p in enumerate(game["players"]) if p["team"] == team)
            game = engine.apply(game, seat, {"type": "score_auto"})
            game = engine.apply(game, seat, {"type": "score_confirm"})
        assert game["phase"] in ("round_over", "finished")
        assert len(game["history"]) == 1
        engine.assert_conservation(game)

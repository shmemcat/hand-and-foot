import pytest
from collections import Counter
from handandfoot_server import engine
from handandfoot_server.fixtures import BOARD_FIXTURES, HAND_FIXTURES, OPENING_FIXTURES, FOOT_FIXTURES, GOING_OUT_FIXTURES, populate
from handandfoot_server.rules import RANKS, SUITS, meld_details, opening_for
from test_engine import fresh
from test_service import client, move, ROOT


@pytest.mark.parametrize("kind", ["scoring", "dense", "catchup"])
def test_development_fixtures_conserve_cards(kind):
    game = fresh(6)
    populate(game, kind)
    engine.assert_conservation(game)
    view = engine.project(game, "0")
    if kind == "scoring":
        assert view["scoring"]["debt"] == 125
        assert len(view["scoring"]["options"]) == 4
    if kind == "catchup":
        assert view["drawCount"] == 3


def test_red_three_target_fixture_plays_a_single_red_through_the_normal_draft(tmp_path):
    from handandfoot_server.application import create_app
    app = create_app({"TESTING": True, "START_WORKER": False, "DEVELOPMENT_FIXTURES": True,
                      "SQLALCHEMY_DATABASE_URI": f"sqlite:///{tmp_path / 'reds.sqlite'}"})
    http, headers = client(app)
    response = http.post(ROOT + "/fixtures", headers=headers, json={"fixture": "red-three-target"})
    assert response.status_code == 200
    before = response.json
    assert before["scoringMode"] == "individual"
    assert before["sides"][0]["opened"]
    assert len(before["players"][0]["redThrees"]) == 2
    red = next(card for card in before["hand"] if card["redThree"])
    response = move(http, headers, before, "meld", groups=[{"cardIds": [red["id"]], "redThree": True}])
    assert response.status_code == 200, response.json
    after = response.json
    assert len(after["players"][0]["redThrees"]) == 3
    assert red["id"] not in {card["id"] for card in after["hand"]}
    assert after["actorId"] == before["actorId"] and after["phase"] == "play"


@pytest.mark.parametrize("kind", FOOT_FIXTURES)
def test_live_foot_previews_use_real_cards_and_keep_the_correct_turn(tmp_path, kind):
    from handandfoot_server.application import create_app
    game = fresh(6, "individual")
    populate(game, kind)
    engine.assert_conservation(game)
    app = create_app({"TESTING": True, "START_WORKER": False, "DEVELOPMENT_FIXTURES": True,
                      "SQLALCHEMY_DATABASE_URI": f"sqlite:///{tmp_path / 'foot.sqlite'}"})
    http, headers = client(app)
    response = http.post(ROOT + "/fixtures", headers=headers, json={"fixture": kind})
    assert response.status_code == 200
    before = response.json
    assert before["playMode"] == "practice" and before["scoringMode"] == "individual"
    assert len(before["hand"]) == 1 and before["players"][0]["footCount"] == 11
    assert before["hand"][0]["rank"] == "K" and before["footTop"]["rank"] == "2"
    assert all("hand" not in player and "foot" not in player for player in before["players"])
    card_id = before["hand"][0]["id"]
    if kind == "foot-play":
        response = move(http, headers, before, "meld", groups=[{"meldId": before["sides"][0]["melds"][0]["id"], "cardIds": [card_id]}])
    else:
        response = move(http, headers, before, "discard", cardId=card_id)
    assert response.status_code == 200, response.json
    after = response.json
    assert len(after["hand"]) == 11 and before["footTop"]["id"] in {card["id"] for card in after["hand"]}
    assert after["players"][0]["inFoot"] and after["players"][0]["footCount"] == 0
    assert after["footTop"] is None
    if kind == "foot-play":
        assert after["actorId"] == after["viewerId"] and after["phase"] == "play"
    else:
        assert after["actorId"] != after["viewerId"] and after["phase"] == "draw"
        assert after["discard"]["id"] == card_id
        assert move(http, headers, after, "discard", cardId=after["hand"][0]["id"]).status_code == 400


@pytest.mark.parametrize("kind", GOING_OUT_FIXTURES)
def test_going_out_previews_enforce_the_book_check_and_discard_face_down(kind):
    game = fresh(6, "individual")
    populate(game, kind)
    engine.assert_conservation(game)
    player = game["players"][0]
    played = player["hand"][:-1]
    target = next(meld for meld in game["sides"][0]["melds"] if meld["rank"] == ("Q" if kind == "going-out-complete-book" else "8"))
    command = {"type": "meld", "groups": [{"meldId": target["id"], "cardIds": played}]}
    if kind == "going-out-blocked":
        with pytest.raises(ValueError, match="Keep two cards"):
            engine.apply(game, 0, command)
        return
    game = engine.apply(game, 0, command)
    assert len(game["players"][0]["hand"]) == 1
    final = game["players"][0]["hand"][0]
    game = engine.apply(game, 0, {"type": "discard", "cardId": final})
    assert game["phase"] == "scoring" and game["discardFaceDown"]
    assert engine.project(game, player["id"])["discard"] is None


@pytest.mark.parametrize("kind", ["scoring", *BOARD_FIXTURES, *HAND_FIXTURES, *OPENING_FIXTURES, *FOOT_FIXTURES, *GOING_OUT_FIXTURES])
def test_fixtures_are_disabled_by_default(tmp_path, kind):
    from handandfoot_server.application import create_app
    app = create_app({"TESTING": True, "START_WORKER": False, "DEVELOPMENT_FIXTURES": False, "SQLALCHEMY_DATABASE_URI": f"sqlite:///{tmp_path / 'game.sqlite'}"})
    http, headers = client(app)
    assert http.post(ROOT + "/fixtures", headers=headers, json={"fixture": kind}).status_code == 404


@pytest.mark.parametrize("kind,round_number", [("opening", 1), ("next-round-opening", 2)])
def test_live_opening_previews_use_real_private_piles_and_rotate_the_dealer(tmp_path, kind, round_number):
    game = fresh(6, "individual")
    dealer = game["dealer"]
    populate(game, kind)
    assert game["round"] == round_number
    assert game["dealer"] == (dealer + round_number - 1) % 6
    engine.assert_conservation(game)
    from handandfoot_server.application import create_app
    app = create_app({"TESTING": True, "START_WORKER": False, "DEVELOPMENT_FIXTURES": True, "SQLALCHEMY_DATABASE_URI": f"sqlite:///{tmp_path / 'opening.sqlite'}"})
    http, headers = client(app)
    response = http.post(ROOT + "/fixtures", headers=headers, json={"fixture": kind})
    assert response.status_code == 200
    view = response.json
    assert view["round"] == round_number and view["phase"] == "choose"
    assert not view["opening"]["complete"]
    assert view["hand"] == [] and list(map(len, view["footPreview"])) == [2, 2]
    assert view["scoringMode"] == "individual" and view["capacity"] == 6


@pytest.mark.parametrize("kind,count", HAND_FIXTURES.items())
def test_large_hands_conserve_cards_and_cannot_make_an_opening(kind, count):
    game = fresh(6, "individual")
    populate(game, kind)
    engine.assert_conservation(game)
    hand = [game["cards"][card_id] for card_id in game["players"][0]["hand"]]
    assert len(hand) == count
    assert len(game["players"][0]["foot"]) == 11
    assert not any(card["wild"] for card in hand)
    ranks = Counter(card["rank"] for card in hand)
    possible_matching_points = sum(
        sum(card["value"] for card in hand if card["rank"] == rank)
        for rank, amount in ranks.items() if rank != "3" and amount >= 3
    )
    assert possible_matching_points <= opening_for(0)
    for suit in SUITS:
        positions = {RANKS.index(card["rank"]) for card in hand if card["suit"] == suit and card["rank"] in RANKS}
        assert not any(set(range(start, start + 3)) <= positions for start in range(len(RANKS) - 2))


@pytest.mark.parametrize("kind,count", HAND_FIXTURES.items())
def test_large_hand_preview_is_an_individual_practice_table(tmp_path, kind, count):
    from handandfoot_server.application import create_app
    app = create_app({"TESTING": True, "START_WORKER": False, "DEVELOPMENT_FIXTURES": True, "SQLALCHEMY_DATABASE_URI": f"sqlite:///{tmp_path / 'preview.sqlite'}"})
    http, headers = client(app)
    response = http.post(ROOT + "/fixtures", headers=headers, json={"fixture": kind})
    assert response.status_code == 200
    view = response.json
    assert view["scoringMode"] == "individual"
    assert view["playMode"] == "practice"
    assert view["capacity"] == 6
    assert view["phase"] == "play"
    assert view["actorId"] == view["viewerId"]
    assert len(view["hand"]) == count
    assert all("hand" not in player and "foot" not in player for player in view["players"])


@pytest.mark.parametrize("kind,open_count", BOARD_FIXTURES.items())
def test_full_board_preview_has_valid_open_and_completed_piles(tmp_path, kind, open_count):
    from handandfoot_server.application import create_app
    game = fresh(6, "individual")
    populate(game, kind)
    engine.assert_conservation(game)
    melds = game["sides"][0]["melds"]
    assert len(melds) == 8 + open_count
    assert sum(not meld["complete"] for meld in melds) == open_count
    assert sum(meld["complete"] for meld in melds) == 8
    for complete in (False, True):
        subset = [meld for meld in melds if meld["complete"] == complete]
        assert any(meld["dirty"] for meld in subset)
        assert any(not meld["dirty"] and meld["kind"] == "set" for meld in subset)
        assert any(meld["kind"] == "run" for meld in subset)
    for side in game["sides"]:
        for meld in side["melds"]:
            details = meld_details([game["cards"][card_id] for card_id in meld["cardIds"]], meld["kind"])
            assert all(meld[key] == value for key, value in details.items())
    app = create_app({"TESTING": True, "START_WORKER": False, "DEVELOPMENT_FIXTURES": True, "SQLALCHEMY_DATABASE_URI": f"sqlite:///{tmp_path / 'full-board.sqlite'}"})
    http, headers = client(app)
    response = http.post(ROOT + "/fixtures", headers=headers, json={"fixture": kind})
    assert response.status_code == 200
    view = response.json
    assert view["scoringMode"] == "individual"
    assert view["playMode"] == "practice"
    assert view["capacity"] == 6
    assert view["actorId"] == view["viewerId"]
    assert len(view["sides"][0]["melds"]) == 8 + open_count
    assert len(view["hand"]) == 10

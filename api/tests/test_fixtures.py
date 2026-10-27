import pytest
from collections import Counter
from handandfoot_server import engine
from handandfoot_server.fixtures import BOARD_FIXTURES, HAND_FIXTURES, populate
from handandfoot_server.rules import RANKS, SUITS, meld_details, opening_for
from test_engine import fresh
from test_service import client, ROOT


@pytest.mark.parametrize("kind", ["scoring", "dense", "catchup"])
def test_development_fixtures_conserve_cards(kind):
    game = fresh(8)
    populate(game, kind)
    engine.assert_conservation(game)
    view = engine.project(game, "0")
    if kind == "scoring":
        assert view["scoring"]["debt"] == 125
        assert len(view["scoring"]["options"]) == 4
    if kind == "catchup":
        assert view["drawCount"] == 3


@pytest.mark.parametrize("kind", ["scoring", *BOARD_FIXTURES, *HAND_FIXTURES])
def test_fixtures_are_disabled_by_default(tmp_path, kind):
    from handandfoot_server.application import create_app
    app = create_app({"TESTING": True, "START_WORKER": False, "DEVELOPMENT_FIXTURES": False, "SQLALCHEMY_DATABASE_URI": f"sqlite:///{tmp_path / 'game.sqlite'}"})
    http, headers = client(app)
    assert http.post(ROOT + "/fixtures", headers=headers, json={"fixture": kind}).status_code == 404


@pytest.mark.parametrize("kind,count", HAND_FIXTURES.items())
def test_large_hands_conserve_cards_and_cannot_make_an_opening(kind, count):
    game = fresh(4, "individual")
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
    assert view["capacity"] == 4
    assert view["phase"] == "play"
    assert view["actorId"] == view["viewerId"]
    assert len(view["hand"]) == count
    assert all("hand" not in player and "foot" not in player for player in view["players"])


@pytest.mark.parametrize("kind,open_count", BOARD_FIXTURES.items())
def test_full_board_preview_has_valid_open_and_completed_piles(tmp_path, kind, open_count):
    from handandfoot_server.application import create_app
    game = fresh(4, "individual")
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
    assert view["capacity"] == 4
    assert view["actorId"] == view["viewerId"]
    assert len(view["sides"][0]["melds"]) == 8 + open_count
    assert len(view["hand"]) == 10

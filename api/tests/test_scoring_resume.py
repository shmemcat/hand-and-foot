"""Old, unfinished score reviews must adopt committed-red debt exactly once."""
import copy
import json

import pytest

from handandfoot_server import engine, scoring
from handandfoot_server.application import ROOT
from handandfoot_server.models import Room, db
from handandfoot_server.rules import meld_details
from test_engine import book, rig, take
from test_service import app, client, create, move


def old_review(game, progress="untouched", count=2):
    game.update(stock=list(game["cards"]), discard=[], replaced=[], phase="play")
    for player in game["players"]:
        player.update(hand=[], foot=[], piles=[], redThrees=[], chosen=True, inFoot=True)
    for side in game["sides"]:
        side.update(melds=[], score=0)
    book(game, "A")
    kings = take(game, "K", 3)
    game["sides"][0]["melds"].append({"id": "open-kings", "creator": game["players"][0]["id"],
                                      "kind": "set", "cardIds": kings,
                                      **meld_details([game["cards"][i] for i in kings])})
    owners = [p for p in game["players"] if p["team"] == 0]
    reds = take(game, "3", count, "hearts")
    for index, card_id in enumerate(reds):
        owners[index % len(owners)]["redThrees"].append(card_id)
    owners[0]["hand"] = take(game, "A", 2)
    engine.finish_round(game, None, "Saved using the earlier red-three rules")
    review = game["scoring"]["sides"][0]
    review["debt"] -= review["redThreeDebt"]
    review["remaining"] -= review.pop("redThreeDebt")
    if progress != "untouched":
        review.update(remaining=0, usedPiles=["reds:0", "open-kings"], canceled=[*reds, *kings],
                      redCredit=count * 5, confirmed=progress == "confirmed", revision=2)
        # One committed red covered only five points, so the old count also
        # partly spent an ace after exhausting the kings.
        if count == 1:
            ace = game["sides"][0]["melds"][0]
            review["usedPiles"].append(ace["id"])
            review["broken"] = [ace["id"]]
            review["canceled"].append(ace["cardIds"][0])
    return json.loads(json.dumps(game))


@pytest.mark.parametrize("mode", ["individual", "partnership"])
@pytest.mark.parametrize("progress", ["untouched", "paid", "confirmed"])
@pytest.mark.parametrize("count", [1, 2])
def test_saved_short_red_review_restarts_only_affected_settlement(mode, progress, count):
    game = old_review(rig(mode=mode), progress, count)
    original = copy.deepcopy(game)
    unrelated = copy.deepcopy(game["scoring"]["sides"][1:])
    view = engine.project(game, game["players"][0]["id"])
    assert game == original  # Reading a saved game does not rewrite its payload.
    assert view["scoring"]["debt"] == 40 + count * 300
    assert view["scoring"]["redThreeDebt"] == count * 300
    assert not view["scoring"]["confirmed"]
    assert view["scoring"]["usedPiles"] == []
    assert view["token"].endswith(f':{original["scoring"]["sides"][0]["revision"] + 1}')
    game = engine.apply(game, 0, {"type": "score_auto"})
    score = scoring.project_review(game, 0)["score"]
    assert score["total"] == 170 - 40 - count * 300
    assert score["uncovered"] == count * 300 - 130
    assert score["books"] == 0
    assert score["redCredit"] == 0
    assert game["scoring"]["sides"][1:] == unrelated
    settled = copy.deepcopy(game)
    scoring.upgrade_pending_reviews(game)
    assert game == settled
    for team in range(len(game["sides"])):
        game = engine.apply(game, team, {"type": "score_confirm"})
    assert len(game["history"]) == 1
    assert game["sides"][0]["score"] == score["total"]
    assert game["history"][0]["scores"][0] == score
    engine.assert_conservation(game)


@pytest.mark.parametrize("progress", ["paid", "confirmed"])
def test_legacy_qualified_reds_keep_their_credit_progress_and_confirmation(progress):
    game = old_review(rig(mode="individual"), progress, count=3)
    prior = copy.deepcopy(game["scoring"]["sides"][0])
    scoring.upgrade_pending_reviews(game)
    assert game["scoring"]["sides"][0] == {**prior, "redThreeDebt": 0}
    assert scoring.project_review(game, 0)["score"]["total"] == 645
    engine.assert_conservation(game)


def test_completed_legacy_round_is_never_rewritten():
    game = old_review(rig(mode="individual"))
    game.update(phase="round_over", history=[{"round": 1, "scores": [{"team": 0, "total": 670}]}])
    before = copy.deepcopy(game)
    scoring.upgrade_pending_reviews(game)
    engine.project(game, game["players"][0]["id"])
    assert game == before


def test_conceding_during_legacy_review_cannot_commit_an_unsettled_short_red_score():
    game = old_review(rig(mode="individual"), "confirmed")
    # Every side but the departing one had submitted its old review.
    for review in game["scoring"]["sides"]:
        review["confirmed"] = review["team"] != 1
    engine.remove_side(game, 1)
    assert game["phase"] == "scoring"
    assert not game["history"]
    assert not game["scoring"]["sides"][0]["confirmed"]
    assert game["scoring"]["sides"][0]["remaining"] == 640
    engine.assert_conservation(game)


def test_legacy_review_refresh_and_submission_share_the_upgraded_decision_token(app):
    http, headers = client(app)
    room = create(http, headers, playMode="practice", scoringMode="individual")
    with app.app_context():
        row = db.session.get(Room, room["code"])
        data = copy.deepcopy(row.payload)
        data["game"] = old_review(data["game"], "confirmed")
        row.payload = data
        db.session.commit()
    room = http.get(f'{ROOT}/rooms/{room["code"]}').json
    assert room["scoring"]["debt"] == 640
    assert not room["scoring"]["confirmed"]
    response = move(http, headers, room, "score_auto")
    assert response.status_code == 200, response.json
    room = response.json
    assert room["scoring"]["score"]["total"] == -470
    response = move(http, headers, room, "score_confirm")
    assert response.status_code == 200, response.json
    assert response.json["phase"] == "round_over"
    assert response.json["history"][-1]["scores"][0]["total"] == -470
    with app.app_context():
        game = db.session.get(Room, room["code"]).payload["game"]
        assert game["scoring"]["sides"][0]["redThreeDebt"] == 600
        engine.assert_conservation(game)

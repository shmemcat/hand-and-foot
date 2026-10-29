"""Interactive, persistent debt settlement before any book bonuses are awarded."""
import copy
from .rules import FAMILY
from .achievement_events import record_round_end


def prepare(game, went_out, reason):
    record_round_end(game)
    sides = []
    for side in game["sides"]:
        red_count = sum(len(player["redThrees"]) for player in game["players"] if player["team"] == side["id"])
        debt = sum(abs(game["cards"][card_id]["value"]) for player in game["players"] if player["team"] == side["id"] for card_id in [*player["hand"], *player["foot"]])
        breakdown = [{"name": player["name"], "handCount": len(player["hand"]), "footCount": len(player["foot"]),
                      "handPoints": sum(abs(game["cards"][i]["value"]) for i in player["hand"]),
                      "footPoints": sum(abs(game["cards"][i]["value"]) for i in player["foot"])}
                     for player in game["players"] if player["team"] == side["id"]]
        sides.append({"team": side["id"], "debt": debt, "remaining": debt, "usedPiles": [], "debtBreakdown": breakdown,
                      "canceled": [], "redCredit": 0, "redThreeQualified": red_count >= 3,
                      "broken": [], "confirmed": False, "revision": 0})
    game.update(phase="scoring", message=reason, ready=[], scoring={"reason": reason, "wentOut": went_out, "sides": sides})


def options(game, team):
    review = game["scoring"]["sides"][team]
    if review["confirmed"] or review["remaining"] <= 0:
        return []
    side = game["sides"][team]
    choices = []
    for meld in side["melds"]:
        if meld["id"] in review["usedPiles"]:
            continue
        cards = [game["cards"][i] for i in meld["cardIds"]]
        choices.append({"id": meld["id"], "label": f'{meld["rank"]} straight flush' if meld["kind"] == "run" else f'{meld["rank"]}’s · {"dirty book" if meld["dirty"] else "clean book"}' if meld["complete"] else f'{meld["rank"]}’s · unfinished pile',
                        "points": sum(card["value"] for card in cards), "bonusAtRisk": meld["bonus"], "cardIds": meld["cardIds"][:], "redThree": False})
    red_ids = [i for player in game["players"] if player["team"] == team for i in player["redThrees"]]
    red_id = f"reds:{team}"
    if red_ids and red_id not in review["usedPiles"]:
        qualified = review.get("redThreeQualified", len(red_ids) >= 3)
        choices.append({"id": red_id, "label": f'Red threes · {len(red_ids)} cards', "points": len(red_ids) * 5, "bonusAtRisk": len(red_ids) * FAMILY.red_three if qualified else 0,
                        "cardIds": red_ids, "redThree": True})
    return choices


def pay(game, team, pile_id):
    review = game["scoring"]["sides"][team]
    option = next((choice for choice in options(game, team) if choice["id"] == pile_id), None)
    if not option:
        raise ValueError("Choose an available pile while there is debt left to cover.")
    review["usedPiles"].append(pile_id)
    if option["bonusAtRisk"] and not option["redThree"]:
        review["broken"].append(pile_id)
    # Use the smallest card values first. A partly spent final card cannot retain
    # its book bonus, but its unspent points remain in the arithmetic total.
    for card_id in sorted(option["cardIds"], key=lambda i: (5 if option["redThree"] else game["cards"][i]["value"], i)):
        if review["remaining"] <= 0:
            break
        payment = min(review["remaining"], 5 if option["redThree"] else game["cards"][card_id]["value"])
        review["remaining"] -= payment
        review["canceled"].append(card_id)
        if option["redThree"]:
            review["redCredit"] += payment
    review["revision"] += 1


def score_side(game, side, went_out):
    review = game["scoring"]["sides"][side["id"]]
    cards = sum(game["cards"][i]["value"] for meld in side["melds"] for i in meld["cardIds"])
    red_ids = [i for player in game["players"] if player["team"] == side["id"] for i in player["redThrees"]]
    retained = len([i for i in red_ids if i not in review["canceled"]])
    # Qualification is locked at round end. Spending a qualified red forfeits
    # the entire bonus, but cannot turn the remaining reds into penalties.
    # Older scoring records retain the original public card IDs as a fallback.
    qualified = review.get("redThreeQualified", len(red_ids) >= 3)
    red_broken = f'reds:{side["id"]}' in review["usedPiles"] or any(i in review["canceled"] for i in red_ids)
    if qualified:
        cards += retained * 5
    red_points = (len(red_ids) * FAMILY.red_three if not red_broken else 0) if qualified else -retained * FAMILY.red_three
    books = sum(meld["bonus"] for meld in side["melds"] if meld["id"] not in review["broken"])
    going_out = FAMILY.going_out_bonus if went_out else 0
    total = cards - review["debt"] + review["redCredit"] + books + red_points + going_out
    return {"team": side["id"], "cards": cards, "debt": review["debt"], "redThrees": red_points,
            "redCredit": review["redCredit"], "books": books, "goingOut": going_out, "total": total,
            "canceled": review["canceled"][:], "lostBooks": len(review["broken"]), "broken": review["broken"][:],
            "uncovered": review["remaining"]}


def confirm(game, team):
    review = game["scoring"]["sides"][team]
    if review["confirmed"]:
        raise ValueError("Your side already confirmed its score.")
    if review["remaining"] > 0 and options(game, team):
        raise ValueError("Choose another pile to cover your remaining debt before confirming.")
    review["confirmed"] = True
    review["revision"] += 1
    if not all(side["confirmed"] for side in game["scoring"]["sides"]):
        return
    scores = [score_side(game, side, game["scoring"]["wentOut"] == side["id"]) for side in game["sides"]]
    for score in scores:
        game["sides"][score["team"]]["score"] += score["total"]
    evidence = []
    for side, score in zip(game["sides"], scores):
        retained = [m for m in side["melds"] if m["id"] not in score["broken"]]
        evidence.append({
            "team": side["id"],
            "cleanBooks": sum(m["kind"] == "set" and m["complete"] and not m["dirty"] for m in retained),
            "dirtyBooks": sum(m["kind"] == "set" and m["complete"] and m["dirty"] for m in retained),
            "runs": sum(m["kind"] == "run" and m["complete"] for m in retained),
            "redThrees": score["redThrees"] // FAMILY.red_three if score["redThrees"] > 0 else 0,
        })
    game["history"].append({"round": game["round"], "reason": game["scoring"]["reason"], "scores": scores, "achievementData": evidence})
    best = max(side["score"] for side in game["sides"])
    game["phase"] = "finished" if best >= game["targetScore"] else "round_over"
    game["ready"] = []
    if game["phase"] == "finished":
        game["winners"] = [side["id"] for side in game["sides"] if side["score"] == best]


def auto_choice(game, team):
    choices = options(game, team)
    if not choices:
        return None
    free = [choice for choice in choices if choice["bonusAtRisk"] == 0]
    if free:
        # Paying with a short red-three pile also removes its existing penalty.
        return min(free, key=lambda choice: (0 if choice["redThree"] else 1, -choice["points"]))["id"]
    dirty_ids = {meld["id"] for meld in game["sides"][team]["melds"]
                 if meld["kind"] == "set" and meld["complete"] and meld["dirty"]}
    dirty = [choice for choice in choices if choice["id"] in dirty_ids]
    if dirty:
        # Dirty books are always spent before clean books, even when a clean
        # book alone could cover the debt with a smaller combined bonus loss.
        choices = dirty
    remaining = game["scoring"]["sides"][team]["remaining"]
    target = min(remaining, sum(choice["points"] for choice in choices))
    # Within the current priority group, break the least bonus needed to cover
    # as much debt as possible. Re-evaluate the priority after each payment.
    plans = {0: (0, [])}
    for choice in choices:
        risk = choice["bonusAtRisk"]
        for covered, (cost, ids) in list(plans.items()):
            next_covered = min(target, covered + choice["points"])
            candidate = (cost + risk, [*ids, choice["id"]])
            existing = plans.get(next_covered)
            if existing is None or (candidate[0], len(candidate[1])) < (existing[0], len(existing[1])):
                plans[next_covered] = candidate
    return plans[target][1][0]


def project_review(game, team):
    if game["phase"] != "scoring":
        return None
    review = game["scoring"]["sides"][team]
    return {
        **copy.deepcopy(review), "options": options(game, team),
        "score": score_side(game, game["sides"][team], game["scoring"]["wentOut"] == team),
        "confirmedSides": [side["team"] for side in game["scoring"]["sides"] if side["confirmed"]],
        "reason": game["scoring"]["reason"],
    }

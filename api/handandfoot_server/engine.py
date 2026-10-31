"""Pure authoritative transitions. No persistence, networking, or account imports."""
import copy
import random
import uuid
from .rules import FAMILY, RANKS, make_deck, meld_details, opening_for, rules_snapshot, draw_count, validate_setup, validate_target_score
from .achievement_events import record_foot_pickup


def uid():
    return uuid.uuid4().hex


def new_game(players, scoring_mode, *, seed=None, target_score=FAMILY.target_score):
    validate_setup(scoring_mode, len(players), "practice")
    validate_target_score(target_score)
    rng = random.Random(seed)
    side_count = len(players) // 2 if scoring_mode == "partnership" else len(players)
    game = {
        "ruleset": rules_snapshot(), "scoringMode": scoring_mode, "targetScore": target_score, "matchId": uid(), "shuffleSeed": rng.getrandbits(128),
        "players": [dict(player, team=index % side_count) for index, player in enumerate(players)],
        "sides": [{"id": i, "score": 0, "opened": False, "melds": []} for i in range(side_count)],
        "round": 0, "dealer": rng.randrange(len(players)), "history": [], "winners": [],
        "phase": "choose", "token": uid(), "actor": 0, "message": "Choose your starting pile.",
        "firstFootPlayerId": None,
    }
    return deal_round(game, rng=rng)


def deal_round(game, *, rng=None):
    rng = rng or random.Random(game["shuffleSeed"] + game["round"] + 1)
    game["round"] += 1
    game["cards"] = make_deck(len(game["players"]))
    stock = list(game["cards"])
    rng.shuffle(stock)
    game.update(stock=stock, discard=[], discardFaceDown=False, tableEvents=[], turnPresentation=None, replaced=[], phase="choose", token=uid(), dealId=uid(), ready=[], openingReady=[], openingComplete=False, pickupDrawPending=False,
                actor=(game["dealer"] + 1) % len(game["players"]), message="Choose the pile you’d like to play first.")
    for side in game["sides"]:
        side.update(opened=False, melds=[])
    for player in game["players"]:
        player.update(hand=[], foot=[], piles=[[], []], chosen=False, inFoot=False, redThrees=[])
    for pile in range(2):
        for _ in range(FAMILY.cards_per_pile):
            for player in game["players"]:
                player["piles"][pile].append(stock.pop())
    # Return special starter cards to the bottom, preserving every physical card.
    while True:
        candidate = stock.pop()
        card = game["cards"][candidate]
        if not card["wild"] and card["rank"] != "3":
            game["discard"] = [candidate]
            break
        stock.insert(0, candidate)
    return game


def side_for(game, player):
    return game["sides"][player["team"]]


def can_go_out(game, player):
    melds = side_for(game, player)["melds"]
    return player["inFoot"] and any(m["kind"] == "set" and m["complete"] and not m["dirty"] for m in melds) and any(m["kind"] == "set" and m["complete"] and m["dirty"] for m in melds)


def enter_foot(game, player):
    if not player["hand"] and not player["inFoot"]:
        player.update(hand=player["foot"], foot=[], inFoot=True)
        table_event(game, player, "foot", count=len(player["hand"]))
        record_foot_pickup(game, player)
        game["message"] = f'{player["name"]} picked up their foot.'


def table_event(game, player, kind, *, count=1, card_id=None, face_down=False):
    """Public motion cues: stock draws never disclose private card identities."""
    event = {"id": uid(), "playerId": player["id"], "kind": kind, "count": count,
             "faceDown": face_down, "card": copy.deepcopy(game["cards"][card_id]) if card_id and not face_down else None}
    game["tableEvents"] = [*game.get("tableEvents", []), event][-32:]


def apply_melds(game, player, groups, *, pickup_id=None):
    if not isinstance(groups, list) or not groups or len(groups) > 30:
        raise ValueError("Choose cards and stage at least one pile.")
    side = side_for(game, player)
    available = set(player["hand"])
    if pickup_id:
        available.add(pickup_id)
    used = set()
    total = 0
    pickup_played = False
    for group in groups:
        if not isinstance(group, dict) or not isinstance(group.get("cardIds"), list) or not group["cardIds"]:
            raise ValueError("Every staged pile needs cards.")
        ids = group["cardIds"]
        if any(not isinstance(card_id, str) for card_id in ids):
            raise ValueError("Select physical cards from your hand.")
        if len(set(ids)) != len(ids) or used.intersection(ids) or not set(ids).issubset(available):
            raise ValueError("A card can only be played once, from your own hand.")
        if group.get("redThree"):
            if group["redThree"] is not True or any(not game["cards"][card_id]["redThree"] for card_id in ids):
                raise ValueError("Select red threes from your hand.")
            if pickup_id:
                raise ValueError("Draw your second card before laying down red threes.")
            if not side["opened"]:
                raise ValueError("Complete your opening meld before laying down red threes.")
            player["redThrees"].extend(ids)
            used.update(ids)
            continue
        target_id = group.get("meldId")
        target = next((m for m in side["melds"] if m["id"] == target_id), None) if target_id else None
        if target_id and not target:
            raise ValueError("That pile does not belong to your scoring side.")
        if pickup_id in ids:
            if target and len(target["cardIds"]) == 6:
                raise ValueError("The seventh card must be played from your hand, not picked up from the discard.")
            pickup_played = True
        kind = target["kind"] if target else group.get("kind", "set")
        all_ids = [*target["cardIds"], *ids] if target else ids[:]
        details = meld_details([game["cards"][i] for i in all_ids], kind, existing=target)
        if kind == "run":
            all_ids.sort(key=lambda i: RANKS.index(game["cards"][i]["rank"]))
        if target:
            target.update(cardIds=all_ids, **details)
        else:
            side["melds"].append({"id": uid(), "creator": player["id"], "kind": kind, "cardIds": all_ids, **details})
        used.update(ids)
        total += sum(game["cards"][i]["value"] for i in ids)
    if pickup_id and not pickup_played:
        raise ValueError("Play the top discard immediately in the same move.")
    if not side["opened"] and total < opening_for(side["score"]):
        raise ValueError(f'Your opening must total at least {opening_for(side["score"])} points. This draft has {total}.')
    side["opened"] = True
    player["hand"] = [i for i in player["hand"] if i not in used]
    remaining = len(player["hand"]) + (FAMILY.discard_followup_draw if pickup_id else 0)
    if not remaining and player["inFoot"]:
        raise ValueError("Keep a final card to discard, even when going out.")
    if player["inFoot"] and remaining == 1 and not can_go_out(game, player):
        raise ValueError("Keep two cards until you have both a clean and a dirty book; your turn still needs a discard.")
    # A discard pickup still owes a stack card, even when its meld empties the hand.
    if not pickup_id:
        enter_foot(game, player)
    game["message"] = f'{player["name"]} played {len(used)} cards.'


def apply(game, seat, command):
    """Return a new state only after the entire command has passed validation."""
    result = copy.deepcopy(game)
    arrange_book_covers(result)
    _apply(result, seat, command)
    arrange_book_covers(result)
    if command.get("type") != "turn_ready":
        result["token"] = uid()
    assert_conservation(result)
    return result


def arrange_book_covers(game):
    """Use equivalent physical cards for red clean and black dirty book covers.

    Only stock and public matching piles can donate a card. Private cards,
    discards, and straight-flush suits are never changed.
    """
    if game["phase"] not in ("play", "draw"):
        return
    cards = game["cards"]
    sets = [meld for side in game["sides"] for meld in side["melds"] if meld["kind"] == "set"]
    red_suits = {"hearts", "diamonds"}
    for book in (meld for meld in sets if meld["complete"]):
        def matches(card_id):
            card = cards[card_id]
            return card["rank"] == book["rank"] and (card["suit"] in red_suits) == (not book["dirty"])
        cover = next((card_id for card_id in reversed(book["cardIds"]) if matches(card_id)), None)
        if cover is None:
            replacement = next((card_id for card_id in book["cardIds"] if cards[card_id]["rank"] == book["rank"]), None)
            donors = [(game["stock"], None)]
            for meld in sets:
                if meld is book:
                    continue
                protected = next((card_id for card_id in reversed(meld["cardIds"])
                                  if cards[card_id]["rank"] == meld["rank"] and
                                  (cards[card_id]["suit"] in red_suits) == (not meld["dirty"])), None) if meld["complete"] else None
                donors.append((meld["cardIds"], protected))
            for donor, protected in donors:
                cover = next((card_id for card_id in donor if card_id != protected and matches(card_id)), None)
                if cover is not None and replacement is not None:
                    donor[donor.index(cover)] = replacement
                    book["cardIds"][book["cardIds"].index(replacement)] = cover
                    break
        if cover in book["cardIds"]:
            book["cardIds"].remove(cover)
            book["cardIds"].append(cover)


def opening_pending(game):
    """A round cannot draw until present humans finish its opening presentation."""
    return "openingReady" in game and not game.get("openingComplete", False) and any(
        not p["bot"] and not p.get("away") and p["id"] not in game["openingReady"] for p in game["players"]
    )


def turn_pending(game):
    presentation = game.get("turnPresentation")
    return bool(presentation and game["phase"] == "draw" and any(
        not p["bot"] and not p.get("away") and p["id"] not in presentation["ready"] for p in game["players"]
    ))


def _apply(game, seat, command):
    if type(seat) is not int or not 0 <= seat < len(game["players"]):
        raise ValueError("This seat does not exist.")
    player = game["players"][seat]
    action = command.get("type")
    if action == "turn_ready":
        presentation = game.get("turnPresentation")
        if game["phase"] != "draw" or not presentation or command.get("presentationId") != presentation["id"]:
            raise ValueError("Wait for the current turn transition.")
        if player["id"] not in presentation["ready"]:
            presentation["ready"].append(player["id"])
        return
    if action == "opening_ready":
        if game["phase"] != "draw" or not all(p["chosen"] for p in game["players"]):
            raise ValueError("Choose your hand and wait for the table first.")
        if player["id"] not in game.setdefault("openingReady", []):
            game["openingReady"].append(player["id"])
        if not opening_pending(game):
            game["openingComplete"] = True
        return
    if game["phase"] == "scoring":
        from . import scoring
        team = player["team"]
        if action == "score_pay":
            scoring.pay(game, team, command.get("pileId"))
        elif action == "score_confirm":
            scoring.confirm(game, team)
        elif action == "score_auto":
            while scoring.options(game, team):
                scoring.pay(game, team, scoring.auto_choice(game, team))
        else:
            raise ValueError("Review and settle your side’s score before the next round.")
        return
    if game["phase"] == "choose":
        if action != "choose" or player["chosen"]:
            raise ValueError("Choose your starting pile first, then wait for the table.")
        pile = command.get("pile")
        if type(pile) is not int or pile not in (0, 1):
            raise ValueError("Choose pile one or pile two.")
        player.update(hand=player["piles"][pile], foot=player["piles"][1 - pile], piles=[], chosen=True)
        game["message"] = f'{player["name"]} chose their hand.'
        if all(p["chosen"] for p in game["players"]):
            game.update(phase="draw", message=f'{game["players"][game["actor"]]["name"]} leads. Draw from the stack or play the top discard.')
        return
    if action == "next_round" and game["phase"] == "round_over":
        if player["id"] not in game["ready"]:
            game["ready"].append(player["id"])
        if all(p["bot"] or p["id"] in game["ready"] for p in game["players"]):
            game["dealer"] = (game["dealer"] + 1) % len(game["players"])
            deal_round(game)
        return
    if game["phase"] not in ("draw", "play") or game["actor"] != seat:
        raise ValueError("Wait for your turn.")
    if game["phase"] == "draw" and opening_pending(game):
        raise ValueError("Wait for the table to finish the opening.")
    if game["phase"] == "draw" and turn_pending(game):
        raise ValueError("Wait for the table to finish the turn transition.")
    if game.get("pickupDrawPending") and action != "draw":
        raise ValueError("Draw your second card from the deck before playing or discarding.")
    if action == "draw":
        if game["phase"] != "draw":
            raise ValueError("You already drew this turn.")
        game["turnPresentation"] = None
        game["openingComplete"] = True
        followup = game.get("pickupDrawPending", False)
        count = FAMILY.discard_followup_draw if followup else draw_count(game["sides"], player["team"])
        if len(game["stock"]) < count:
            finish_round(game, None, "The stack ran out.")
            return
        player["hand"].extend(game["stock"].pop() for _ in range(count))
        table_event(game, player, "draw", count=count)
        game.update(phase="play", pickupDrawPending=False, message=(f'{player["name"]} drew their second card.' if followup else f'{player["name"]} drew {count} cards.' + (' Catch-up card included!' if count == 3 else '')))
        return
    if action == "pickup":
        if game["phase"] != "draw" or not game["discard"]:
            raise ValueError("Choose the discard instead of drawing from the stack.")
        game["turnPresentation"] = None
        top_id = game["discard"][-1]
        top = game["cards"][top_id]
        if top["rank"] == "3":
            raise ValueError("Threes cannot be picked up from the discard.")
        apply_melds(game, player, command.get("groups"), pickup_id=top_id)
        game["discard"].pop()
        table_event(game, player, "pickup", card_id=top_id)
        game.update(phase="draw", pickupDrawPending=True, openingComplete=True,
                    message=f'{player["name"]} played the top discard. Draw one card from the deck before discarding.')
        return
    if action == "red_three":
        # Replacement is allowed before opening; exposure requires an opened side.
        card_ids = command.get("cardIds", [command.get("cardId")])
        if (not isinstance(card_ids, list) or not card_ids
                or any(not isinstance(card_id, str) for card_id in card_ids)
                or len(set(card_ids)) != len(card_ids)
                or any(card_id not in player["hand"] or not game["cards"][card_id]["redThree"] for card_id in card_ids)):
            raise ValueError("Select red threes from your hand, using each card only once.")
        if game["phase"] != "play":
            raise ValueError("Draw before replacing or laying down a red three.")
        expose = command.get("expose")
        if type(expose) is not bool:
            raise ValueError("Choose whether to keep the red three or replace it.")
        if expose and not side_for(game, player)["opened"]:
            raise ValueError("Your side must complete its opening meld before laying down red threes.")
        if not expose and len(game["stock"]) < len(card_ids):
            finish_round(game, None, "The stack ran out while replacing red threes.")
            return
        for card_id in card_ids:
            player["hand"].remove(card_id)
            if expose:
                player["redThrees"].append(card_id)
            else:
                game["discard"].append(card_id)
                game["discardFaceDown"] = False
                table_event(game, player, "replace", card_id=card_id)
                player["hand"].append(game["stock"].pop())
        if not player["hand"] and player["inFoot"]:
            raise ValueError("Keep a final card to discard.")
        if player["inFoot"] and len(player["hand"]) == 1 and not can_go_out(game, player):
            raise ValueError("Keep two cards until you have both book types. Replace this red three instead.")
        enter_foot(game, player)
        count = len(card_ids)
        if not expose:
            table_event(game, player, "draw", count=count)
        game["message"] = f'{player["name"]} {"laid down" if expose else "replaced"} {"a red three" if count == 1 else f"{count} red threes"}.'
        return
    if game["phase"] != "play":
        raise ValueError("Draw two cards, or pick up and immediately play the top discard.")
    if action == "meld":
        apply_melds(game, player, command.get("groups"))
        return
    if action == "discard":
        card_id = command.get("cardId")
        if card_id not in player["hand"]:
            raise ValueError("Select exactly one card from your hand to discard.")
        if game["cards"][card_id]["redThree"]:
            raise ValueError("You may not discard red threes. Replace them or lay them down after opening.")
        if len(player["hand"]) == 1 and player["inFoot"] and not can_go_out(game, player):
            raise ValueError("Going out needs at least one clean and one dirty book.")
        player["hand"].remove(card_id)
        game["discard"].append(card_id)
        game["discardFaceDown"] = not player["hand"] and player["inFoot"]
        table_event(game, player, "discard", card_id=card_id, face_down=game["discardFaceDown"])
        if not player["hand"] and player["inFoot"]:
            finish_round(game, player["team"], f'{player["name"]} went out first.')
            return
        # Discarding out of the hand ends the turn, then reveals the foot.
        enter_foot(game, player)
        game["actor"] = (game["actor"] + 1) % len(game["players"])
        game["turnPresentation"] = {"id": game["tableEvents"][-1]["id"], "ready": []}
        game.update(phase="draw", pickupDrawPending=False, message=f'{game["players"][game["actor"]]["name"]}’s turn. Draw from the stack or play the top discard.')
        return
    raise ValueError("Unknown game action.")


def finish_round(game, went_out, reason):
    from .scoring import prepare
    game["pickupDrawPending"] = False
    prepare(game, went_out, reason)


def remove_side(game, team):
    """Retire a conceding side without moving its cards into anyone else's hand."""
    roster = game["players"]
    removed = [p for p in roster if p["team"] == team]
    remaining = [p for p in roster if p["team"] != team]
    actor = next(roster[(game["actor"] + offset) % len(roster)] for offset in range(len(roster))
                 if roster[(game["actor"] + offset) % len(roster)] in remaining)
    dealer = next(roster[(game["dealer"] - offset) % len(roster)] for offset in range(len(roster))
                  if roster[(game["dealer"] - offset) % len(roster)] in remaining)
    for player in removed:
        for zone in [player["hand"], player["foot"], player["redThrees"], *player["piles"]]:
            game["replaced"].extend(zone)
        game.get("playerAchievements", {}).pop(player["id"], None)
    for meld in game["sides"][team]["melds"]:
        game["replaced"].extend(meld["cardIds"])
    mapping = {side["id"]: index for index, side in enumerate(s for s in game["sides"] if s["id"] != team)}
    game["sides"] = [s for s in game["sides"] if s["id"] != team]
    for side in game["sides"]:
        side["id"] = mapping[side["id"]]
    for player in remaining:
        player["team"] = mapping[player["team"]]
    if roster[game["actor"]] in removed and game["phase"] in ("draw", "play"):
        game.update(phase="draw", pickupDrawPending=False, turnPresentation=None)
    game.update(players=remaining, actor=remaining.index(actor), dealer=remaining.index(dealer), token=uid())
    for record in game["history"]:
        for field in ("scores", "achievementData"):
            if field in record:
                record[field] = [item for item in record[field] if item["team"] in mapping]
                for item in record[field]:
                    item["team"] = mapping[item["team"]]
    review = game.get("scoring")
    if review:
        review["wentOut"] = mapping.get(review["wentOut"])
        review["sides"] = [s for s in review["sides"] if s["team"] in mapping]
        for side in review["sides"]:
            old_team = side["team"]
            side["team"] = mapping[old_team]
            side["usedPiles"] = [f'reds:{side["team"]}' if pile == f"reds:{old_team}" else pile for pile in side["usedPiles"]]
    if len(game["sides"]) == 1:
        # A forfeited match is available for review, but is not a completed score.
        game.update(phase="finished", winners=[0], endedByConcession=True, message="The other teams conceded.")
    elif game["phase"] == "choose" and all(p["chosen"] for p in remaining):
        game["phase"] = "draw"
    elif game["phase"] == "scoring" and all(s["confirmed"] for s in review["sides"]):
        from .scoring import complete
        complete(game)
    if game["phase"] in ("draw", "play"):
        game["message"] = f'{actor["name"]}’s turn.'
    assert_conservation(game)


def assert_conservation(game):
    zones = [*game["stock"], *game["discard"], *game["replaced"]]
    for player in game["players"]:
        zones.extend(player["hand"])
        zones.extend(player["foot"])
        zones.extend(player["redThrees"])
        for pile in player["piles"]:
            zones.extend(pile)
    for side in game["sides"]:
        for meld in side["melds"]:
            zones.extend(meld["cardIds"])
    if len(zones) != len(game["cards"]) or set(zones) != set(game["cards"]):
        raise AssertionError("Every physical card must belong to exactly one zone.")


def project(game, viewer_id):
    """Keep hands private during play and reveal all remaining cards at round end."""
    # Older saved tables receive the same cover arrangement as their next move.
    if game["phase"] in ("play", "draw"):
        game = copy.deepcopy(game)
        arrange_book_covers(game)
    viewer = next(p for p in game["players"] if p["id"] == viewer_id)
    from .scoring import project_review
    cards = game["cards"]
    round_review = game["phase"] in ("round_over", "finished")
    scoring_players = [p for p in game["players"] if p["team"] == viewer["team"]] if game["phase"] == "scoring" else []
    players = [{
        "id": p["id"], "name": p["name"], "team": p["team"], "bot": p["bot"], "profileIcon": p.get("profileIcon", "user"),
        "chosen": p["chosen"], "inFoot": p["inFoot"],
        "handCount": len(p["hand"]) + (len(p["foot"]) if round_review else 0) if p["chosen"] else 11,
        "footCount": 0 if round_review else len(p["foot"]) if p["chosen"] else 11,
        "footTop": cards[p["foot"][0]] if not round_review and p["chosen"] and p["foot"] else None,
        **({"roundCards": [cards[i] for i in [*p["hand"], *p["foot"]]]} if round_review else {}),
        "redThrees": [cards[i] for i in p["redThrees"]],
        "ready": p["id"] in game["ready"], "away": p.get("away", False),
    } for p in game["players"]]
    sides = []
    for side in game["sides"]:
        melds = [{key: value for key, value in meld.items() if key != "cardIds"} | {"cards": [cards[i] for i in meld["cardIds"]]} for meld in side["melds"]]
        if game["phase"] == "scoring" and game.get("scoring"):
            review = game["scoring"]["sides"][side["id"]]
            for meld in melds:
                meld["bonusLost"] = meld["id"] in review["broken"]
                meld["spentCardIds"] = [card["id"] for card in meld["cards"] if card["id"] in review["canceled"]]
        names = [p["name"] for p in game["players"] if p["team"] == side["id"]]
        sides.append({"id": side["id"], "name": " & ".join(names), "score": side["score"], "opened": side["opened"],
                      "melds": melds, "opening": opening_for(side["score"]),
                      "clean": sum(m["kind"] == "set" and m["complete"] and not m["dirty"] for m in melds),
                      "dirty": sum(m["kind"] == "set" and m["complete"] and m["dirty"] for m in melds)})
    return {
        "players": players, "sides": sides, "decks": len(cards) // 54, "ruleset": FAMILY.id,
        "drawCount": FAMILY.discard_followup_draw if game.get("pickupDrawPending") else draw_count(game["sides"], viewer["team"]),
        "pickupDrawPending": bool(game.get("pickupDrawPending")),
        "round": game["round"], "targetScore": game["targetScore"], "phase": game["phase"], "token": (f'{game["dealId"]}:choose:{viewer_id}' if game["phase"] == "choose" else f'{game["dealId"]}:opening' if game["phase"] == "draw" and opening_pending(game) else f'{game["dealId"]}:turn:{game["turnPresentation"]["id"]}' if turn_pending(game) else f'{game["dealId"]}:ready' if game["phase"] in ("round_over", "finished") else f'{game["dealId"]}:scoring:{viewer["team"]}:{game["scoring"]["sides"][viewer["team"]]["revision"]}' if game["phase"] == "scoring" else game["token"]),
        "opening": {"id": game["dealId"], "ready": game.get("openingReady", []), "complete": not opening_pending(game)} if "openingReady" in game else None,
        "turnPresentation": {**copy.deepcopy(game["turnPresentation"]), "complete": not turn_pending(game)} if game.get("turnPresentation") else None,
        "actorId": game["players"][game["actor"]]["id"],
        "dealerId": game["players"][game["dealer"]]["id"], "message": game["message"],
        "hand": [cards[i] for i in [*viewer["hand"], *(viewer["foot"] if round_review else [])]],
        "footPreview": [[cards[pile[0]], cards[pile[-1]]] for pile in viewer["piles"]] if not viewer["chosen"] else None,
        "footTop": cards[viewer["foot"][0]] if not round_review and viewer["foot"] else None,
        # Settlement animates the side's combined debt after play has ended.
        "scoringHand": [cards[i] for p in scoring_players for i in p["hand"]] if scoring_players else None,
        "scoringFoot": [cards[i] for p in scoring_players for i in p["foot"]] if scoring_players else None,
        "discard": cards[game["discard"][-1]] if game["discard"] and not game.get("discardFaceDown") else None,
        "discardFaceDown": bool(game.get("discardFaceDown")),
        "tableEvents": copy.deepcopy(game.get("tableEvents", [])),
        "discardCount": len(game["discard"]), "stockCount": len(game["stock"]),
        "history": copy.deepcopy(game["history"]), "winners": game["winners"][:],
        "scoring": project_review(game, viewer["team"]),
    }

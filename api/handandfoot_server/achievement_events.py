"""Pure achievement evidence captured from authoritative game transitions."""

GAMEPLAY_ACHIEVEMENTS = {"sole_survivor", "a_leg_up", "caught_red_handed"}


def unlock(game, player, achievement_id):
    earned = game.setdefault("playerAchievements", {}).setdefault(player["id"], [])
    if achievement_id not in earned:
        earned.append(achievement_id)


def record_foot_pickup(game, player):
    # Older games cannot establish who picked up the very first foot.
    if "firstFootPlayerId" in game and game["firstFootPlayerId"] is None:
        game["firstFootPlayerId"] = player["id"]
        unlock(game, player, "a_leg_up")


def record_round_end(game):
    foot_teams = {player["team"] for player in game["players"] if player["inFoot"]}
    for player in game["players"]:
        if len(foot_teams) == 1 and player["team"] in foot_teams:
            unlock(game, player, "sole_survivor")
        if any(game["cards"][card_id]["redThree"] for card_id in [*player["hand"], *player["foot"]]):
            unlock(game, player, "caught_red_handed")

"""Repeatable complete-match rehearsal using redacted bot views."""
import argparse
from . import bots, engine, scoring
from .rules import MIN_PLAYERS, MAX_PLAYERS


def simulate(count=6, mode="partnership", seed=1, *, verbose=False, difficulties=None):
    difficulties = difficulties or [bots.DEFAULT_DIFFICULTY]
    if len(difficulties) not in (1, count):
        raise ValueError("Choose one difficulty for the table or one per seat.")
    for difficulty in difficulties:
        bots.validate_difficulty(difficulty)
    players = [{"id": str(i), "name": f"Bot {i + 1}", "bot": True} for i in range(count)]
    game = engine.new_game(players, mode, seed=seed)
    for step in range(50000):
        if game["phase"] == "finished":
            return game, step
        if game["phase"] == "round_over":
            if verbose:
                print(f'Round {game["round"]}: {[side["score"] for side in game["sides"]]}', flush=True)
            game = engine.apply(game, 0, {"type": "next_round"})
            continue
        if game["phase"] == "scoring":
            team = next(side["team"] for side in game["scoring"]["sides"] if not side["confirmed"])
            seat = next(i for i,p in enumerate(game["players"]) if p["team"] == team)
            pile = scoring.auto_choice(game, team)
            move = {"type": "score_pay", "pileId": pile} if pile else {"type": "score_confirm"}
        else:
            seat = next(i for i,p in enumerate(game["players"]) if not p["chosen"]) if game["phase"] == "choose" else game["actor"]
            view = engine.project(game, str(seat)) | {"viewerId": str(seat)}
            move = bots.decide(view, difficulties[seat % len(difficulties)])
        game = engine.apply(game, seat, move)
    raise AssertionError("Match did not finish within 50,000 moves.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--players", type=int, choices=range(MIN_PLAYERS, MAX_PLAYERS + 1), default=MAX_PLAYERS)
    parser.add_argument("--mode", choices=["individual", "partnership"], default="partnership")
    parser.add_argument("--seed", type=int, default=1)
    parser.add_argument("--difficulties", nargs="+", choices=bots.DIFFICULTIES, default=[bots.DEFAULT_DIFFICULTY],
                        help="One profile for the table, or one per seat in seating order.")
    args = parser.parse_args()
    game, steps = simulate(args.players, args.mode, args.seed, verbose=True, difficulties=args.difficulties)
    print(f'Finished: {game["round"]} rounds, {steps} accepted moves, scores {[side["score"] for side in game["sides"]]}, winners {game["winners"]}.')

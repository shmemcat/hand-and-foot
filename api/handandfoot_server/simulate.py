"""Repeatable complete-match rehearsal using redacted bot views."""
import argparse
from . import bots, engine, scoring


def simulate(count=8, mode="partnership", seed=1, target=10000, *, verbose=False):
    players = [{"id": str(i), "name": f"Bot {i + 1}", "bot": True} for i in range(count)]
    game = engine.new_game(players, mode, seed=seed, target_score=target)
    last_round = 0
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
            move = bots.decide(view)
        game = engine.apply(game, seat, move)
    raise AssertionError("Match did not finish within 50,000 moves.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--players", type=int, default=8)
    parser.add_argument("--mode", choices=["individual", "partnership"], default="partnership")
    parser.add_argument("--seed", type=int, default=1)
    args = parser.parse_args()
    game, steps = simulate(args.players, args.mode, args.seed, verbose=True)
    print(f'Finished: {game["round"]} rounds, {steps} accepted moves, scores {[side["score"] for side in game["sides"]]}, winners {game["winners"]}.')

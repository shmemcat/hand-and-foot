"""Keep disposable test databases inside this checkout."""
from pathlib import Path
import uuid


def pytest_configure(config):
    if not config.option.basetemp:
        root = Path(__file__).resolve().parents[1]
        target = (root / ".local" / "pytest" / uuid.uuid4().hex).resolve()
        assert target.is_relative_to(root)
        target.parent.mkdir(parents=True, exist_ok=True)
        config.option.basetemp = str(target)

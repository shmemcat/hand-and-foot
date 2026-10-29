"""Explicit schema setup; production runtime credentials never perform DDL."""
from sqlalchemy import inspect, text
from sqlalchemy.exc import SQLAlchemyError
from .models import db

REVISION = "handandfoot_001"
VERSION_TABLE = "handandfoot_schema_version"


def upgrade_schema():
    with db.engine.begin() as connection:
        connection.execute(text(f"CREATE TABLE IF NOT EXISTS {VERSION_TABLE} (version_num VARCHAR(32) PRIMARY KEY)"))
        current = connection.execute(text(f"SELECT version_num FROM {VERSION_TABLE}")).scalar()
        if current not in (None, REVISION):
            raise RuntimeError("An explicit Hand & Foot schema migration is required.")
    db.create_all()
    if current is None:
        with db.engine.begin() as connection:
            connection.execute(text(f"INSERT INTO {VERSION_TABLE} VALUES (:revision)"), {"revision": REVISION})


def schema_ready():
    try:
        inspector = inspect(db.engine)
        tables = set(inspector.get_table_names())
        if not {VERSION_TABLE, *db.metadata.tables} <= tables:
            return False
        for table in db.metadata.sorted_tables:
            if not set(table.columns.keys()) <= {column["name"] for column in inspector.get_columns(table.name)}:
                return False
        return db.session.execute(text(f"SELECT version_num FROM {VERSION_TABLE}")).scalar() == REVISION
    except SQLAlchemyError:
        db.session.rollback()
        return False


if __name__ == "__main__":
    import sys
    from .application import create_app
    app = create_app({"START_WORKER": False, "AUTO_CREATE_SCHEMA": False})
    with app.app_context():
        if sys.argv[1:] == ["upgrade"]:
            upgrade_schema()
        elif sys.argv[1:] == ["check"]:
            raise SystemExit(0 if schema_ready() else 1)
        else:
            raise SystemExit("Use upgrade or check")

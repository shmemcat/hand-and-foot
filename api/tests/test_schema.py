from sqlalchemy import inspect, text
from handandfoot_server.application import create_app
from handandfoot_server.models import db
from handandfoot_server.schema import REVISION, schema_ready, upgrade_schema


def test_production_startup_and_readiness_never_create_tables(tmp_path):
    app = create_app({"TESTING": True, "START_WORKER": False, "AUTO_CREATE_SCHEMA": False,
                      "SECRET_KEY": "schema-test-" * 4, "SQLALCHEMY_DATABASE_URI": f"sqlite:///{tmp_path / 'schema.sqlite'}"})
    http = app.test_client()
    assert http.get("/health").json["component"] == "handandfoot-game"
    assert http.get("/ready").status_code == 503
    with app.app_context():
        assert inspect(db.engine).get_table_names() == []
        upgrade_schema()
        upgrade_schema()
        assert schema_ready()
        assert http.get("/ready").json["schemaRevision"] == REVISION
        db.session.execute(text("UPDATE handandfoot_schema_version SET version_num='future'"))
        db.session.commit()
        assert not schema_ready()
        assert http.get("/ready").status_code == 503


def test_production_account_mode_requires_the_private_account_configuration(tmp_path):
    app = create_app({"TESTING": True, "START_WORKER": False, "REQUIRE_ACCOUNTS": True,
                      "SECRET_KEY": "schema-test-" * 4, "SQLALCHEMY_DATABASE_URI": f"sqlite:///{tmp_path / 'accounts.sqlite'}"})
    assert app.test_client().get("/ready").status_code == 503


def test_postgresql_urls_select_the_installed_driver_without_connecting():
    app = create_app({"TESTING": True, "START_WORKER": False, "AUTO_CREATE_SCHEMA": False,
                      "SECRET_KEY": "schema-test-" * 4, "SQLALCHEMY_DATABASE_URI": "postgresql://example:synthetic@127.0.0.1/disposable"})
    with app.app_context():
        assert db.engine.driver == "psycopg2"

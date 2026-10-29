from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()


class Room(db.Model):
    __tablename__ = "handandfoot_rooms_v1"
    code = db.Column(db.String(6), primary_key=True)
    payload = db.Column(db.JSON, nullable=False)
    updated_at = db.Column(db.Float, nullable=False)


class Receipt(db.Model):
    __tablename__ = "handandfoot_receipts_v1"
    code = db.Column(db.String(6), primary_key=True)
    action_id = db.Column(db.String(64), primary_key=True)
    principal = db.Column(db.String(64), nullable=False)
    fingerprint = db.Column(db.String(64), nullable=False)
    revision = db.Column(db.Integer, nullable=False)


class MatchResult(db.Model):
    __tablename__ = "handandfoot_results_v1"
    id = db.Column(db.String(32), primary_key=True)
    payload = db.Column(db.JSON, nullable=False)
    completed_at = db.Column(db.Float, nullable=False)


class DeletedAccount(db.Model):
    __tablename__ = "handandfoot_deleted_accounts_v1"
    user_id = db.Column(db.BigInteger, primary_key=True)
    request_id = db.Column(db.String(32), nullable=False)


class AchievementUnlock(db.Model):
    __tablename__ = "handandfoot_achievement_unlocks_v1"
    user_id = db.Column(db.BigInteger, primary_key=True)
    achievement_id = db.Column(db.String(64), primary_key=True)

\set ON_ERROR_STOP on
GRANT USAGE ON SCHEMA public TO handandfoot_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON handandfoot_rooms_v1, handandfoot_receipts_v1, handandfoot_results_v1, handandfoot_deleted_accounts_v1, handandfoot_achievement_unlocks_v1 TO handandfoot_runtime;
GRANT SELECT ON handandfoot_schema_version TO handandfoot_runtime;

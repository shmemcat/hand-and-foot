CREATE ROLE handandfoot_runtime LOGIN PASSWORD 'split-handandfoot-local' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
GRANT USAGE ON SCHEMA public TO handandfoot_runtime;

-- Runs once when the Postgres container first initialises its data volume.
-- Integration tests truncate every table between cases, so they need a database of
-- their own rather than sharing the development one.
CREATE DATABASE cognate_bridge_test;

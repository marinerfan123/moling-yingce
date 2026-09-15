\getenv api_password POSTGRES_API_PASSWORD
\if :{?api_password}
\else
\echo 'POSTGRES_API_PASSWORD is required'
\quit 1
\endif

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'comic_migrator') THEN CREATE ROLE comic_migrator LOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'comic_security_owner') THEN CREATE ROLE comic_security_owner NOLOGIN NOINHERIT BYPASSRLS; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'comic_operations') THEN CREATE ROLE comic_operations NOLOGIN NOINHERIT NOBYPASSRLS; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'comic_api') THEN CREATE ROLE comic_api LOGIN NOINHERIT NOBYPASSRLS; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'comic_collab') THEN CREATE ROLE comic_collab LOGIN NOINHERIT NOBYPASSRLS; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'comic_dispatcher') THEN CREATE ROLE comic_dispatcher LOGIN NOINHERIT NOBYPASSRLS; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'comic_generation_worker') THEN CREATE ROLE comic_generation_worker LOGIN NOINHERIT NOBYPASSRLS; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'comic_media_worker') THEN CREATE ROLE comic_media_worker LOGIN NOINHERIT NOBYPASSRLS; END IF;
END
$$;

ALTER ROLE comic_api PASSWORD :'api_password';

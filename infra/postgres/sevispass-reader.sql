DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='sevispass_reader') THEN
    CREATE ROLE sevispass_reader LOGIN;
  END IF;
  IF EXISTS (SELECT FROM pg_roles WHERE rolname='sevispass_reader'
             AND (rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls)) THEN
    RAISE EXCEPTION 'Reader role has elevated attributes and requires administrator review';
  END IF;
  IF EXISTS (SELECT FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.member WHERE r.rolname='sevispass_reader') THEN
    RAISE EXCEPTION 'Reader role memberships require administrator review';
  END IF;
END $$;
-- statement
ALTER ROLE sevispass_reader WITH LOGIN NOINHERIT CONNECTION LIMIT 5;
-- statement
ALTER ROLE sevispass_reader SET default_transaction_read_only = on;
-- statement
ALTER ROLE sevispass_reader SET statement_timeout = '15s';
-- statement
ALTER ROLE sevispass_reader SET search_path = sevispass, pg_catalog;
-- statement
CREATE SCHEMA IF NOT EXISTS sevispass;
-- statement
REVOKE ALL ON SCHEMA sevispass FROM PUBLIC, sevispass_reader;
-- statement
DROP VIEW IF EXISTS sevispass.employees;
-- statement
CREATE VIEW sevispass.employees WITH (security_barrier=true) AS
SELECT e.number AS employee_number,
       e.payload::jsonb->>'first' AS first_name,
       e.payload::jsonb->>'last' AS last_name,
       e.payload::jsonb->>'gender' AS gender,
       NULLIF(e.payload::jsonb->>'dob', '') AS date_of_birth,
       e.payload::jsonb->>'position' AS position,
       o.payload::jsonb->>'name' AS department_name
FROM public.employees e
JOIN public.registry r ON r.id='excel-config' AND e.dataset=r.payload::jsonb->>'dataset'
LEFT JOIN public.organisations o ON o.dataset=e.dataset AND o.key=e.agency;
-- statement
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM sevispass_reader;
-- statement
REVOKE ALL ON ALL TABLES IN SCHEMA sevispass FROM PUBLIC, sevispass_reader;
-- statement
REVOKE ALL ON SCHEMA public FROM sevispass_reader;
-- statement
GRANT CONNECT ON DATABASE registry TO sevispass_reader;
-- statement
GRANT USAGE ON SCHEMA sevispass TO sevispass_reader;
-- statement
GRANT SELECT ON sevispass.employees TO sevispass_reader;

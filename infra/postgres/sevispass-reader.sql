DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='sevispass_reader') THEN
    CREATE ROLE sevispass_reader LOGIN;
  END IF;
  IF EXISTS (SELECT FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.member WHERE r.rolname='sevispass_reader') THEN
    RAISE EXCEPTION 'Reader role memberships require administrator review';
  END IF;
END $$;
-- statement
ALTER ROLE sevispass_reader WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 5;
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
CREATE OR REPLACE VIEW sevispass.employees WITH (security_barrier=true) AS
SELECT e.number AS employee_number, e.dataset AS dataset_id, r.revision AS dataset_revision,
       e.payload::jsonb AS employee,
       o.payload::jsonb AS organisation,
       r.payload::jsonb->'source' AS payroll_source,
       CASE WHEN r.payload::jsonb->'source' IS NOT NULL
                 AND r.payload::jsonb->'source' <> 'null'::jsonb
                 AND e.status='Not provided'
                 AND NOT COALESCE((e.payload::jsonb->>'statusReviewed')::boolean,false)
            THEN 'Active' ELSE e.status END AS effective_employment_status
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

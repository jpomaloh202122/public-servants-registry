CREATE OR REPLACE FUNCTION registry_valid_dob(value text) RETURNS boolean LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
 IF value IS NULL OR value !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN RETURN false; END IF;
 RETURN (value::date)::text=value;
EXCEPTION WHEN others THEN RETURN false;
END;
$$;

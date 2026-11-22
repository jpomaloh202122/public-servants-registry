DO $$
BEGIN
 ALTER TABLE registry_id_cards DROP CONSTRAINT IF EXISTS registry_id_cards_state_check;
 ALTER TABLE registry_id_cards ADD CONSTRAINT registry_id_cards_state_check CHECK (state IN ('issued','superseded','revoked','suspended'));
 CREATE UNIQUE INDEX IF NOT EXISTS registry_id_one_open ON registry_id_cards(employee_number) WHERE state IN ('issued','suspended');
END $$;

CREATE TABLE IF NOT EXISTS public.registry_id_cards (
 id text PRIMARY KEY,
 employee_number text NOT NULL,
 state text NOT NULL CHECK(state IN ('issued','superseded','revoked')),
 verification_token text NOT NULL,
 token_hash text NOT NULL UNIQUE,
 record_hash text NOT NULL,
 employee_sequence text NOT NULL,
 issued_at timestamptz NOT NULL,
 issued_by text NOT NULL,
 payload text NOT NULL
);
-- statement
CREATE UNIQUE INDEX IF NOT EXISTS registry_id_card_current ON public.registry_id_cards(employee_number) WHERE state='issued';

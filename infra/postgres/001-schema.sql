CREATE TABLE IF NOT EXISTS registry (id text PRIMARY KEY,revision integer NOT NULL DEFAULT 0,payload text NOT NULL);
CREATE TABLE IF NOT EXISTS employees(id text PRIMARY KEY,dataset text NOT NULL,number text NOT NULL,agency text NOT NULL,status text NOT NULL,search text NOT NULL,ready integer NOT NULL DEFAULT 0,payload text NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS employee_dataset_number ON employees(dataset,number);
CREATE INDEX IF NOT EXISTS employee_dataset_agency ON employees(dataset,agency);
CREATE INDEX IF NOT EXISTS employee_dataset_status ON employees(dataset,status);
CREATE TABLE IF NOT EXISTS organisations(id text PRIMARY KEY,dataset text NOT NULL,key text NOT NULL,payload text NOT NULL);
CREATE INDEX IF NOT EXISTS organisation_dataset ON organisations(dataset);
INSERT INTO registry(id,revision,payload) VALUES ('excel-config',0,'{"dataset":"","source":null,"events":[]}') ON CONFLICT(id) DO NOTHING;

CREATE TABLE IF NOT EXISTS audit_events(id text PRIMARY KEY,created_at text NOT NULL,actor text NOT NULL,payload text NOT NULL);
CREATE INDEX IF NOT EXISTS audit_events_created ON audit_events(created_at);

CREATE TABLE IF NOT EXISTS public.registry_change_events (
 seq bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 id text NOT NULL UNIQUE,
 employee_number text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 payload jsonb NOT NULL
);
-- statement
CREATE TABLE IF NOT EXISTS public.registry_webhook_deliveries (
 event_id text NOT NULL REFERENCES public.registry_change_events(id),
 destination text NOT NULL CHECK(destination IN ('sevispass','seviswallet')),
 attempts integer NOT NULL DEFAULT 0,
 delivered_at timestamptz,
 next_attempt_at timestamptz NOT NULL DEFAULT now(),
 lease_until timestamptz,
 lease_token text,
 last_error text,
 PRIMARY KEY(event_id,destination)
);
-- statement
CREATE INDEX IF NOT EXISTS registry_delivery_pending ON public.registry_webhook_deliveries(destination,next_attempt_at) WHERE delivered_at IS NULL;
-- statement
CREATE INDEX IF NOT EXISTS registry_events_employee ON public.registry_change_events(employee_number,seq);
-- statement
CREATE OR REPLACE FUNCTION public.registry_employee_state(value jsonb, organisation jsonb)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT (value - ARRAY['updated','sourceRow','agency','sourceStatus','statusReviewed','payrollAbsent','missingSince','lastPayrollDataset','previousEmploymentStatus','statusReason'])
 || jsonb_build_object(
 'status',CASE WHEN value->>'status'='Not provided' AND NOT COALESCE((value->>'statusReviewed')::boolean,false) THEN 'Active' ELSE value->>'status' END,
 'agency',jsonb_build_object('code',organisation->>'code','name',organisation->>'name'),
 'payrollPresent',NOT COALESCE((value->>'payrollAbsent')::boolean,false))
$$;
-- statement
CREATE OR REPLACE FUNCTION public.registry_emit_change(number text, prior jsonb, fresh jsonb, revision integer, dataset text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE event_id text; changes jsonb; message jsonb; action text; event_sequence bigint;
BEGIN
 IF prior IS NOT DISTINCT FROM fresh THEN RETURN; END IF;
 SELECT jsonb_agg(key ORDER BY key) INTO changes
 FROM (SELECT key FROM jsonb_object_keys(COALESCE(prior,'{}'::jsonb)||fresh) key
       WHERE prior->key IS DISTINCT FROM fresh->key) fields;
 event_id := md5(txid_current()::text||dataset||number||COALESCE(prior::text,'')||fresh::text);
 action := CASE WHEN fresh->>'status' IN ('Inactive','Suspended','Terminated','Retired','Resigned','Deceased')
                  OR fresh->>'payrollPresent'='false' THEN 'deactivate' ELSE 'review' END;
 message := jsonb_build_object('id',event_id,'type','employee.changed','schemaVersion',1,
   'employeeNumber',number,'datasetRevision',revision,'datasetId',dataset,
   'occurredAt',clock_timestamp(),'changedFields',changes,'credentialAction',action,
   'reason',CASE WHEN fresh->>'payrollPresent'='false' THEN 'absent_from_payroll' ELSE 'record_changed' END,
   'previous',CASE WHEN prior IS NULL THEN NULL ELSE jsonb_build_object('status',prior->'status','payrollPresent',prior->'payrollPresent','agency',prior->'agency','position',prior->'position') END,
   'current',jsonb_build_object('status',fresh->'status','payrollPresent',fresh->'payrollPresent','agency',fresh->'agency','position',fresh->'position'));
 INSERT INTO public.registry_change_events(id,employee_number,payload) VALUES(event_id,number,message) ON CONFLICT(id) DO NOTHING RETURNING seq INTO event_sequence;
 IF event_sequence IS NOT NULL THEN
  UPDATE public.registry_change_events SET payload=message||jsonb_build_object('sequence',event_sequence) WHERE id=event_id;
 END IF;
 INSERT INTO public.registry_webhook_deliveries(event_id,destination)
 VALUES(event_id,'sevispass'),(event_id,'seviswallet') ON CONFLICT DO NOTHING;
END $$;
-- statement
CREATE OR REPLACE FUNCTION public.registry_activate_payroll()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE prior_dataset text; fresh_dataset text;
BEGIN
 IF NEW.id<>'excel-config' THEN RETURN NEW; END IF;
 prior_dataset := OLD.payload::jsonb->>'dataset';
 fresh_dataset := NEW.payload::jsonb->>'dataset';
 IF fresh_dataset IS NOT DISTINCT FROM prior_dataset OR COALESCE(prior_dataset,'')='' THEN RETURN NEW; END IF;
 IF COALESCE(fresh_dataset,'')='' THEN RAISE EXCEPTION 'Active payroll dataset is required'; END IF;
 IF COALESCE((NEW.payload::jsonb->'source'->>'fullPayroll')::boolean,false) IS NOT TRUE THEN
  RAISE EXCEPTION 'Explicit complete payroll period confirmation is required';
 END IF;
 IF (NEW.payload::jsonb->'source'->>'asOf')::date < (OLD.payload::jsonb->'source'->>'asOf')::date THEN
  RAISE EXCEPTION 'Payroll period is older than the active period';
 END IF;
 -- Map retained employees to a separate organisation key. Uploaded org-1 may identify a different agency.
 INSERT INTO public.organisations(id,dataset,key,payload)
 SELECT fresh_dataset||':retained:'||md5((p.payload::jsonb-'id')::text),fresh_dataset,'retained:'||md5((p.payload::jsonb-'id')::text),
        (p.payload::jsonb||jsonb_build_object('id','retained:'||md5((p.payload::jsonb-'id')::text)))::text
 FROM public.organisations p WHERE p.dataset=prior_dataset
 AND EXISTS (SELECT 1 FROM public.employees e WHERE e.dataset=prior_dataset AND e.agency=p.key
   AND NOT EXISTS(SELECT 1 FROM public.employees f WHERE f.dataset=fresh_dataset AND f.number=e.number))
 ON CONFLICT(id) DO NOTHING;
 -- Retain incomplete legacy records even when their organisation reference cannot be resolved.
 INSERT INTO public.organisations(id,dataset,key,payload)
 SELECT DISTINCT fresh_dataset||':retained-unknown:'||md5(p.agency),fresh_dataset,
   'retained-unknown:'||md5(p.agency),
   jsonb_build_object('id','retained-unknown:'||md5(p.agency),'code',p.agency,
     'name','Unresolved previous organisation','type','Organisation')::text
 FROM public.employees p WHERE p.dataset=prior_dataset
 AND NOT EXISTS(SELECT 1 FROM public.organisations o WHERE o.dataset=prior_dataset AND o.key=p.agency)
 AND NOT EXISTS(SELECT 1 FROM public.employees f WHERE f.dataset=fresh_dataset AND f.number=p.number)
 ON CONFLICT(id) DO NOTHING;
 INSERT INTO public.employees(id,dataset,number,agency,status,search,ready,payload)
 SELECT fresh_dataset||':retained:'||p.number,fresh_dataset,p.number,COALESCE('retained:'||md5((po.payload::jsonb-'id')::text),'retained-unknown:'||md5(p.agency)),'Inactive',p.search,0,
   (p.payload::jsonb||jsonb_build_object('agency',COALESCE('retained:'||md5((po.payload::jsonb-'id')::text),'retained-unknown:'||md5(p.agency)),'status','Inactive','statusReviewed',true,
    'payrollAbsent',true,'statusReason','Not present in payroll cycle',
    'sourceConflict',COALESCE((p.payload::jsonb->>'sourceConflict')::boolean,false) OR po.key IS NULL,
    'previousEmploymentStatus',COALESCE(p.payload::jsonb->>'previousEmploymentStatus',p.status),
    'missingSince',COALESCE(p.payload::jsonb->>'missingSince',NEW.payload::jsonb->'source'->>'asOf'),
    'lastPayrollDataset',COALESCE(p.payload::jsonb->>'lastPayrollDataset',prior_dataset)))::text
 FROM public.employees p LEFT JOIN public.organisations po ON po.dataset=prior_dataset AND po.key=p.agency WHERE p.dataset=prior_dataset
 AND NOT EXISTS(SELECT 1 FROM public.employees f WHERE f.dataset=fresh_dataset AND f.number=p.number)
 ON CONFLICT(dataset,number) DO NOTHING;
 -- Business field comparison uses stable organisation identity instead of import-local keys.
 PERFORM public.registry_emit_change(f.number,
   CASE WHEN p.number IS NULL THEN NULL ELSE public.registry_employee_state(p.payload::jsonb||jsonb_build_object('status',p.status,'number',p.number),po.payload::jsonb) END,
   public.registry_employee_state(f.payload::jsonb||jsonb_build_object('status',f.status,'number',f.number),fo.payload::jsonb),NEW.revision,fresh_dataset)
 FROM public.employees f
 LEFT JOIN public.employees p ON p.dataset=prior_dataset AND p.number=f.number
 LEFT JOIN public.organisations po ON po.dataset=prior_dataset AND po.key=p.agency
 LEFT JOIN public.organisations fo ON fo.dataset=fresh_dataset AND fo.key=f.agency
 WHERE f.dataset=fresh_dataset
 AND public.registry_employee_state(p.payload::jsonb||jsonb_build_object('status',p.status,'number',p.number),po.payload::jsonb)
     IS DISTINCT FROM public.registry_employee_state(f.payload::jsonb||jsonb_build_object('status',f.status,'number',f.number),fo.payload::jsonb);
 RETURN NEW;
END $$;
-- statement
CREATE OR REPLACE TRIGGER registry_payroll_activation
BEFORE UPDATE ON public.registry FOR EACH ROW EXECUTE FUNCTION public.registry_activate_payroll();
-- statement
CREATE OR REPLACE FUNCTION public.registry_employee_changed()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE current_config public.registry%ROWTYPE; org jsonb; prior_org jsonb;
BEGIN
 SELECT * INTO current_config FROM public.registry WHERE id='excel-config';
 IF NEW.dataset IS DISTINCT FROM current_config.payload::jsonb->>'dataset' THEN RETURN NEW; END IF;
 -- Serialise edits with snapshot activation. Registry updates use the same row lock.
 SELECT * INTO current_config FROM public.registry WHERE id='excel-config' FOR UPDATE;
 IF NEW.dataset IS DISTINCT FROM current_config.payload::jsonb->>'dataset' THEN
  RAISE EXCEPTION 'Payroll snapshot changed; refresh before editing';
 END IF;
 IF TG_OP='UPDATE' AND NEW.number IS DISTINCT FROM OLD.number THEN
  RAISE EXCEPTION 'Employee Number is permanent';
 END IF;
 IF COALESCE((NEW.payload::jsonb->>'payrollAbsent')::boolean,false) AND NEW.status='Active' THEN
  RAISE EXCEPTION 'An employee absent from payroll must return in a payroll upload before activation';
 END IF;
 SELECT payload::jsonb INTO org FROM public.organisations WHERE dataset=NEW.dataset AND key=NEW.agency;
 IF TG_OP='UPDATE' THEN
  SELECT payload::jsonb INTO prior_org FROM public.organisations WHERE dataset=OLD.dataset AND key=OLD.agency;
  PERFORM public.registry_emit_change(NEW.number,public.registry_employee_state(OLD.payload::jsonb||jsonb_build_object('status',OLD.status,'number',OLD.number),prior_org),
    public.registry_employee_state(NEW.payload::jsonb||jsonb_build_object('status',NEW.status,'number',NEW.number),org),current_config.revision+1,NEW.dataset);
 ELSE
  PERFORM public.registry_emit_change(NEW.number,NULL,public.registry_employee_state(NEW.payload::jsonb||jsonb_build_object('status',NEW.status,'number',NEW.number),org),
    current_config.revision+1,NEW.dataset);
 END IF;
 RETURN NEW;
END $$;
-- statement
CREATE OR REPLACE TRIGGER registry_employee_lifecycle
AFTER INSERT OR UPDATE ON public.employees FOR EACH ROW EXECUTE FUNCTION public.registry_employee_changed();
-- statement
REVOKE ALL ON FUNCTION public.registry_employee_state(jsonb,jsonb),public.registry_emit_change(text,jsonb,jsonb,integer,text),public.registry_activate_payroll(),public.registry_employee_changed() FROM PUBLIC;
-- statement
CREATE OR REPLACE FUNCTION public.registry_organisation_changed()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE current_config public.registry%ROWTYPE;
BEGIN
 SELECT * INTO current_config FROM public.registry WHERE id='excel-config';
 IF NEW.dataset IS DISTINCT FROM current_config.payload::jsonb->>'dataset' THEN RETURN NEW; END IF;
 SELECT * INTO current_config FROM public.registry WHERE id='excel-config' FOR UPDATE;
 IF NEW.dataset IS DISTINCT FROM current_config.payload::jsonb->>'dataset' THEN
  RAISE EXCEPTION 'Payroll snapshot changed; refresh before editing';
 END IF;
 PERFORM public.registry_emit_change(e.number,
  public.registry_employee_state(e.payload::jsonb||jsonb_build_object('status',e.status,'number',e.number),OLD.payload::jsonb),
  public.registry_employee_state(e.payload::jsonb||jsonb_build_object('status',e.status,'number',e.number),NEW.payload::jsonb),
  current_config.revision+1,NEW.dataset)
 FROM public.employees e WHERE e.dataset=NEW.dataset AND e.agency=NEW.key;
 RETURN NEW;
END $$;
-- statement
CREATE OR REPLACE TRIGGER registry_organisation_lifecycle
AFTER UPDATE ON public.organisations FOR EACH ROW EXECUTE FUNCTION public.registry_organisation_changed();
-- statement
REVOKE ALL ON FUNCTION public.registry_organisation_changed() FROM PUBLIC;

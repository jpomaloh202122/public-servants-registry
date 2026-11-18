import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const db = new PGlite();
try {
  await db.exec(readFileSync('infra/postgres/001-schema.sql', 'utf8'));
  await db.exec("UPDATE registry SET payload='{\"dataset\":\"current\",\"source\":{\"statusProvided\":false}}', revision=2 WHERE id='excel-config'");
  for (const dataset of ['current', 'old']) {
    await db.query('INSERT INTO employees VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
      [dataset, dataset, '000123', 'agency', 'Not provided', 'officer', 0,
        JSON.stringify({first:'Synthetic',last:'Officer',photo:'portraits/example',customField:'preserved'})]);
  }
  // Aurora's owner can create roles but is not a PostgreSQL superuser.
  await db.exec('CREATE ROLE provisioning_owner CREATEROLE');
  await db.exec('SET ROLE provisioning_owner');
  const roleStatements = readFileSync('infra/postgres/sevispass-reader.sql','utf8').split('\n-- statement\n');
  await db.exec(roleStatements.slice(0, 2).join('\n'));
  await db.exec('RESET ROLE');
  await db.exec(readFileSync('infra/postgres/sevispass-reader.sql','utf8').replace('ON DATABASE registry', 'ON DATABASE postgres'));
  await db.exec('SET ROLE sevispass_reader');
  const result = await db.query('SELECT * FROM sevispass.employees WHERE employee_number=$1',['000123']);
  assert.equal(result.rows.length,1);
  assert.equal(result.rows[0].dataset_id,'current');
  assert.equal(result.rows[0].employee.customField,'preserved');
  assert.equal(result.rows[0].effective_employment_status,'Active');
  assert.equal((await db.query("SELECT * FROM sevispass.employees WHERE employee_number='123'")).rows.length,0);
  await assert.rejects(db.query('SELECT * FROM public.employees'), /permission denied/);
  await assert.rejects(db.query("UPDATE sevispass.employees SET employee_number='999'"), /permission denied|cannot update/);
  await assert.rejects(db.query('DELETE FROM sevispass.employees'), /permission denied|cannot delete/);
  await assert.rejects(db.query('CREATE TABLE public.reader_probe (id int)'), /permission denied/);
  await db.exec('RESET ROLE');
  await db.exec("UPDATE registry SET payload='{\"dataset\":\"old\",\"source\":null}' WHERE id='excel-config'");
  await db.exec('SET ROLE sevispass_reader');
  assert.equal((await db.query('SELECT dataset_id FROM sevispass.employees')).rows[0].dataset_id,'old');
  console.log('Reader tests passed: full payload, active snapshot, exact identifier, denied table access and writes.');
} finally {
  await db.close();
}

import assert from 'node:assert/strict';
import {GET} from '../app/api/database-export/route';
const context=(globalThis as any).__databaseTest;
context.user=false;
assert.equal((await GET(new Request('http://example/api/database-export?engine=mysql'))).status,401);
context.user=true;
assert.equal((await GET(new Request('http://example/api/database-export?engine=other'))).status,400);
for(const d of ['mysql','oracle']){
 context.reset();
 const res=await GET(new Request('http://example/api/database-export?engine='+d));
 const text=await res.text();
 assert.equal(res.status,200);assert.match(res.headers.get('cache-control')!,/no-store/);
 assert.equal((text.match(/INSERT INTO sp_employee /g)||[]).length,1001);
 assert.equal((text.match(/INSERT INTO sp_organisation /g)||[]).length,1);
 assert.match(text,/EXPORT COMPLETE: 1001 employees/);assert.match(text,/COMMIT;/);
 context.reset();const blank=await (await GET(new Request('http://example/api/database-export?engine='+d+'&content=schema'))).text();assert.doesNotMatch(blank,/INSERT INTO/);assert.match(blank,/SCHEMA ONLY/);
 context.reset();const filtered=await (await GET(new Request('http://example/api/database-export?engine='+d+'&scope=filtered&status=Active&agency=o1&query=Smith&readiness=conflicts'))).text();assert.ok(context.statements.some((s:string)=>s.includes('status=?')&&s.includes('agency=?')&&s.includes('sourceConflict')));assert.match(filtered,/EXPORT COMPLETE/);
 context.reset();context.change=true;const interrupted=await GET(new Request('http://example/api/database-export?engine='+d));await assert.rejects(interrupted.text(),/Registry changed/);
}
console.log('Database download routes: authentication, 1001-row pagination, both dialects, schema-only, filters and revision interruption passed.');

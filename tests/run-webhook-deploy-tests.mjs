import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
const directory=mkdtempSync(join(tmpdir(),'webhook-deploy-test-'));
try {
 const source=readFileSync('scripts/deploy-payroll-lifecycle.mjs','utf8')
  .replace("import {execFileSync} from 'node:child_process';","const execFileSync=globalThis.__deployExec;");
 for (const initial of ['ROLLBACK_COMPLETE','ROLLBACK_IN_PROGRESS','UPDATE_COMPLETE','missing','ROLLBACK_FAILED']) {
  const calls=[];
  let state=initial;
  globalThis.__deployExec=(command,args)=>{
   calls.push([command,...args]);
   if(command===process.execPath)return '';
   if(command==='zip'){writeFileSync(args[1],'synthetic zip');return '';}
   if(command!=='aws')throw Error('Unexpected command');
   const name=args[args.indexOf('--stack-name')+1];
   if(args[0]==='sts')return JSON.stringify({Account:'440660366630'});
   if(args[1]==='describe-stacks'){
    if(name==='ps-id-registry-backend')return JSON.stringify({Stacks:[{Outputs:[
     ['DbClusterArn','cluster'],['DbSecretArn','app-secret'],['OwnerSecretArn','owner-secret'],
     ['DbName','registry'],['S3Bucket','bucket']
    ].map(([OutputKey,OutputValue])=>({OutputKey,OutputValue}))}]});
    assert.equal(name,'ps-id-registry-backend-webhooks');
    if(state==='missing'){
     const error=new Error('Missing');error.stderr='Stack with id '+name+' does not exist';throw error;
    }
    return JSON.stringify({Stacks:[{StackStatus:state,Outputs:[]}]});
   }
   if(args[1]==='delete-stack'){assert.equal(name,'ps-id-registry-backend-webhooks');state='missing';return '';}
   if(args[1]==='wait'&&args[2]==='stack-rollback-complete'){state='ROLLBACK_COMPLETE';return '';}
   if(args[1]==='deploy'){state='UPDATE_COMPLETE';return '';}
   return '';
  };
  const path=join(directory,initial+'.mjs');
  writeFileSync(path,source);
  if(initial==='ROLLBACK_FAILED')await assert.rejects(import(pathToFileURL(path)),/Inspect webhook stack state/);
  else await import(pathToFileURL(path));
  const deleted=calls.filter(call=>call.includes('delete-stack'));
  assert.equal(deleted.length,initial==='ROLLBACK_COMPLETE'||initial==='ROLLBACK_IN_PROGRESS'?1:0);
  if(initial==='ROLLBACK_FAILED')assert.ok(!calls.some(call=>call.includes('deploy')));
 }
 console.log('Webhook deployment tests passed: failed-create recovery, empty CLI response, missing/healthy stacks and unsafe-state rejection.');
} finally {delete globalThis.__deployExec;rmSync(directory,{recursive:true,force:true});}

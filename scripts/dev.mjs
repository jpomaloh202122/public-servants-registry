import {spawn} from 'node:child_process';
const args=process.argv.slice(2).filter(x=>x!=='--strictPort').map(x=>x==='--host'?'--hostname':x);
const child=spawn(process.execPath,['node_modules/next/dist/bin/next','dev',...args],{stdio:'inherit',env:process.env});
child.on('exit',code=>process.exit(code??1));
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>child.kill(signal));

'use client';
import {useCallback,useEffect,useState} from 'react';

type Health = {
  checkedAt: string;
  services: {name:string;status:string;detail:string}[];
  dataset: {revision:number;records:number;source:string|null}|null;
};

export default function SystemHealth(){
  const [health,setHealth]=useState<Health|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const refresh=useCallback(async()=>{
    setBusy(true);setError('');
    try{
      const response=await fetch('/api/system',{cache:'no-store'});
      if(!response.ok)throw Error(`Health check returned HTTP ${response.status}.`);
      setHealth(await response.json());
    }catch(e){setError((e as Error).message);}
    finally{setBusy(false);}
  },[]);
  useEffect(()=>{void refresh();},[refresh]);
  return <section className="panel">
    <div className="panel-head"><div><h2>AWS service checks</h2><p>{health?'Checked '+new Date(health.checkedAt).toLocaleString('en-PG',{timeZone:'Pacific/Port_Moresby'}):'Checks run on demand.'}</p></div><button className="btn" disabled={busy} onClick={refresh}>{busy?'Checking…':'Refresh health'}</button></div>
    {error&&<p role="alert">{error}</p>}
    {health&&<><div className="table-scroll"><table><thead><tr><th>Check</th><th>Status</th><th>Detail</th></tr></thead><tbody>{health.services.map(item=><tr key={item.name}><th scope="row">{item.name}</th><td>{item.status}</td><td>{item.detail}</td></tr>)}</tbody></table></div>
    <p>{health.dataset?`Active dataset: ${health.dataset.source??'None'} · Revision ${health.dataset.revision} · ${health.dataset.records.toLocaleString()} stored employee records`:'Active dataset could not be checked.'}</p></>}
  </section>;
}

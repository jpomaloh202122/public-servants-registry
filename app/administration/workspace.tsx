'use client';
import {useEffect,useState} from 'react';
import type {Role,Assignment} from '../registry-access';
import '../access.css';
type User={id:string;name:string;email:string;assignment:Assignment|null;main:boolean};
type Directory={users:User[];roles:Role[];agencies:{code:string;name:string}[];next?:string};
type Card={id:string;state:string;issued:string};
export default function Administration(){
 const [dir,setDir]=useState<Directory>(),[cursor,setCursor]=useState(''),[refresh,setRefresh]=useState(0),[msg,notify]=useState(''),[busy,lock]=useState(false);
 const [user,chooseUser]=useState<User>(),[role,chooseRole]=useState<Role>(),[number,setNumber]=useState(''),[cards,setCards]=useState<Card[]>([]),[reason,setReason]=useState('');
 useEffect(()=>{let active=true;fetch('/api/registry-admin?cursor='+encodeURIComponent(cursor)).then(async res=>{const body=await res.json();if(!res.ok)throw Error(body.error);if(active)setDir(body);}).catch(e=>{if(active)notify(e.message);});return()=>{active=false;};},[cursor,refresh]);
 async function loadCards(){try{const res=await fetch('/api/registry-admin?employee='+encodeURIComponent(number.trim()));const b=await res.json();if(!res.ok)throw Error(b.error);setCards(b.cards);notify(b.cards.length?'':'No IDs found for this employee.');}catch(e){notify((e as Error).message);}}
 async function act(action:string,body:Record<string,unknown>){
  if(busy||!window.confirm('Confirm '+action.replaceAll('-',' ')+'?'))return;
  lock(true);try{const res=await fetch('/api/registry-admin',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...body,action})});const result=await res.json();if(!res.ok)throw Error(result.error);
   if(body.state)await loadCards();else{chooseUser(undefined);chooseRole(undefined);setRefresh(v=>v+1);}notify('Saved.');
  }catch(e){notify((e as Error).message);}finally{lock(false);}
 }
 return <main className="access-workspace"><header><h1>Registry administration</h1><a href="/">Return to registry</a></header><p role="status">{msg}</p>
 <section><h2>Issued ID controls</h2><form onSubmit={e=>{e.preventDefault();loadCards();}}><label>Employee number<input required value={number} onChange={e=>{setNumber(e.target.value);setCards([]);}}/></label><button>Find IDs</button></form>
 {cards.length>0&&<label>Reason for action<input maxLength={500} value={reason} onChange={e=>setReason(e.target.value)}/></label>}{cards.map(c=><div key={c.id}><strong>{c.state}</strong> · {c.issued} · {c.id} {['issued','suspended'].includes(c.state)&&<>{(c.state==='issued'?['suspend','revoke']:['resume','revoke']).map(a=><button key={a} disabled={!reason.trim()||busy} onClick={()=>act(a,{...c,reason})}>{a}</button>)}</>}<button disabled={!reason.trim()||busy} onClick={()=>act('delete-card',{...c,reason})}>Delete ID</button></div>)}</section>
 {dir&&<><section><h2>Users</h2><table><thead><tr><th>Name / email</th><th>Role</th><th>Agency</th><th/></tr></thead><tbody>{dir.users.map(u=><tr key={u.id}><td>{u.name}<br/>{u.email}</td><td>{u.main?'Main administrator':dir.roles.find(r=>r.id===u.assignment?.role)?.name||u.assignment?.role||'Cognito group access'}</td><td>{u.assignment?.agency}</td><td>{!u.main&&<button onClick={()=>chooseUser(u)}>Manage</button>}</td></tr>)}</tbody></table>
 <button disabled={!cursor} onClick={()=>setCursor('')}>First page</button><button disabled={!dir.next} onClick={()=>setCursor(dir.next||'')}>Next page</button>
 <h3>{user?'Update '+user.email:'Create agency user'}</h3><form key={user?.id||'create'} onSubmit={e=>{e.preventDefault();act(user?'update-user':'create-user',{...Object.fromEntries(new FormData(e.currentTarget)),id:user?.id});}}>
 <label>Name<input required name="name" defaultValue={user?.name}/></label>{!user&&<label>Email<input required name="email" type="email"/></label>}
 <label>Department<select name="agency" required defaultValue={user?.assignment?.agency||''}><option value="">Select department</option>{dir.agencies.map((a,i)=><option key={i} value={a.code}>{a.name} ({a.code})</option>)}</select></label>
 <label>Agency role<select required name="role" defaultValue={user?.assignment?.role||'hr-officer'}>{dir.roles.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
 <button disabled={busy}>{user?'Save user':'Create and invite'}</button>{user&&<><button type="button" onClick={()=>chooseUser(undefined)}>Cancel</button><button type="button" disabled={busy} onClick={()=>act('delete-user',{id:user.id})}>Delete user</button></>}</form></section>
 <section><h2>Agency roles</h2>{dir.roles.map(r=><p key={r.id}><strong>{r.name}</strong> · {r.mode==='correct'?'Correct records and upload photos':'View records'} {!['hr-manager','hr-officer'].includes(r.id)&&<button onClick={()=>chooseRole(r)}>Manage role</button>}</p>)}
 <form key={role?.id||'new-role'} onSubmit={e=>{e.preventDefault();act(role?'update-role':'create-role',{...Object.fromEntries(new FormData(e.currentTarget)),id:role?.id});}}>
 <label>Role name<input required name="name" defaultValue={role?.name}/></label><label>Agency permissions<select name="mode" defaultValue={role?.mode||'view'}><option value="view">View records</option><option value="correct">Correct records and upload photos</option></select></label>
 <button disabled={busy}>{role?'Update role':'Create role'}</button>{role&&<><button type="button" onClick={()=>chooseRole(undefined)}>Cancel</button><button type="button" disabled={busy} onClick={()=>act('delete-role',{id:role.id})}>Delete role</button></>}</form></section></>}</main>;
}

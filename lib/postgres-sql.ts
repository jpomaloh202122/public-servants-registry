// Convert only the small, fixed SQL vocabulary used by the registry repository.
// Values remain separate Data API parameters; uploaded SQL never reaches this adapter.
export function postgresSQL(sql:string){
 let out=sql.replace(/json_extract\(payload,'\$\.([A-Za-z]+)'\)=1/g,"(payload::jsonb->>'$1')='true'")
 .replace(/json_extract\(payload,'\$\.([A-Za-z]+)'\)/g,"(payload::jsonb->>'$1')")
 .replace(/\bAS ([a-z][a-zA-Z]*[A-Z][a-zA-Z]*)\b/g,'AS "$1"');
 let quoted=false,index=0,result='';
 for(let i=0;i<out.length;i++){const c=out[i];if(c==="'"){if(quoted&&out[i+1]==="'"){result+="''";i++;continue;}quoted=!quoted;}result+=c==='?'&&!quoted?':p'+index++:c;}
 return {sql:result,count:index};
}

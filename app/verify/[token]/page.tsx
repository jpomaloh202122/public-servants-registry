import {verifyIdCard} from '../../server-id-card';
import type {CardVerification} from '../../id-card';
export const dynamic='force-dynamic';
export const metadata={title:'Verify Public Servant ID',robots:{index:false,follow:false},referrer:'no-referrer'};
const descriptions:Record<CardVerification['status'],[string,string]>={
 valid:['ID record verified','This registry-issued ID matches the current active employee record. Compare the details below with the card presented.'],
 inactive:['ID inactive','This ID currently fails the registry validation checks. Contact the Government Payroll Office.'],
 changed:['Replacement ID required','The employee record has changed since issuance. Contact the Government Payroll Office for review and reissue.'],
 revoked:['ID revoked','This ID has been revoked. Contact the Government Payroll Office.'],
 superseded:['ID replaced','A newer ID has replaced this card. Ask the holder to present their current card.'],
 unknown:['ID not recognised','The registry could not find an issued ID for this code.'],
 preview:['Card preview','This code belongs to a preview awaiting issuance approval. Ask for an issued Public Servant ID.'],
 unavailable:['Verification unavailable','The registry could not complete the check. Retry shortly or contact the Government Payroll Office.']
};
export default async function VerifyCardPage({params}:{params:Promise<{token:string}>}) {
 const {token}=await params;
 let result:CardVerification;
 try{result=await verifyIdCard(token);}catch{result={status:'unavailable',checkedAt:new Date().toISOString()};}
 const [title,description]=descriptions[result.status];
 return <main className="card-verification">
  <img src="/gpo-emblem-transparent.png" alt="Government Payroll Office"/>
  <p className="eyebrow">PUBLIC SERVANT ID VERIFICATION</p>
  <h1 className={result.status==='valid'?'verification-valid':''}>{title}</h1>
  <p>{description}</p>
  {result.status==='valid'&&<dl>{[['Full name',result.name],['Department',result.agency],['Position',result.position],
    ['Gender',result.gender],['Employee Number',result.employeeNumber]].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>}
  <p className="verification-time">Checked {new Date(result.checkedAt).toLocaleString('en-PG',{timeZone:'Pacific/Port_Moresby'})} PNG time</p>
 </main>;
}

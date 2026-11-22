export type IdCard = {
 employeeNumber:string;
 name:string;
 agency:string;
 agencyCode:string;
 position:string;
 gender:string;
 photoUrl:string;
 datasetId:string;
 revision:number;
 payrollCycle:string|null;
 assessedOn:string;
 preparedAt:string;
 status:'preview'|'issued'|'sample';
 issuanceAvailable:boolean;
 verificationUrl:string;
 qrDataUrl:string;
 cardId?:string;
 issuedAt?:string;
 issuedOn?:string;
 expiresOn?:string;
 needsReplacement?:boolean;
};
export type CardVerification = {
 status:'valid'|'expired'|'suspended'|'inactive'|'changed'|'revoked'|'superseded'|'unknown'|'preview'|'unavailable';
 checkedAt:string;
 employeeNumber?:string;
 name?:string;
 agency?:string;
 position?:string;
 gender?:string;
};

const pngCalendar=new Intl.DateTimeFormat('en-CA',{timeZone:'Pacific/Port_Moresby',year:'numeric',month:'2-digit',day:'2-digit'});
export function cardDates(issuedAt:string){
 const issuedOn=pngCalendar.format(new Date(issuedAt));
 const [year,month,day]=issuedOn.split('-').map(Number);
 const expiryYear=year+3;
 const lastDay=new Date(Date.UTC(expiryYear,month,0)).getUTCDate();
 const expiresOn=new Date(Date.UTC(expiryYear,month-1,Math.min(day,lastDay))).toISOString().slice(0,10);
 return {issuedOn,expiresOn};
}
export function displayCardDate(isoDay:string){
 return new Intl.DateTimeFormat('en-GB',{day:'2-digit',month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(isoDay+'T00:00:00Z'));
}

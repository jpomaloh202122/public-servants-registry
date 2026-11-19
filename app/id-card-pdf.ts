import {jsPDF} from 'jspdf';
import type {IdCard} from './id-card';
export type IdCardAssets={logo:string;photo:string;font:string;bold:string};

export function makeIdCardPdf(card:IdCard,assets:IdCardAssets) {
 const doc=new jsPDF({orientation:'landscape',unit:'mm',format:[86,54],compress:true});
 doc.addFileToVFS('Card.ttf',assets.font);
 doc.addFileToVFS('Card-Bold.ttf',assets.bold);
 doc.addFont('Card.ttf','Card','normal');
 doc.addFont('Card-Bold.ttf','Card','bold');
 doc.setProperties({title:'Public Servant Card Preview '+card.employeeNumber,author:'Government Payroll Office',subject:'Awaiting issuance approval'});
 const text=(value:string,x:number,y:number,size:number,bold=false)=>{
  doc.setFont('Card',bold?'bold':'normal');doc.setFontSize(size);doc.text(value,x,y);
 };
 function wrapped(value:string,label:string,x:number,y:number,width:number,lines:number,size:number,minSize:number) {
  let fitted:string[]=[];
  for(let fontSize=size;fontSize>=minSize;fontSize-=0.5) {
   doc.setFontSize(fontSize);fitted=doc.splitTextToSize(value,width);
   if(fitted.length<=lines){doc.text(fitted,x,y,{lineHeightFactor:1.15});return;}
  }
  throw Error('The '+label+' is too long for this card layout. Review the employee record.');
 }
 function frame() {
  doc.setFillColor(255,255,255);doc.rect(0,0,86,54,'F');
  doc.setFillColor(117,30,36);doc.rect(0,0,86,11,'F');
  doc.setFillColor(190,145,58);doc.rect(0,11,86,0.6,'F');
  doc.setFillColor(249,240,220);doc.rect(0,49,86,5,'F');
  doc.setTextColor(117,30,36);
  doc.setFont('Card','bold');doc.setFontSize(4.7);
  doc.text('PREVIEW  |  AWAITING ISSUANCE APPROVAL',43,52.2,{align:'center'});
 }
 frame();
 doc.setFillColor(255,255,255);doc.roundedRect(2,1,17,10,1,1,'F');
 doc.addImage(assets.logo,'PNG',3.5,1.5,14,9);
 doc.setTextColor(255,255,255);
 text('GOVERNMENT OF PAPUA NEW GUINEA',22,4.6,4.6,true);
 text('Public Servant Digital ID',22,8.5,6.7,true);
 doc.setFillColor(239,241,243);doc.rect(3,15,22,28.3,'F');
 const image=doc.getImageProperties(assets.photo);
 const scale=Math.min(22/image.width,28.3/image.height);
 doc.addImage(assets.photo,image.fileType,3+(22-image.width*scale)/2,15+(28.3-image.height*scale)/2,image.width*scale,image.height*scale);
 doc.setTextColor(30,36,42);
 doc.setFont('Card','bold');
 wrapped(card.name,'name',29,18,53,3,9,6);
 doc.setTextColor(90,96,102);text('EMPLOYEE NUMBER',29,31.5,4.5);
 doc.setTextColor(30,36,42);doc.setFont('Card','bold');
 wrapped(card.employeeNumber,'Employee Number',29,36,53,1,8.5,5);
 doc.setTextColor(90,96,102);text('AGENCY CODE',29,42,4.5);
 doc.setTextColor(30,36,42);doc.setFont('Card','bold');
 wrapped(card.agencyCode,'agency code',29,46,53,1,7,5);
 doc.addPage([86,54],'landscape');
 frame();
 doc.setTextColor(255,255,255);text('GOVERNMENT PAYROLL OFFICE',4,5,6.5,true);
 text('Registry review details',4,8.8,4.6);
 doc.setTextColor(90,96,102);text('AGENCY / DEPARTMENT',4,16,4.5);
 doc.setTextColor(30,36,42);doc.setFont('Card','bold');
 wrapped(card.agency,'agency name',4,20,78,2,6.8,5);
 doc.setTextColor(90,96,102);text('POSITION',4,29,4.5);
 doc.setTextColor(30,36,42);doc.setFont('Card','normal');
 wrapped(card.position,'position',4,33,78,2,6.8,5);
 doc.setTextColor(40,94,65);text('Registry readiness checks met',4,41,5,true);
 doc.setTextColor(90,96,102);
 text('Payroll period '+(card.payrollCycle??'Not recorded')+'  |  Revision '+card.revision,4,44.5,4.4);
 text('Assessed '+card.assessedOn,4,47.4,4);
 return doc;
}

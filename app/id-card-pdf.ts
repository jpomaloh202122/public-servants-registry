import {jsPDF,GState} from 'jspdf';
import type {IdCard} from './id-card';
export type IdCardAssets={logo:string;font:string;bold:string};
export function makeIdCardPdf(card:IdCard,assets:IdCardAssets) {
 const doc=new jsPDF({orientation:'landscape',unit:'mm',format:[86,54],compress:true});
 doc.addFileToVFS('Card.ttf',assets.font);doc.addFileToVFS('Card-Bold.ttf',assets.bold);
 doc.addFont('Card.ttf','Card','normal');doc.addFont('Card-Bold.ttf','Card','bold');
 doc.setProperties({title:'Public Servant Digital ID '+card.employeeNumber,author:'Government of PNG Public Servants Registry System',
  subject:card.status==='issued'?'Registry-issued Public Servant ID':'Card design preview'});
 const text=(value:string,x:number,y:number,size:number,bold=false)=>{
  doc.setFont('Card',bold?'bold':'normal');doc.setFontSize(size);doc.text(value,x,y);
 };
 function field(value:string,label:string,x:number,y:number,width:number,lines:number,size:number,minSize:number) {
  let fitted:string[]=[];
  doc.setFont('Card','bold');
  for(let fontSize=size;fontSize>=minSize;fontSize-=0.5) {
   doc.setFontSize(fontSize);fitted=doc.splitTextToSize(value,width);
   if(fitted.length<=lines){doc.text(fitted,x,y,{lineHeightFactor:1.08});return;}
  }
  throw Error('The '+label+' is too long for this card layout. Review the employee record.');
 }
 doc.setFillColor(255,252,245);doc.rect(0,0,86,54,'F');
 doc.saveGraphicsState();doc.setGState(new GState({opacity:0.09}));
 doc.addImage(assets.logo,assets.logo.startsWith('data:image/jpeg')?'JPEG':'PNG',12.5,12,49,33);
 doc.restoreGraphicsState();
 doc.setFillColor(25,25,25);doc.rect(0,0,86,10.8,'F');
 doc.setFillColor(174,22,35);doc.rect(0,10.5,86,0.4,'F');
 // A foil-inspired band sits below all identity fields and the QR quiet zone.
 const foilStops=[[169,108,25],[242,203,104],[255,245,202],[191,135,46],[247,220,148],[169,108,25]];
 for(let x=0;x<86;x++){
  const offset=x/85*(foilStops.length-1);
  const start=Math.min(Math.floor(offset),foilStops.length-2);
  const rgb=foilStops[start].map((value,i)=>Math.round(value+(foilStops[start+1][i]-value)*(offset-start)));
  doc.setFillColor(rgb[0],rgb[1],rgb[2]);doc.rect(x,52.3,1.02,1.7,'F');
 }
 doc.setDrawColor(255,237,187);doc.setLineWidth(.12);
 for(let x=1;x<86;x+=1.4)doc.line(x,52.3,x-.8,54);
 doc.setTextColor(239,187,72);text('GOVERNMENT OF PAPUA NEW GUINEA',3.5,3.5,5.3,true);
 doc.setTextColor(255,255,255);text('Public Servant Digital ID',3.5,8.8,11,true);
 doc.setTextColor(239,187,72);doc.setFont('Card','bold');doc.setFontSize(5.4);
 doc.text(card.status.toUpperCase(),82.3,8.1,{align:'right'});
 const label=(value:string,x:number,y:number)=>{doc.setTextColor(82,93,94);text(value,x,y,5.1,true);doc.setTextColor(31,42,43);};
 label('FULL NAME',3.5,15.9);field(card.name,'name',3.5,21.5,51.5,1,14,7);
 label('DEPARTMENT',3.5,25.6);field(card.agency,'department',3.5,29.2,51.5,2,7.2,5.2);
 label('POSITION',3.5,33.6);field(card.position,'position',3.5,37.2,51.5,2,7.2,5.2);
 doc.setDrawColor(213,208,197);doc.setLineWidth(0.2);doc.line(3.5,40.7,53.5,40.7);
 label('GENDER',3.5,44.2);field(card.gender,'gender',3.5,47.8,23,1,8.3,5.3);
 label('EMPLOYEE NUMBER',29.2,44.2);field(card.employeeNumber,'Employee Number',29.2,47.8,25.5,1,8.3,5.3);
 doc.addImage(card.qrDataUrl,'PNG',56.8,15.5,26,26);
 doc.setTextColor(25,31,33);doc.setFont('Card','bold');doc.setFontSize(6.2);
 doc.text('Scan to verify',69.8,45.8,{align:'center'});
 return doc;
}

import {jsPDF,GState} from 'jspdf';
import type {IdCard} from './id-card';
export type IdCardAssets={logo:string;font:string;bold:string;portrait?:string};
export function makeIdCardPdf(card:IdCard,assets:IdCardAssets) {
 const doc=new jsPDF({orientation:'landscape',unit:'mm',format:[86,54],compress:true});
 doc.addFileToVFS('Card.ttf',assets.font);doc.addFileToVFS('Card-Bold.ttf',assets.bold);
 doc.addFont('Card.ttf','Card','normal');doc.addFont('Card-Bold.ttf','Card','bold');
 doc.setProperties({title:'Public Servant ID Pass '+card.employeeNumber,author:'Government of PNG Public Servants Registry System',
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
 doc.setFillColor(32,30,29);doc.triangle(0,0,35,0,0,7,'F');
 doc.setFillColor(222,177,66);doc.triangle(0,7,35,0,0,8,'F');
 doc.setFillColor(166,26,40);doc.triangle(0,8,35,0,0,10,'F');
 doc.addImage(assets.logo,assets.logo.startsWith('data:image/jpeg')?'JPEG':'PNG',36,1,14,9);
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
 doc.setTextColor(35,32,30);doc.setFont('Card','bold');doc.setFontSize(5.2);
 doc.text('GOVERNMENT OF PAPUA NEW GUINEA',43,12.1,{align:'center'});
 doc.setFontSize(10);doc.text('Public Servant ID Pass',43,16.1,{align:'center'});
 doc.setTextColor(155,25,40);doc.setFontSize(5.6);
 doc.text(card.status==='issued'?'ISSUED':'SPECIMEN',43,19.2,{align:'center'});
 if(assets.portrait)doc.addImage(assets.portrait,'JPEG',2.8,22,17.7,23.6);
 else if(card.status!=='sample')throw Error('A verified portrait is required to print this pass.');
 doc.setTextColor(32,30,29);
 field(card.name,'name',22.5,25,40,2,9,5);
 const row=(label:string,value:string,y:number)=>{
  doc.setTextColor(95,79,66);text(label,22.5,y,4.8,true);
  doc.setTextColor(32,30,29);field(value,label,22.5,y+2.7,40,2,6.4,4.9);
 };
 row('DEPARTMENT',card.agency,30);row('POSITION',card.position,37.8);
 text('GENDER',22.5,46,4.8,true);field(card.gender,'gender',22.5,49,14,1,6.3,4.8);
 text('EMPLOYEE NUMBER',38,46,4.8,true);field(card.employeeNumber,'employee number',38,49,25,1,6.3,4.8);
 doc.addImage(card.qrDataUrl,'PNG',63.2,27,21,21);
 return doc;
}

import {jsPDF,GState} from 'jspdf';
import autoTable from 'jspdf-autotable';
import type {ManagementReport} from './management-report';
export type ReportPdfAssets={logo:string;font:string;bold:string};
export function makeManagementPdf(report:ManagementReport,sections:string[],assets:ReportPdfAssets){
 const doc=new jsPDF({orientation:'landscape',unit:'mm',format:'a4',compress:true});doc.addFileToVFS('GPO.ttf',assets.font);doc.addFont('GPO.ttf','GPO','normal');doc.addFileToVFS('GPO-Bold.ttf',assets.bold);doc.addFont('GPO-Bold.ttf','GPO','bold');
 doc.setProperties({title:report.title,author:'Government Payroll Office',subject:report.scope,keywords:report.id});let y=42;
 const decorate=()=>{doc.saveGraphicsState();doc.saveGraphicsState();const state=new GState({opacity:0.04});doc.setGState(state);doc.addImage(assets.logo,'PNG',105,52,85,85);doc.restoreGraphicsState();doc.addImage(assets.logo,'PNG',12,8,21,21);doc.setFont('GPO','bold');doc.setTextColor(35,35,35);doc.setFontSize(12);doc.text('GOVERNMENT OF PAPUA NEW GUINEA',38,14);doc.setFontSize(10);doc.text('Government Payroll Office',38,20);doc.setFont('GPO','normal');doc.setFontSize(8);doc.text(report.title,38,26);doc.setDrawColor(170,143,83);doc.line(12,32,285,32);doc.setFontSize(7);doc.text(`Report ${report.id}  |  Generated ${report.generatedPng}`,12,37);doc.restoreGraphicsState();};
 let first=true;
 for(const key of [...sections,'definitions']){if(!first)doc.addPage();first=false;y=44;
 for(const t of report.tables[key]||[]){if(y>165){doc.addPage();y=44;}doc.setFont('GPO','bold');doc.setFontSize(11);doc.setTextColor(25,25,25);doc.text(t.name,12,y);y+=6;
 const scopeLines=doc.splitTextToSize('Scope: '+report.scope,270);doc.setFont('GPO','normal');doc.setFontSize(7);doc.text(scopeLines,12,y);y+=scopeLines.length*3.5+3;
 const indexes=t.name==='Agency comparison'?[0,1,2,3,4,5,8,12]:t.headers.map((_,i)=>i);const headers=indexes.map(i=>t.headers[i]),body=t.rows.map(r=>indexes.map(i=>r[i]));
 autoTable(doc,{startY:y,head:[headers],body,margin:{top:44,bottom:17,left:12,right:12},styles:{font:'GPO',fontSize:headers.length>6?7:8,cellPadding:2,overflow:'linebreak',lineColor:[220,220,220],lineWidth:0.1},headStyles:{fillColor:[49,49,49],textColor:255,fontStyle:'bold'},alternateRowStyles:{fillColor:[247,246,242]},willDrawPage:()=>{decorate();}});
 y=(doc as any).lastAutoTable.finalY+10;
 }}
 const pages=doc.getNumberOfPages();for(let n=1;n<=pages;n++){doc.setPage(n);doc.setFont('GPO','normal');doc.setFontSize(7);doc.setTextColor(100,100,100);doc.text('Internal management use | Source: '+report.source+' | Prepared by '+report.preparedBy,12,202);doc.text(`${n} / ${pages}`,285,202,{align:'right'});}return doc;
}

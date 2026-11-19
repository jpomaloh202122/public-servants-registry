import {jsPDF} from 'jspdf';
import type {IdCard} from './id-card';

export function makeIdCardPdf(card:IdCard,passPng:string) {
 const doc=new jsPDF({orientation:'landscape',unit:'mm',format:[86,54],compress:true});
 doc.setProperties({title:'Public Servant ID Pass '+card.employeeNumber,author:'Government of PNG Public Servants Registry System'});
 doc.addImage(passPng,'PNG',0,0,86,54);
 return doc;
}

import {displayCardDate,type IdCard} from './id-card';

export type PassFormat='physical'|'digital';

function loadImage(src:string):Promise<HTMLImageElement> {
 const image=new Image();
 image.src=src;
 return image.decode().then(()=>image);
}

async function loadIssuedSignature(card:IdCard) {
 if(card.status!=='issued'||!card.cardId)return null;
 const query=new URLSearchParams({employeeNumber:card.employeeNumber,id:card.cardId});
 const response=await fetch('/api/id-card/secretary-approval?'+query,{cache:'no-store'});
 if(response.status===204)return null;
 if(!response.ok)throw Error('The Secretary approval block could not be loaded. Refresh and try again.');
 return createImageBitmap(await response.blob());
}

// Coordinates follow the two approved artwork masters in their native pixels.
export async function renderPass(card:IdCard,format:PassFormat):Promise<HTMLCanvasElement> {
 const physical=format==='physical';
 const [art,photo,qr,approval,signature]=await Promise.all([
  loadImage('/pass-art/'+format+'.webp'),loadImage(card.photoUrl),loadImage(card.qrDataUrl),
  loadImage('/pass-art/secretary-approval.svg'),loadIssuedSignature(card)
 ]);
 const canvas=document.createElement('canvas');
 canvas.width=art.naturalWidth;canvas.height=art.naturalHeight;
 const ctx=canvas.getContext('2d');
 if(!ctx)throw Error('The ID preview could not be drawn.');
 ctx.drawImage(art,0,0);
 const [px,py,pw,ph,radius]=physical?[40,249,258,338,18]:[34,422,162,222,12];
 ctx.save();ctx.beginPath();ctx.roundRect(px,py,pw,ph,radius);ctx.clip();
 const scale=Math.max(pw/photo.naturalWidth,ph/photo.naturalHeight);
 const w=photo.naturalWidth*scale,h=photo.naturalHeight*scale;
 ctx.drawImage(photo,px+(pw-w)/2,py+(ph-h)/2,w,h);
 ctx.restore();
 const [qx,qy,side]=physical?[859,406,168]:[252,650,139];
 ctx.fillStyle='white';ctx.fillRect(qx+4,qy+4,side-8,side-8);
 ctx.imageSmoothingEnabled=false;ctx.drawImage(qr,qx+3,qy+3,side-6,side-6);ctx.imageSmoothingEnabled=true;
 ctx.textBaseline='middle';ctx.textAlign='center';ctx.fillStyle='#fff';
 ctx.font='700 '+(physical?25:21)+'px Arial, sans-serif';
 ctx.fillText((card.status==='issued'?'ISSUED':'SPECIMEN').split('').join(' '),physical?596:246,physical?306:377);
 ctx.textAlign='left';ctx.fillStyle=physical?'#111':'#fff';
 function fitted(value:string,x:number,y:number,width:number,height:number,size:number,bold=false) {
  const context=ctx!;
  for(let fontSize=size;fontSize>=9;fontSize--){
   context.font=(bold?'700 ':'400 ')+fontSize+'px Arial, sans-serif';
   const lines:string[]=[];let line='';
   for(const word of value.trim().split(/\s+/)){
    const joined=line?line+' '+word:word;
    if(line&&context.measureText(joined).width>width){lines.push(line);line=word;}else line=joined;
   }
   lines.push(line);
   const leading=fontSize*1.06;
   if(lines.length*leading>height||lines.some(part=>context.measureText(part).width>width))continue;
   lines.forEach((part,index)=>context.fillText(part,x,y+height/2+(index-(lines.length-1)/2)*leading));
   return;
  }
  throw Error('An identity field is too long to display in full on this pass. Review the employee record.');
 }
 if(physical){
  fitted(card.name,334,341,505,61,56,true);
  [card.agency,card.position,card.gender,card.employeeNumber].forEach((value,index)=>fitted(value,562,412+index*43,262,39,24));
 }else{
  fitted(card.name,215,410,237,49,40,true);
  fitted(card.agency,330,462,116,45,17);
  fitted(card.position,330,512,117,28,16);
  fitted(card.gender,330,547,117,25,16);
  fitted(card.employeeNumber,330,581,117,38,18);
 }
 const issued=card.issuedOn?displayCardDate(card.issuedOn):'On issuance';
 const expiry=card.expiresOn?displayCardDate(card.expiresOn):'3 years from issue';
 const validityField=(label:string,value:string,x:number,y:number,width:number)=>{
  fitted(label,x,y,width,18,physical?16:14,true);
  fitted(value,x,y+18,width,25,physical?21:18);
 };
 const drawApproval=(x:number,y:number,w:number,h:number)=>{
  ctx.drawImage(approval,x,y,w,h);
  if(!signature)return;
  const scale=Math.min(w*.79/signature.width,h*.49/signature.height);
  const width=signature.width*scale,height=signature.height*scale;
  ctx.drawImage(signature,x+(w-width)/2,y+h*.29-height/2,width,height);
  signature.close();
 };
 if(physical){
  validityField('Date of issuance',issued,335,588,218);
  validityField('Expiry date',expiry,568,588,240);
  drawApproval(810,580,230,58);
 }else{
  validityField('Date of issuance',issued,50,649,184);
  validityField('Expiry date',expiry,50,695,184);
  drawApproval(50,744,192,49);
 }
 return canvas;
}

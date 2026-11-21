export const portraitWidth=350;
export const portraitHeight=450;
export function numberFromPhoto(name:string){
 const match=/^([^/\\\u0000-\u001f\u007f]+)\.(jpe?g|png)$/i.exec(name);
 const number=match?.[1];
 return number&&number.length<=100&&number.trim()===number?number:null;
}
export function portraitCrop(width:number,height:number){
 if(width<portraitWidth||height<portraitHeight)throw Error('Photo must be at least 350 × 450 pixels after rotation.');
 const scale=Math.min(width/portraitWidth,height/portraitHeight);
 const w=portraitWidth*scale,h=portraitHeight*scale;
 return {x:(width-w)/2,y:(height-h)/2,w,h};
}

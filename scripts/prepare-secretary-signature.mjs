import sharp from 'sharp';

const [source,destination]=process.argv.slice(2);
if(!source||!destination)throw Error('Usage: node scripts/prepare-secretary-signature.mjs INPUT_JPEG OUTPUT_PNG');

const {data,info}=await sharp(source).rotate().removeAlpha().toColourspace('srgb')
 .extract({left:112,top:614,width:636,height:258})
 .raw().toBuffer({resolveWithObject:true});
const rgba=Buffer.alloc(info.width*info.height*4);
for(let i=0;i<info.width*info.height;i++){
 const [red,green,blue]=data.subarray(i*3,i*3+3);
 // The supplied scan has blue ink on grey paper. Separate the ink by colour.
 const chroma=blue-Math.max(red,green);
 rgba.set([26,52,108,Math.round(Math.max(0,Math.min(1,(chroma-7)/29))*255)],i*4);
}
await sharp(rgba,{raw:{width:info.width,height:info.height,channels:4}})
 .trim({background:'#1a346c00',threshold:12}).png().toFile(destination);

const sharp=require('sharp');
const fs=require('fs');
const path=require('path');

async function main(){
  const src=process.argv[2];
  const out=process.argv[3];
  if(!src||!out)throw new Error('Usage: node tile-screenshot.js input.png output.dzi');
  const meta=await sharp(src,{limitInputPixels:false}).metadata();
  console.log('HD source dimensions:',meta.width+'x'+meta.height);
  if(meta.width<17000 || meta.height<11000){
    throw new Error('Unexpected HD map dimensions: '+meta.width+'x'+meta.height);
  }
  fs.mkdirSync(path.dirname(out),{recursive:true});
  await sharp(src,{limitInputPixels:false,sequentialRead:true})
    .webp({quality:94,effort:3,smartSubsample:true})
    .tile({size:1024,overlap:0,layout:'dz',container:'fs'})
    .toFile(out);
  console.log('Deep Zoom tiles generated.');
}
main().catch(err=>{console.error(err);process.exit(1);});

const sharp=require('sharp');
const fs=require('fs');

(async()=>{
  const src=process.argv[2],base=process.argv[3],metaOut=process.argv[4];
  if(!src||!base||!metaOut)throw new Error('Usage: node tile-screenshot.js source.png output-base meta.js');
  const image=sharp(src,{limitInputPixels:false,sequentialRead:true});
  const meta=await image.metadata();
  const maxLevel=Math.ceil(Math.log2(Math.max(meta.width,meta.height)));
  console.log('HD source dimensions:',meta.width+'x'+meta.height,'maxLevel',maxLevel);
  await sharp(src,{limitInputPixels:false,sequentialRead:true})
    .webp({quality:92,effort:3,smartSubsample:true})
    .tile({size:1024,overlap:0,layout:'dz',container:'fs'})
    .toFile(base);
  const info={
    available:true,width:meta.width,height:meta.height,maxLevel,
    tileSize:1024,folder:'maps/screenshot-hd_files',format:'webp'
  };
  fs.writeFileSync(metaOut,'window.HK_HD_MAP='+JSON.stringify(info)+';\n');
  console.log('Deep Zoom pyramid generated.');
})().catch(err=>{console.error(err);process.exit(1)});
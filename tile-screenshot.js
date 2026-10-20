const sharp=require('sharp');
const fs=require('fs');
const path=require('path');

(async()=>{
  const src=process.argv[2],base=process.argv[3],metaOut=process.argv[4];
  const pixelsPerWorld=Number(process.argv[5]||16);
  if(!src||!base||!metaOut)throw new Error('Usage: node tile-screenshot.js source output-base meta.js [pixelsPerWorld]');
  const image=sharp(src,{limitInputPixels:false,sequentialRead:true});
  const meta=await image.metadata();
  const maxLevel=Math.ceil(Math.log2(Math.max(meta.width,meta.height)));
  console.log('Screenshot source dimensions:',meta.width+'x'+meta.height,'maxLevel',maxLevel);
  await sharp(src,{limitInputPixels:false,sequentialRead:true})
    .webp({quality:92,effort:3,smartSubsample:true})
    .tile({size:1024,overlap:0,layout:'dz',container:'fs'})
    .toFile(base);
  const folder='maps/'+path.basename(base)+'_files';
  const info={
    available:true,width:meta.width,height:meta.height,maxLevel,
    tileSize:1024,folder,format:'webp',pixelsPerWorld,
    worldWidth:meta.width/pixelsPerWorld,
    worldHeight:meta.height/pixelsPerWorld
  };
  fs.writeFileSync(metaOut,'window.HK_HD_MAP='+JSON.stringify(info)+';\n');
  console.log('Deep Zoom pyramid generated.');
})().catch(err=>{console.error(err);process.exit(1)});
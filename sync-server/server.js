import http from 'node:http';
import crypto from 'node:crypto';
import { createClient } from 'redis';

const PORT=Number(process.env.PORT||10000);
const REDIS_URL=process.env.REDIS_URL;
const TOKEN_HASH=process.env.SYNC_TOKEN_HASH||'';
const ALLOWED_ORIGIN=process.env.ALLOWED_ORIGIN||'https://hallownest-map-federico.onrender.com';
const KEY='hallownest:state:v1';

if(!REDIS_URL) throw new Error('REDIS_URL missing');
if(!TOKEN_HASH) throw new Error('SYNC_TOKEN_HASH missing');

const redis=createClient({url:REDIS_URL});
redis.on('error',err=>console.error('redis',err.message));
await redis.connect();

function cors(res,origin){
  if(origin===ALLOWED_ORIGIN){
    res.setHeader('Access-Control-Allow-Origin',origin);
    res.setHeader('Vary','Origin');
  }
  res.setHeader('Access-Control-Allow-Headers','Authorization, Content-Type');
  res.setHeader('Access-Control-Allow-Methods','GET, PUT, OPTIONS');
  res.setHeader('Cache-Control','no-store');
}
function send(res,status,obj){
  res.statusCode=status;
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.end(JSON.stringify(obj));
}
function authorized(req){
  const raw=(req.headers.authorization||'').replace(/^Bearer\s+/i,'');
  if(!raw)return false;
  const hash=crypto.createHash('sha256').update(raw).digest('hex');
  try{
    return crypto.timingSafeEqual(Buffer.from(hash,'hex'),Buffer.from(TOKEN_HASH,'hex'));
  }catch{return false;}
}
async function bodyJson(req){
  let raw='';
  for await(const chunk of req){
    raw+=chunk;
    if(raw.length>500000)throw new Error('body too large');
  }
  return raw?JSON.parse(raw):{};
}

const server=http.createServer(async(req,res)=>{
  const origin=req.headers.origin||'';
  cors(res,origin);

  if(req.method==='OPTIONS'){
    res.statusCode=204;res.end();return;
  }
  if(req.url==='/health'){
    send(res,200,{ok:true,redis:redis.isReady});return;
  }
  if(req.url!=='/state'){
    send(res,404,{error:'not found'});return;
  }
  if(origin && origin!==ALLOWED_ORIGIN){
    send(res,403,{error:'origin denied'});return;
  }
  if(!authorized(req)){
    send(res,401,{error:'unauthorized'});return;
  }

  try{
    if(req.method==='GET'){
      const raw=await redis.get(KEY);
      send(res,200,raw?JSON.parse(raw):{state:null,updatedAt:0});
      return;
    }
    if(req.method==='PUT'){
      const body=await bodyJson(req);
      if(!body || typeof body!=='object' || typeof body.state!=='object'){
        send(res,400,{error:'invalid state'});return;
      }
      const updatedAt=Number(body.updatedAt)||Date.now();
      const payload={state:body.state,updatedAt};
      await redis.set(KEY,JSON.stringify(payload));
      send(res,200,{ok:true,updatedAt});
      return;
    }
    send(res,405,{error:'method not allowed'});
  }catch(err){
    console.error(err);
    send(res,500,{error:'server error'});
  }
});

server.listen(PORT,'0.0.0.0',()=>console.log('sync api listening',PORT));

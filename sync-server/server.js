import http from 'node:http';
import crypto from 'node:crypto';
import { createClient } from 'redis';

const PORT=Number(process.env.PORT||10000);
const REDIS_URL=process.env.REDIS_URL;
const ALLOWED_ORIGIN=process.env.ALLOWED_ORIGIN||'https://hallownest-map-federico.onrender.com';

if(!REDIS_URL) throw new Error('REDIS_URL missing');

const redis=createClient({url:REDIS_URL});
redis.on('error',err=>console.error('redis',err.message));

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
function bearer(req){
  const m=(req.headers.authorization||'').match(/^Bearer\s+([A-Za-z0-9_-]{32,200})$/);
  return m?m[1]:null;
}
function keyFor(token){
  return 'hallownest:state:'+crypto.createHash('sha256').update(token).digest('hex');
}
async function bodyJson(req){
  let raw='';
  for await(const chunk of req){
    raw+=chunk;
    if(raw.length>300000)throw new Error('body too large');
  }
  return raw?JSON.parse(raw):{};
}
function cleanState(s){
  if(!s||typeof s!=='object'||Array.isArray(s))return null;
  return {
    found:(s.found&&typeof s.found==='object')?s.found:{},
    notes:(s.notes&&typeof s.notes==='object')?s.notes:{},
    spoilers:!!s.spoilers,
    mapMode:s.mapMode==='sketch'?'sketch':'screenshot'
  };
}

await redis.connect();
console.log('redis connected',REDIS_URL.replace(/:\/\/.*@/,'://***@'));

const server=http.createServer(async(req,res)=>{
  const origin=req.headers.origin||'';
  cors(res,origin);

  if(req.method==='OPTIONS'){res.statusCode=204;res.end();return;}
  if(req.url==='/health'){send(res,200,{ok:true,redis:redis.isReady});return;}
  if(req.url!=='/api/state'){send(res,404,{error:'not_found'});return;}
  if(origin&&origin!==ALLOWED_ORIGIN){send(res,403,{error:'origin_denied'});return;}

  const token=bearer(req);
  if(!token){send(res,401,{error:'unauthorized'});return;}
  const key=keyFor(token);

  try{
    if(req.method==='GET'){
      const raw=await redis.get(key);
      if(!raw){send(res,404,{error:'state_not_found'});return;}
      send(res,200,JSON.parse(raw));
      return;
    }
    if(req.method==='PUT'){
      const body=await bodyJson(req);
      const state=cleanState(body.state);
      if(!state){send(res,400,{error:'invalid_state'});return;}
      const payload={version:1,updatedAt:Number(body.updatedAt)||Date.now(),state};
      await redis.set(key,JSON.stringify(payload));
      send(res,200,{ok:true,updatedAt:payload.updatedAt});
      return;
    }
    send(res,405,{error:'method_not_allowed'});
  }catch(err){
    console.error('request',err);
    send(res,500,{error:'server_error'});
  }
});

server.listen(PORT,'0.0.0.0',()=>console.log('sync api listening',PORT));
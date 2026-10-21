const http=require('http');
const crypto=require('crypto');
const {createClient}=require('redis');

const PORT=Number(process.env.PORT||10000);
const REDIS_URL=process.env.REDIS_URL;
const ALLOWED_ORIGIN=process.env.ALLOWED_ORIGIN||'https://hallownest-map-federico.onrender.com';

if(!REDIS_URL){
  console.error('REDIS_URL missing');
  process.exit(1);
}

const redis=createClient({url:REDIS_URL});
redis.on('error',err=>console.error('Redis error',err.message));

function cors(res,origin){
  if(origin===ALLOWED_ORIGIN) res.setHeader('Access-Control-Allow-Origin',origin);
  res.setHeader('Vary','Origin');
  res.setHeader('Access-Control-Allow-Headers','Authorization, Content-Type');
  res.setHeader('Access-Control-Allow-Methods','GET, PUT, OPTIONS');
  res.setHeader('Cache-Control','no-store');
}
function send(res,code,obj){
  res.statusCode=code;
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.end(JSON.stringify(obj));
}
function tokenFrom(req){
  const h=req.headers.authorization||'';
  const m=h.match(/^Bearer\s+([A-Za-z0-9_-]{32,200})$/);
  return m?m[1]:null;
}
function stateKey(token){
  const hash=crypto.createHash('sha256').update(token).digest('hex');
  return 'hkstate:'+hash;
}
function validState(s){
  return s && typeof s==='object' && !Array.isArray(s)
    && (!s.found || typeof s.found==='object')
    && (!s.notes || typeof s.notes==='object');
}

async function main(){
  await redis.connect();
  console.log('Redis connected');

  const server=http.createServer(async(req,res)=>{
    const origin=req.headers.origin||'';
    cors(res,origin);
    if(req.method==='OPTIONS'){res.statusCode=204;return res.end();}

    if(req.url==='/health'){
      return send(res,200,{ok:true,redis:redis.isReady});
    }
    if(req.url!=='/api/state'){
      return send(res,404,{error:'not_found'});
    }
    if(origin && origin!==ALLOWED_ORIGIN){
      return send(res,403,{error:'origin_not_allowed'});
    }

    const token=tokenFrom(req);
    if(!token)return send(res,401,{error:'missing_or_invalid_token'});
    const key=stateKey(token);

    try{
      if(req.method==='GET'){
        const raw=await redis.get(key);
        if(!raw)return send(res,404,{error:'state_not_found'});
        return send(res,200,JSON.parse(raw));
      }

      if(req.method==='PUT'){
        let body='',tooLarge=false;
        req.on('data',chunk=>{
          body+=chunk;
          if(body.length>250000){tooLarge=true;req.destroy();}
        });
        req.on('end',async()=>{
          if(tooLarge)return send(res,413,{error:'too_large'});
          try{
            const data=JSON.parse(body||'{}');
            if(!validState(data.state))return send(res,400,{error:'invalid_state'});
            const payload={
              version:1,
              updatedAt:Number(data.updatedAt)||Date.now(),
              state:{
                found:data.state.found||{},
                notes:data.state.notes||{},
                spoilers:!!data.state.spoilers,
                mapMode:data.state.mapMode||'screenshot'
              }
            };
            await redis.set(key,JSON.stringify(payload));
            return send(res,200,{ok:true,updatedAt:payload.updatedAt});
          }catch(e){
            return send(res,400,{error:'bad_json'});
          }
        });
        return;
      }

      return send(res,405,{error:'method_not_allowed'});
    }catch(e){
      console.error('Request error',e);
      return send(res,500,{error:'server_error'});
    }
  });

  server.listen(PORT,'0.0.0.0',()=>console.log('Sync API listening on',PORT));
}
main().catch(err=>{console.error(err);process.exit(1)});
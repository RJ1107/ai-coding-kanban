import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {root, dataFile, version} from './store.mjs';

const configFile=path.join(root,'config.json');
const marker=path.join(root,'data','server.json');
const workspaceId=createHash('sha256').update(process.platform==='win32'?dataFile.toLowerCase():dataFile).digest('hex').slice(0,20);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function health(port){try {const res=await fetch(`http://127.0.0.1:${port}/api/health`,{signal:AbortSignal.timeout(600)});return res.ok?await res.json():null;}catch{return null;}}
async function portFree(port){const server=net.createServer();return new Promise(resolve=>{server.once('error',()=>resolve(false));server.listen(port,'127.0.0.1',()=>server.close(()=>resolve(true)));});}
export async function start(preferred){
 const config=fs.existsSync(configFile)?JSON.parse(fs.readFileSync(configFile,'utf8')):{};
 const previous=fs.existsSync(marker)?JSON.parse(fs.readFileSync(marker,'utf8')):null;
 if(previous){
  const info=await health(previous.port);
  if(info?.workspaceId===workspaceId && info.pid===previous.pid){
   if(info.version===version)return {...info,url:`http://127.0.0.1:${info.port}`,reused:true};
   // The runtime files were upgraded underneath an older owned viewer; replace only that process.
   await stop();
  }
 }
 const base=Number(preferred||config.port||4318);
 if(!Number.isInteger(base)||base<1024||base>65480)throw new Error('Choose a port between 1024 and 65480.');
 let port;
 for(let p=base;p<base+40;p++){if(await portFree(p)){port=p;break;}}
 if(!port)throw new Error('No free local port found. Try another --port.');
 fs.mkdirSync(path.dirname(marker),{recursive:true});
 const out=fs.openSync(path.join(root,'data','server.log'),'a');
 const err=fs.openSync(path.join(root,'data','server-error.log'),'a');
 let child;
 try {child=spawn(process.execPath,[path.join(root,'server.mjs')],{cwd:root,env:{...process.env,BOARD_PORT:String(port),BOARD_DATA:dataFile},detached:true,windowsHide:true,stdio:['ignore',out,err]});}
 finally{fs.closeSync(out);fs.closeSync(err);}
 let launchError; child.once('error',e=>{launchError=e;}); child.unref();
 for(let i=0;i<50;i++){
  if(launchError)throw launchError;
  await sleep(100);
  const info=await health(port);
  if(info?.workspaceId===workspaceId && info.pid===child.pid){fs.writeFileSync(marker,JSON.stringify({port,pid:child.pid,workspaceId}));fs.writeFileSync(configFile,JSON.stringify({...config,port},null,2));return {...info,url:`http://127.0.0.1:${port}`,reused:false};}
 }
 // The PID belongs to the child just created; do not stop an unrelated listener.
 try{child.kill();}catch{}
 throw new Error('The board did not start. Inspect .agent-workboard/data/server-error.log.');
}
export async function stop(){
 if(!fs.existsSync(marker))return {stopped:false,reason:'No owned server recorded'};
 const previous=JSON.parse(fs.readFileSync(marker,'utf8'));
 const info=await health(previous.port);
 if(!info){fs.unlinkSync(marker);return {stopped:false,reason:'Server is already offline'};}
 if(info.workspaceId!==workspaceId||info.pid!==previous.pid)throw new Error('The recorded port now belongs to another process. Nothing was stopped.');
 process.kill(previous.pid,'SIGTERM');
 for(let i=0;i<30;i++){if(!await health(previous.port))break;await sleep(100);}
 fs.unlinkSync(marker);
 return {stopped:true};
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try {if(process.argv[2]==='start')console.log(JSON.stringify(await start(process.argv[3])));else if(process.argv[2]==='stop')console.log(JSON.stringify(await stop()));else throw new Error('Use: node .agent-workboard/manage.mjs start|stop');}
 catch(error){console.error(error.message);process.exitCode=1;}
}

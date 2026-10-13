import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';

const skillRoot=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const args=process.argv.slice(2);const options={};
for(let i=0;i<args.length;i++){
 const key=args[i];
 if(['--no-start','--no-connect'].includes(key)){options[key.slice(2)]=true;continue;}
 if(!['--workspace','--project','--title','--goal','--owner','--port'].includes(key)||args[i+1]===undefined)throw new Error('Use --workspace DIRECTORY --project ID --title TITLE --goal GOAL [--owner NAME] [--port NUMBER] [--no-start] [--no-connect]');
 options[key.slice(2)]=args[++i];
}
try{
 if(Number(process.versions.node.split('.')[0])<22)throw new Error('Node.js 22 or newer is required.');
 if(!options.workspace||!options.project||!options.title)throw new Error('--workspace, --project and --title are required.');
 const workspace=fs.realpathSync(path.resolve(options.workspace));
 if(!fs.statSync(workspace).isDirectory())throw new Error('Workspace must be an existing project directory.');
 const runtime=path.join(workspace,'.agent-workboard');
 if(fs.existsSync(runtime)&&!fs.existsSync(path.join(runtime,'.workboard-owned')))throw new Error('.agent-workboard exists and was not created by this skill. Choose a different workspace or inspect it first.');
 fs.mkdirSync(runtime,{recursive:true});
 fs.cpSync(path.join(skillRoot,'assets','workboard'),runtime,{recursive:true,filter:src=>!src.endsWith('test.mjs')});
 fs.writeFileSync(path.join(runtime,'.workboard-owned'),'live-coding-kanban\n');
 const tool=path.join(runtime,'board.mjs');
 const env={...process.env,BOARD_DATA:path.join(runtime,'data','board.json')};
 execFileSync(process.execPath,[tool,'project','--project',options.project,'--title',options.title,'--goal',options.goal||'','--actor',options.owner||'Agent'],{encoding:'utf8',env});
 if(!options['no-connect']){
  const begin='<!-- live-coding-kanban:start -->',end='<!-- live-coding-kanban:end -->';
  const contract=fs.readFileSync(path.join(skillRoot,'references','project-contract.md'),'utf8');
  const block=`${begin}\n${contract}\nCurrent workboard project ID: ${options.project}\n${end}`;
  for(const name of ['AGENTS.md','CLAUDE.md','WORKBOARD.md']){
   const file=path.join(workspace,name);const old=fs.existsSync(file)?fs.readFileSync(file,'utf8'):'';
   if(old.includes(begin)!==old.includes(end))throw new Error(`Incomplete workboard markers in ${name}; repair before reconnecting.`);
   const next=old.includes(begin)?old.slice(0,old.indexOf(begin))+block+old.slice(old.indexOf(end)+end.length):old+(old.endsWith('\n')||!old?'':'\n')+'\n'+block+'\n';
   if(next!==old){if(old)fs.copyFileSync(file,file+'.workboard-backup-'+Date.now());fs.writeFileSync(file,next,'utf8');}
  }
  const ignore=path.join(workspace,'.gitignore');const old=fs.existsSync(ignore)?fs.readFileSync(ignore,'utf8'):'';
  const additions=['.agent-workboard/','*.workboard-backup-*'].filter(item=>!old.split(/\r?\n/).includes(item));
  if(additions.length)fs.writeFileSync(ignore,old+(old.endsWith('\n')||!old?'':'\n')+additions.join('\n')+'\n');
 }
 let server;
 if(!options['no-start'])server=JSON.parse(execFileSync(process.execPath,[path.join(runtime,'manage.mjs'),'start',options.port||''],{encoding:'utf8',env}));
 console.log(JSON.stringify({workspace,runtime,project:options.project,boardTool:tool,...(server||{}),reportCommand:[process.execPath,tool,'task','--project',options.project,'--id','TASK-ID','--status','doing','--actor',options.owner||'Agent']},null,2));
}catch(error){console.error(error.message);process.exitCode=1;}

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn, execFile} from 'node:child_process';
import {promisify} from 'node:util';
import net from 'node:net';
import http from 'node:http';
import {root, apply, summarize} from '../assets/workboard/store.mjs';

const run = promisify(execFile);
const blank = () => ({schema:1,revision:0,projects:[],tasks:[],events:[],updatedAt:null});
test('task lifecycle, project isolation, evidence, no-op and stale-edit protection', () => {
  const state = blank();
  apply(state, {type:'project',project:'a',title:'Project A'});
  apply(state, {type:'project',project:'b',title:'Project B'});
  apply(state, {type:'task',project:'a',id:'same',title:'Implement',actor:'Codex'});
  apply(state, {type:'task',project:'b',id:'same',title:'Other task',actor:'Claude Code'});
  apply(state, {type:'task',project:'a',id:'same',status:'doing',note:'Working'});
  apply(state, {type:'task',project:'a',id:'same',status:'blocked',note:'Missing input'});
  apply(state, {type:'task',project:'a',id:'same',status:'doing',note:'Input received',owner:'Claude Code'});
  apply(state, {type:'task',project:'a',id:'same',status:'done',evidence:'Verified the behavior in a real browser'});
  const a = state.tasks.find(t => t.projectId === 'a');
  assert.equal(a.status, 'done'); assert.equal(a.owner, 'Claude Code'); assert.match(a.evidence, /browser/);
  assert.equal(state.tasks.find(t => t.projectId === 'b').status, 'todo');
  const revision = state.revision;
  assert.equal(apply(state,{type:'task',project:'a',id:'same',status:'done'}).changed,false);
  assert.equal(state.revision,revision);
  assert.throws(() => apply(state,{type:'task',project:'a',id:'same',expectedUpdatedAt:'old',status:'todo'}), /changed while/);
  assert.throws(() => apply(state,{type:'task',project:'a',id:'same',status:'pretend'}), /status/);
  assert.throws(() => apply(state,{type:'task',project:'missing',title:'No project'}), /Create project/);
  assert.throws(() => apply(state,{type:'task',project:'a',title:' '}), /non-empty/);
  assert.equal(state.events.filter(e=>e.taskId==='same' && e.projectId==='a').length,5);
});

test('time in status survives edits, and the handoff summary carries blockers and evidence', () => {
  const state = blank();
  apply(state, {type:'project',project:'a',title:'Project A',goal:'Ship it'});
  apply(state, {type:'task',project:'a',id:'one',title:'Build',status:'doing',actor:'Codex'});
  const task = state.tasks[0];
  task.statusAt = task.updatedAt = '2020-01-01T00:00:00.000Z';
  apply(state, {type:'task',project:'a',id:'one',note:'Halfway'});
  assert.equal(task.statusAt,'2020-01-01T00:00:00.000Z'); assert.notEqual(task.updatedAt,task.statusAt);
  apply(state, {type:'task',project:'a',id:'one',status:'done',evidence:'Ran the\nsuite: 4 passed'});
  assert.equal(task.statusAt,task.updatedAt);
  delete task.statusAt; // boards written by 1.x have no statusAt
  apply(state, {type:'task',project:'a',id:'one',note:'Still done'});
  assert.ok(task.statusAt);
  apply(state, {type:'task',project:'a',id:'two',title:'Deploy',status:'blocked',note:'Needs a token',actor:'Codex',owner:'Claude Code'});
  apply(state, {type:'note',project:'a',note:'Scope reduced',actor:'You'});
  const text = summarize(state,'a');
  assert.match(text,/^# Handoff: Project A\n\nGoal: Ship it/);
  assert.match(text,/Progress: 1\/2 done, 0 in progress, 1 blocked, 0 up next/);
  assert.match(text,/## Blocked\n- `two` Deploy \(owner: Claude Code\)\n  - Blocker: Needs a token/);
  assert.match(text,/  - Evidence: Ran the suite: 4 passed/);
  assert.match(text,/## Project notes\n- .* You: Scope reduced/);
  assert.ok(text.indexOf('## Blocked') < text.indexOf('## Done'));
  assert.equal(summarize(state),text);
  assert.throws(() => summarize(state,'missing'), /does not exist/);
  assert.throws(() => summarize(blank()), /No project/);
});

test('CLI persists concurrent writers without losing updates', async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(),'workboard-test-'));
  const data = path.join(temp,'board.json');
  const options = {env:{...process.env, BOARD_DATA:data}};
  try {
    await run(process.execPath,[path.join(root,'board.mjs'),'project','--project','a','--title','Test'],options);
    await Promise.all(Array.from({length:12},(_,i)=>run(process.execPath,[path.join(root,'board.mjs'),'task','--project','a','--id',`task-${i}`,'--title',`Task ${i}`],options)));
    const state=JSON.parse(fs.readFileSync(data,'utf8'));
    assert.equal(state.tasks.length,12); assert.equal(state.revision,13); assert.equal(state.events.length,13);
    assert.equal(fs.existsSync(data+'.lock'),false);
  } finally { fs.rmSync(temp,{recursive:true,force:true}); }
});

async function freePort() { const s=net.createServer(); await new Promise(r=>s.listen(0,'127.0.0.1',r)); const p=s.address().port; await new Promise(r=>s.close(r)); return p; }
async function startServer(port, data) {
  const child=spawn(process.execPath,[path.join(root,'server.mjs')],{env:{...process.env,BOARD_PORT:String(port),BOARD_DATA:data},stdio:['ignore','pipe','pipe']});
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Server startup timed out')),6000);child.stdout.once('data',()=>{clearTimeout(timer);resolve()});child.once('error',reject);child.once('exit',code=>{if(code)reject(new Error(`Server exited ${code}`))});});
  return child;
}
async function stopServer(child) { const exited=new Promise(r=>child.once('exit',r)); child.kill(); await exited; }
test('live events, safe local mutations, restart persistence, and unavailable routes', async () => {
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'workboard-http-'));
  const data=path.join(temp,'board.json'); const port=await freePort(); const base=`http://127.0.0.1:${port}`;
  let child;
  try {
    child=await startServer(port,data);
    const initial=await (await fetch(base+'/api/state')).json();
    assert.equal(initial.state.revision,0);
    const command={type:'project',project:'live',title:'Live test'};
    assert.equal((await fetch(base+'/api/command',{method:'POST',body:JSON.stringify(command)})).status,403);
    assert.equal((await fetch(base+'/api/state',{headers:{Origin:'https://external.example'}})).status,403);
    const invalidHost = await new Promise((resolve,reject)=>{ const req=http.get(base+'/api/state',{headers:{Host:'external.example'}},res=>{res.resume();resolve(res.statusCode)});req.on('error',reject); });
    assert.equal(invalidHost,403);
    const streamControl=new AbortController();
    const stream=await fetch(base+'/api/events',{signal:streamControl.signal});
    const reader=stream.body.getReader(); const first=await reader.read(); assert.match(new TextDecoder().decode(first.value),/event: board/);
    const mutation=await fetch(base+'/api/command',{method:'POST',headers:{'Content-Type':'application/json','X-Board-Token':initial.token},body:JSON.stringify(command)});
    assert.equal(mutation.status,200);
    const next=await reader.read(); assert.match(new TextDecoder().decode(next.value),/Live test/);
    streamControl.abort();
    const summary=await fetch(base+'/api/summary?project=live');
    assert.match(summary.headers.get('content-type'),/markdown/); assert.match(await summary.text(),/# Handoff: Live test/);
    assert.equal((await fetch(base+'/api/summary?project=missing')).status,400);
    for (const asset of ['/','/app.js','/field.js','/style.css']) assert.equal((await fetch(base+asset)).status,200);
    assert.equal((await fetch(base+'/data/board.json')).status,404);
    assert.equal((await fetch(base+'/../server.mjs')).status,404);
    await stopServer(child); child=null;
    child=await startServer(port,data);
    const reloaded=await (await fetch(base+'/api/state')).json();
    assert.equal(reloaded.state.projects[0].title,'Live test'); assert.notEqual(reloaded.token,initial.token);
  } finally { if(child)await stopServer(child); fs.rmSync(temp,{recursive:true,force:true}); }
});

test('portable setup preserves instructions, repeated setup retains tasks, and state is project-local', async () => {
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'workboard setup with spaces-'));
  const skill=path.resolve(root,'../..');
  try {
    fs.writeFileSync(path.join(temp,'AGENTS.md'),'# Existing rules\nKeep these rules.\n');
    const args=[path.join(skill,'scripts/setup.mjs'),'--workspace',temp,'--project','portable','--title','Portable task','--no-start'];
    await run(process.execPath,args,{env:{...process.env,BOARD_DATA:path.join(temp,'wrong-global-data.json')}});
    const first=fs.readFileSync(path.join(temp,'AGENTS.md'),'utf8');
    assert.ok(first.startsWith('# Existing rules\nKeep these rules.\n'));
    assert.ok(fs.existsSync(path.join(temp,'CLAUDE.md')));
    assert.ok(fs.existsSync(path.join(temp,'WORKBOARD.md')));
    assert.equal(fs.existsSync(path.join(temp,'wrong-global-data.json')),false);
    const tool=path.join(temp,'.agent-workboard/board.mjs');
    await run(process.execPath,[tool,'task','--project','portable','--id','carry','--title','Retain me','--actor','Codex']);
    await run(process.execPath,args);
    assert.equal(fs.readFileSync(path.join(temp,'AGENTS.md'),'utf8'),first);
    assert.equal(JSON.parse(fs.readFileSync(path.join(temp,'.agent-workboard/data/board.json'),'utf8')).tasks[0].title,'Retain me');
    assert.match(fs.readFileSync(path.join(temp,'.gitignore'),'utf8'),/\.agent-workboard/);
    assert.equal(fs.readdirSync(temp).filter(name=>name.includes('backup')).length,1);
  } finally { fs.rmSync(temp,{recursive:true,force:true}); }
});

test('setup avoids occupied ports, resumes owned server, and stops only that server', async () => {
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'workboard-port-'));
  const skill=path.resolve(root,'../..');const occupied=net.createServer();
  await new Promise(r=>occupied.listen(0,'127.0.0.1',r));const port=occupied.address().port;
  let info;
  try {
    const args=[path.join(skill,'scripts/setup.mjs'),'--workspace',temp,'--project','port','--title','Port test','--port',String(port),'--no-connect'];
    info=JSON.parse((await run(process.execPath,args)).stdout);
    assert.notEqual(info.port,port);
    const again=JSON.parse((await run(process.execPath,args)).stdout);
    assert.equal(again.pid,info.pid);assert.equal(again.reused,true);
    // An upgraded runtime must replace its own older viewer instead of reusing stale server code.
    const store=path.join(temp,'.agent-workboard/store.mjs');
    fs.writeFileSync(store,fs.readFileSync(store,'utf8').replace(/version = '[^']+'/,"version = '99.0.0'"));
    const upgraded=JSON.parse((await run(process.execPath,[path.join(temp,'.agent-workboard/manage.mjs'),'start'])).stdout);
    assert.equal(upgraded.version,'99.0.0');assert.equal(upgraded.reused,false);assert.notEqual(upgraded.pid,info.pid);info=upgraded;
    const stopped=JSON.parse((await run(process.execPath,[path.join(temp,'.agent-workboard/manage.mjs'),'stop'])).stdout);
    assert.equal(stopped.stopped,true);info=null;
    assert.ok(occupied.listening);
  } finally {
    if(info)await run(process.execPath,[path.join(temp,'.agent-workboard/manage.mjs'),'stop']).catch(()=>{});
    await new Promise(r=>occupied.close(r));fs.rmSync(temp,{recursive:true,force:true});
  }
});

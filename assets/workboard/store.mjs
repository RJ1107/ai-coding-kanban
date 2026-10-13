import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';

export const root = path.dirname(fileURLToPath(import.meta.url));
export const dataFile = path.resolve(process.env.BOARD_DATA || path.join(root, 'data', 'board.json'));
export const version = '2.1.0';
export const statuses = ['todo', 'doing', 'done', 'blocked'];
const empty = () => ({schema: 1, revision: 0, projects: [], tasks: [], events: [], updatedAt: null});
export function readState() {
  if (!fs.existsSync(dataFile)) return empty();
  const state = JSON.parse(fs.readFileSync(dataFile, 'utf8').replace(/^\uFEFF/, ''));
  if (state.schema !== 1 || !Array.isArray(state.tasks) || !Array.isArray(state.projects) || !Array.isArray(state.events)) throw new Error('Invalid board data. Restore data/board.json from a backup.');
  return state;
}
function str(value, name, max = 2000) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error(`${name} must be non-empty text, at most ${max} characters.`);
  return value.trim();
}
function optional(value, name, max = 2000) { return value === '' ? '' : str(value, name, max); }
export function apply(state, command) {
  if (!command || typeof command !== 'object' || Array.isArray(command)) throw new Error('Expected a command object.');
  const now = new Date().toISOString();
  const actor = str(command.actor || 'Agent', 'actor', 80);
  const projectId = str(command.project || 'default', 'project', 100);
  const project = state.projects.find(p => p.id === projectId);
  let event;
  let result;
  if (command.type === 'project') {
    const title = str(command.title, 'title', 160);
    const goal = optional(command.goal ?? '', 'goal');
    if (project) Object.assign(project, {title, goal, updatedAt: now});
    else state.projects.push({id: projectId, title, goal, createdAt: now, updatedAt: now});
    result = projectId;
    event = {kind: 'project', title, note: goal};
  } else {
    if (!project) throw new Error(`Create project '${projectId}' first.`);
    if (command.type === 'task') {
      const id = str(command.id || randomUUID(), 'id', 100);
      const existing = state.tasks.find(t => t.id === id && t.projectId === projectId);
      if (existing && command.expectedUpdatedAt && command.expectedUpdatedAt !== existing.updatedAt) throw new Error('This task changed while you were editing. Reopen it to review the latest update.');
      const status = command.status ?? existing?.status ?? 'todo';
      if (!statuses.includes(status)) throw new Error('status must be todo, doing, done, or blocked.');
      const title = str(command.title ?? existing?.title, 'title', 180);
      const note = optional(command.note ?? existing?.note ?? '', 'note');
      const evidence = optional(command.evidence ?? existing?.evidence ?? '', 'evidence', 4000);
      const owner = str(command.owner || existing?.owner || actor, 'owner', 80);
      const from = existing?.status ?? null;
      const changes = {title, status, note, evidence, owner};
      if (existing && Object.entries(changes).every(([k, v]) => existing[k] === v)) return {changed: false, result: id};
      // statusAt records when the card entered its current column, so the viewer can show real elapsed time.
      if (existing) Object.assign(existing, changes, {updatedAt: now, statusAt: from === status ? existing.statusAt ?? existing.updatedAt : now});
      else state.tasks.push({id, projectId, ...changes, createdAt: now, updatedAt: now, statusAt: now});
      event = {kind: existing ? 'update' : 'create', taskId: id, title, from, to: status, note, evidence};
      result = id;
    } else if (command.type === 'note') {
      event = {kind: 'note', title: 'Project update', note: str(command.note, 'note')};
      result = projectId;
    } else throw new Error('type must be project, task, or note.');
    project.updatedAt = now;
  }
  state.revision += 1;
  state.updatedAt = now;
  state.events.unshift({id: randomUUID(), at: now, actor, projectId, ...event});
  state.events = state.events.slice(0, 500);
  return {changed: true, result};
}
const headings = {doing: 'In progress', blocked: 'Blocked', todo: 'Up next', done: 'Done'};
// Markdown a person or the next assistant can read to continue without opening the viewer.
export function summarize(state, projectId) {
  const project = state.projects.find(p => p.id === projectId) || (projectId ? null : state.projects[0]);
  if (!project) throw new Error(projectId ? `Project '${projectId}' does not exist.` : 'No project exists yet.');
  const tasks = state.tasks.filter(t => t.projectId === project.id);
  const count = status => tasks.filter(t => t.status === status).length;
  const lines = [`# Handoff: ${project.title}`, ''];
  if (project.goal) lines.push(`Goal: ${project.goal}`, '');
  lines.push(`Progress: ${count('done')}/${tasks.length} done, ${count('doing')} in progress, ${count('blocked')} blocked, ${count('todo')} up next. Project ID \`${project.id}\`, revision r${state.revision}, updated ${project.updatedAt}.`);
  for (const status of ['doing', 'blocked', 'todo', 'done']) {
    const group = tasks.filter(t => t.status === status);
    if (!group.length) continue;
    lines.push('', `## ${headings[status]}`);
    for (const task of group) {
      lines.push(`- \`${task.id}\` ${task.title} (owner: ${task.owner})`);
      if (task.note) lines.push(`  - ${status === 'blocked' ? 'Blocker' : 'Latest'}: ${task.note.replace(/\s+/g, ' ')}`);
      if (task.evidence) lines.push(`  - Evidence: ${task.evidence.replace(/\s+/g, ' ')}`);
    }
  }
  const notes = state.events.filter(e => e.projectId === project.id && e.kind === 'note').slice(0, 5);
  if (notes.length) lines.push('', '## Project notes', ...notes.map(e => `- ${e.at} ${e.actor}: ${e.note.replace(/\s+/g, ' ')}`));
  return lines.join('\n') + '\n';
}
export async function update(command) {
  fs.mkdirSync(path.dirname(dataFile), {recursive: true});
  const lockFile = dataFile + '.lock';
  let lock;
  for (let i = 0; i < 80; i++) {
    try { lock = fs.openSync(lockFile, 'wx'); break; }
    catch (error) {
      if (error.code !== 'EEXIST') throw error;
      // Recover only a lock whose recorded process has exited, never a live writer.
      try {
        const pid = Number(fs.readFileSync(lockFile, 'utf8'));
        if (pid > 0) { try { process.kill(pid, 0); } catch (e) { if (e.code === 'ESRCH') fs.unlinkSync(lockFile); } }
      } catch {}
      await new Promise(r => setTimeout(r, 50));
    }
  }
  if (lock === undefined) throw new Error('Board is busy. Retry the update.');
  let temp;
  try {
    fs.writeFileSync(lock, String(process.pid));
    const state = readState();
    const result = apply(state, command);
    if (result.changed) {
      temp = dataFile + '.' + randomUUID() + '.tmp';
      fs.writeFileSync(temp, JSON.stringify(state, null, 2) + '\n');
      fs.renameSync(temp, dataFile);
    }
    return {...result, revision: state.revision};
  } finally {
    fs.closeSync(lock);
    fs.unlinkSync(lockFile);
    if (temp && fs.existsSync(temp)) fs.unlinkSync(temp);
  }
}

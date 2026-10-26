import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';

export const root = path.dirname(fileURLToPath(import.meta.url));
export const dataFile = path.resolve(process.env.BOARD_DATA || path.join(root, 'data', 'board.json'));
export const version = '2.4.0';
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
// The languages a project's own text is written in. New projects are written in English and Chinese, so every title,
// note and piece of evidence is expected twice; a project made before this setting existed, or set to "en", in English
// only. Accepts "en", "zh", "en,zh" or an array.
const LANGUAGES = ['en', 'zh'];
function languages(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  const list = [...new Set((Array.isArray(value) ? value : String(value).split(',')).map(item => String(item).trim()).filter(Boolean))];
  if (!list.length || list.some(item => !LANGUAGES.includes(item))) throw new Error('languages must be en, zh or en,zh.');
  return list;
}
// Which Chinese copies a bilingual record still lacks: a field that has text in one language but not the other.
const missingChinese = (record, pairs) => pairs.filter(([en, zh]) => record[en] && !record[zh]).map(([, zh]) => zh);
export function apply(state, command) {
  if (!command || typeof command !== 'object' || Array.isArray(command)) throw new Error('Expected a command object.');
  const now = new Date().toISOString();
  const actor = str(command.actor || 'Agent', 'actor', 80);
  const projectId = str(command.project || 'default', 'project', 100);
  const project = state.projects.find(p => p.id === projectId);
  let event;
  let result;
  let missing = [];
  if (command.type === 'project') {
    const title = str(command.title, 'title', 160);
    const goal = optional(command.goal ?? '', 'goal');
    // A board can carry a second language for the text an assistant wrote. Empty means the
    // viewer falls back to the original, so a board that never sets them behaves as before.
    const titleZh = optional(command.titleZh ?? project?.titleZh ?? '', 'titleZh', 160);
    const goalZh = optional(command.goalZh ?? project?.goalZh ?? '', 'goalZh');
    const langs = languages(command.languages, project ? project.languages ?? ['en'] : ['en', 'zh']);
    if (project) Object.assign(project, {title, titleZh, goal, goalZh, languages: langs, updatedAt: now});
    else state.projects.push({id: projectId, title, titleZh, goal, goalZh, languages: langs, createdAt: now, updatedAt: now});
    if (langs.includes('zh')) missing = missingChinese({title, titleZh, goal, goalZh}, [['title', 'titleZh'], ['goal', 'goalZh']]);
    result = projectId;
    event = {kind: 'project', title, titleZh, note: goal, noteZh: goalZh};
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
      const titleZh = optional(command.titleZh ?? existing?.titleZh ?? '', 'titleZh', 180);
      const noteZh = optional(command.noteZh ?? existing?.noteZh ?? '', 'noteZh');
      const evidenceZh = optional(command.evidenceZh ?? existing?.evidenceZh ?? '', 'evidenceZh', 4000);
      const owner = str(command.owner || existing?.owner || actor, 'owner', 80);
      const from = existing?.status ?? null;
      const changes = {title, titleZh, status, note, noteZh, evidence, evidenceZh, owner};
      if (existing && Object.entries(changes).every(([k, v]) => existing[k] === v)) return {changed: false, result: id};
      // statusAt records when the card entered its current column, so the viewer can show real elapsed time.
      if (existing) Object.assign(existing, changes, {updatedAt: now, statusAt: from === status ? existing.statusAt ?? existing.updatedAt : now});
      else state.tasks.push({id, projectId, ...changes, createdAt: now, updatedAt: now, statusAt: now});
      event = {kind: existing ? 'update' : 'create', taskId: id, title, titleZh, from, to: status,
               note, noteZh, evidence, evidenceZh};
      result = id;
      if ((project.languages ?? ['en']).includes('zh')) missing = missingChinese(changes, [['title', 'titleZh'], ['note', 'noteZh'], ['evidence', 'evidenceZh']]);
    } else if (command.type === 'note') {
      event = {kind: 'note', title: 'Project update', titleZh: '项目备注',
               note: str(command.note, 'note'), noteZh: optional(command.noteZh ?? '', 'noteZh')};
      result = projectId;
      if ((project.languages ?? ['en']).includes('zh')) missing = missingChinese(event, [['note', 'noteZh']]);
    } else if (command.type === 'archive') {
      // A soft delete: finished work leaves the lists but keeps its cards, its history and
      // its handoff. Nothing is removed from disk, and unarchive puts it back untouched.
      const archived = command.archived === false || command.archived === 'false' ? null : now;
      if (project.archivedAt === archived) return {changed: false, result: projectId};
      project.archivedAt = archived;
      project.updatedAt = now;
      event = {kind: 'archive', title: project.title, titleZh: project.titleZh || '',
               note: archived ? 'Archived' : 'Restored', noteZh: archived ? '已归档' : '已恢复'};
      result = projectId;
    } else throw new Error('type must be project, task, note, or archive.');
    project.updatedAt = now;
  }
  state.revision += 1;
  state.updatedAt = now;
  state.events.unshift({id: randomUUID(), at: now, actor, projectId, ...event});
  state.events = state.events.slice(0, 500);
  // missingZh names the Chinese copies a bilingual project still expects; the command line warns about them.
  return {changed: true, result, ...(missing.length ? {missingZh: missing} : {})};
}
const headings = {
  en: {doing: 'In progress', blocked: 'Blocked', todo: 'Up next', done: 'Done',
       handoff: 'Handoff', goal: 'Goal', progress: 'Progress',
       done_word: 'done', in_progress: 'in progress', blocked_word: 'blocked', up_next: 'up next',
       project_id: 'Project ID', revision: 'revision', updated: 'updated', owner: 'owner',
       blocker: 'Blocker', latest: 'Latest', evidence: 'Evidence', notes: 'Project notes'},
  zh: {doing: '进行中', blocked: '受阻', todo: '待办', done: '已完成',
       handoff: '交接', goal: '目标', progress: '进度',
       done_word: '已完成', in_progress: '进行中', blocked_word: '受阻', up_next: '待办',
       project_id: '项目 ID', revision: '版本', updated: '更新于', owner: '负责人',
       blocker: '阻塞原因', latest: '最新进展', evidence: '验证', notes: '项目备注'},
};
/* The handoff is read by the next assistant and by a person. It follows the language it
   was asked for, and falls back to whatever text the card carries in the other one. */
const say = (record, field, lang) => (lang === 'zh' && record?.[field + 'Zh']) || record?.[field] || '';
// Markdown a person or the next assistant can read to continue without opening the viewer.
export function summarize(state, projectId, lang = 'en') {
  const word = headings[lang] ? headings[lang] : headings.en;
  const project = state.projects.find(p => p.id === projectId) || (projectId ? null : state.projects[0]);
  if (!project) throw new Error(projectId ? `Project '${projectId}' does not exist.` : 'No project exists yet.');
  const tasks = state.tasks.filter(t => t.projectId === project.id);
  const count = status => tasks.filter(t => t.status === status).length;
  const lines = [`# ${word.handoff}: ${say(project, 'title', lang)}`, ''];
  const goal = say(project, 'goal', lang);
  if (goal) lines.push(`${word.goal}: ${goal}`, '');
  lines.push(`${word.progress}: ${count('done')}/${tasks.length} ${word.done_word}, ${count('doing')} ${word.in_progress}, ${count('blocked')} ${word.blocked_word}, ${count('todo')} ${word.up_next}. ${word.project_id} \`${project.id}\`, ${word.revision} r${state.revision}, ${word.updated} ${project.updatedAt}.`);
  for (const status of ['doing', 'blocked', 'todo', 'done']) {
    const group = tasks.filter(t => t.status === status);
    if (!group.length) continue;
    lines.push('', `## ${word[status]}`);
    for (const task of group) {
      lines.push(`- \`${task.id}\` ${say(task, 'title', lang)} (${word.owner}: ${task.owner})`);
      const note = say(task, 'note', lang), evidence = say(task, 'evidence', lang);
      if (note) lines.push(`  - ${status === 'blocked' ? word.blocker : word.latest}: ${note.replace(/\s+/g, ' ')}`);
      if (evidence) lines.push(`  - ${word.evidence}: ${evidence.replace(/\s+/g, ' ')}`);
    }
  }
  const notes = state.events.filter(e => e.projectId === project.id && e.kind === 'note').slice(0, 5);
  if (notes.length) {
    lines.push('', `## ${word.notes}`,
      ...notes.map(e => `- ${e.at} ${e.actor}: ${say(e, 'note', lang).replace(/\s+/g, ' ')}`));
  }
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

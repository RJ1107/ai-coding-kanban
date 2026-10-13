const $ = id => document.getElementById(id);
const labels = {en: {projects:'PROJECTS',newProject:'+ New project',localOnly:'Stored on this computer',workspace:'Workspace',compact:'Side panel',expanded:'Full board',eyebrow:'YOUR ASSISTANT. YOUR PROGRESS.',newTask:'+ Add task',focus:'WORKING ON NOW',boardHelp:'Open a card for context and evidence · Drag to change status',activity:'Recent activity',recorded:'A record of what changed',footer:'Progress reported by your coding assistant. Connection status refers to the board service.',taskDetail:'TASK DETAILS',status:'Status',note:'Latest progress / next step',evidence:'Results and verification',cancel:'Cancel',save:'Save changes',name:'Title',create:'Create',goal:'Project goal',live:'Live updates',connecting:'Connecting',offline:'Reconnecting',todo:'Up next',doing:'In progress',done:'Done',blocked:'Blocked',empty:'No tasks here yet',verified:'Evidence',unverified:'No evidence attached yet',noFocus:'No task is in progress',noFocusNote:'The assistant updates this when work starts.',allDone:'The current plan is complete',allDoneNote:'Open the cards to review results and verification.',noProject:'Create a project to track the work',noProjectGoal:'Your assistant creates tasks after understanding the goal, then keeps them up to date.',taskCount:n=>`${n} tasks`,updated:'Updated',history:'Card history',saved:'Changes saved',created:'Created',emptyActivity:'Task changes will appear here.',added:'created',moved:'moved',edited:'updated',projectUpdated:'updated project',projectNote:'added an update',newProjectTitle:'New project',newTaskTitle:'Add task',selectProject:'Create a project first',stale:'Showing the last known state while disconnected.'}
};
let lang = "en";
let state = {projects:[], tasks:[], events:[]};
let token;
let selectedProject = new URLSearchParams(location.search).get('project') || localStorage.getItem('workboard-project');
let selectedTask;
let selectedUpdatedAt;
let createType;
let createStatus = 'todo';
let connected = false;
let compact = localStorage.getItem('workboard-compact') === 'true';
let source;
const t = key => labels[lang][key] || key;
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clock = value => value ? new Date(value).toLocaleTimeString(lang === 'zh' ? 'zh-CN' : 'en-US', {hour:'2-digit', minute:'2-digit'}) : '—';
const fullTime = value => new Date(value).toLocaleString(lang === 'zh' ? 'zh-CN' : 'en-US');
const statuses = ['todo', 'doing', 'done', 'blocked'];
function connection() { $('connection').textContent = t(connected ? 'live' : 'offline'); $('connection').classList.toggle('offline', !connected); $('connection').title = connected ? '' : t('stale'); }
function eventText(e) {
  if (e.kind === 'create') return `${t('added')} · ${e.title}`;
  if (e.kind === 'update') return `${t(e.from !== e.to ? 'moved' : 'edited')} · ${e.title}${e.from !== e.to ? ` · ${t(e.from)} → ${t(e.to)}` : ''}`;
  if (e.kind === 'project') return `${t('projectUpdated')} · ${e.title}`;
  return t('projectNote');
}
function render() {
  document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
  document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
  document.body.classList.toggle('compact', compact);
  $('compact').textContent = t(compact ? 'expanded' : 'compact');
  $('compact').setAttribute('aria-pressed', String(compact));
  connection();
  let project = state.projects.find(p => p.id === selectedProject) || state.projects[0];
  if (project) selectedProject = project.id;
  $('projects').innerHTML = state.projects.map(p => `<button class="project-link${p.id === selectedProject ? ' active' : ''}" data-project="${esc(p.id)}"${p.id === selectedProject ? ' aria-current="page"' : ''}>${esc(p.title)}</button>`).join('');
  $('title').textContent = project?.title || t('noProject');
  $('crumb').textContent = project?.title || 'Workboard';
  $('goal').textContent = project?.goal || t('noProjectGoal');
  document.title = (project?.title || 'Agent Workboard') + ' · Workboard';
  const tasks = state.tasks.filter(task => task.projectId === selectedProject);
  const doing = tasks.find(task => task.status === 'doing');
  const blocked = tasks.find(task => task.status === 'blocked');
  const allDone = tasks.length > 0 && tasks.every(task => task.status === 'done');
  const focus = doing || blocked;
  $('focus-title').textContent = focus?.title || t(allDone ? 'allDone' : 'noFocus');
  $('focus-note').textContent = focus?.note || t(allDone ? 'allDoneNote' : 'noFocusNote');
  $('focus').querySelector('.focus-label').textContent = blocked && !doing ? t('blocked') : t('focus');
  $('updated').textContent = project ? `${t('updated')} ${clock(project.updatedAt)}` : '';
  $('task-count').textContent = labels[lang].taskCount(tasks.length);
  $('revision').textContent = `r${state.revision || 0}`;
  const completed = tasks.filter(task => task.status === 'done').length;
  $('completion').textContent = `${completed} / ${tasks.length} completed`;
  $('progress-fill').style.width = `${tasks.length ? 100 * completed / tasks.length : 0}%`;
  $('progress-track').setAttribute('aria-valuenow', String(completed));
  $('progress-track').setAttribute('aria-valuemax', String(Math.max(1, tasks.length)));
  $('board').innerHTML = statuses.map(status => {
    const group = tasks.filter(task => task.status === status);
    return `<section class="column ${status}" data-status="${status}" aria-label="${t(status)}"><div class="column-head"><span class="status-dot"></span>${t(status)}<span class="count">${group.length}</span><button class="plus" data-add="${status}" aria-label="${esc(t('newTaskTitle') + ' · ' + t(status))}">+</button></div>${group.length ? group.map(task => `<button class="task" draggable="true" data-task="${esc(task.id)}"><span class="task-code"><span>${esc(task.id)}</span><span>···</span></span><h3>${esc(task.title)}</h3><p class="task-note">${esc(task.note || '—')}</p><span class="task-foot"><span class="avatar">${esc(task.owner?.slice(0,1))}</span><span>${esc(task.owner)}</span>${task.evidence ? `<span class="evidence-tag" title="${esc(task.evidence)}">✓ ${t('verified')}</span>` : ''}</span></button>`).join('') : `<div class="empty">${t('empty')}</div>`}</section>`;
  }).join('');
  const events = state.events.filter(e => e.projectId === selectedProject).slice(0,8);
  $('events').innerHTML = events.length ? events.map(e => `<li class="event"><span class="event-mark" aria-hidden="true">${e.to === 'done' ? '✓' : '·'}</span><div><p><strong>${esc(e.actor)}</strong> ${esc(eventText(e))}</p>${e.note ? `<small>${esc(e.note)}</small>` : ''}</div><time datetime="${esc(e.at)}" title="${esc(fullTime(e.at))}">${clock(e.at)}</time></li>`).join('') : `<li class="empty">${t('emptyActivity')}</li>`;
  // Do not overwrite a person's unsaved edits when an agent update arrives.
  if ($('detail').open) renderHistory();
}
function toast(message) { $('toast').textContent = message; $('toast').hidden = false; clearTimeout(toast.timer); toast.timer = setTimeout(() => $('toast').hidden = true, 4500); }
async function send(command) {
  const res = await fetch('/api/command', {method:'POST', headers:{'Content-Type':'application/json','X-Board-Token':token}, body:JSON.stringify(command)});
  const result = await res.json();
  if (!res.ok) throw new Error(result.error);
  return result;
}
function renderHistory() {
  const events = state.events.filter(e => e.taskId === selectedTask && e.projectId === selectedProject).slice(0,5);
  $('task-history').innerHTML = `<strong>${t('history')}</strong>${events.map(e => `<p>${esc(fullTime(e.at))} · ${esc(e.actor)}<br>${esc(eventText(e))}</p>`).join('')}`;
}
function openTask(id) {
  const task = state.tasks.find(task => task.id === id && task.projectId === selectedProject);
  if (!task) return;
  selectedTask = id;
  selectedUpdatedAt = task.updatedAt;
  $('detail-title').textContent = task.title;
  $('detail-meta').textContent = `${task.id} · ${task.owner} · ${t('updated')} ${fullTime(task.updatedAt)}${task.status === 'done' && !task.evidence ? ' · ' + t('unverified') : ''}`;
  $('detail-status').innerHTML = statuses.map(s => `<option value="${s}">${t(s)}</option>`).join('');
  $('detail-status').value = task.status;
  $('detail-note').value = task.note;
  $('detail-evidence').value = task.evidence;
  renderHistory();
  $('detail').showModal();
}
function openCreate(type, status = 'todo') {
  if (type === 'task' && !state.projects.some(p => p.id === selectedProject)) return toast(t('selectProject'));
  createType = type; createStatus = status;
  $('create-heading').textContent = t(type === 'project' ? 'newProjectTitle' : 'newTaskTitle');
  $('create-note-label').textContent = t(type === 'project' ? 'goal' : 'note');
  $('create-form').reset();
  $('create').showModal();
}
document.addEventListener('click', e => {
  const close = e.target.closest('[data-close]');
  if (close) $(close.dataset.close).close();
  const project = e.target.closest('[data-project]');
  if (project) { selectedProject = project.dataset.project; localStorage.setItem('workboard-project', selectedProject); render(); }
  const task = e.target.closest('[data-task]');
  if (task) openTask(task.dataset.task);
  const add = e.target.closest('[data-add]');
  if (add) openCreate('task', add.dataset.add);
});
$('new-project').onclick = () => openCreate('project');
$('new-task').onclick = () => openCreate('task');
$('compact').onclick = () => { compact = !compact; localStorage.setItem('workboard-compact', String(compact)); render(); };
$('detail-form').onsubmit = async e => {
  e.preventDefault();
  const submit = e.submitter; submit.disabled = true;
  try { await send({type:'task', project:selectedProject, id:selectedTask, expectedUpdatedAt:selectedUpdatedAt, status:$('detail-status').value, note:$('detail-note').value, evidence:$('detail-evidence').value}); $('detail').close(); toast(t('saved')); }
  catch (error) { toast(error.message); } finally { submit.disabled = false; }
};
$('create-form').onsubmit = async e => {
  e.preventDefault(); const submit = e.submitter; submit.disabled = true;
  try {
    const id = (createType === 'project' ? 'project-' : 'task-') + crypto.randomUUID().slice(0,8);
    const command = {type:createType, title:$('create-title').value};
    if (createType === 'project') Object.assign(command, {project:id, goal:$('create-note').value});
    else Object.assign(command, {project:selectedProject, id, status:createStatus, note:$('create-note').value, owner:'You'});
    await send(command);
    if (createType === 'project') { selectedProject = id; localStorage.setItem('workboard-project', id); }
    $('create').close(); toast(t('created'));
    await load();
  } catch (error) { toast(error.message); } finally { submit.disabled = false; }
};
let dragging;
$('board').addEventListener('dragstart', e => { const task = e.target.closest('[data-task]'); if (task) { dragging = task.dataset.task; e.dataTransfer.setData('text/plain', dragging); e.dataTransfer.effectAllowed = 'move'; } });
$('board').addEventListener('dragover', e => { const col = e.target.closest('[data-status]'); if (dragging && col) { e.preventDefault(); document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over')); col.classList.add('drag-over'); } });
$('board').addEventListener('dragend', () => { dragging = null; document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over')); });
$('board').addEventListener('drop', async e => { const col = e.target.closest('[data-status]'); if (!dragging || !col) return; e.preventDefault(); const id = dragging; dragging = null; document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over')); try { await send({type:'task',project:selectedProject,id,status:col.dataset.status}); } catch (error) { toast(error.message); } });
async function load() { const res = await fetch('/api/state'); if (!res.ok) throw new Error('Board unavailable'); const value = await res.json(); state = value.state; token = value.token; render(); }
async function start() {
  try {
    await load();
    source?.close(); source = new EventSource('/api/events');
    source.addEventListener('board', e => { state = JSON.parse(e.data); connected = true; render(); });
    source.onopen = () => { connected = true; connection(); load().catch(() => {}); };
    source.onerror = () => { connected = false; connection(); };
  } catch { connected = false; connection(); setTimeout(start, 2000); }
}
// Refresh the mutation token after a server restart, without losing card selection.
document.addEventListener('visibilitychange', () => { if (!document.hidden) load().catch(() => {}); });
window.addEventListener('online', () => load().catch(() => {}));
render(); start();

import {createField} from './field.js';

const $ = id => document.getElementById(id);
const statuses = ['todo', 'doing', 'done', 'blocked'];
const names = {todo: 'Up next', doing: 'In progress', done: 'Done', blocked: 'Blocked'};
const colors = {todo: '#7f8ca0', doing: '#59c8ff', done: '#4df0b4', blocked: '#ff6f4d'};
const still = matchMedia('(prefers-reduced-motion: reduce)');
const field = createField($('field'));

let state = {projects: [], tasks: [], events: [], revision: 0};
let token, source, connected = false, booted = false;
let selectedProject = new URLSearchParams(location.search).get('project') || localStorage.getItem('workboard-project');
let renderedProject, selectedTask, selectedUpdatedAt, createType, ownerFilter = null;
const cards = new Map();      // task id -> element, for the selected project
const seenStatus = new Map(); // task id -> status at the previous render
const seenEvents = new Set();
let cometAngle = 0, shownDone = null, shownFocus = null;

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const pad = n => String(n).padStart(2, '0');
const clock = value => new Date(value).toLocaleTimeString('en-US', {hour: '2-digit', minute: '2-digit', hour12: false});
const fullTime = value => new Date(value).toLocaleString('en-US');
function age(since, precise) {
  const s = Math.max(0, Math.floor((Date.now() - new Date(since)) / 1000));
  const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60);
  if (precise) return `${h ? pad(h) + ':' : ''}${pad(m)}:${pad(s % 60)}`;
  return h ? `${h}h ${pad(m)}m` : m ? `${m}m` : `${s}s`;
}
const known = {'You': 'a0', 'Claude Code': 'a1', 'Codex': 'a2'};
const agentClass = name => known[name] || 'a' + (3 + [...String(name)].reduce((sum, c) => sum + c.charCodeAt(0), 0) % 4);
function monogram(name) {
  const words = String(name || '?').trim().split(/\s+/);
  return (words.length > 1 ? words[0][0] + words[1][0] : words[0].slice(0, 2)).toUpperCase();
}
function replay(el, name) { el.classList.remove(name); void el.getBoundingClientRect(); el.classList.add(name); }
function toast(message) { $('toast').textContent = message; $('toast').hidden = false; clearTimeout(toast.timer); toast.timer = setTimeout(() => $('toast').hidden = true, 4200); }

function eventLine(e) {
  const who = `<b>${esc(e.actor)}</b>`, what = `<em>${esc(e.title)}</em>`;
  if (e.kind === 'create') return `${who} added ${what}`;
  if (e.kind === 'update') return e.from !== e.to ? `${who} moved ${what}<span class="route">${names[e.from]} → ${names[e.to]}</span>` : `${who} updated ${what}`;
  if (e.kind === 'project') return `${who} set up the project`;
  return `${who} left a project note`;
}
function eventItem(e, fresh) {
  const detail = e.to === 'done' && e.evidence ? e.evidence : e.note;
  return `<li class="event ${e.kind === 'create' ? 'todo' : e.to || ''}${fresh ? ' fresh' : ''}"${e.taskId ? ` data-task="${esc(e.taskId)}"` : ''}><time datetime="${esc(e.at)}" title="${esc(fullTime(e.at))}">${clock(e.at)}</time><p>${eventLine(e)}</p>${detail ? `<p class="detail">${esc(detail)}</p>` : ''}</li>`;
}

/* Progress ring: one arc per card, in plan order, clockwise from the top. */
const point = (r, deg) => { const t = (deg - 90) * Math.PI / 180; return `${(160 + r * Math.cos(t)).toFixed(2)} ${(160 + r * Math.sin(t)).toFixed(2)}`; };
const arc = (r, from, to) => `M${point(r, from)}A${r} ${r} 0 ${to - from > 180 ? 1 : 0} 1 ${point(r, to)}`;
const segment = (index, total) => { const size = 360 / total, gap = total > 1 ? Math.min(7, size * .22) : .01; return [index * size + gap / 2, (index + 1) * size - gap / 2]; };
function buildOrbit() {
  let ticks = '';
  for (let i = 0; i < 72; i++) ticks += `<path${i % 6 ? '' : ' class="major"'} d="M${point(136, i * 5)}L${point(i % 6 ? 141 : 146, i * 5)}"/>`;
  $('orbit').innerHTML = `<g class="ticks">${ticks}</g><circle class="inner" cx="160" cy="160" r="94"/><circle class="track" cx="160" cy="160" r="118"/><g id="segments"></g><g class="comet" id="comet"><circle cx="160" cy="42" r="3.5"/></g><text class="count" id="orbit-count" x="160" y="184"></text><text class="of" id="orbit-of" x="160" y="212"></text>`;
}
function renderOrbit(tasks, draw) {
  $('segments').innerHTML = tasks.map((task, i) => {
    const [from, to] = segment(i, tasks.length), d = arc(118, from, to);
    return `<path class="seg ${task.status}${draw ? ' draw' : ''}" pathLength="1" d="${d}" data-task="${esc(task.id)}"><title>${esc(task.title)} · ${names[task.status]}</title></path>${task.status === 'doing' ? `<path class="flow" d="${d}"/>` : ''}`;
  }).join('');
  if (draw) $('segments').querySelectorAll('.draw').forEach((el, i) => el.style.setProperty('--i', i));
  const done = tasks.filter(task => task.status === 'done').length;
  $('orbit-count').textContent = tasks.length ? pad(done) : '—';
  $('orbit-of').textContent = tasks.length ? `OF ${pad(tasks.length)} DONE` : 'NO TASKS YET';
  $('ghost').textContent = tasks.length ? `${pad(done)}/${pad(tasks.length)}` : '';
  if (shownDone !== null && shownDone !== done) replay($('orbit-count'), 'tick');
  shownDone = done;
}
// A point of light travels the ring to the card that just changed.
function comet(index, total) {
  if (still.matches || !total) return;
  const [from, to] = segment(index, total);
  let target = (from + to) / 2;
  while (target <= cometAngle) target += 360;
  $('comet').animate([
    {transform: `rotate(${cometAngle}deg)`, opacity: 0},
    {opacity: 1, offset: .12}, {opacity: 1, offset: .82},
    {transform: `rotate(${target}deg)`, opacity: 0}
  ], {duration: 1100, easing: 'cubic-bezier(.5,0,.2,1)'});
  cometAngle = target % 360;
}

function cardMarkup(task) {
  const proof = task.status === 'done'
    ? task.evidence ? `<p class="proof"><b>Evidence</b>${esc(task.evidence)}</p>` : '<p class="proof missing">Marked done without evidence</p>'
    : task.note ? `<p class="note">${esc(task.note)}</p>` : '';
  return `<span class="card-top"><span>${esc(task.id)}</span><span class="age" data-since="${esc(task.statusAt || task.updatedAt)}">${age(task.statusAt || task.updatedAt)}</span></span><h3>${esc(task.title)}</h3>${proof}<span class="card-foot"><span class="mono ${agentClass(task.owner)}">${esc(monogram(task.owner))}</span>${esc(task.owner)}${task.evidence && task.status !== 'done' ? '<span class="tag">EVIDENCE</span>' : ''}</span>`;
}
function land(el) {
  replay(el, 'landed');
  const box = el.getBoundingClientRect();
  field.pulse(box.left + box.width / 2, box.top + box.height / 2);
}
// Cards keep their DOM node between renders, so a status change can fly from the old column to the new one.
function renderBoard(tasks, animate) {
  const before = new Map();
  if (animate) for (const [id, el] of cards) before.set(id, el.getBoundingClientRect());
  const alive = new Set();
  for (const status of statuses) {
    const group = tasks.filter(task => task.status === status), stack = $('stack-' + status);
    // Finished work is listed newest first, so the card that just landed is at the top of its scroll box.
    if (status === 'done') group.sort((a, b) => (b.statusAt || b.updatedAt).localeCompare(a.statusAt || a.updatedAt));
    $('count-' + status).textContent = pad(group.length);
    group.forEach((task, i) => {
      alive.add(task.id);
      let el = cards.get(task.id);
      if (!el) {
        el = Object.assign(document.createElement('article'), {className: 'card', tabIndex: 0, draggable: true});
        el.setAttribute('role', 'button'); el.dataset.task = task.id; cards.set(task.id, el);
      }
      const signature = JSON.stringify([task.title, task.note, task.evidence, task.owner, task.status, task.statusAt]);
      if (el.signature !== signature) { el.signature = signature; el.innerHTML = cardMarkup(task); }
      el.dataset.status = task.status;
      el.classList.toggle('dim', Boolean(ownerFilter) && task.owner !== ownerFilter);
      if (stack.children[i] !== el) stack.insertBefore(el, stack.children[i] || null);
    });
  }
  for (const [id, el] of cards) if (!alive.has(id)) { el.remove(); cards.delete(id); seenStatus.delete(id); }
  let entering = 0;
  tasks.forEach((task, index) => {
    const el = cards.get(task.id), was = before.get(task.id);
    const moved = seenStatus.has(task.id) && seenStatus.get(task.id) !== task.status;
    seenStatus.set(task.id, task.status);
    if (!was) {
      el.style.setProperty('--i', entering++);
      el.classList.add('enter');
      el.addEventListener('animationend', () => el.classList.remove('enter'), {once: true});
      return;
    }
    if (moved) { comet(index, tasks.length); reveal(el); }
    if (still.matches) return;
    const now = el.getBoundingClientRect(), dx = was.left - now.left, dy = was.top - now.top;
    if (Math.abs(dx) + Math.abs(dy) < 2) { if (moved) land(el); return; }
    const motion = [{transform: `translate(${dx}px, ${dy}px)`}, {transform: 'translate(0, 0)'}];
    if (!moved) { el.animate(motion, {duration: 450, easing: 'cubic-bezier(.22,1,.36,1)'}); return; }
    // Columns clip what is inside them, so the flight is made by a copy pinned above the page.
    const ghost = el.cloneNode(true);
    ghost.classList.add('ghost', 'flying'); ghost.removeAttribute('data-task'); ghost.setAttribute('aria-hidden', 'true');
    Object.assign(ghost.style, {left: now.left + 'px', top: now.top + 'px', width: now.width + 'px', height: now.height + 'px'});
    document.body.append(ghost); el.classList.add('away');
    ghost.animate(motion, {duration: 900, easing: 'cubic-bezier(.22,1,.36,1)'}).onfinish = () => { ghost.remove(); el.classList.remove('away'); land(el); };
  });
  for (const stack of document.querySelectorAll('.stack')) hint(stack);
}
// Scrolls a column's own box, not the page, until the card is inside it.
function reveal(el) {
  const stack = el.parentElement;
  if (el.offsetTop < stack.scrollTop) stack.scrollTop = el.offsetTop - 4;
  else if (el.offsetTop + el.offsetHeight > stack.scrollTop + stack.clientHeight) stack.scrollTop = el.offsetTop + el.offsetHeight - stack.clientHeight + 10;
}
const hint = stack => stack.classList.toggle('more', stack.scrollHeight - stack.scrollTop - stack.clientHeight > 6);

function favicon(color) {
  $('favicon').href = 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="#05070b"/><circle cx="16" cy="16" r="9" fill="none" stroke="${color}" stroke-width="4"/></svg>`);
}
function connection() {
  $('connection').textContent = connected ? 'LIVE' : 'RECONNECTING';
  $('connection').classList.toggle('offline', !connected);
  $('connection').title = connected ? 'Connected to the local board service' : 'Showing the last known state while disconnected.';
  document.body.classList.toggle('live', connected);
}

function render() {
  connection();
  const project = state.projects.find(p => p.id === selectedProject) || state.projects[0];
  if (state.projects.length) selectedProject = project.id;
  const switched = renderedProject !== selectedProject;
  if (switched) {
    for (const el of cards.values()) el.remove();
    cards.clear(); seenStatus.clear(); seenEvents.clear();
    ownerFilter = null; shownDone = null; shownFocus = null; renderedProject = selectedProject;
  }
  const tasks = state.tasks.filter(task => task.projectId === selectedProject);
  const by = status => tasks.filter(task => task.status === status);
  const done = by('done').length, blocked = by('blocked'), doing = by('doing').sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  $('project').innerHTML = state.projects.map(p => `<option value="${esc(p.id)}"${p.id === selectedProject ? ' selected' : ''}>${esc(p.title)}</option>`).join('') + '<option value="">+ New project</option>';
  $('strip').innerHTML = tasks.map(task => `<i class="${task.status}"></i>`).join('');
  $('kicker').textContent = project ? `Project · ${project.id}` : 'Workboard';
  $('title').textContent = project?.title || 'No project yet';
  $('goal').textContent = project?.goal || (project ? '' : 'Your assistant creates the plan after understanding the goal, then keeps every card up to date while it works.');
  document.title = `${blocked.length ? '⚠ ' : ''}${tasks.length ? `${done}/${tasks.length} · ` : ''}${project?.title || 'Workboard'}`;
  favicon(blocked.length ? colors.blocked : doing.length ? colors.doing : tasks.length && done === tasks.length ? colors.done : colors.todo);

  const owners = [...new Set(tasks.map(task => task.owner))];
  $('agents').innerHTML = owners.map(owner => {
    const mine = tasks.filter(task => task.owner === owner), finished = mine.filter(task => task.status === 'done').length;
    return `<button class="agent ${agentClass(owner)}${ownerFilter === owner ? ' on' : ''}" data-owner="${esc(owner)}" aria-pressed="${ownerFilter === owner}" title="Highlight this owner's cards"><span class="mono ${agentClass(owner)}">${esc(monogram(owner))}</span>${esc(owner)}<small>${finished}/${mine.length}</small></button>`;
  }).join('');

  renderOrbit(tasks, switched);

  const focus = doing[0] || blocked[0], complete = tasks.length > 0 && done === tasks.length;
  const mode = doing[0] ? 'doing' : blocked[0] ? 'blocked' : complete ? 'done' : 'idle';
  $('focus').className = 'focus ' + mode;
  $('focus').dataset.task = focus?.id || '';
  $('focus-label').textContent = {doing: doing.length > 1 ? `WORKING ON NOW · ${doing.length} ACTIVE` : 'WORKING ON NOW', blocked: 'BLOCKED · NEEDS INPUT', done: 'PLAN COMPLETE', idle: 'STANDING BY'}[mode];
  $('focus-title').textContent = focus?.title || (complete ? 'Every card is done' : 'No task is in progress');
  $('focus-note').textContent = focus?.note || (complete ? 'Open the cards to review results and verification.' : 'This updates the moment your assistant starts a card.');
  $('focus-clock').textContent = focus ? age(focus.statusAt || focus.updatedAt, true) : '';
  if (focus) Object.assign($('focus-clock').dataset, {since: focus.statusAt || focus.updatedAt, precise: '1'}); else delete $('focus-clock').dataset.since;
  $('focus-meta').innerHTML = focus ? `${esc(focus.owner)} · updated <span data-since="${esc(focus.updatedAt)}">${age(focus.updatedAt)}</span> ago` : '';
  const focusKey = `${mode}/${focus?.id}/${focus?.note}`;
  if (shownFocus !== null && shownFocus !== focusKey) replay($('focus').querySelector('.focus-main'), 'swap');
  shownFocus = focusKey;

  renderBoard(tasks, booted && !switched);

  const events = state.events.filter(e => e.projectId === selectedProject).slice(0, 40);
  $('events').innerHTML = events.length ? events.map(e => eventItem(e, booted && !switched && !seenEvents.has(e.id))).join('') : '<li class="empty">Changes will appear here as they happen.</li>';
  events.forEach(e => seenEvents.add(e.id));
  $('revision').textContent = `r${state.revision || 0}`;

  // Never overwrite a person's unsaved edits when an assistant update arrives; flag it instead.
  if ($('detail').open) {
    const task = tasks.find(task => task.id === selectedTask);
    $('detail-stale').hidden = !task || task.updatedAt === selectedUpdatedAt;
    renderHistory();
  }
}

async function send(command) {
  const res = await fetch('/api/command', {method: 'POST', headers: {'Content-Type': 'application/json', 'X-Board-Token': token}, body: JSON.stringify(command)});
  const result = await res.json();
  if (!res.ok) throw new Error(result.error);
  return result;
}
function renderHistory() {
  const events = state.events.filter(e => e.taskId === selectedTask && e.projectId === selectedProject).slice(0, 30);
  $('task-history').innerHTML = events.map(e => eventItem({...e, taskId: null}, false)).join('') || '<li class="empty">No recorded changes yet.</li>';
}
function openTask(id) {
  const task = state.tasks.find(task => task.id === id && task.projectId === selectedProject);
  if (!task) return;
  selectedTask = id; selectedUpdatedAt = task.updatedAt;
  $('detail-id').textContent = `${task.id} · updated ${fullTime(task.updatedAt)}`;
  $('detail-stale').hidden = true;
  $('detail-title').value = task.title;
  $('detail-owner').value = task.owner;
  $('detail-status').innerHTML = statuses.map(s => `<label class="${s}"><input type="radio" name="status" value="${s}"${s === task.status ? ' checked' : ''}><span>${names[s]}</span></label>`).join('');
  $('detail-note').value = task.note;
  $('detail-evidence').value = task.evidence;
  renderHistory();
  $('detail').showModal();
}
function openCreate(type) {
  if (type === 'task' && !state.projects.some(p => p.id === selectedProject)) return toast('Create a project first');
  createType = type;
  $('create-heading').textContent = type === 'project' ? 'New project' : 'Add task';
  $('create-note-label').textContent = type === 'project' ? 'Project goal' : 'First step or context';
  $('create-form').reset();
  $('create').showModal();
}

document.addEventListener('click', e => {
  const close = e.target.closest('[data-close]');
  if (close) return $(close.dataset.close).close();
  const owner = e.target.closest('[data-owner]');
  if (owner) { ownerFilter = ownerFilter === owner.dataset.owner ? null : owner.dataset.owner; return render(); }
  const task = e.target.closest('[data-task]');
  if (task?.dataset.task && !e.target.closest('dialog')) openTask(task.dataset.task);
});
document.addEventListener('keydown', e => {
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches?.('.card')) { e.preventDefault(); openTask(e.target.dataset.task); }
});
$('project').onchange = e => {
  if (!e.target.value) { e.target.value = selectedProject || ''; return openCreate('project'); }
  selectedProject = e.target.value; localStorage.setItem('workboard-project', selectedProject); render();
};
$('new-task').onclick = () => openCreate('task');
$('handoff').onclick = async () => {
  try {
    const res = await fetch('/api/summary?project=' + encodeURIComponent(selectedProject || ''));
    const text = await res.text();
    if (!res.ok) throw new Error(JSON.parse(text).error);
    await navigator.clipboard.writeText(text);
    toast('Handoff summary copied as Markdown');
  } catch (error) { toast(error.message || 'Could not copy the summary'); }
};
$('detail-form').onsubmit = async e => {
  e.preventDefault();
  const submit = e.submitter; submit.disabled = true;
  try {
    await send({type: 'task', project: selectedProject, id: selectedTask, expectedUpdatedAt: selectedUpdatedAt, title: $('detail-title').value, owner: $('detail-owner').value, status: new FormData(e.target).get('status'), note: $('detail-note').value, evidence: $('detail-evidence').value});
    $('detail').close(); toast('Changes saved');
  } catch (error) { toast(error.message); } finally { submit.disabled = false; }
};
$('create-form').onsubmit = async e => {
  e.preventDefault();
  const submit = e.submitter; submit.disabled = true;
  try {
    const id = (createType === 'project' ? 'project-' : 'task-') + crypto.randomUUID().slice(0, 8);
    const command = {type: createType, title: $('create-title').value};
    if (createType === 'project') Object.assign(command, {project: id, goal: $('create-note').value});
    else Object.assign(command, {project: selectedProject, id, status: 'todo', note: $('create-note').value, owner: 'You'});
    await send(command);
    if (createType === 'project') { selectedProject = id; localStorage.setItem('workboard-project', id); }
    $('create').close(); toast('Created');
    await load();
  } catch (error) { toast(error.message); } finally { submit.disabled = false; }
};

let dragging;
const clearOver = () => document.querySelectorAll('.over').forEach(el => el.classList.remove('over'));
$('board').addEventListener('dragstart', e => { const card = e.target.closest('.card'); if (card) { dragging = card.dataset.task; e.dataTransfer.setData('text/plain', dragging); e.dataTransfer.effectAllowed = 'move'; } });
$('board').addEventListener('dragover', e => { const column = e.target.closest('.column'); if (dragging && column) { e.preventDefault(); clearOver(); column.classList.add('over'); } });
$('board').addEventListener('dragend', () => { dragging = null; clearOver(); });
$('board').addEventListener('drop', async e => {
  const column = e.target.closest('.column');
  if (!dragging || !column) return;
  e.preventDefault();
  const id = dragging; dragging = null; clearOver();
  try { await send({type: 'task', project: selectedProject, id, status: column.dataset.status}); } catch (error) { toast(error.message); }
});

// Elapsed times tick without re-rendering the board.
setInterval(() => document.querySelectorAll('[data-since]').forEach(el => { el.textContent = age(el.dataset.since, el.dataset.precise); }), 1000);
let queued = false;
addEventListener('scroll', () => {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => {
    queued = false;
    document.documentElement.style.setProperty('--scroll', Math.min(1, scrollY / 340).toFixed(3));
    document.body.classList.toggle('scrolled', scrollY > 12);
  });
}, {passive: true});

async function load() {
  const res = await fetch('/api/state');
  if (!res.ok) throw new Error('Board unavailable');
  const value = await res.json();
  state = value.state; token = value.token;
  render();
}
async function start() {
  try {
    await load();
    if (!booted) setTimeout(() => { document.body.classList.remove('booting'); booted = true; }, 650);
    source?.close(); source = new EventSource('/api/events');
    source.addEventListener('board', e => { state = JSON.parse(e.data); connected = true; render(); });
    source.onopen = () => { connected = true; connection(); load().catch(() => {}); };
    source.onerror = () => { connected = false; connection(); };
  } catch { connected = false; connection(); setTimeout(start, 2000); }
}
// Refresh the mutation token after a server restart, without losing card selection.
document.addEventListener('visibilitychange', () => { if (!document.hidden) load().catch(() => {}); });
addEventListener('online', () => load().catch(() => {}));

$('board').addEventListener('scroll', e => e.target.classList?.contains('stack') && hint(e.target), true);
$('board').innerHTML = statuses.map(s => `<section class="column ${s}" data-status="${s}" aria-label="${names[s]}"><header><i></i><h2>${names[s]}</h2><span class="count" id="count-${s}">00</span></header><div class="stack" id="stack-${s}"></div></section>`).join('');
buildOrbit();
render();
start();

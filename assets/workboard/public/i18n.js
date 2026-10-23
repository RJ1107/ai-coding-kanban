/* Viewer language. Card text is whatever the assistant wrote and is never translated;
   this covers the chrome around it, so the board reads naturally to a Chinese user
   without changing what a handoff hands over. */

const DICT = {
  en: {
    project: 'Project', connecting: 'Connecting', live: 'LIVE', reconnecting: 'RECONNECTING',
    connected_title: 'Connected to the local board service',
    offline_title: 'Showing the last known state while disconnected.',
    handoff: 'Copy handoff',
    handoff_title: 'Copy a Markdown summary for a teammate or the next assistant',
    add_task: 'Add task', owners: 'Owners', progress: 'Task progress',
    current_focus: 'Current focus', task_board: 'Task board', activity: 'Activity',
    footer: 'Progress is reported by your coding assistant. The link status describes this board service, not the model.',
    close: 'Close', cancel: 'Cancel', save: 'Save changes', create: 'Create',
    title_field: 'Title', status_field: 'Status', owner_field: 'Owner',
    note_field: 'Latest progress / next step', evidence_field: 'Results and verification',
    card_history: 'Card history',
    stale: 'This card changed after you opened it. Close and reopen it to edit the latest version.',
    todo: 'Up next', doing: 'In progress', done: 'Done', blocked: 'Blocked',
    of_done: (n) => `OF ${n} DONE`, no_tasks: 'NO TASKS YET',
    workboard: 'Workboard', no_project: 'No project yet',
    empty_goal: 'Your assistant creates the plan after understanding the goal, then keeps every card up to date while it works.',
    working_now: 'WORKING ON NOW', working_now_n: (n) => `WORKING ON NOW · ${n} ACTIVE`,
    needs_input: 'BLOCKED · NEEDS INPUT', plan_complete: 'PLAN COMPLETE', standing_by: 'STANDING BY',
    all_done: 'Every card is done', nothing_running: 'No task is in progress',
    review_hint: 'Open the cards to review results and verification.',
    start_hint: 'This updates the moment your assistant starts a card.',
    updated_ago: (who, ago) => `${who} · updated ${ago} ago`,
    no_events: 'Changes will appear here as they happen.', no_history: 'No recorded changes yet.',
    added: (who, what) => `${who} added ${what}`,
    moved: (who, what, from, to) => `${who} moved ${what}<span class="route">${from} → ${to}</span>`,
    updated: (who, what) => `${who} updated ${what}`,
    set_up: (who) => `${who} set up the project`,
    left_note: (who) => `${who} left a project note`,
    detail_id: (id, when) => `${id} · updated ${when}`,
    new_project: 'New project', project_goal: 'Project goal', first_step: 'First step or context',
    need_project: 'Create a project first', copied: 'Handoff summary copied as Markdown',
    copy_failed: 'Could not copy the summary', saved: 'Changes saved',
    unavailable: 'Board unavailable', new_project_option: '+ New project',
    highlight_owner: "Highlight this owner's cards",
    evidence_tag: 'Evidence', no_evidence: 'Marked done without evidence',
    other_boards: 'Other boards on this machine',
    hours_minutes: (h, m) => `${h}h ${m}m`, minutes: (m) => `${m}m`, seconds: (s) => `${s}s`,
    switch_language: 'Switch to Chinese', language_label: '中',
  },
  zh: {
    project: '项目', connecting: '连接中', live: '实时', reconnecting: '重连中',
    connected_title: '已连接本地看板服务',
    offline_title: '连接已断开，显示的是最后一次已知状态。',
    handoff: '复制交接摘要',
    handoff_title: '复制一份 Markdown 摘要，交给同事或下一个助手',
    add_task: '新建卡片', owners: '负责人', progress: '任务进度',
    current_focus: '当前进行', task_board: '任务看板', activity: '动态',
    footer: '进度由你的编程助手上报。连接状态描述的是这个看板服务，不是模型。',
    close: '关闭', cancel: '取消', save: '保存修改', create: '创建',
    title_field: '标题', status_field: '状态', owner_field: '负责人',
    note_field: '最新进展 / 下一步', evidence_field: '结果与验证',
    card_history: '卡片历史',
    stale: '这张卡片在你打开后被改过。关闭后重新打开，再编辑最新版本。',
    todo: '待办', doing: '进行中', done: '已完成', blocked: '受阻',
    of_done: (n) => `${n} 张 · 已完成`, no_tasks: '还没有卡片',
    workboard: '看板', no_project: '还没有项目',
    empty_goal: '助手理解目标后会先列出计划，然后在工作过程中保持每张卡片是最新的。',
    working_now: '正在进行', working_now_n: (n) => `正在进行 · ${n} 张`,
    needs_input: '受阻 · 需要你介入', plan_complete: '计划已完成', standing_by: '待命中',
    all_done: '所有卡片都已完成', nothing_running: '当前没有进行中的任务',
    review_hint: '点开卡片查看结果与验证。',
    start_hint: '助手开始某张卡片时，这里会立刻更新。',
    updated_ago: (who, ago) => `${who} · ${ago}前更新`,
    no_events: '有变化时会显示在这里。', no_history: '还没有记录到变更。',
    added: (who, what) => `${who} 新建了 ${what}`,
    moved: (who, what, from, to) => `${who} 移动了 ${what}<span class="route">${from} → ${to}</span>`,
    updated: (who, what) => `${who} 更新了 ${what}`,
    set_up: (who) => `${who} 建立了项目`,
    left_note: (who) => `${who} 留下一条项目备注`,
    detail_id: (id, when) => `${id} · ${when} 更新`,
    new_project: '新建项目', project_goal: '项目目标', first_step: '第一步或背景',
    need_project: '请先创建一个项目', copied: '交接摘要已复制为 Markdown',
    copy_failed: '摘要复制失败', saved: '已保存',
    unavailable: '看板服务不可用', new_project_option: '+ 新建项目',
    highlight_owner: '高亮这个负责人的卡片',
    evidence_tag: '验证', no_evidence: '标记完成但没有验证记录',
    other_boards: '本机的其他看板',
    hours_minutes: (h, m) => `${h} 小时 ${m} 分`, minutes: (m) => `${m} 分`, seconds: (s) => `${s} 秒`,
    switch_language: '切换到英文', language_label: 'EN',
  },
};

const STORAGE = 'workboard-lang';

function initial() {
  try {
    const saved = localStorage.getItem(STORAGE);
    if (saved && DICT[saved]) return saved;
  } catch { /* private mode: fall through to the browser's own language */ }
  return String(navigator.language || '').toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

let current = initial();

export const lang = () => current;

export function t(key, ...params) {
  const entry = DICT[current][key] ?? DICT.en[key] ?? key;
  return typeof entry === 'function' ? entry(...params) : entry;
}

/** Locale for clocks and dates, so a timestamp matches the rest of the chrome. */
export const locale = () => (current === 'zh' ? 'zh-CN' : 'en-US');

export function setLang(next) {
  if (!DICT[next] || next === current) return;
  current = next;
  try { localStorage.setItem(STORAGE, next); } catch { /* nothing to persist to */ }
  // The viewer reads its whole state from the service on load, so a reload is the
  // simplest correct way to re-render every string, including the columns built once.
  location.reload();
}

/** Fill the static markup: data-i18n for text, -title for tooltips, -aria for labels. */
export function applyStatic(root = document) {
  document.documentElement.lang = current === 'zh' ? 'zh-CN' : 'en';
  for (const el of root.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
  for (const el of root.querySelectorAll('[data-i18n-title]')) el.title = t(el.dataset.i18nTitle);
  for (const el of root.querySelectorAll('[data-i18n-aria]')) {
    el.setAttribute('aria-label', t(el.dataset.i18nAria));
  }
}

'use strict';

/* Stream Helper chat bot — локальная панель управления. Без сборки и зависимостей. */

const ICONS = {
  overview: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/></svg>',
  commands: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 17l6-6-6-6"/><path d="M12 19h8"/></svg>',
  timers: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  links: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1.2 1.2"/><path d="M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1.2-1.2"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>',
  edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v5M14 11v5"/></svg>',
  copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/></svg>',
  x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12.5l5 5L20 6.5"/></svg>',
  refresh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/></svg>',
  external: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3h7v7"/><path d="M21 3l-9 9"/><path d="M19 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h5"/></svg>',
  chat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a8.5 8.5 0 0 1-12.3 7.6L4 21l1.4-4.7A8.5 8.5 0 1 1 21 12Z"/></svg>',
  reply: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 17l-5-5 5-5"/><path d="M4 12h10a6 6 0 0 1 6 6v1"/></svg>',
  alert: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/></svg>',
  lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>',
  chevron: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>',
  spark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.8 4.7L18.5 9l-4.7 1.8L12 15.5l-1.8-4.7L5.5 9l4.7-1.3L12 3Z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15Z"/></svg>',
  arrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M13 6l6 6-6 6"/></svg>',
  save: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z"/><path d="M7 3v6h9"/><path d="M7 21v-7h10v7"/></svg>',
  users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9"/><path d="M16 3.1a4 4 0 0 1 0 7.8"/></svg>',
  info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>',
  reset: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg>'
};

const VIEWS = {
  overview: {
    title: 'Обзор',
    eyebrow: 'Панель управления',
    sub: 'Живой статус бота и последние сообщения'
  },
  commands: {
    title: 'Команды',
    eyebrow: 'Редактор команд',
    sub: 'Ответы бота на команды в чате Twitch'
  },
  timers: {
    title: 'Автосообщения',
    eyebrow: 'Расписание',
    sub: 'Сообщения по таймеру, пока чат активен'
  },
  links: {
    title: 'Ссылки',
    eyebrow: 'Настройки',
    sub: 'Для команды !social и переменной {socials}'
  },
  moderation: {
    title: 'Модерация',
    eyebrow: 'Автопилот чата',
    sub: 'Спам, запрещённые слова, ссылки, капс и наказания'
  },
  fun: {
    title: 'Развлечения',
    eyebrow: 'Активность чата',
    sub: 'Баллы, розыгрыши, викторина и благодарности за события'
  }
};

const VAR_LIST = [
  '{user}', '{channel}', '{platform}', '{uptime}', '{socials}',
  '{twitch}', '{youtube}', '{discord}', '{date}', '{time}'
];

const state = {
  view: 'overview',
  panel: null,
  status: null,
  loading: true,
  loadError: '',
  statusError: false,
  search: '',
  filter: 'all',
  linksDraft: null,
  linksDirty: false,
  modDraft: null,
  modDirty: false,
  funDraft: null,
  funDirty: false,
  saving: false,
  editing: null,
  drawerKeyHandler: null
};

/* ---------- helpers ---------- */

function copy(value) {
  return JSON.parse(JSON.stringify(value == null ? null : value));
}

function el(tag, attrs) {
  const node = document.createElement(tag);
  if (attrs) {
    Object.keys(attrs).forEach(function (key) {
      const value = attrs[key];
      if (value == null || value === false) return;
      if (key === 'class' || key === 'className') node.className = value;
      else if (key === 'text') node.textContent = value;
      else if (key === 'html') node.innerHTML = value;
      else if (key === 'dataset') Object.assign(node.dataset, value);
      else if (key === 'style' && typeof value === 'object') {
        Object.keys(value).forEach(function (name) {
          if (name.indexOf('--') === 0) node.style.setProperty(name, value[name]);
          else node.style[name] = value[name];
        });
      } else if (key === 'for') node.htmlFor = value;
      else if (key.indexOf('on') === 0 && typeof value === 'function') {
        node.addEventListener(key.slice(2).toLowerCase(), value);
      } else if (key in node && typeof node[key] !== 'function') {
        try { node[key] = value; } catch (error) { node.setAttribute(key, value); }
      } else {
        node.setAttribute(key, value === true ? '' : value);
      }
    });
  }
  const args = Array.prototype.slice.call(arguments, 2);
  append(node, args);
  return node;
}

function append(node, children) {
  children.forEach(function (child) {
    if (child == null || child === false) return;
    if (Array.isArray(child)) {
      append(node, child);
    } else if (child instanceof Node) {
      node.appendChild(child);
    } else {
      node.appendChild(document.createTextNode(String(child)));
    }
  });
}

function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

function icon(name, size) {
  const span = el('span', { class: 'icon' });
  span.innerHTML = ICONS[name] || '';
  const svg = span.firstElementChild;
  if (svg) {
    const px = String(size || 18);
    svg.setAttribute('width', px);
    svg.setAttribute('height', px);
    svg.setAttribute('aria-hidden', 'true');
  }
  return span;
}

function fillStaticIcons() {
  document.querySelectorAll('[data-icon]').forEach(function (node) {
    node.innerHTML = ICONS[node.dataset.icon] || '';
  });
}

function button(label, iconName, className, onClick) {
  const attrs = { class: 'btn ' + (className || ''), type: 'button' };
  if (onClick) attrs.onClick = onClick;
  const node = el('button', attrs);
  if (iconName) node.appendChild(icon(iconName, 16));
  if (label) node.appendChild(el('span', { class: 'btn-label', text: label }));
  return node;
}

function iconButton(iconName, title, action, extraClass) {
  return el('button', {
    class: 'icon-btn ' + (extraClass || ''),
    type: 'button',
    title: title,
    'aria-label': title,
    dataset: { action: action }
  }, icon(iconName, 16));
}

function api(path, options) {
  const opts = options || {};
  const headers = Object.assign({
    'X-Panel-Request': '1'
  }, opts.headers || {});
  return fetch(path, Object.assign({}, opts, {
    cache: 'no-store',
    headers: headers
  })).then(function (response) {
    return response.json().catch(function () { return null; }).then(function (data) {
      if (!response.ok || !data || data.ok === false) {
        const error = new Error((data && data.error) || ('Ошибка ' + response.status));
        error.fields = (data && data.fields) || {};
        error.status = response.status;
        throw error;
      }
      return data;
    });
  });
}

function toast(message, type) {
  const root = document.getElementById('toast-root');
  const kind = type || 'ok';
  const iconName = kind === 'error' ? 'alert' : (kind === 'warn' ? 'info' : 'check');
  const node = el('div', { class: 'toast ' + kind },
    icon(iconName, 15),
    el('div', { text: message })
  );
  root.appendChild(node);
  window.setTimeout(function () {
    node.classList.add('leaving');
    window.setTimeout(function () { node.remove(); }, 190);
  }, 4200);
}

function formatNext(seconds) {
  const sec = Math.max(0, Number(seconds) || 0);
  if (sec < 60) return 'через ' + sec + ' с';
  const min = Math.round(sec / 60);
  if (min < 60) return 'через ' + min + ' мин';
  const hours = Math.floor(min / 60);
  const rest = min % 60;
  return 'через ' + hours + ' ч' + (rest ? ' ' + rest + ' мин' : '');
}

function socialsLine(socials) {
  const labels = (state.panel && state.panel.meta && state.panel.meta.socialLabels) || {};
  const source = socials || {};
  return Object.keys(labels)
    .filter(function (key) { return source[key]; })
    .map(function (key) { return labels[key] + ': ' + source[key]; })
    .join(' · ');
}

function renderVars(text) {
  const socials = state.linksDraft || (state.panel && state.panel.socials) || {};
  const labels = (state.panel && state.panel.meta && state.panel.meta.socialLabels) || {};
  const channel = (state.panel && state.panel.meta && state.panel.meta.channel) || 'your_channel';
  const values = {
    user: 'Аня',
    channel: channel,
    platform: 'twitch',
    uptime: '2 ч 14 мин',
    socials: socialsLine(socials),
    youtube: socials.youtube || '',
    twitch: socials.twitch || '',
    discord: socials.discord || '',
    date: new Date().toLocaleDateString('ru-RU'),
    time: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
  };
  return String(text == null ? '' : text).replace(/\{([a-zа-яё_]+)\}/gi, function (match, key) {
    const value = values[key.toLowerCase()];
    return value === undefined ? match : value;
  });
}

/* ---------- data ---------- */

async function loadPanel(options) {
  const silent = options && options.silent;
  try {
    const data = await api('/api/panel');
    state.panel = data;
    if (!state.linksDirty) state.linksDraft = copy(data.socials);
    if (!state.modDirty) state.modDraft = copy(data.moderation || {});
    if (!state.funDirty) {
      state.funDraft = copy({
        points: data.points || {},
        giveaways: data.giveaways || {},
        quiz: data.quiz || {},
        events: data.events || {}
      });
    }
    state.loadError = '';
    state.loading = false;
    render();
    return true;
  } catch (error) {
    if (!state.panel) {
      state.loadError = error.message;
      state.loading = false;
      render();
    }
    if (!silent) toast('Не удалось загрузить настройки: ' + error.message, 'error');
    return false;
  }
}

async function refreshStatus() {
  try {
    const response = await fetch('/status', { cache: 'no-store' });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    state.status = await response.json();
    state.statusError = false;
  } catch (error) {
    state.statusError = true;
  }
  updateSidebar();
  if (state.view === 'overview') {
    const current = document.getElementById('overview-root');
    if (current) {
      const feed = current.querySelector('.feed');
      const scroll = feed ? feed.scrollTop : 0;
      const next = renderOverview();
      current.replaceWith(next);
      const nextFeed = next.querySelector('.feed');
      if (nextFeed) nextFeed.scrollTop = scroll;
    }
  }
  if (state.view === 'timers') updateTimerNextLabels();
}

async function refreshAll() {
  const [ok] = await Promise.all([loadPanel({ silent: true }), refreshStatus()]);
  if (ok) toast('Данные обновлены', 'ok');
}

function updateSidebar() {
  const dot = document.getElementById('side-dot');
  const label = document.getElementById('side-status-text');
  const channel = document.getElementById('side-channel');
  const s = state.status;

  let cls = 'status-dot';
  let text = 'Нет связи';
  let chan = state.panel ? '#' + state.panel.meta.channel : 'Twitch';

  if (state.statusError) {
    cls += ' bad';
  } else if (!s) {
    cls += ' warn';
    text = 'Подключение…';
  } else {
    chan = '#' + (s.twitch.channel || '—');
    if (s.twitch.status === 'online') {
      if (s.twitch.readOnly) {
        cls += ' warn';
        text = 'Только чтение';
      } else {
        cls += ' ok';
        text = 'Бот на связи';
      }
    } else if (s.twitch.status === 'connecting') {
      cls += ' warn';
      text = 'Подключается…';
    } else {
      cls += ' bad';
      text = 'Не подключён';
    }
  }

  dot.className = cls;
  label.textContent = text;
  channel.textContent = chan;

  if (state.panel) {
    const commandsCount = document.getElementById('nav-commands-count');
    const timersCount = document.getElementById('nav-timers-count');
    if (commandsCount) commandsCount.textContent = String(state.panel.commands.length);
    if (timersCount) timersCount.textContent = String(state.panel.timers.length);
  }
}

/* ---------- render shell ---------- */

function currentView() {
  const hash = String(window.location.hash || '').replace(/^#/, '');
  return VIEWS[hash] ? hash : 'overview';
}

function render() {
  const meta = VIEWS[state.view];
  document.getElementById('page-title').textContent = meta.title;
  document.getElementById('page-eyebrow').textContent = meta.eyebrow;
  document.getElementById('page-sub').textContent = state.view === 'links' && state.linksDirty
    ? 'Есть несохранённые изменения'
    : meta.sub;
  document.title = 'Stream Helper · ' + meta.title;

  document.querySelectorAll('.nav-item').forEach(function (item) {
    item.classList.toggle('active', item.dataset.view === state.view);
  });

  renderTopbar();

  const view = document.getElementById('view');
  clear(view);

  if (state.loading) {
    view.appendChild(renderLoading());
    return;
  }
  if (state.loadError && !state.panel) {
    view.appendChild(renderLoadError());
    return;
  }

  if (state.view === 'overview') view.appendChild(renderOverview());
  else if (state.view === 'commands') view.appendChild(renderCommandsView());
  else if (state.view === 'timers') view.appendChild(renderTimersView());
  else if (state.view === 'moderation') view.appendChild(renderModerationView());
  else if (state.view === 'fun') view.appendChild(renderFunView());
  else {
    view.appendChild(renderLinksView());
    paintLinksPreview();
  }

  updateSidebar();
}

function renderTopbar() {
  const root = clear(document.getElementById('topbar-actions'));
  if (state.view === 'overview' || state.view === 'commands') {
    root.appendChild(button('Новая команда', 'plus', 'primary', function () { openCommandDrawer(null); }));
  } else if (state.view === 'timers') {
    root.appendChild(button('Новое автосообщение', 'plus', 'primary', function () { openTimerDrawer(null); }));
  } else if (state.view === 'links') {
    const reset = button('Сбросить', 'reset', 'ghost', resetLinks);
    reset.disabled = !state.linksDirty;
    const save = button('Сохранить', 'save', 'primary', saveLinks);
    save.disabled = !state.linksDirty || state.saving;
    root.appendChild(reset);
    root.appendChild(save);
  } else if (state.view === 'moderation') {
    const reset = button('Сбросить', 'reset', 'ghost', resetModeration);
    reset.disabled = !state.modDirty;
    const save = button('Сохранить', 'save', 'primary', saveModerationSettings);
    save.disabled = !state.modDirty || state.saving;
    root.appendChild(reset);
    root.appendChild(save);
  } else if (state.view === 'fun') {
    const reset = button('Сбросить', 'reset', 'ghost', resetFun);
    reset.disabled = !state.funDirty;
    const save = button('Сохранить', 'save', 'primary', saveFunSettings);
    save.disabled = !state.funDirty || state.saving;
    root.appendChild(reset);
    root.appendChild(save);
  }

  const refresh = el('button', {
    class: 'btn ghost',
    type: 'button',
    title: 'Обновить данные',
    'aria-label': 'Обновить данные',
    onClick: refreshAll
  }, icon('refresh', 16));
  root.appendChild(refresh);
}

function renderLoading() {
  return el('div', { class: 'overview' },
    el('div', { class: 'skeleton skeleton-card', style: { height: '132px' } }),
    el('div', { class: 'skeleton-grid' },
      el('div', { class: 'skeleton skeleton-card' }),
      el('div', { class: 'skeleton skeleton-card' }),
      el('div', { class: 'skeleton skeleton-card' }),
      el('div', { class: 'skeleton skeleton-card' })
    ),
    el('div', { class: 'card' },
      el('div', { class: 'skeleton skeleton-row' }),
      el('div', { class: 'skeleton skeleton-row' }),
      el('div', { class: 'skeleton skeleton-row' }),
      el('div', { class: 'skeleton skeleton-row' })
    )
  );
}

function renderLoadError() {
  return el('div', { class: 'error-card' },
    icon('alert', 20),
    el('div', null,
      el('h3', { text: 'Не удалось загрузить настройки' }),
      el('p', { text: state.loadError || 'Проверь, что бот запущен, и обнови страницу.' }),
      el('div', { class: 'quick-actions', style: { marginTop: '12px' } },
        button('Попробовать снова', 'refresh', 'small', function () { state.loading = true; render(); loadPanel(); })
      )
    )
  );
}

/* ---------- overview ---------- */

function renderOverview() {
  const s = state.status;
  const p = state.panel;
  const wrap = el('div', { class: 'overview', id: 'overview-root' });
  if (!s) {
    wrap.appendChild(renderLoading());
    return wrap;
  }

  const tw = s.twitch || {};
  const online = tw.status === 'online';
  const orbState = online ? (tw.readOnly ? 'warn' : '') : (tw.status === 'connecting' ? 'warn' : 'bad');
  const heading = online
    ? (tw.readOnly ? 'Бот читает чат' : 'Бот на связи')
    : (tw.status === 'connecting' ? 'Подключаюсь…' : 'Нет подключения');
  const subheading = online
    ? 'Пишет в #' + (tw.channel || '—') + (tw.bot ? ' под @' + tw.bot : ' анонимно')
    : 'Проверь окно бота и вход в Twitch';

  const hero = el('section', { class: 'hero' },
    el('div', { class: 'hero-main' },
      el('span', { class: 'hero-orb ' + orbState }),
      el('div', { class: 'hero-copy' },
        el('p', { class: 'eyebrow', text: 'Twitch' }),
        el('h2', { text: heading }),
        el('p', { text: subheading })
      )
    ),
    el('div', { class: 'hero-side' },
      el('span', { class: 'chip ' + (online && !tw.readOnly ? 'ok' : 'warn') },
        icon(online ? 'check' : 'alert', 12),
        el('span', { text: online ? (tw.readOnly ? 'Без отправки' : 'Отправка включена') : 'Ожидание' })
      ),
      el('span', { class: 'chip accent', text: 'uptime ' + (s.uptimeText || '—') }),
      el('a', {
        class: 'btn ghost',
        href: 'https://twitch.tv/' + (tw.channel || (p && p.meta.channel) || ''),
        target: '_blank',
        rel: 'noopener'
      }, el('span', { text: 'Открыть канал' }), icon('external', 15))
    )
  );
  wrap.appendChild(hero);

  const stats = el('div', { class: 'stats' },
    statCard('Принято сообщений', s.counters.messages || 0, 'chat', '#90b9ff', 'rgba(88, 140, 255, 0.13)', 'rgba(88, 140, 255, 0.16)'),
    statCard('Ответов бота', s.counters.replies || 0, 'reply', '#93edb9', 'rgba(69, 212, 131, 0.13)', 'rgba(69, 212, 131, 0.16)'),
    statCard('Аптайм', s.uptimeText || '—', 'clock', '#ffd27a', 'rgba(255, 176, 32, 0.12)', 'rgba(255, 176, 32, 0.14)'),
    statCard('Своих команд', p ? p.commands.length : 0, 'commands', '#cbb4ff', 'rgba(169, 112, 255, 0.14)', 'rgba(169, 112, 255, 0.17)')
  );
  wrap.appendChild(stats);

  const layout = el('div', { class: 'grid-2' });

  const feedRows = (s.feed || []).slice().reverse().map(function (item) {
    return el('div', { class: 'feed-row ' + (item.dir === 'out' ? 'out' : '') },
      el('span', { class: 'feed-time', text: item.time || '' }),
      el('div', { class: 'feed-body' },
        el('div', { class: 'feed-meta' },
          el('span', { class: 'feed-dir ' + (item.dir === 'out' ? 'out' : 'in'), text: item.dir === 'out' ? 'бот' : 'чат' }),
          el('span', { class: 'feed-user', text: item.user || '—' })
        ),
        el('div', { class: 'feed-text', text: item.text || '' })
      )
    );
  });

  if (!feedRows.length) {
    feedRows.push(el('div', { class: 'empty', style: { minHeight: '220px' } },
      el('span', { class: 'empty-icon' }, icon('chat', 23)),
      el('h3', { text: 'Пока тихо' }),
      el('p', { text: 'Как только в чате появятся сообщения, они будут здесь.' })
    ));
  }

  const feedCard = el('section', { class: 'card' },
    el('div', { class: 'card-head' },
      el('div', null,
        el('h2', { class: 'card-title', text: 'Последние сообщения' }),
        el('p', { class: 'card-sub', text: 'Входящие из чата и ответы бота' })
      ),
      el('span', { class: 'chip mono', text: 'live' })
    ),
    el('div', { class: 'feed' }, feedRows)
  );
  layout.appendChild(feedCard);

  const side = el('div', { class: 'stack' });

  const timerRows = (s.timers || []).slice(0, 4).map(function (timer) {
    return el('div', { class: 'mini-row' },
      el('div', { class: 'mini-text', text: timer.text || '' }),
      el('span', { class: 'mini-next', text: formatNext(timer.nextInSec) })
    );
  });
  if (!timerRows.length) {
    timerRows.push(el('div', { class: 'card-sub', style: { padding: '6px 0 10px' }, text: 'Активных автосообщений нет.' }));
  }

  const timersCard = el('section', { class: 'card' },
    el('div', { class: 'card-head' },
      el('h2', { class: 'card-title', text: 'Автосообщения' }),
      el('span', { class: 'chip', text: (s.timers || []).length + ' активных' })
    ),
    el('div', { class: 'mini-list' }, timerRows),
    el('div', { class: 'quick-actions' },
      quickAction('Настроить расписание', 'timers', '#timers'),
      quickAction('Редактор команд', 'commands', '#commands')
    )
  );
  side.appendChild(timersCard);

  const infoCard = el('section', { class: 'card' },
    el('div', { class: 'card-head' },
      el('h2', { class: 'card-title', text: 'Подключение' })
    ),
    el('div', { class: 'info-list' },
      infoRow('Канал', '#' + (tw.channel || '—')),
      infoRow('Аккаунт', tw.bot ? '@' + tw.bot : 'анонимно'),
      infoRow('Отправка', tw.readOnly ? 'только чтение' : 'включена'),
      infoRow('Своих команд', p ? p.commands.length : '—'),
      infoRow('Автосообщений', p ? p.timers.length : '—')
    ),
    el('div', { class: 'quick-actions' },
      quickAction('Изменить ссылки', 'links', '#links')
    )
  );
  side.appendChild(infoCard);
  layout.appendChild(side);
  wrap.appendChild(layout);

  return wrap;
}

function statCard(label, value, iconName, color, soft, glow) {
  return el('div', { class: 'stat', style: { '--stat-color': color, '--stat-soft': soft, '--stat-glow': glow } },
    el('span', { class: 'stat-icon' }, icon(iconName, 17)),
    el('span', { class: 'stat-value', text: String(value) }),
    el('span', { class: 'stat-label', text: label })
  );
}

function infoRow(label, value) {
  return el('div', { class: 'info-row' },
    el('span', { text: label }),
    el('b', { text: value })
  );
}

function quickAction(label, iconName, href) {
  return el('a', { class: 'quick-action', href: href },
    icon(iconName, 15),
    el('span', { text: label }),
    el('span', { class: 'arrow', html: ICONS.arrow })
  );
}

/* ---------- commands ---------- */

function renderCommandsView() {
  const p = state.panel;
  const wrap = el('div', { class: 'commands-view' });
  const listMount = el('div', { id: 'command-list-mount' });

  const searchInput = el('input', {
    type: 'search',
    placeholder: 'Поиск по имени, алиасу или тексту…',
    'aria-label': 'Поиск команд',
    value: state.search
  });
  searchInput.addEventListener('input', function () {
    state.search = searchInput.value;
    paint();
  });

  const filters = el('div', { class: 'filters' },
    filterButton('all', 'Все'),
    filterButton('on', 'Включённые'),
    filterButton('off', 'Выключенные')
  );

  const toolbar = el('div', { class: 'toolbar' },
    el('div', { class: 'toolbar-left' },
      el('label', { class: 'search' }, icon('search', 15), searchInput)
    ),
    el('div', { class: 'toolbar-right' },
      filters,
      button('Добавить', 'plus', 'small', function () { openCommandDrawer(null); })
    )
  );
  wrap.appendChild(toolbar);
  wrap.appendChild(listMount);

  function paint() {
    clear(listMount);
    const query = state.search.trim().toLowerCase();
    const items = p.commands.map(function (command, index) {
      return { command: command, index: index };
    }).filter(function (item) {
      const command = item.command;
      if (state.filter === 'on' && command.enabled === false) return false;
      if (state.filter === 'off' && command.enabled !== false) return false;
      if (!query) return true;
      const haystack = [command.name].concat(command.aliases || [], [command.reply]).join(' ').toLowerCase();
      return haystack.indexOf(query) !== -1;
    });

    const summary = el('div', { class: 'list-summary' },
      el('span', {
        text: items.length === p.commands.length
          ? 'Всего ' + p.commands.length + ' ' + plural(p.commands.length, 'команда', 'команды', 'команд')
          : 'Показано ' + items.length + ' из ' + p.commands.length
      }),
      el('span', { text: 'Изменения применяются сразу' })
    );
    listMount.appendChild(summary);

    if (!items.length) {
      listMount.appendChild(el('div', { class: 'empty' },
        el('span', { class: 'empty-icon' }, icon(query ? 'search' : 'commands', 23)),
        el('h3', { text: query ? 'Ничего не найдено' : (p.commands.length ? 'Все команды скрыты фильтром' : 'Пока нет своих команд') }),
        el('p', { text: query ? 'Попробуй другое название или очисти поиск.' : 'Добавь первую команду — бот сразу начнёт на неё отвечать.' }),
        el('div', { class: 'quick-actions', style: { width: '100%', maxWidth: '240px' } },
          button(query ? 'Очистить поиск' : 'Создать команду', query ? 'reset' : 'plus', 'primary small', function () {
            if (query) {
              state.search = '';
              searchInput.value = '';
              paint();
            } else {
              openCommandDrawer(null);
            }
          })
        )
      ));
    } else {
      const grid = el('div', { class: 'command-grid' });
      items.forEach(function (item) { grid.appendChild(commandCard(item.command, item.index)); });
      listMount.appendChild(grid);
    }

    clear(filters);
    filters.appendChild(filterButton('all', 'Все'));
    filters.appendChild(filterButton('on', 'Включённые'));
    filters.appendChild(filterButton('off', 'Выключенные'));
  }

  function filterButton(value, label) {
    return el('button', {
      class: 'filter ' + (state.filter === value ? 'active' : ''),
      type: 'button',
      text: label,
      onClick: function () {
        state.filter = value;
        paint();
      }
    });
  }

  listMount.addEventListener('change', function (event) {
    const toggle = event.target.closest('[data-toggle-command]');
    if (!toggle) return;
    toggleCommand(Number(toggle.dataset.index), toggle.checked);
  });

  listMount.addEventListener('click', function (event) {
    const actionNode = event.target.closest('[data-action]');
    if (actionNode && listMount.contains(actionNode)) {
      event.stopPropagation();
      const index = Number(actionNode.dataset.index);
      const action = actionNode.dataset.action;
      if (action === 'edit') openCommandDrawer(index);
      else if (action === 'duplicate') duplicateCommand(index);
      else if (action === 'delete') askDeleteCommand(index);
      return;
    }
    if (event.target.closest('.cmd-actions')) return;
    const card = event.target.closest('.command-card');
    if (card) openCommandDrawer(Number(card.dataset.index));
  });

  paint();
  wrap.appendChild(renderBuiltins());
  return wrap;
}

function commandCard(command, index) {
  const enabled = command.enabled !== false;
  const aliases = command.aliases || [];
  const visibleAliases = aliases.slice(0, 2);

  const chips = [];
  visibleAliases.forEach(function (alias) {
    chips.push(el('span', { class: 'chip alias-chip', text: '!' + alias }));
  });
  if (aliases.length > visibleAliases.length) {
    chips.push(el('span', { class: 'chip', text: '+' + (aliases.length - visibleAliases.length) }));
  }
  if (command.permission && command.permission !== 'everyone') {
    chips.push(el('span', { class: 'chip accent', text: command.permission === 'mod' ? 'модераторы' : 'стример' }));
  }
  if (command.cooldownMs) {
    chips.push(el('span', { class: 'chip', text: Math.round(command.cooldownMs / 1000) + ' с' }));
  }
  (command.platforms || ['twitch']).forEach(function (platform) {
    chips.push(el('span', {
      class: 'chip ' + (platform === 'twitch' ? 'accent' : ''),
      text: platform === 'twitch' ? 'twitch' : 'youtube'
    }));
  });

  const duplicateBtn = iconButton('copy', 'Дублировать', 'duplicate');
  duplicateBtn.dataset.index = String(index);
  const deleteBtn = iconButton('trash', 'Удалить', 'delete', 'danger');
  deleteBtn.dataset.index = String(index);

  return el('article', {
    class: 'command-card ' + (enabled ? '' : 'disabled'),
    dataset: { index: String(index) }
  },
    el('div', { class: 'cmd-top' },
      el('div', { class: 'cmd-name' },
        el('span', { class: 'cmd-prefix', text: '!' }),
        el('strong', { text: command.name })
      ),
      el('div', { class: 'cmd-actions' },
        duplicateBtn,
        deleteBtn,
        el('label', { class: 'switch', title: enabled ? 'Выключить команду' : 'Включить команду' },
          el('input', {
            type: 'checkbox',
            checked: enabled,
            dataset: { toggleCommand: '1', index: String(index) },
            'aria-label': (enabled ? 'Выключить' : 'Включить') + ' команду !' + command.name
          }),
          el('span', { class: 'track' })
        )
      )
    ),
    el('p', { class: 'cmd-reply', text: command.reply || '' }),
    el('div', { class: 'cmd-chips' }, chips),
    el('div', { class: 'cmd-foot' },
      el('span', { class: 'cmd-length', text: (command.reply || '').length + ' / 480 символов' }),
      el('button', {
        class: 'link-btn',
        type: 'button',
        dataset: { action: 'edit', index: String(index) }
      }, el('span', { text: 'Редактировать' }), icon('arrow', 14))
    )
  );
}

function renderBuiltins() {
  const builtins = (state.panel.meta && state.panel.meta.builtins) || [];
  const list = el('div', { class: 'builtin-list' });
  builtins.forEach(function (command) {
    list.appendChild(el('div', { class: 'builtin-row' },
      el('span', { class: 'builtin-name', text: '!' + command.name }),
      el('span', { class: 'builtin-desc', text: command.description || '' }),
      el('span', { class: 'builtin-aliases', text: (command.aliases || []).slice(0, 3).map(function (a) { return '!' + a; }).join(' ') })
    ));
  });

  return el('details', { class: 'builtins card' },
    el('summary', null,
      icon('lock', 16),
      el('span', { text: 'Встроенные команды' }),
      el('span', { class: 'chip', text: String(builtins.length) }),
      el('span', { class: 'chevron', html: ICONS.chevron })
    ),
    list
  );
}

async function toggleCommand(index, enabled) {
  if (state.saving) return;
  const next = copy(state.panel.commands);
  if (!next[index]) return;
  next[index].enabled = enabled;
  await saveCommandList(next, enabled ? 'Команда включена' : 'Команда выключена');
}

async function duplicateCommand(index) {
  if (state.saving) return;
  const source = state.panel.commands[index];
  if (!source) return;
  const next = copy(state.panel.commands);
  const used = new Set();
  next.forEach(function (command) {
    used.add(command.name);
    (command.aliases || []).forEach(function (alias) { used.add(alias); });
  });
  let base = (source.name + '-copy').slice(0, 32);
  let name = base;
  let counter = 2;
  while (used.has(name)) {
    name = base.slice(0, 29) + '-' + counter;
    counter += 1;
  }
  next.push({
    name: name,
    aliases: [],
    reply: source.reply,
    permission: source.permission || 'everyone',
    platforms: source.platforms || ['twitch'],
    enabled: false
  });
  await saveCommandList(next, 'Копия «!' + name + '» создана и выключена');
}

function askDeleteCommand(index) {
  const command = state.panel.commands[index];
  if (!command) return;
  confirmDialog(
    'Удалить команду?',
    'Команда «!' + command.name + '» исчезнет из config.js. Это можно отменить только вручную.',
    'Удалить',
    function () {
      const next = copy(state.panel.commands);
      next.splice(index, 1);
      saveCommandList(next, 'Команда !' + command.name + ' удалена');
    }
  );
}

async function saveCommandList(next, message) {
  state.saving = true;
  try {
    const data = await api('/api/commands', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ commands: next })
    });
    state.panel.commands = data.commands;
    toast(message || 'Команды сохранены', 'ok');
    render();
    refreshStatus();
  } catch (error) {
    toast(error.message, 'error');
    render();
  } finally {
    state.saving = false;
  }
}

/* ---------- command drawer ---------- */

function openCommandDrawer(index) {
  if (!state.panel) return;
  const meta = state.panel.meta;
  const isNew = index == null;
  const source = isNew ? {
    name: '', aliases: [], reply: '', permission: 'everyone',
    platforms: ['twitch'], enabled: true
  } : state.panel.commands[index];
  if (!source) return;

  let platforms = (source.platforms && source.platforms.length ? source.platforms : ['twitch']).slice();
  if (!meta.youtubeEnabled) platforms = platforms.filter(function (p) { return p !== 'youtube'; });
  if (!platforms.length) platforms = ['twitch'];

  state.editing = {
    type: 'command',
    index: isNew ? null : index,
    isNew: isNew,
    draft: {
      name: source.name || '',
      aliases: (source.aliases || []).slice(),
      reply: source.reply || '',
      permission: source.permission || 'everyone',
      platforms: platforms,
      cooldownSec: source.cooldownMs ? String(Math.round(source.cooldownMs / 1000)) : '',
      enabled: source.enabled !== false
    }
  };
  renderCommandDrawer();
}

function currentReplyLimit(platforms) {
  const list = platforms || (state.editing && state.editing.draft.platforms) || ['twitch'];
  return list.indexOf('youtube') !== -1 ? 200 : 480;
}

function renderCommandDrawer() {
  const editing = state.editing;
  const meta = state.panel.meta;
  const draft = editing.draft;
  const isNew = editing.isNew;
  const root = clear(document.getElementById('drawer-root'));

  const errorBox = el('div', { class: 'form-error', id: 'form-error', role: 'alert' });
  const previewText = el('span', { class: 'preview-text' });
  const counter = el('span', { class: 'counter' });

  function updatePreview() {
    previewText.textContent = renderVars(draft.reply || 'Здесь появится ответ бота');
    const limit = currentReplyLimit(draft.platforms);
    counter.textContent = draft.reply.length + ' / ' + limit;
    counter.classList.toggle('over', draft.reply.length > limit);
  }

  function clearError(field) {
    const error = overlay.querySelector('[data-error="' + field + '"]');
    if (error) error.classList.remove('visible');
    const input = overlay.querySelector('#cmd-' + field);
    if (input) input.classList.remove('invalid');
    errorBox.classList.remove('visible');
  }

  function fieldError(field, message) {
    const error = overlay.querySelector('[data-error="' + field + '"]');
    if (error) {
      error.textContent = message;
      error.classList.add('visible');
    }
    const input = overlay.querySelector('#cmd-' + field);
    if (input) input.classList.add('invalid');
  }

  /* name */
  const nameInput = el('input', {
    class: 'input mono',
    id: 'cmd-name',
    value: draft.name,
    placeholder: 'discord',
    maxlength: '32',
    autocomplete: 'off',
    spellcheck: false
  });
  nameInput.addEventListener('input', function () {
    draft.name = nameInput.value.replace(/^[!#]+/, '');
    clearError('name');
  });

  const nameBlock = el('div', { class: 'form-section' },
    el('label', { class: 'form-label', for: 'cmd-name' }, el('span', { text: 'Имя команды' })),
    el('div', { class: 'input-wrap' },
      el('span', { class: 'input-prefix', text: '!' }),
      nameInput
    ),
    el('p', { class: 'form-hint', text: 'Латиница или кириллица, цифры, _ и -. До 32 символов.' }),
    el('p', { class: 'field-error', dataset: { error: 'name' } })
  );

  /* aliases */
  const tagInput = el('div', { class: 'tag-input', id: 'cmd-aliases' });
  const aliasInput = el('input', {
    class: 'tag-field',
    placeholder: 'алиас + Enter',
    maxlength: '32',
    autocomplete: 'off',
    'aria-label': 'Добавить алиас'
  });

  function paintAliases() {
    tagInput.querySelectorAll('.tag').forEach(function (tag) { tag.remove(); });
    draft.aliases.forEach(function (alias, index) {
      const remove = el('button', {
        type: 'button',
        'aria-label': 'Убрать алиас ' + alias,
        onClick: function () {
          draft.aliases.splice(index, 1);
          paintAliases();
          clearError('aliases');
        }
      }, icon('x', 11));
      const tag = el('span', { class: 'tag' }, el('span', { text: alias }), remove);
      tagInput.insertBefore(tag, aliasInput);
    });
  }

  function addAlias(raw) {
    const alias = String(raw || '').replace(/^[!#]+/, '').trim().toLowerCase();
    aliasInput.value = '';
    if (!alias) return;
    if (draft.aliases.indexOf(alias) !== -1) return;
    if (draft.aliases.length >= meta.maxAliases) {
      fieldError('aliases', 'Максимум ' + meta.maxAliases + ' алиасов');
      return;
    }
    draft.aliases.push(alias);
    paintAliases();
    clearError('aliases');
  }

  aliasInput.addEventListener('keydown', function (event) {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      addAlias(aliasInput.value);
    } else if (event.key === 'Backspace' && !aliasInput.value && draft.aliases.length) {
      draft.aliases.pop();
      paintAliases();
    }
  });
  aliasInput.addEventListener('blur', function () { addAlias(aliasInput.value); });

  tagInput.appendChild(aliasInput);
  paintAliases();

  const aliasesBlock = el('div', { class: 'form-section' },
    el('label', { class: 'form-label' }, el('span', { text: 'Алиасы' }), el('span', { class: 'counter', text: 'до ' + meta.maxAliases })),
    tagInput,
    el('p', { class: 'form-hint', text: 'Например: дс, дискорд. Enter или запятая — добавить.' }),
    el('p', { class: 'field-error', dataset: { error: 'aliases' } })
  );

  /* reply */
  const replyInput = el('textarea', {
    class: 'input',
    id: 'cmd-reply',
    rows: '4',
    placeholder: 'Привет, {user}! Заходи в Discord: {discord}'
  });
  replyInput.value = draft.reply;
  replyInput.addEventListener('input', function () {
    draft.reply = replyInput.value;
    updatePreview();
    clearError('reply');
  });

  const varRow = el('div', { class: 'var-row' });
  VAR_LIST.forEach(function (variable) {
    varRow.appendChild(el('button', {
      class: 'var-chip',
      type: 'button',
      text: variable,
      title: 'Вставить ' + variable,
      onClick: function () {
        const start = replyInput.selectionStart == null ? replyInput.value.length : replyInput.selectionStart;
        const end = replyInput.selectionEnd == null ? start : replyInput.selectionEnd;
        replyInput.setRangeText(variable, start, end, 'end');
        replyInput.focus();
        replyInput.dispatchEvent(new Event('input'));
      }
    }));
  });

  const replyBlock = el('div', { class: 'form-section' },
    el('label', { class: 'form-label', for: 'cmd-reply' }, el('span', { text: 'Ответ бота' }), counter),
    replyInput,
    varRow,
    el('div', { class: 'preview' },
      el('div', { class: 'preview-head' }, el('span', { class: 'status-dot' }), el('span', { text: 'предпросмотр' })),
      el('div', { class: 'preview-bubble' },
        el('span', { class: 'preview-user', text: 'Аня' }),
        previewText
      )
    ),
    el('p', { class: 'field-error', dataset: { error: 'reply' } })
  );

  /* permission */
  const permissionSeg = el('div', { class: 'seg' });
  const permissionOptions = [
    { value: 'everyone', label: 'Все' },
    { value: 'mod', label: 'Модераторы' },
    { value: 'broadcaster', label: 'Стример' }
  ];
  permissionOptions.forEach(function (option) {
    permissionSeg.appendChild(el('button', {
      class: 'seg-btn ' + (draft.permission === option.value ? 'active' : ''),
      type: 'button',
      text: option.label,
      onClick: function () {
        draft.permission = option.value;
        permissionSeg.querySelectorAll('.seg-btn').forEach(function (btn, index) {
          btn.classList.toggle('active', permissionOptions[index].value === option.value);
        });
      }
    }));
  });

  const permissionBlock = el('div', { class: 'form-section' },
    el('label', { class: 'form-label' }, el('span', { text: 'Кто может пользоваться' })),
    permissionSeg,
    el('p', { class: 'form-hint', text: '«Модераторы» и «Стример» не показываются зрителям в !help.' })
  );

  /* platforms */
  const platformsBlock = el('div', { class: 'form-section' },
    el('label', { class: 'form-label' }, el('span', { text: 'Платформы' }))
  );
  const platformRow = el('div', { class: 'check-row', id: 'cmd-platforms' });
  [
    { value: 'twitch', label: 'Twitch', enabled: true },
    { value: 'youtube', label: 'YouTube', enabled: meta.youtubeEnabled }
  ].forEach(function (platform) {
    const input = el('input', {
      type: 'checkbox',
      checked: draft.platforms.indexOf(platform.value) !== -1,
      disabled: !platform.enabled
    });
    input.addEventListener('change', function () {
      if (input.checked) {
        if (draft.platforms.indexOf(platform.value) === -1) draft.platforms.push(platform.value);
      } else {
        draft.platforms = draft.platforms.filter(function (p) { return p !== platform.value; });
      }
      if (!draft.platforms.length) {
        draft.platforms = ['twitch'];
        input.checked = false;
        fieldError('platforms', 'Нужна хотя бы одна платформа');
      }
      paintPlatforms();
      updatePreview();
    });
    const chip = el('label', { class: 'check-chip ' + (draft.platforms.indexOf(platform.value) !== -1 ? 'checked' : '') + (platform.enabled ? '' : ' disabled') },
      input,
      el('span', { text: platform.label })
    );
    chip.dataset.platform = platform.value;
    platformRow.appendChild(chip);
  });
  function paintPlatforms() {
    platformRow.querySelectorAll('.check-chip').forEach(function (chip) {
      const input = chip.querySelector('input');
      chip.classList.toggle('checked', input.checked);
    });
  }
  platformsBlock.appendChild(platformRow);
  platformsBlock.appendChild(el('p', {
    class: 'form-hint',
    text: meta.youtubeEnabled ? 'Куда бот может отвечать.' : 'YouTube выключен в config.js — доступен только Twitch.'
  }));
  platformsBlock.appendChild(el('p', { class: 'field-error', dataset: { error: 'platforms' } }));

  /* cooldown */
  const cooldownInput = el('input', {
    class: 'input',
    id: 'cmd-cooldown',
    type: 'number',
    min: '1',
    max: '3600',
    step: '1',
    value: draft.cooldownSec,
    placeholder: 'по умолчанию'
  });
  cooldownInput.addEventListener('input', function () {
    draft.cooldownSec = cooldownInput.value;
    clearError('cooldownMs');
  });
  const cooldownBlock = el('div', { class: 'form-section' },
    el('label', { class: 'form-label', for: 'cmd-cooldown' }, el('span', { text: 'Своя задержка, секунды' })),
    cooldownInput,
    el('p', { class: 'form-hint', text: 'Пусто или 0 — общая задержка из настроек. Минимум 1 секунда.' }),
    el('p', { class: 'field-error', dataset: { error: 'cooldownMs' } })
  );

  /* enabled */
  const enabledInput = el('input', { type: 'checkbox', checked: draft.enabled });
  enabledInput.addEventListener('change', function () { draft.enabled = enabledInput.checked; });
  const enabledBlock = el('div', { class: 'form-section' },
    el('div', { class: 'switch-row' },
      el('div', { class: 'switch-copy' },
        el('strong', { text: 'Команда включена' }),
        el('span', { text: 'Выключенная команда не отвечает и не попадает в !help.' })
      ),
      el('label', { class: 'switch' }, enabledInput, el('span', { class: 'track' }))
    )
  );

  const body = el('div', { class: 'drawer-body' },
    errorBox,
    nameBlock,
    aliasesBlock,
    replyBlock,
    permissionBlock,
    platformsBlock,
    cooldownBlock,
    enabledBlock
  );

  const saveBtn = button(isNew ? 'Создать команду' : 'Сохранить', 'check', 'primary');
  const cancelBtn = button('Отмена', null, 'ghost', closeDrawer);
  saveBtn.addEventListener('click', saveCommandDraft);

  const overlay = el('div', { class: 'drawer-overlay' },
    el('aside', {
      class: 'drawer',
      role: 'dialog',
      'aria-modal': 'true',
      'aria-labelledby': 'drawer-title'
    },
      el('header', { class: 'drawer-head' },
        el('div', null,
          el('p', { class: 'eyebrow', text: isNew ? 'Новая команда' : 'Редактирование' }),
          el('h2', { id: 'drawer-title', text: isNew ? 'Создать команду' : '!' + draft.name }),
          el('p', { text: 'Ответ появится в чате Twitch' })
        ),
        el('button', {
          class: 'icon-btn',
          type: 'button',
          title: 'Закрыть',
          'aria-label': 'Закрыть',
          onClick: closeDrawer
        }, icon('x', 18))
      ),
      body,
      el('footer', { class: 'drawer-foot' }, cancelBtn, saveBtn)
    )
  );

  overlay.addEventListener('mousedown', function (event) {
    if (event.target === overlay) closeDrawer();
  });

  root.appendChild(overlay);
  updatePreview();

  state.drawerKeyHandler = function (event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeDrawer();
    } else if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      saveCommandDraft();
    } else if (event.key === 'Tab') {
      trapFocus(event, overlay.querySelector('.drawer'));
    }
  };
  document.addEventListener('keydown', state.drawerKeyHandler);
  document.body.style.overflow = 'hidden';

  window.setTimeout(function () {
    nameInput.focus();
    nameInput.select();
  }, 60);

  /* save */
  async function saveCommandDraft() {
    if (state.saving) return;
    const errors = validateCommandDraft(draft, editing);
    if (Object.keys(errors).length) {
      errorBox.textContent = 'Проверь поля формы';
      errorBox.classList.add('visible');
      Object.keys(errors).forEach(function (field) { fieldError(field, errors[field]); });
      return;
    }
    errorBox.classList.remove('visible');
    state.saving = true;
    saveBtn.disabled = true;
    const hadLabel = saveBtn.querySelector('.btn-label');
    if (hadLabel) hadLabel.textContent = 'Сохраняю…';

    const base = editing.isNew ? {} : copy(state.panel.commands[editing.index]);
    const payload = Object.assign(base, {
      name: draft.name.trim().replace(/^[!#]+/, '').toLowerCase(),
      aliases: draft.aliases.slice(),
      reply: draft.reply,
      permission: draft.permission,
      platforms: draft.platforms.slice(),
      cooldownMs: draft.cooldownSec === '' ? 0 : Math.round(Number(draft.cooldownSec) * 1000),
      enabled: draft.enabled
    });
    const next = copy(state.panel.commands);
    if (editing.isNew) next.push(payload);
    else next[editing.index] = payload;

    try {
      const data = await api('/api/commands', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commands: next })
      });
      state.panel.commands = data.commands;
      const message = editing.isNew ? 'Команда !' + payload.name + ' создана' : 'Команда !' + payload.name + ' сохранена';
      closeDrawer();
      toast(message, 'ok');
      render();
      refreshStatus();
    } catch (error) {
      errorBox.textContent = error.message;
      errorBox.classList.add('visible');
      Object.keys(error.fields || {}).forEach(function (field) { fieldError(field, error.fields[field]); });
      saveBtn.disabled = false;
      if (hadLabel) hadLabel.textContent = isNew ? 'Создать команду' : 'Сохранить';
    } finally {
      state.saving = false;
    }
  }
}

function validateCommandDraft(draft, editing) {
  const errors = {};
  const meta = state.panel.meta;
  const name = draft.name.trim().replace(/^[!#]+/, '').toLowerCase();
  const reserved = new Set();
  meta.builtins.forEach(function (command) {
    reserved.add(command.name);
    (command.aliases || []).forEach(function (alias) { reserved.add(alias); });
  });

  if (!name) errors.name = 'Введи имя команды';
  else if (!/^[a-zа-яё0-9_-]{1,32}$/i.test(name)) errors.name = 'Только буквы, цифры, _ и -, до 32 символов';
  else if (reserved.has(name)) errors.name = 'Это имя занято встроенной командой';

  const used = new Map();
  state.panel.commands.forEach(function (command, index) {
    if (!editing.isNew && index === editing.index) return;
    used.set(command.name, 'name');
    (command.aliases || []).forEach(function (alias) { used.set(alias, 'aliases'); });
  });
  if (!errors.name && used.has(name)) errors.name = 'Такая команда или алиас уже есть';

  draft.aliases.forEach(function (alias) {
    if (!/^[a-zа-яё0-9_-]{1,32}$/i.test(alias)) errors.aliases = 'Алиас «' + alias + '» не подходит';
    else if (reserved.has(alias)) errors.aliases = 'Алиас «' + alias + '» занят встроенной командой';
    else if (used.has(alias)) errors.aliases = 'Алиас «' + alias + '» уже используется';
  });
  if (draft.aliases.length > meta.maxAliases) errors.aliases = 'Максимум ' + meta.maxAliases + ' алиасов';

  if (!draft.reply.trim()) errors.reply = 'Напиши текст ответа';
  else {
    const limit = currentReplyLimit(draft.platforms);
    if (draft.reply.length > limit) errors.reply = 'Сократи ответ до ' + limit + ' символов';
  }

  if (!draft.platforms.length) errors.platforms = 'Нужна хотя бы одна платформа';

  if (draft.cooldownSec !== '') {
    const value = Number(draft.cooldownSec);
    if (!Number.isFinite(value) || value < 1 || value > 3600 || Math.round(value) !== value) {
      errors.cooldownMs = 'Целое число от 1 до 3600 секунд';
    }
  }

  return errors;
}

function closeDrawer() {
  const root = document.getElementById('drawer-root');
  clear(root);
  if (state.drawerKeyHandler) {
    document.removeEventListener('keydown', state.drawerKeyHandler);
    state.drawerKeyHandler = null;
  }
  document.body.style.overflow = '';
  state.editing = null;
}

function trapFocus(event, container) {
  if (!container) return;
  const nodes = container.querySelectorAll('button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), a[href]');
  if (!nodes.length) return;
  const first = nodes[0];
  const last = nodes[nodes.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

/* ---------- timers ---------- */

function renderTimersView() {
  const p = state.panel;
  const wrap = el('div', { class: 'timers-view' });
  wrap.appendChild(el('div', { class: 'note-banner' },
    icon('info', 16),
    el('div', null,
      el('strong', { text: 'Автосообщения не спамят. ' }),
      el('span', {
        text: 'Бот пишет только если в чате была активность за последние ' +
          p.meta.activityWindowMinutes + ' мин, и держит паузу ' +
          Math.round(p.meta.minGapMs / 60000) + ' мин между любыми автосообщениями.'
      })
    )
  ));

  if (!p.timers.length) {
    wrap.appendChild(el('div', { class: 'empty' },
      el('span', { class: 'empty-icon' }, icon('timers', 23)),
      el('h3', { text: 'Расписание пока пустое' }),
      el('p', { text: 'Добавь первое автосообщение — например, напоминание о ссылках раз в 30 минут.' }),
      button('Добавить автосообщение', 'plus', 'primary small', function () { openTimerDrawer(null); })
    ));
    return wrap;
  }

  const list = el('div', { class: 'timer-grid' });
  p.timers.forEach(function (timer, index) {
    const enabled = timer.enabled !== false;
    const next = enabled ? findNextTimer(timer.id) : null;
    list.appendChild(el('article', { class: 'timer-card ' + (enabled ? '' : 'disabled') },
      el('div', { class: 'timer-interval' },
        el('strong', { text: String(timer.everyMinutes) }),
        el('span', { text: 'минут' })
      ),
      el('div', { class: 'timer-body' },
        el('p', { class: 'timer-text', text: timer.text }),
        el('div', { class: 'timer-meta' },
          (timer.platforms || ['twitch']).map(function (platform) {
            return el('span', { class: 'chip ' + (platform === 'twitch' ? 'accent' : ''), text: platform });
          }),
          el('span', {
            class: 'chip ' + (enabled ? '' : 'warn'),
            dataset: { nextTimer: timer.id },
            text: enabled ? (next === null ? 'ждёт статус' : formatNext(next)) : 'выключено'
          })
        )
      ),
      el('div', { class: 'timer-actions' },
        el('button', {
          class: 'icon-btn',
          type: 'button',
          title: 'Редактировать',
          'aria-label': 'Редактировать автосообщение',
          onClick: function () { openTimerDrawer(index); }
        }, icon('edit', 16)),
        el('button', {
          class: 'icon-btn danger',
          type: 'button',
          title: 'Удалить',
          'aria-label': 'Удалить автосообщение',
          onClick: function () { askDeleteTimer(index); }
        }, icon('trash', 16)),
        el('label', { class: 'switch', title: enabled ? 'Выключить' : 'Включить' },
          el('input', {
            type: 'checkbox',
            checked: enabled,
            'aria-label': (enabled ? 'Выключить' : 'Включить') + ' автосообщение',
            onChange: function (event) { toggleTimer(index, event.target.checked); }
          }),
          el('span', { class: 'track' })
        )
      )
    ));
  });
  wrap.appendChild(list);
  return wrap;
}

function findNextTimer(id) {
  if (!state.status || !state.status.timers) return null;
  const found = state.status.timers.find(function (timer) { return timer.id === id; });
  return found ? found.nextInSec : null;
}

function updateTimerNextLabels() {
  document.querySelectorAll('[data-next-timer]').forEach(function (node) {
    const card = node.closest('.timer-card');
    if (card && card.classList.contains('disabled')) {
      node.textContent = 'выключено';
      return;
    }
    const id = node.dataset.nextTimer;
    const next = findNextTimer(id);
    node.textContent = next === null ? 'ждёт статус' : formatNext(next);
  });
}

async function toggleTimer(index, enabled) {
  if (state.saving) return;
  const next = copy(state.panel.timers);
  if (!next[index]) return;
  next[index].enabled = enabled;
  await saveTimerList(next, enabled ? 'Автосообщение включено' : 'Автосообщение выключено');
}

function askDeleteTimer(index) {
  const timer = state.panel.timers[index];
  if (!timer) return;
  confirmDialog(
    'Удалить автосообщение?',
    'Текст «' + timer.text.slice(0, 80) + (timer.text.length > 80 ? '…' : '') + '» исчезнет из config.js.',
    'Удалить',
    function () {
      const next = copy(state.panel.timers);
      next.splice(index, 1);
      saveTimerList(next, 'Автосообщение удалено');
    }
  );
}

async function saveTimerList(next, message) {
  state.saving = true;
  try {
    const data = await api('/api/timers', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ timers: next })
    });
    state.panel.timers = data.timers;
    toast(message || 'Расписание сохранено', 'ok');
    render();
    refreshStatus();
  } catch (error) {
    toast(error.message, 'error');
    render();
  } finally {
    state.saving = false;
  }
}

function openTimerDrawer(index) {
  if (!state.panel) return;
  const isNew = index == null;
  const source = isNew ? {
    text: '', everyMinutes: 30, platforms: ['twitch'], enabled: true
  } : state.panel.timers[index];
  if (!source) return;
  let platforms = (source.platforms && source.platforms.length ? source.platforms : ['twitch']).slice();
  if (!state.panel.meta.youtubeEnabled) platforms = platforms.filter(function (p) { return p !== 'youtube'; });
  if (!platforms.length) platforms = ['twitch'];

  state.editing = {
    type: 'timer',
    index: isNew ? null : index,
    isNew: isNew,
    draft: {
      id: source.id || undefined,
      text: source.text || '',
      everyMinutes: String(source.everyMinutes || 30),
      platforms: platforms,
      enabled: source.enabled !== false
    }
  };
  renderTimerDrawer();
}

function renderTimerDrawer() {
  const editing = state.editing;
  const draft = editing.draft;
  const meta = state.panel.meta;
  const isNew = editing.isNew;
  const root = clear(document.getElementById('drawer-root'));
  const errorBox = el('div', { class: 'form-error', id: 'form-error', role: 'alert' });
  const previewText = el('span', { class: 'preview-text' });
  const counter = el('span', { class: 'counter' });

  function updatePreview() {
    previewText.textContent = renderVars(draft.text || 'Здесь появится автосообщение');
    const limit = currentTimerLimit(draft.platforms);
    counter.textContent = draft.text.length + ' / ' + limit;
    counter.classList.toggle('over', draft.text.length > limit);
  }

  function clearError(field) {
    const error = overlay.querySelector('[data-error="' + field + '"]');
    if (error) error.classList.remove('visible');
    const input = overlay.querySelector('#timer-' + field);
    if (input) input.classList.remove('invalid');
    errorBox.classList.remove('visible');
  }

  function fieldError(field, message) {
    const error = overlay.querySelector('[data-error="' + field + '"]');
    if (error) {
      error.textContent = message;
      error.classList.add('visible');
    }
    const input = overlay.querySelector('#timer-' + field);
    if (input) input.classList.add('invalid');
  }

  const textInput = el('textarea', {
    class: 'input',
    id: 'timer-text',
    rows: '4',
    placeholder: 'Все ссылки: {socials}'
  });
  textInput.value = draft.text;
  textInput.addEventListener('input', function () {
    draft.text = textInput.value;
    updatePreview();
    clearError('text');
  });

  const varRow = el('div', { class: 'var-row' });
  VAR_LIST.forEach(function (variable) {
    varRow.appendChild(el('button', {
      class: 'var-chip',
      type: 'button',
      text: variable,
      title: 'Вставить ' + variable,
      onClick: function () {
        const start = textInput.selectionStart == null ? textInput.value.length : textInput.selectionStart;
        const end = textInput.selectionEnd == null ? start : textInput.selectionEnd;
        textInput.setRangeText(variable, start, end, 'end');
        textInput.focus();
        textInput.dispatchEvent(new Event('input'));
      }
    }));
  });

  const textBlock = el('div', { class: 'form-section' },
    el('label', { class: 'form-label', for: 'timer-text' }, el('span', { text: 'Текст сообщения' }), counter),
    textInput,
    varRow,
    el('div', { class: 'preview' },
      el('div', { class: 'preview-head' }, el('span', { class: 'status-dot' }), el('span', { text: 'предпросмотр' })),
      el('div', { class: 'preview-bubble' },
        el('span', { class: 'preview-user', text: 'бот' }),
        previewText
      )
    ),
    el('p', { class: 'field-error', dataset: { error: 'text' } })
  );

  const intervalInput = el('input', {
    class: 'input',
    id: 'timer-everyMinutes',
    type: 'number',
    min: '1',
    max: '1440',
    step: '1',
    value: draft.everyMinutes
  });
  intervalInput.addEventListener('input', function () {
    draft.everyMinutes = intervalInput.value;
    clearError('everyMinutes');
  });

  const intervalBlock = el('div', { class: 'form-section' },
    el('label', { class: 'form-label', for: 'timer-everyMinutes' }, el('span', { text: 'Интервал, минут' })),
    intervalInput,
    el('p', { class: 'form-hint', text: 'От 1 до 1440 минут. Первое сообщение — только через полный интервал.' }),
    el('p', { class: 'field-error', dataset: { error: 'everyMinutes' } })
  );

  const platformRow = el('div', { class: 'check-row', id: 'timer-platforms' });
  [
    { value: 'twitch', label: 'Twitch', enabled: true },
    { value: 'youtube', label: 'YouTube', enabled: meta.youtubeEnabled }
  ].forEach(function (platform) {
    const input = el('input', {
      type: 'checkbox',
      checked: draft.platforms.indexOf(platform.value) !== -1,
      disabled: !platform.enabled
    });
    input.addEventListener('change', function () {
      if (input.checked) {
        if (draft.platforms.indexOf(platform.value) === -1) draft.platforms.push(platform.value);
      } else {
        draft.platforms = draft.platforms.filter(function (p) { return p !== platform.value; });
      }
      if (!draft.platforms.length) draft.platforms = ['twitch'];
      paintPlatforms();
      updatePreview();
    });
    const chip = el('label', { class: 'check-chip ' + (draft.platforms.indexOf(platform.value) !== -1 ? 'checked' : '') + (platform.enabled ? '' : ' disabled') },
      input,
      el('span', { text: platform.label })
    );
    platformRow.appendChild(chip);
  });
  function paintPlatforms() {
    platformRow.querySelectorAll('.check-chip').forEach(function (chip) {
      chip.classList.toggle('checked', chip.querySelector('input').checked);
    });
  }

  const platformBlock = el('div', { class: 'form-section' },
    el('label', { class: 'form-label' }, el('span', { text: 'Платформы' })),
    platformRow,
    el('p', { class: 'field-error', dataset: { error: 'platforms' } })
  );

  const enabledInput = el('input', { type: 'checkbox', checked: draft.enabled });
  enabledInput.addEventListener('change', function () { draft.enabled = enabledInput.checked; });
  const enabledBlock = el('div', { class: 'form-section' },
    el('div', { class: 'switch-row' },
      el('div', { class: 'switch-copy' },
        el('strong', { text: 'Автосообщение включено' }),
        el('span', { text: 'Выключенное не попадает в расписание.' })
      ),
      el('label', { class: 'switch' }, enabledInput, el('span', { class: 'track' }))
    )
  );

  const body = el('div', { class: 'drawer-body' },
    errorBox, textBlock, intervalBlock, platformBlock, enabledBlock
  );

  const saveBtn = button(isNew ? 'Создать' : 'Сохранить', 'check', 'primary');
  const cancelBtn = button('Отмена', null, 'ghost', closeDrawer);

  const overlay = el('div', { class: 'drawer-overlay' },
    el('aside', { class: 'drawer', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'drawer-title' },
      el('header', { class: 'drawer-head' },
        el('div', null,
          el('p', { class: 'eyebrow', text: isNew ? 'Новое автосообщение' : 'Редактирование' }),
          el('h2', { id: 'drawer-title', text: isNew ? 'Добавить в расписание' : 'Автосообщение' }),
          el('p', { text: 'Пишется только в активный чат' })
        ),
        el('button', { class: 'icon-btn', type: 'button', title: 'Закрыть', 'aria-label': 'Закрыть', onClick: closeDrawer }, icon('x', 18))
      ),
      body,
      el('footer', { class: 'drawer-foot' }, cancelBtn, saveBtn)
    )
  );
  overlay.addEventListener('mousedown', function (event) { if (event.target === overlay) closeDrawer(); });
  root.appendChild(overlay);
  updatePreview();

  state.drawerKeyHandler = function (event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeDrawer();
    } else if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      saveTimerDraft();
    } else if (event.key === 'Tab') {
      trapFocus(event, overlay.querySelector('.drawer'));
    }
  };
  document.addEventListener('keydown', state.drawerKeyHandler);
  document.body.style.overflow = 'hidden';
  window.setTimeout(function () { textInput.focus(); }, 60);

  saveBtn.addEventListener('click', saveTimerDraft);

  async function saveTimerDraft() {
    if (state.saving) return;
    const errors = validateTimerDraft(draft);
    if (Object.keys(errors).length) {
      errorBox.textContent = 'Проверь поля формы';
      errorBox.classList.add('visible');
      Object.keys(errors).forEach(function (field) { fieldError(field, errors[field]); });
      return;
    }

    state.saving = true;
    saveBtn.disabled = true;
    const label = saveBtn.querySelector('.btn-label');
    if (label) label.textContent = 'Сохраняю…';

    const payload = {
      text: draft.text,
      everyMinutes: Number(draft.everyMinutes),
      platforms: draft.platforms.slice(),
      enabled: draft.enabled
    };
    if (draft.id) payload.id = draft.id;

    const next = copy(state.panel.timers);
    if (editing.isNew) next.push(payload);
    else next[editing.index] = Object.assign(copy(state.panel.timers[editing.index]), payload);

    try {
      const data = await api('/api/timers', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timers: next })
      });
      state.panel.timers = data.timers;
      closeDrawer();
      toast(isNew ? 'Автосообщение добавлено' : 'Автосообщение сохранено', 'ok');
      render();
      refreshStatus();
    } catch (error) {
      errorBox.textContent = error.message;
      errorBox.classList.add('visible');
      Object.keys(error.fields || {}).forEach(function (field) { fieldError(field, error.fields[field]); });
      saveBtn.disabled = false;
      if (label) label.textContent = isNew ? 'Создать' : 'Сохранить';
    } finally {
      state.saving = false;
    }
  }
}

function currentTimerLimit(platforms) {
  return (platforms || []).indexOf('youtube') !== -1 ? 200 : 480;
}

function validateTimerDraft(draft) {
  const errors = {};
  if (!draft.text.trim()) errors.text = 'Напиши текст автосообщения';
  else {
    const limit = currentTimerLimit(draft.platforms);
    if (draft.text.length > limit) errors.text = 'Сократи текст до ' + limit + ' символов';
  }
  const minutes = Number(draft.everyMinutes);
  if (!Number.isFinite(minutes) || minutes < 1 || minutes > 1440 || Math.round(minutes) !== minutes) {
    errors.everyMinutes = 'Целое число от 1 до 1440';
  }
  if (!draft.platforms.length) errors.platforms = 'Выбери платформу';
  return errors;
}

/* ---------- moderation ---------- */

function settingsCard(title, sub, badge, children) {
  const card = el('section', { class: 'card settings-card' });
  card.appendChild(el('div', { class: 'card-head' },
    el('div', null,
      el('h2', { class: 'card-title', text: title }),
      sub ? el('p', { class: 'card-sub', text: sub }) : null
    ),
    badge ? el('span', { class: 'chip accent', text: badge }) : null
  ));
  children.forEach(function (child) { if (child) card.appendChild(child); });
  return card;
}

function settingField(label, control, hint) {
  return el('div', { class: 'setting-field' },
    el('label', { class: 'setting-label', text: label }),
    control,
    hint ? el('p', { class: 'setting-hint', text: hint }) : null
  );
}

function settingToggle(label, hint, checked, onChange) {
  const input = el('input', { type: 'checkbox', checked: !!checked });
  input.addEventListener('change', function () { onChange(input.checked); });
  return el('div', { class: 'setting-toggle' },
    el('div', { class: 'setting-toggle-copy' },
      el('strong', { text: label }),
      hint ? el('span', { class: 'setting-hint', text: hint }) : null
    ),
    el('label', { class: 'switch' }, input, el('span', { class: 'track' }))
  );
}

function settingNumber(label, value, min, max, onChange, hint) {
  const input = el('input', {
    class: 'input',
    type: 'number',
    min: min,
    max: max,
    value: value == null ? '' : value,
    autocomplete: 'off'
  });
  input.addEventListener('input', function () {
    onChange(input.value === '' ? '' : Number(input.value));
  });
  return settingField(label, input, hint);
}

function settingText(label, value, onChange, hint) {
  const input = el('input', { class: 'input', value: value == null ? '' : value, autocomplete: 'off' });
  input.addEventListener('input', function () { onChange(input.value); });
  return settingField(label, input, hint);
}

function settingArea(label, value, onChange, hint, rows) {
  const area = el('textarea', {
    class: 'input',
    rows: rows || 4,
    value: value == null ? '' : value,
    spellcheck: false
  });
  area.addEventListener('input', function () { onChange(area.value); });
  return settingField(label, area, hint);
}

function markModDirty() {
  state.modDirty = true;
  renderTopbar();
  const sub = document.getElementById('page-sub');
  if (sub) sub.textContent = 'Есть несохранённые изменения';
}

function markFunDirty() {
  state.funDirty = true;
  renderTopbar();
  const sub = document.getElementById('page-sub');
  if (sub) sub.textContent = 'Есть несохранённые изменения';
}

function renderModerationView() {
  if (!state.modDraft) state.modDraft = copy(state.panel.moderation || {});
  const draft = state.modDraft;
  const stats = (state.status && state.status.moderation && state.status.moderation.stats) || {};

  const wrap = el('div', { class: 'settings-view' });
  wrap.appendChild(el('div', { class: 'stats' },
    statCard('Удалено', stats.deleted || 0, 'chat', '#a970ff', 'rgba(169, 112, 255, 0.12)', 'rgba(169, 112, 255, 0.18)'),
    statCard('Мутов', stats.timeouts || 0, 'timers', '#ffb020', 'rgba(255, 176, 32, 0.12)', 'rgba(255, 176, 32, 0.18)'),
    statCard('Банов', stats.bans || 0, 'lock', '#ff6172', 'rgba(255, 97, 114, 0.12)', 'rgba(255, 97, 114, 0.18)'),
    statCard('Нарушений', stats.violations || 0, 'alert', '#45d483', 'rgba(69, 212, 131, 0.12)', 'rgba(69, 212, 131, 0.18)')
  ));

  const columns = el('div', { class: 'settings-columns' });
  const left = el('div', { class: 'stack' });
  const right = el('div', { class: 'stack' });

  left.appendChild(settingsCard('Основное', 'Автоматическая модерация сообщений в чате', draft.enabled ? 'включена' : 'выключена', [
    settingToggle('Модерация включена', 'Проверять каждое сообщение в чате', draft.enabled !== false, function (value) {
      draft.enabled = value; markModDirty();
    }),
    settingToggle('Удалять нарушения', 'Бот удаляет сообщение через /delete', draft.deleteMessages !== false, function (value) {
      draft.deleteMessages = value; markModDirty();
    }),
    settingToggle('Предупреждать в чате', 'Короткий ответ нарушителю (не чаще раза в минуту)', draft.warnInChat !== false, function (value) {
      draft.warnInChat = value; markModDirty();
    })
  ]));

  draft.exempt = draft.exempt || {};
  left.appendChild(settingsCard('Кого не трогать', 'Освобождение от автоматической модерации', '', [
    el('div', { class: 'settings-toggles' },
      settingToggle('Модераторов', '', draft.exempt.mods !== false, function (v) { draft.exempt.mods = v; markModDirty(); }),
      settingToggle('Стримера', '', draft.exempt.broadcaster !== false, function (v) { draft.exempt.broadcaster = v; markModDirty(); }),
      settingToggle('Подписчиков', '', draft.exempt.subscribers !== false, function (v) { draft.exempt.subscribers = v; markModDirty(); }),
      settingToggle('VIP', '', draft.exempt.vips !== false, function (v) { draft.exempt.vips = v; markModDirty(); })
    ),
    settingArea('Свои ники (по одному в строке)', (draft.exempt.users || []).join('\n'), function (value) {
      draft.exempt.users = value.split(/\n+/).map(function (item) { return item.trim(); }).filter(Boolean);
      markModDirty();
    }, 'Этих зрителей модерация не проверяет.', 3)
  ]));

  draft.bannedWords = draft.bannedWords || {};
  left.appendChild(settingsCard('Запрещённые слова', 'Удаление и наказание за недопустимые слова', '', [
    settingToggle('Проверять слова', '', draft.bannedWords.enabled !== false, function (value) {
      draft.bannedWords.enabled = value; markModDirty();
    }),
    settingArea('Слова и фразы (по одному в строке)',
      (draft.bannedWords.words || []).join('\n'),
      function (value) {
        draft.bannedWords.words = value.split(/\n+/).map(function (item) { return item.trim(); }).filter(Boolean);
        markModDirty();
      },
      'Совпадение без учёта регистра. Фразы можно писать с пробелами.', 6)
  ]));

  draft.links = draft.links || {};
  left.appendChild(settingsCard('Ссылки', 'Сторонние ссылки удаляются, разрешённые — пропускаются', '', [
    settingToggle('Проверять ссылки', '', draft.links.enabled !== false, function (value) {
      draft.links.enabled = value; markModDirty();
    }),
    settingToggle('Разрешать ссылки из «Ссылок»', 'Домены Twitch, YouTube, Discord, Telegram и т.д.', draft.links.useSocials !== false, function (value) {
      draft.links.useSocials = value; markModDirty();
    }),
    settingArea('Разрешённые домены (по одному в строке)',
      (draft.links.allow || []).join('\n'),
      function (value) {
        draft.links.allow = value.split(/\n+/).map(function (item) { return item.trim(); }).filter(Boolean);
        markModDirty();
      },
      'Поддомены разрешаются автоматически: clips.twitch.tv подходит для twitch.tv.', 6)
  ]));

  draft.caps = draft.caps || {};
  right.appendChild(settingsCard('Капс', 'Слишком громкие сообщения', '', [
    settingToggle('Проверять капс', '', draft.caps.enabled !== false, function (value) {
      draft.caps.enabled = value; markModDirty();
    }),
    settingNumber('Минимум букв', draft.caps.minLength, 1, 200, function (value) { draft.caps.minLength = value; markModDirty(); }, 'Короткие сообщения не проверяются.'),
    settingNumber('Доля заглавных, %', draft.caps.percent, 1, 100, function (value) { draft.caps.percent = value; markModDirty(); }, 'Например, 70 — сообщение почти полностью капсом.')
  ]));

  draft.spam = draft.spam || {};
  right.appendChild(settingsCard('Спам и флуд', 'Частота, повторы, длина', '', [
    settingToggle('Проверять спам', '', draft.spam.enabled !== false, function (value) {
      draft.spam.enabled = value; markModDirty();
    }),
    settingNumber('Сообщений за окно', draft.spam.maxMessages, 2, 100, function (value) { draft.spam.maxMessages = value; markModDirty(); }),
    settingNumber('Окно, секунд', draft.spam.windowSec, 1, 300, function (value) { draft.spam.windowSec = value; markModDirty(); }),
    settingNumber('Повторов одного текста', draft.spam.duplicateCount, 2, 100, function (value) { draft.spam.duplicateCount = value; markModDirty(); }),
    settingNumber('Окно повторов, секунд', draft.spam.duplicateWindowSec, 1, 600, function (value) { draft.spam.duplicateWindowSec = value; markModDirty(); }),
    settingNumber('Максимум символов', draft.spam.maxLength, 50, 500, function (value) { draft.spam.maxLength = value; markModDirty(); })
  ]));

  draft.punishment = draft.punishment || {};
  right.appendChild(settingsCard('Наказания', 'Мут и бан по числу нарушений', '', [
    settingToggle('Выдавать наказания', 'Если выключено — бот только удаляет сообщения', draft.punishment.enabled !== false, function (value) {
      draft.punishment.enabled = value; markModDirty();
    }),
    settingNumber('Мут со страйка', draft.punishment.timeoutAfter, 1, 50, function (value) { draft.punishment.timeoutAfter = value; markModDirty(); }, 'Первый мут после N нарушений.'),
    settingNumber('Длительность мута, сек', draft.punishment.timeoutSec, 1, 1209600, function (value) { draft.punishment.timeoutSec = value; markModDirty(); }, 'Дальше длительность растёт с каждым нарушением.'),
    settingNumber('Бан со страйка', draft.punishment.banAfter, 0, 100, function (value) { draft.punishment.banAfter = value; markModDirty(); }, '0 — не банить автоматически.'),
    settingNumber('Окно страйков, минут', draft.punishment.strikeWindowMin, 1, 1440, function (value) { draft.punishment.strikeWindowMin = value; markModDirty(); }),
    settingText('Причина наказания', draft.punishment.reason, function (value) { draft.punishment.reason = value; markModDirty(); }, 'Её увидит модератор в истории наказаний.')
  ]));

  columns.appendChild(left);
  columns.appendChild(right);
  wrap.appendChild(columns);

  wrap.appendChild(el('div', { class: 'save-bar' },
    el('span', { class: 'dirty-note', style: { visibility: state.modDirty ? 'visible' : 'hidden' } },
      icon('info', 14),
      el('span', { text: 'Есть несохранённые изменения' })
    ),
    el('div', { class: 'check-row' },
      button('Сбросить', 'reset', 'ghost small', resetModeration),
      button('Сохранить', 'save', 'primary small', saveModerationSettings)
    )
  ));

  return wrap;
}

/* ---------- fun ---------- */

function questionsToText(list) {
  return (list || []).map(function (item) {
    const answers = Array.isArray(item.a) ? item.a.join(', ') : String(item.a || '');
    return (item.q || '') + ' | ' + answers + ' | ' + (item.hint || '');
  }).join('\n');
}

function parseQuestions(text) {
  return String(text || '').split(/\n+/).map(function (line) {
    const parts = line.split('|').map(function (item) { return item.trim(); });
    const q = parts[0] || '';
    const answers = (parts[1] || '').split(',').map(function (item) { return item.trim(); }).filter(Boolean);
    if (!q || !answers.length) return null;
    return { q: q, a: answers, hint: parts[2] || '' };
  }).filter(Boolean);
}

function renderFunView() {
  if (!state.funDraft) {
    state.funDraft = copy({
      points: state.panel.points || {},
      giveaways: state.panel.giveaways || {},
      quiz: state.panel.quiz || {},
      events: state.panel.events || {}
    });
  }
  const draft = state.funDraft;
  draft.points = draft.points || {};
  draft.giveaways = draft.giveaways || {};
  draft.quiz = draft.quiz || {};
  draft.events = draft.events || {};
  draft.giveaways.messages = draft.giveaways.messages || {};
  draft.events.messages = draft.events.messages || {};

  const wrap = el('div', { class: 'settings-view' });
  const pointsLive = (state.status && state.status.points) || {};

  wrap.appendChild(el('div', { class: 'note-banner' },
    icon('spark', 16),
    el('div', null,
      el('strong', { text: 'Как это работает' }),
      el('p', { text: 'Зрители получают баллы за сообщения и ежедневный вход. Баллы тратятся на участие в розыгрышах. Викторина начисляет награду за первый правильный ответ.' })
    )
  ));

  const columns = el('div', { class: 'settings-columns' });
  const left = el('div', { class: 'stack' });
  const right = el('div', { class: 'stack' });

  left.appendChild(settingsCard('Баллы', 'Внутренняя валюта канала', draft.points.currency || 'балл', [
    settingToggle('Система баллов включена', '', draft.points.enabled !== false, function (value) {
      draft.points.enabled = value; markFunDirty();
    }),
    settingText('Название валюты', draft.points.currency || 'балл', function (value) { draft.points.currency = value; markFunDirty(); }),
    settingNumber('Баллов за сообщение', draft.points.perMessage, 0, 1000, function (value) { draft.points.perMessage = value; markFunDirty(); }),
    settingNumber('Задержка начисления, сек', draft.points.messageCooldownSec, 1, 3600, function (value) { draft.points.messageCooldownSec = value; markFunDirty(); }),
    settingNumber('Ежедневный бонус', draft.points.dailyBonus, 0, 100000, function (value) { draft.points.dailyBonus = value; markFunDirty(); }),
    settingNumber('Минимум для перевода', draft.points.transferMin, 1, 100000, function (value) { draft.points.transferMin = value; markFunDirty(); })
  ]));

  if (pointsLive.users && pointsLive.users.length) {
    const top = el('div', { class: 'mini-list' }, pointsLive.users.slice(0, 5).map(function (item, index) {
      return el('div', { class: 'mini-row' },
        el('span', { class: 'mini-text', text: (index + 1) + '. ' + item.name }),
        el('span', { class: 'mini-next', text: String(item.points) })
      );
    }));
    left.appendChild(settingsCard('Топ по баллам', 'Живые данные', '', [top]));
  }

  left.appendChild(settingsCard('Розыгрыши', 'Вход по ключевому слову или !join', '', [
    settingToggle('Розыгрыши включены', '', draft.giveaways.enabled !== false, function (value) {
      draft.giveaways.enabled = value; markFunDirty();
    }),
    settingNumber('Длительность по умолчанию, мин', draft.giveaways.defaultMinutes, 1, 120, function (value) { draft.giveaways.defaultMinutes = value; markFunDirty(); }),
    settingNumber('Победителей по умолчанию', draft.giveaways.defaultWinners, 1, 20, function (value) { draft.giveaways.defaultWinners = value; markFunDirty(); }),
    settingNumber('Стоимость участия, баллов', draft.giveaways.entryCost, 0, 100000, function (value) { draft.giveaways.entryCost = value; markFunDirty(); }, '0 — бесплатно.'),
    settingToggle('Разрешать несколько заявок', 'Один зритель сможет участвовать повторно', draft.giveaways.allowMultiple === true, function (value) {
      draft.giveaways.allowMultiple = value; markFunDirty();
    }),
    settingArea('Старт розыгрыша', draft.giveaways.messages.start || '', function (value) { draft.giveaways.messages.start = value; markFunDirty(); }, 'Переменные: {prize} {keyword} {minutes} {winners}', 3),
    settingArea('Победитель', draft.giveaways.messages.winner || '', function (value) { draft.giveaways.messages.winner = value; markFunDirty(); }, 'Переменные: {prize} {winners} {count}', 2),
    settingArea('Никто не участвовал', draft.giveaways.messages.noEntries || '', function (value) { draft.giveaways.messages.noEntries = value; markFunDirty(); }, 'Переменная: {prize}', 2)
  ]));

  right.appendChild(settingsCard('Викторина', 'Вопросы и награда за правильный ответ', '', [
    settingToggle('Викторина включена', '', draft.quiz.enabled !== false, function (value) {
      draft.quiz.enabled = value; markFunDirty();
    }),
    settingNumber('Секунд на вопрос', draft.quiz.questionSeconds, 10, 600, function (value) { draft.quiz.questionSeconds = value; markFunDirty(); }),
    settingNumber('Пауза между вопросами, сек', draft.quiz.betweenSeconds, 3, 600, function (value) { draft.quiz.betweenSeconds = value; markFunDirty(); }),
    settingNumber('Подсказка через, сек', draft.quiz.hintAfterSeconds, 1, 600, function (value) { draft.quiz.hintAfterSeconds = value; markFunDirty(); }),
    settingNumber('Награда, баллов', draft.quiz.rewardPoints, 0, 100000, function (value) { draft.quiz.rewardPoints = value; markFunDirty(); }),
    settingNumber('Вопросов за запуск', draft.quiz.maxQuestions, 0, 100, function (value) { draft.quiz.maxQuestions = value; markFunDirty(); }, '0 — пока не закончатся вопросы.'),
    settingArea('Вопросы: вопрос | ответы через запятую | подсказка',
      questionsToText(draft.quiz.questions),
      function (value) {
        draft.quiz.questions = parseQuestions(value);
        markFunDirty();
      },
      'Каждый вопрос с новой строки. Ответы можно перечислять через запятую; регистр не важен.', 8)
  ]));

  right.appendChild(settingsCard('Благодарности за события', 'Подписки, подарки, рейды, битсы и фоллоу', '', [
    settingToggle('Оповещения включены', '', draft.events.enabled !== false, function (value) {
      draft.events.enabled = value; markFunDirty();
    }),
    settingNumber('Минимум битсов', draft.events.minCheerBits, 1, 1000000, function (value) { draft.events.minCheerBits = value; markFunDirty(); }),
    settingNumber('Минимум зрителей в рейде', draft.events.minRaidViewers, 0, 1000000, function (value) { draft.events.minRaidViewers = value; markFunDirty(); }),
    settingArea('Подписка', draft.events.messages.sub || '', function (value) { draft.events.messages.sub = value; markFunDirty(); }, '{user}', 2),
    settingArea('Продление', draft.events.messages.resub || '', function (value) { draft.events.messages.resub = value; markFunDirty(); }, '{user} {months}', 2),
    settingArea('Подарочная подписка', draft.events.messages.gift || '', function (value) { draft.events.messages.gift = value; markFunDirty(); }, '{user} {recipient}', 2),
    settingArea('Массовый подарок', draft.events.messages.massGift || '', function (value) { draft.events.messages.massGift = value; markFunDirty(); }, '{user} {count}', 2),
    settingArea('Рейд', draft.events.messages.raid || '', function (value) { draft.events.messages.raid = value; markFunDirty(); }, '{user} {viewers}', 2),
    settingArea('Битсы', draft.events.messages.cheer || '', function (value) { draft.events.messages.cheer = value; markFunDirty(); }, '{user} {bits}', 2),
    settingArea('Фоллоу', draft.events.messages.follow || '', function (value) { draft.events.messages.follow = value; markFunDirty(); }, '{user}', 2),
    el('p', { class: 'setting-hint', text: 'Для фоллоу нужен повторный вход через auth-twitch.bat: бот запросит право moderator:read:followers.' })
  ]));

  columns.appendChild(left);
  columns.appendChild(right);
  wrap.appendChild(columns);

  wrap.appendChild(el('div', { class: 'save-bar' },
    el('span', { class: 'dirty-note', style: { visibility: state.funDirty ? 'visible' : 'hidden' } },
      icon('info', 14),
      el('span', { text: 'Есть несохранённые изменения' })
    ),
    el('div', { class: 'check-row' },
      button('Сбросить', 'reset', 'ghost small', resetFun),
      button('Сохранить', 'save', 'primary small', saveFunSettings)
    )
  ));

  return wrap;
}

async function saveModerationSettings() {
  if (state.saving) return;
  state.saving = true;
  renderTopbar();
  try {
    const data = await api('/api/moderation', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ moderation: state.modDraft })
    });
    state.panel.moderation = data.moderation;
    state.modDraft = copy(data.moderation);
    state.modDirty = false;
    toast('Модерация сохранена', 'ok');
    render();
  } catch (error) {
    toast(error.message, 'error');
  } finally {
    state.saving = false;
    renderTopbar();
  }
}

function resetModeration() {
  if (!state.panel) return;
  state.modDraft = copy(state.panel.moderation || {});
  state.modDirty = false;
  render();
}

async function saveFunSettings() {
  if (state.saving) return;
  state.saving = true;
  renderTopbar();
  try {
    const data = await api('/api/entertainment', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(state.funDraft)
    });
    state.panel.points = data.points;
    state.panel.giveaways = data.giveaways;
    state.panel.quiz = data.quiz;
    state.panel.events = data.events;
    state.funDraft = copy({
      points: data.points,
      giveaways: data.giveaways,
      quiz: data.quiz,
      events: data.events
    });
    state.funDirty = false;
    toast('Настройки развлечений сохранены', 'ok');
    render();
  } catch (error) {
    toast(error.message, 'error');
  } finally {
    state.saving = false;
    renderTopbar();
  }
}

function resetFun() {
  if (!state.panel) return;
  state.funDraft = copy({
    points: state.panel.points || {},
    giveaways: state.panel.giveaways || {},
    quiz: state.panel.quiz || {},
    events: state.panel.events || {}
  });
  state.funDirty = false;
  render();
}

/* ---------- links ---------- */


function renderLinksView() {
  const p = state.panel;
  if (!state.linksDraft) state.linksDraft = copy(p.socials);
  const wrap = el('div', { class: 'links-view' });
  const layout = el('div', { class: 'links-layout' });
  const card = el('section', { class: 'card' });
  card.appendChild(el('div', { class: 'card-head' },
    el('div', null,
      el('h2', { class: 'card-title', text: 'Ссылки сообщества' }),
      el('p', { class: 'card-sub', text: 'Пустые поля не показываются в чате' })
    ),
    el('span', { class: 'chip accent', text: '!social' })
  ));

  const grid = el('div', { class: 'links-grid' });
  const labels = p.meta.socialLabels;
  const keys = p.meta.socialKeys;

  keys.forEach(function (key) {
    const input = el('input', {
      class: 'input',
      id: 'social-' + key,
      value: state.linksDraft[key] || '',
      placeholder: placeholderFor(key),
      autocomplete: 'off',
      spellcheck: false
    });
    input.addEventListener('input', function () {
      state.linksDraft[key] = input.value;
      markLinksDirty();
    });
    grid.appendChild(el('div', { class: 'social-field' },
      el('label', { class: 'social-label', for: 'social-' + key },
        el('span', { class: 'social-badge ' + key, text: (labels[key] || key).slice(0, 1) }),
        el('span', { text: labels[key] || key })
      ),
      input
    ));
  });

  card.appendChild(grid);
  card.appendChild(el('div', { class: 'save-bar' },
    el('span', { class: 'dirty-note', id: 'links-dirty-note', style: { visibility: state.linksDirty ? 'visible' : 'hidden' } },
      icon('info', 14),
      el('span', { text: 'Есть несохранённые изменения' })
    ),
    el('div', { class: 'check-row' },
      button('Сбросить', 'reset', 'ghost small', resetLinks),
      button('Сохранить', 'save', 'primary small', saveLinks)
    )
  ));
  layout.appendChild(card);

  const preview = el('section', { class: 'card links-preview' },
    el('div', { class: 'card-head' },
      el('div', null,
        el('h2', { class: 'card-title', text: 'Как увидит чат' }),
        el('p', { class: 'card-sub', text: 'Ответ на команду !social' })
      )
    ),
    el('div', { id: 'links-preview-body' })
  );
  layout.appendChild(preview);
  wrap.appendChild(layout);
  paintLinksPreview();
  return wrap;
}

function placeholderFor(key) {
  const map = {
    youtube: 'https://youtube.com/@your_channel',
    twitch: 'https://twitch.tv/your_channel',
    discord: 'https://discord.gg/…',
    telegram: 'https://t.me/…',
    vk: 'https://vk.com/…',
    boosty: 'https://boosty.to/…',
    tiktok: 'https://tiktok.com/@…',
    instagram: 'https://instagram.com/…'
  };
  return map[key] || 'https://…';
}

function markLinksDirty() {
  state.linksDirty = true;
  const note = document.getElementById('links-dirty-note');
  if (note) note.style.visibility = 'visible';
  const sub = document.getElementById('page-sub');
  if (sub) sub.textContent = 'Есть несохранённые изменения';
  renderTopbar();
  paintLinksPreview();
}

function paintLinksPreview() {
  const mount = document.getElementById('links-preview-body');
  if (!mount) return;
  clear(mount);
  const line = socialsLine(state.linksDraft || {});
  if (!line) {
    mount.appendChild(el('div', { class: 'social-line-empty' },
      el('div', { class: 'empty-icon', style: { margin: '0 auto 10px' } }, icon('links', 22)),
      el('p', { text: 'Заполни хотя бы одну ссылку — здесь появится ответ бота.' })
    ));
    return;
  }
  mount.appendChild(el('div', { class: 'preview-bubble', style: { display: 'block', lineHeight: '1.55' }, text: line }));
}

async function saveLinks() {
  if (state.saving || !state.linksDirty) return;
  state.saving = true;
  renderTopbar();
  try {
    const data = await api('/api/socials', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ socials: state.linksDraft })
    });
    state.panel.socials = data.socials;
    state.linksDraft = copy(data.socials);
    state.linksDirty = false;
    toast('Ссылки сохранены', 'ok');
    render();
  } catch (error) {
    toast(error.message, 'error');
  } finally {
    state.saving = false;
    renderTopbar();
  }
}

function resetLinks() {
  if (!state.panel) return;
  state.linksDraft = copy(state.panel.socials);
  state.linksDirty = false;
  render();
}

/* ---------- modal ---------- */

function confirmDialog(title, text, confirmLabel, onConfirm) {
  const root = clear(document.getElementById('modal-root'));
  const close = function () {
    clear(root);
    document.removeEventListener('keydown', onKey);
  };
  const onKey = function (event) {
    if (event.key === 'Escape') close();
  };
  const overlay = el('div', { class: 'modal-overlay' },
    el('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true' },
      el('div', { class: 'modal-icon' }, icon('trash', 20)),
      el('h3', { text: title }),
      el('p', { text: text }),
      el('div', { class: 'modal-actions' },
        button('Отмена', null, 'ghost', close),
        button(confirmLabel, 'trash', 'danger', function () { close(); onConfirm(); })
      )
    )
  );
  overlay.addEventListener('mousedown', function (event) { if (event.target === overlay) close(); });
  root.appendChild(overlay);
  document.addEventListener('keydown', onKey);
}

/* ---------- utilities ---------- */

function plural(count, one, few, many) {
  const n = Math.abs(Number(count)) % 100;
  const n1 = n % 10;
  if (n > 10 && n < 20) return many;
  if (n1 > 1 && n1 < 5) return few;
  if (n1 === 1) return one;
  return many;
}

/* ---------- boot ---------- */

function init() {
  fillStaticIcons();
  state.view = currentView();
  render();

  window.addEventListener('hashchange', function () {
    state.view = currentView();
    render();
    window.scrollTo({ top: 0, behavior: 'instant' });
  });

  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) refreshStatus();
  });

  window.addEventListener('beforeunload', function (event) {
    if (state.linksDirty || state.modDirty || state.funDirty) {
      event.preventDefault();
      event.returnValue = '';
    }
  });

  loadPanel();
  refreshStatus();
  window.setInterval(function () {
    if (!document.hidden) refreshStatus();
  }, 2000);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();

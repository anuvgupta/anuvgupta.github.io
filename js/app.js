(() => {
  'use strict';

  // ---------------------------------------------------------------------------
  // Pages. Each page gets a desktop icon, a Start menu entry and a window.
  // To add a page: add an entry here and write its render function.
  // ---------------------------------------------------------------------------
  const PAGES = [
    { id: 'projects', title: 'Projects', icon: 'img/icons/projects.svg', blurb: 'Things I have built', render: renderProjects },
    { id: 'about', title: 'About', icon: 'img/icons/about.svg', blurb: 'Who I am', render: renderAbout },
  ];
  // Opened on first visit when the URL has no #page.
  const DEFAULT_PAGE = 'projects';

  const pageById = (id) => PAGES.find((p) => p.id === id);

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------
  function h(tag, attrs, ...children) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const c of children.flat(Infinity)) {
      if (c == null || c === false) continue;
      el.append(c instanceof Node ? c : String(c));
    }
    return el;
  }

  const asArray = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);
  const clamp = (n, lo, hi) => Math.min(Math.max(n, lo), Math.max(lo, hi));

  // Only allow http(s)/mailto links and same-site paths from the JSON files.
  function safeUrl(url) {
    if (typeof url !== 'string' || !url.trim()) return null;
    try {
      const u = new URL(url, location.href);
      return ['http:', 'https:', 'mailto:'].includes(u.protocol) ? u.href : null;
    } catch {
      return null;
    }
  }

  function repoName(url) {
    try {
      const u = new URL(url);
      return u.pathname.replace(/^\/+|\/+$/g, '') || u.hostname;
    } catch {
      return url;
    }
  }

  function hostName(url) {
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch {
      return url;
    }
  }

  const initials = (name) =>
    String(name || '')
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => w[0].toUpperCase())
      .slice(0, 2)
      .join('');

  const jsonCache = {};
  function loadJSON(path) {
    if (!jsonCache[path]) {
      jsonCache[path] = fetch(path, { cache: 'no-cache' })
        .then((r) => {
          if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
          return r.json();
        })
        .catch((err) => {
          delete jsonCache[path];
          throw err;
        });
    }
    return jsonCache[path];
  }

  function linkButton(label, url, icon) {
    return h(
      'a',
      { class: 'xp-btn', href: safeUrl(url), target: '_blank', rel: 'noopener noreferrer' },
      h('img', { src: icon, alt: '', width: 16, height: 16 }),
      label
    );
  }

  function notice(text, kind) {
    return h('p', { class: `notice ${kind || ''}` }, text);
  }

  let balloonTimer;
  function showBalloon(text) {
    const el = document.getElementById('balloon');
    el.textContent = text;
    el.hidden = false;
    clearTimeout(balloonTimer);
    balloonTimer = setTimeout(() => (el.hidden = true), 2500);
  }

  // ---------------------------------------------------------------------------
  // Page renderers
  // ---------------------------------------------------------------------------
  async function renderProjects(body) {
    body.append(notice('Loading projects…'));
    try {
      const data = await loadJSON('data/projects.json');
      const projects = asArray(data.projects);
      body.replaceChildren(
        h(
          'div',
          { class: 'page' },
          h(
            'header',
            { class: 'page-header' },
            h('h1', null, 'Projects'),
            h('p', null, `${projects.length} project${projects.length === 1 ? '' : 's'}`)
          ),
          projects.length ? projects.map(projectCard) : notice('No projects yet.')
        )
      );
    } catch (err) {
      console.error(err);
      body.replaceChildren(h('div', { class: 'page' }, notice('Couldn’t load the project list.', 'error')));
    }
  }

  function projectCard(p) {
    const shots = asArray(p.screenshots)
      .map((s) => (typeof s === 'string' ? { src: s } : s))
      .filter((s) => s && safeUrl(s.src))
      .slice(0, 3);
    const github = asArray(p.github)
      .map((g) => (typeof g === 'string' ? { url: g } : g))
      .filter((g) => g && safeUrl(g.url));
    const links = asArray(p.links)
      .map((l) => (typeof l === 'string' ? { url: l } : l))
      .filter((l) => l && safeUrl(l.url));

    return h(
      'article',
      { class: 'project' },
      h('h2', { class: 'project-title' }, p.name || 'Untitled project'),
      h(
        'div',
        { class: 'project-content' },
        p.description ? h('p', { class: 'project-desc' }, p.description) : null,
        shots.length
          ? h(
              'div',
              { class: 'project-shots' },
              shots.map((s, i) =>
                h(
                  'a',
                  { href: safeUrl(s.src), target: '_blank', rel: 'noopener', title: 'Open full size' },
                  h('img', { src: safeUrl(s.src), alt: s.alt || `${p.name || 'Project'} screenshot ${i + 1}`, loading: 'lazy' })
                )
              )
            )
          : null,
        github.length || links.length
          ? h(
              'div',
              { class: 'project-links' },
              github.map((g) =>
                linkButton(g.label || (github.length > 1 ? repoName(g.url) : 'GitHub'), g.url, 'img/icons/github.svg')
              ),
              links.map((l) => linkButton(l.label || hostName(l.url), l.url, 'img/icons/link.svg'))
            )
          : null
      )
    );
  }

  async function renderAbout(body) {
    body.append(notice('Loading…'));
    try {
      const a = await loadJSON('data/about.json');
      body.replaceChildren(
        h(
          'div',
          { class: 'page about' },
          h('div', { class: 'user-tile user-tile-lg', 'aria-hidden': 'true' }, initials(a.name)),
          h('h1', null, a.name),
          a.tagline ? h('p', { class: 'tagline' }, a.tagline) : null,
          h(
            'div',
            { class: 'about-links' },
            asArray(a.links)
              .filter((l) => l && safeUrl(l.url))
              .map((l) => linkButton(l.label || hostName(l.url), l.url, l.icon || 'img/icons/link.svg'))
          )
        )
      );
    } catch (err) {
      console.error(err);
      body.replaceChildren(h('div', { class: 'page' }, notice('Couldn’t load this page.', 'error')));
    }
  }

  // Text the Start menu search matches against, beyond each page's title.
  const searchText = { projects: '', about: '' };
  function loadSearchText() {
    loadJSON('data/projects.json')
      .then((d) => {
        searchText.projects = asArray(d.projects)
          .map((p) => `${p.name || ''} ${p.description || ''}`)
          .join(' ');
      })
      .catch(() => {});
    loadJSON('data/about.json')
      .then((a) => {
        searchText.about = `${a.name || ''} ${a.tagline || ''} ${asArray(a.links).map((l) => l.label).join(' ')}`;
      })
      .catch(() => {});
  }

  // ---------------------------------------------------------------------------
  // Window manager
  // ---------------------------------------------------------------------------
  const desktopEl = document.getElementById('desktop');
  const tasksEl = document.getElementById('tasks');
  const wins = new Map(); // page id -> window state
  let zTop = 10;
  let activeId = null;
  let openCount = 0; // used to cascade new windows

  const desktopSize = () => ({ w: desktopEl.clientWidth, h: desktopEl.clientHeight });

  function defaultGeom() {
    const { w: dw, h: dh } = desktopSize();
    const step = openCount % 6;
    if (dw < 700) {
      const top = 6 + step * 10;
      return { left: 6, top, width: dw - 12, height: Math.max(220, dh - top - 6) };
    }
    const width = Math.min(dw - 24, Math.max(560, Math.round((dw * 2) / 3)));
    const offset = step * 28;
    const top = clamp(12 + offset, 0, dh - 240);
    const left = clamp(Math.round((dw - width) / 2) + offset, 0, dw - width);
    return { left, top, width, height: Math.max(240, dh - top - 12) };
  }

  function applyGeom(win) {
    const s = win.el.style;
    s.left = `${win.geom.left}px`;
    s.top = `${win.geom.top}px`;
    s.width = `${win.geom.width}px`;
    s.height = `${win.geom.height}px`;
  }

  // Keep windows reachable after the viewport shrinks.
  function fitToDesktop(win) {
    const { w: dw, h: dh } = desktopSize();
    const g = win.geom;
    g.width = Math.min(g.width, dw - (dw < 700 ? 12 : 0));
    g.height = Math.min(g.height, dh);
    g.left = clamp(g.left, 80 - g.width, dw - 80);
    g.top = clamp(g.top, 0, dh - 30);
    applyGeom(win);
  }

  function setHash(id) {
    const url = id ? `#${id}` : location.pathname + location.search;
    if ((id ? `#${id}` : '') !== location.hash) history.replaceState(null, '', url);
  }

  function openPage(id) {
    const page = pageById(id);
    if (!page) return;
    closeStartMenu();
    const existing = wins.get(id);
    if (existing) {
      if (existing.minimized) setMinimized(existing, false);
      focusWin(id);
      return;
    }
    const win = createWindow(page);
    wins.set(id, win);
    openCount++;
    focusWin(id);
  }

  function focusWin(id) {
    const win = wins.get(id);
    if (!win || win.minimized) return;
    if (activeId !== id) win.el.style.zIndex = String(++zTop);
    activeId = id;
    for (const [wid, w] of wins) {
      const on = wid === id;
      w.el.classList.toggle('inactive', !on);
      w.task.classList.toggle('active', on);
      w.task.setAttribute('aria-pressed', String(on));
    }
    setHash(id);
  }

  function focusTopmost() {
    let top = null;
    for (const w of wins.values()) {
      if (!w.minimized && (!top || +w.el.style.zIndex > +top.el.style.zIndex)) top = w;
    }
    if (top) {
      activeId = null;
      focusWin(top.id);
      return;
    }
    activeId = null;
    for (const w of wins.values()) {
      w.el.classList.add('inactive');
      w.task.classList.remove('active');
      w.task.setAttribute('aria-pressed', 'false');
    }
    setHash(null);
  }

  function setMinimized(win, minimized) {
    win.minimized = minimized;
    win.el.hidden = minimized;
    if (minimized) {
      closeMenus();
      if (activeId === win.id) focusTopmost();
    }
  }

  function setMaximized(win, maximized) {
    win.maximized = maximized;
    win.el.classList.toggle('maximized', maximized);
    const label = maximized ? 'Restore' : 'Maximize';
    win.maxBtn.setAttribute('aria-label', label);
    win.maxBtn.title = label;
    win.maxItem.textContent = label;
  }

  function closeWin(win) {
    closeMenus();
    win.el.remove();
    win.task.remove();
    wins.delete(win.id);
    if (activeId === win.id) {
      activeId = null;
      focusTopmost();
    }
  }

  function createWindow(page) {
    const win = { id: page.id, page, minimized: false, maximized: false, geom: defaultGeom() };

    const titleId = `win-title-${page.id}`;
    win.maxBtn = h('button', { class: 'tb-max', type: 'button', 'aria-label': 'Maximize', title: 'Maximize' });
    const titleBar = h(
      'div',
      { class: 'title-bar' },
      h('img', { class: 'title-icon', src: page.icon, alt: '', draggable: 'false' }),
      h('span', { class: 'title-text', id: titleId }, page.title),
      h(
        'div',
        { class: 'title-controls' },
        h('button', { class: 'tb-min', type: 'button', 'aria-label': 'Minimize', title: 'Minimize', onclick: () => setMinimized(win, true) }),
        win.maxBtn,
        h('button', { class: 'tb-close', type: 'button', 'aria-label': 'Close', title: 'Close', onclick: () => closeWin(win) })
      )
    );
    win.maxBtn.addEventListener('click', () => setMaximized(win, !win.maximized));

    win.body = h('div', { class: 'window-body', tabindex: '-1' });

    const menuBar = buildMenuBar(win, [
      {
        label: 'File',
        items: [
          { label: 'Minimize', action: () => setMinimized(win, true) },
          { label: 'Maximize', action: () => setMaximized(win, !win.maximized), ref: 'maxItem' },
          null,
          { label: 'Close', action: () => closeWin(win) },
        ],
      },
      {
        label: 'Edit',
        items: [
          { label: 'Select All', action: () => selectAll(win.body) },
          { label: 'Copy Page Link', action: () => copyLink(page) },
        ],
      },
    ]);

    win.el = h(
      'section',
      { class: 'window', role: 'dialog', 'aria-labelledby': titleId, 'data-page': page.id },
      titleBar,
      menuBar,
      win.body
    );
    win.el.addEventListener('pointerdown', () => focusWin(win.id), true);

    makeDraggable(win, titleBar);
    titleBar.addEventListener('dblclick', (e) => {
      if (!e.target.closest('button')) setMaximized(win, !win.maximized);
    });

    win.task = h(
      'button',
      { class: 'task', type: 'button', 'aria-pressed': 'false', title: page.title },
      h('img', { src: page.icon, alt: '', width: 16, height: 16 }),
      h('span', null, page.title)
    );
    win.task.addEventListener('click', () => {
      if (win.minimized) {
        setMinimized(win, false);
        focusWin(win.id);
      } else if (activeId === win.id) {
        setMinimized(win, true);
      } else {
        focusWin(win.id);
      }
    });

    applyGeom(win);
    desktopEl.append(win.el);
    tasksEl.append(win.task);
    page.render(win.body);
    return win;
  }

  function makeDraggable(win, handle) {
    handle.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || e.target.closest('button') || win.maximized) return;
      e.preventDefault();
      const start = { x: e.clientX, y: e.clientY, left: win.geom.left, top: win.geom.top };
      handle.setPointerCapture(e.pointerId);
      handle.classList.add('dragging');

      const move = (ev) => {
        const { w: dw, h: dh } = desktopSize();
        win.geom.left = clamp(start.left + ev.clientX - start.x, 80 - win.geom.width, dw - 80);
        win.geom.top = clamp(start.top + ev.clientY - start.y, 0, dh - 30);
        applyGeom(win);
      };
      const end = () => {
        handle.classList.remove('dragging');
        handle.removeEventListener('pointermove', move);
        handle.removeEventListener('pointerup', end);
        handle.removeEventListener('pointercancel', end);
      };
      handle.addEventListener('pointermove', move);
      handle.addEventListener('pointerup', end);
      handle.addEventListener('pointercancel', end);
    });
  }

  function selectAll(el) {
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }

  async function copyLink(page) {
    const url = `${location.origin}${location.pathname}#${page.id}`;
    try {
      await navigator.clipboard.writeText(url);
      showBalloon('Link copied');
    } catch {
      showBalloon(url);
    }
  }

  // ---------------------------------------------------------------------------
  // Window menu bar (File / Edit)
  // ---------------------------------------------------------------------------
  let openMenu = null;

  function closeMenus() {
    if (!openMenu) return;
    openMenu.classList.remove('open');
    openMenu.querySelector('.menu-btn').setAttribute('aria-expanded', 'false');
    openMenu = null;
  }

  function showMenu(menu) {
    if (openMenu === menu) return;
    closeMenus();
    menu.classList.add('open');
    menu.querySelector('.menu-btn').setAttribute('aria-expanded', 'true');
    openMenu = menu;
  }

  function buildMenuBar(win, menus) {
    return h(
      'nav',
      { class: 'menu-bar', 'aria-label': 'Window menu' },
      menus.map(({ label, items }) => {
        const menu = h('div', { class: 'menu' });
        const btn = h('button', { class: 'menu-btn', type: 'button', 'aria-haspopup': 'menu', 'aria-expanded': 'false' }, label);
        btn.addEventListener('click', () => (openMenu === menu ? closeMenus() : showMenu(menu)));
        // Like XP: once a menu is open, hovering a sibling switches to it.
        btn.addEventListener('pointerenter', () => {
          if (openMenu && openMenu !== menu && openMenu.parentElement === menu.parentElement) showMenu(menu);
        });
        const list = h(
          'div',
          { class: 'menu-dropdown', role: 'menu' },
          items.map((item) => {
            if (!item) return h('div', { class: 'menu-sep', role: 'separator' });
            const b = h('button', { type: 'button', role: 'menuitem' }, item.label);
            b.addEventListener('click', () => {
              closeMenus();
              item.action();
            });
            if (item.ref) win[item.ref] = b;
            return b;
          })
        );
        menu.append(btn, list);
        return menu;
      })
    );
  }

  // ---------------------------------------------------------------------------
  // Desktop icons
  // ---------------------------------------------------------------------------
  const iconsEl = document.getElementById('desktop-icons');

  function selectIcon(btn) {
    for (const el of iconsEl.children) el.classList.toggle('selected', el === btn);
  }

  for (const page of PAGES) {
    const btn = h(
      'button',
      { class: 'desktop-icon', type: 'button', role: 'listitem', title: `Open ${page.title}`, style: `--icon:url("${new URL(page.icon, location.href).href}")` },
      h('span', { class: 'icon-img' }, h('img', { src: page.icon, alt: '', draggable: 'false' })),
      h('span', { class: 'icon-label' }, page.title)
    );
    let pointerType = 'mouse';
    btn.addEventListener('pointerdown', (e) => {
      pointerType = e.pointerType || 'mouse';
      selectIcon(btn);
    });
    // Mouse: double-click opens. Touch and pen: a single tap opens.
    btn.addEventListener('click', () => {
      if (pointerType !== 'mouse') openPage(page.id);
    });
    btn.addEventListener('dblclick', () => openPage(page.id));
    btn.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        openPage(page.id);
      }
    });
    btn.addEventListener('focus', () => selectIcon(btn));
    iconsEl.append(btn);
  }

  desktopEl.addEventListener('pointerdown', (e) => {
    if (e.target === desktopEl || e.target === iconsEl) selectIcon(null);
  });

  // ---------------------------------------------------------------------------
  // Start menu: search + list of pages
  // ---------------------------------------------------------------------------
  const startBtn = document.getElementById('start-button');
  const startMenu = document.getElementById('start-menu');
  const startSearch = document.getElementById('start-search');
  const startList = document.getElementById('start-list');

  function renderStartList(query) {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    const matches = PAGES.filter((p) => {
      const hay = `${p.title} ${p.blurb} ${searchText[p.id] || ''}`.toLowerCase();
      return terms.every((t) => hay.includes(t));
    });
    startList.replaceChildren(
      ...(matches.length
        ? matches.map((p) =>
            h(
              'li',
              null,
              h(
                'button',
                { type: 'button', class: 'sm-item', onclick: () => openPage(p.id) },
                h('img', { src: p.icon, alt: '', width: 32, height: 32 }),
                h('span', { class: 'sm-item-text' }, h('strong', null, p.title), h('small', null, p.blurb))
              )
            )
          )
        : [h('li', { class: 'sm-empty' }, `No pages match “${query.trim()}”`)])
    );
  }

  function openStartMenu() {
    closeMenus();
    startSearch.value = '';
    renderStartList('');
    startMenu.hidden = false;
    startBtn.classList.add('pressed');
    startBtn.setAttribute('aria-expanded', 'true');
    // Skip auto-focus on touch so the on-screen keyboard doesn't pop up.
    if (matchMedia('(pointer: fine)').matches) startSearch.focus();
  }

  function closeStartMenu() {
    if (startMenu.hidden) return;
    startMenu.hidden = true;
    startBtn.classList.remove('pressed');
    startBtn.setAttribute('aria-expanded', 'false');
  }

  startBtn.addEventListener('click', () => (startMenu.hidden ? openStartMenu() : closeStartMenu()));
  startSearch.addEventListener('input', () => renderStartList(startSearch.value));
  startSearch.addEventListener('keydown', (e) => {
    const first = startList.querySelector('.sm-item');
    if (e.key === 'Enter' && first) {
      e.preventDefault();
      first.click();
    } else if (e.key === 'ArrowDown' && first) {
      e.preventDefault();
      first.focus();
    }
  });
  startList.addEventListener('keydown', (e) => {
    const items = [...startList.querySelectorAll('.sm-item')];
    const i = items.indexOf(document.activeElement);
    if (e.key === 'ArrowDown' && i < items.length - 1) {
      e.preventDefault();
      items[i + 1].focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      (i > 0 ? items[i - 1] : startSearch).focus();
    }
  });

  // ---------------------------------------------------------------------------
  // Global listeners
  // ---------------------------------------------------------------------------
  document.addEventListener('pointerdown', (e) => {
    if (openMenu && !openMenu.contains(e.target)) closeMenus();
    if (!startMenu.hidden && !startMenu.contains(e.target) && !startBtn.contains(e.target)) closeStartMenu();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (openMenu) closeMenus();
    else if (!startMenu.hidden) {
      closeStartMenu();
      startBtn.focus();
    }
  });

  window.addEventListener('resize', () => {
    for (const w of wins.values()) fitToDesktop(w);
  });

  window.addEventListener('hashchange', () => {
    const id = location.hash.slice(1);
    if (pageById(id)) openPage(id);
  });

  // Taskbar clock
  const clockEl = document.getElementById('clock');
  function tick() {
    const now = new Date();
    clockEl.textContent = now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    clockEl.dateTime = now.toISOString();
    clockEl.title = now.toLocaleDateString([], { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  }
  tick();
  setInterval(tick, 10000);

  // ---------------------------------------------------------------------------
  // Boot
  // ---------------------------------------------------------------------------
  loadSearchText();
  const initial = location.hash.slice(1);
  openPage(pageById(initial) ? initial : DEFAULT_PAGE);
})();

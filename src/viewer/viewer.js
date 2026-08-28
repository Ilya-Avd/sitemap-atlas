/* Viewer for the self-contained HTML report. No dependencies, no network. */
(function () {
  'use strict';

  var DATA = window.__SITEMAP__;
  var root = DATA.root;
  var DEPTH_COLORS = 6;
  var CHILD_PAGE = 300;
  var ROW_BUDGET = 4000;

  /* ---------- index ---------- */

  // `depth`, `children` and most `path`s are dropped from the payload and
  // rebuilt here — on a large sitemap the repeated path prefixes dominate the
  // file size. A node keeps an explicit `path` only when it is not derivable.
  var byPath = new Map();
  var parentOf = new Map();
  (function index(node, parent) {
    node.depth = parent ? parent.depth + 1 : 0;
    if (node.path == null) node.path = parent ? parent.path + '/' + node.name : '';
    if (!node.children) node.children = [];
    if (node.entry && !node.entry.loc) {
      node.entry.loc = node.path + (node.entry.slash ? '/' : '');
    }
    byPath.set(node.path, node);
    if (parent) parentOf.set(node.path, parent);
    for (var i = 0; i < node.children.length; i++) index(node.children[i], node);
  })(root, null);

  var state = {
    view: 'outline',
    query: '',
    expanded: new Set(),
    shown: new Map(),
  };

  // Two levels open by default: enough to read the shape of a site without
  // dumping thousands of rows on a large one.
  state.expanded.add(root.path);
  for (var i = 0; i < root.children.length; i++) state.expanded.add(root.children[i].path);

  /* ---------- helpers ---------- */

  function num(n) {
    return n.toLocaleString('en-US');
  }

  function colorOf(depth) {
    return 'var(--d' + (depth % DEPTH_COLORS) + ')';
  }

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }

  function svgEl(tag, attrs) {
    var node = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (var key in attrs) node.setAttribute(key, attrs[key]);
    return node;
  }

  function chevron() {
    var svg = svgEl('svg', { viewBox: '0 0 16 16', width: '10', height: '10' });
    svg.appendChild(
      svgEl('path', {
        d: 'M6 3l5 5-5 5',
        fill: 'none',
        stroke: 'currentColor',
        'stroke-width': '2.2',
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round',
      }),
    );
    return svg;
  }

  function shortDate(value) {
    if (!value) return '';
    return String(value).slice(0, 10);
  }

  function tooltip(node) {
    var lines = [node.entry ? node.entry.loc : node.path + '/'];
    if (node.entry) {
      if (node.entry.lastmod) lines.push('lastmod: ' + node.entry.lastmod);
      if (node.entry.changefreq) lines.push('changefreq: ' + node.entry.changefreq);
      if (node.entry.priority != null) lines.push('priority: ' + node.entry.priority);
      if (node.entry.alts) lines.push('alternates: ' + node.entry.alts);
    }
    if (node.children.length) lines.push(num(node.count) + ' URLs below');
    return lines.join('\n');
  }

  /* ---------- filtering ---------- */

  var filter = null; /* { visible: Set, matched: Set } or null */

  function computeFilter(query) {
    if (!query) return null;
    var q = query.toLowerCase();
    var visible = new Set();
    var matched = new Set();
    (function walk(node) {
      var hit = false;
      for (var i = 0; i < node.children.length; i++) {
        if (walk(node.children[i])) hit = true;
      }
      var loc = node.entry ? node.entry.loc.toLowerCase() : '';
      var self = node.name.toLowerCase().indexOf(q) >= 0 || loc.indexOf(q) >= 0;
      if (self) matched.add(node.path);
      if (self || hit) {
        visible.add(node.path);
        return true;
      }
      return false;
    })(root);
    return { visible: visible, matched: matched };
  }

  function childrenOf(node) {
    if (!filter) return node.children;
    return node.children.filter(function (child) {
      return filter.visible.has(child.path);
    });
  }

  function isOpen(node) {
    if (!childrenOf(node).length) return false;
    // A search result is only useful if the path down to it is already unfolded.
    if (filter) return true;
    return state.expanded.has(node.path);
  }

  /* ---------- outline view ---------- */

  var outline = document.getElementById('outline');
  var budget = 0;

  function highlight(text, target) {
    if (!state.query) {
      target.appendChild(document.createTextNode(text));
      return;
    }
    var lower = text.toLowerCase();
    var q = state.query.toLowerCase();
    var from = 0;
    var at = lower.indexOf(q, from);
    if (at < 0) {
      target.appendChild(document.createTextNode(text));
      return;
    }
    while (at >= 0) {
      if (at > from) target.appendChild(document.createTextNode(text.slice(from, at)));
      target.appendChild(el('mark', null, text.slice(at, at + q.length)));
      from = at + q.length;
      at = lower.indexOf(q, from);
    }
    if (from < text.length) target.appendChild(document.createTextNode(text.slice(from)));
  }

  function buildRow(node) {
    var kids = childrenOf(node);
    var open = isOpen(node);
    var row = el('div', 'row' + (kids.length ? ' has-children' : '') + (open ? ' open' : ''));
    if (filter && filter.matched.has(node.path)) row.className += ' match';
    row.dataset.path = node.path;
    row.title = tooltip(node);

    var twisty = el('span', 'twisty' + (kids.length ? '' : ' leaf'));
    twisty.appendChild(chevron());
    row.appendChild(twisty);

    var dot = el('span', 'dot' + (node.entry ? '' : ' hollow'));
    dot.style.color = colorOf(node.depth);
    row.appendChild(dot);

    var label = el('span', 'label');
    highlight(node.name, label);
    row.appendChild(label);

    if (node.count > 1 || kids.length) row.appendChild(el('span', 'badge', num(node.count)));
    if (node.dupes) row.appendChild(el('span', 'badge', '×' + (node.dupes + 1)));
    if (node.truncated) row.appendChild(el('span', 'badge', '+' + num(node.truncated) + ' deeper'));

    var meta = el('span', 'meta');
    if (node.entry && node.entry.lastmod) {
      meta.appendChild(el('span', null, shortDate(node.entry.lastmod)));
    }
    if (node.entry) {
      var link = el('a', 'open-link', '↗');
      link.href = node.entry.loc;
      link.target = '_blank';
      link.rel = 'noreferrer noopener';
      link.title = 'Open ' + node.entry.loc;
      link.addEventListener('click', function (event) {
        event.stopPropagation();
      });
      meta.appendChild(link);
    }
    row.appendChild(meta);

    if (kids.length) {
      row.addEventListener('click', function () {
        toggle(node.path);
      });
    }
    return row;
  }

  function renderNode(node, into) {
    if (budget-- <= 0) return;
    into.appendChild(buildRow(node));
    if (!isOpen(node)) return;

    var kids = childrenOf(node);
    var box = el('div', 'children');
    var limit = state.shown.get(node.path) || CHILD_PAGE;
    for (var i = 0; i < Math.min(kids.length, limit); i++) renderNode(kids[i], box);
    if (kids.length > limit) {
      var rest = kids.length - limit;
      var more = el('div', 'more', '+ ' + num(rest) + ' more — click to show');
      more.style.cursor = 'pointer';
      more.addEventListener('click', function () {
        state.shown.set(node.path, limit + CHILD_PAGE);
        render();
      });
      box.appendChild(more);
    }
    into.appendChild(box);
  }

  function renderOutline() {
    outline.textContent = '';
    budget = ROW_BUDGET;
    if (filter && !filter.visible.size) {
      outline.appendChild(el('div', 'empty', 'Nothing matches "' + state.query + '"'));
      return;
    }
    renderNode(root, outline);
    if (budget <= 0) {
      outline.appendChild(
        el('div', 'more', 'Output truncated at ' + num(ROW_BUDGET) + ' rows — narrow the search.'),
      );
    }
  }

  function toggle(path) {
    if (filter) return;
    if (state.expanded.has(path)) state.expanded.delete(path);
    else state.expanded.add(path);
    render();
  }

  /* ---------- graph view ---------- */

  var graph = document.getElementById('graph');
  var svg = svgEl('svg', { xmlns: 'http://www.w3.org/2000/svg' });
  var viewport = svgEl('g', {});
  svg.appendChild(viewport);
  graph.appendChild(svg);

  var transform = { x: 40, y: 40, k: 1 };
  var fitted = false;
  var DX = 200;
  var DY = 22;

  function layout() {
    var nodes = [];
    var links = [];
    var cursor = 0;
    (function walk(node, depth) {
      var kids = isOpen(node) ? childrenOf(node) : [];
      var item = { node: node, x: depth * DX, y: 0, open: kids.length > 0 };
      if (kids.length) {
        var first = null;
        var last = null;
        for (var i = 0; i < kids.length; i++) {
          var child = walk(kids[i], depth + 1);
          links.push({ from: item, to: child });
          if (first === null) first = child.y;
          last = child.y;
        }
        item.y = (first + last) / 2;
      } else {
        item.y = cursor++ * DY;
      }
      nodes.push(item);
      return item;
    })(root, 0);
    return { nodes: nodes, links: links };
  }

  function applyTransform() {
    viewport.setAttribute(
      'transform',
      'translate(' + transform.x + ',' + transform.y + ') scale(' + transform.k + ')',
    );
  }

  function renderGraph() {
    var model = layout();
    viewport.textContent = '';

    var linkLayer = svgEl('g', {});
    for (var i = 0; i < model.links.length; i++) {
      var a = model.links[i].from;
      var b = model.links[i].to;
      var mid = (a.x + b.x) / 2;
      linkLayer.appendChild(
        svgEl('path', {
          class: 'link',
          d:
            'M' +
            a.x +
            ',' +
            a.y +
            'C' +
            mid +
            ',' +
            a.y +
            ' ' +
            mid +
            ',' +
            b.y +
            ' ' +
            b.x +
            ',' +
            b.y,
        }),
      );
    }
    viewport.appendChild(linkLayer);

    for (var j = 0; j < model.nodes.length; j++) {
      var item = model.nodes[j];
      var node = item.node;
      var g = svgEl('g', {
        class: 'node' + (filter && filter.matched.has(node.path) ? ' match' : ''),
        transform: 'translate(' + item.x + ',' + item.y + ')',
      });

      var circle = svgEl('circle', {
        r: node.children.length ? 4.5 : 3,
        fill: item.open ? 'var(--bg-panel)' : colorOf(node.depth),
        stroke: colorOf(node.depth),
      });
      g.appendChild(circle);

      // An unfolded node sits at the mouth of its own edges, so its label goes
      // on the outside; everything else reads left to right.
      var name = node.name.length > 28 ? node.name.slice(0, 27) + '…' : node.name;
      var text = svgEl('text', {
        x: item.open ? -9 : 9,
        y: 0,
        'text-anchor': item.open ? 'end' : 'start',
      });
      var main = svgEl('tspan', {});
      main.textContent = name;
      text.appendChild(main);

      if (node.children.length && !item.open) {
        var count = svgEl('tspan', { class: 'count' });
        count.textContent = '  ' + num(node.count);
        text.appendChild(count);
      }
      g.appendChild(text);

      var title = svgEl('title', {});
      title.textContent = tooltip(node);
      g.appendChild(title);

      if (node.children.length) {
        (function (path) {
          g.addEventListener('click', function () {
            toggle(path);
          });
        })(node.path);
      }
      viewport.appendChild(g);
    }

    applyTransform();
    if (!fitted) {
      fitted = true;
      fit();
      applyTransform();
    }
  }

  /** Fit to the rendered bounding box so labels never hang off an edge. */
  function fit() {
    var bbox;
    try {
      bbox = viewport.getBBox();
    } catch (err) {
      return;
    }
    if (!bbox.width || !bbox.height) return;
    var box = graph.getBoundingClientRect();
    var pad = 28;
    var k = Math.min((box.width - pad * 2) / bbox.width, (box.height - pad * 2) / bbox.height, 1.2);
    transform.k = Math.max(0.05, k);
    transform.x = pad - bbox.x * transform.k;
    transform.y = (box.height - bbox.height * transform.k) / 2 - bbox.y * transform.k;
  }

  var panning = null;
  graph.addEventListener('pointerdown', function (event) {
    if (event.target.closest('.node')) return;
    panning = { x: event.clientX - transform.x, y: event.clientY - transform.y };
    graph.classList.add('panning');
    graph.setPointerCapture(event.pointerId);
  });
  graph.addEventListener('pointermove', function (event) {
    if (!panning) return;
    transform.x = event.clientX - panning.x;
    transform.y = event.clientY - panning.y;
    applyTransform();
  });
  function endPan(event) {
    if (!panning) return;
    panning = null;
    graph.classList.remove('panning');
    if (event.pointerId != null && graph.hasPointerCapture(event.pointerId)) {
      graph.releasePointerCapture(event.pointerId);
    }
  }
  graph.addEventListener('pointerup', endPan);
  graph.addEventListener('pointercancel', endPan);

  graph.addEventListener(
    'wheel',
    function (event) {
      event.preventDefault();
      var box = graph.getBoundingClientRect();
      var px = event.clientX - box.left;
      var py = event.clientY - box.top;
      var factor = Math.exp(-event.deltaY * 0.0015);
      var next = Math.max(0.05, Math.min(4, transform.k * factor));
      // Keep the point under the cursor pinned while the scale changes.
      transform.x = px - ((px - transform.x) * next) / transform.k;
      transform.y = py - ((py - transform.y) * next) / transform.k;
      transform.k = next;
      applyTransform();
    },
    { passive: false },
  );

  /* ---------- shell ---------- */

  function render() {
    if (state.view === 'outline') renderOutline();
    else renderGraph();
  }

  function setView(view) {
    state.view = view;
    document.getElementById('view-outline').setAttribute('aria-pressed', view === 'outline');
    document.getElementById('view-graph').setAttribute('aria-pressed', view === 'graph');
    document.getElementById('fit').hidden = view !== 'graph';
    outline.hidden = view !== 'outline';
    graph.hidden = view !== 'graph';
    render();
  }

  var input = document.getElementById('q');
  var debounce;
  input.addEventListener('input', function () {
    clearTimeout(debounce);
    debounce = setTimeout(function () {
      state.query = input.value.trim();
      filter = computeFilter(state.query);
      state.shown.clear();
      render();
    }, 120);
  });

  document.getElementById('clear').addEventListener('click', function () {
    input.value = '';
    state.query = '';
    filter = null;
    render();
    input.focus();
  });

  document.getElementById('view-outline').addEventListener('click', function () {
    setView('outline');
  });
  document.getElementById('view-graph').addEventListener('click', function () {
    setView('graph');
  });

  document.getElementById('fit').addEventListener('click', function () {
    fit();
    applyTransform();
  });

  document.getElementById('expand').addEventListener('click', function () {
    var count = 0;
    byPath.forEach(function (node, path) {
      if (node.children.length && count++ < 20000) state.expanded.add(path);
    });
    render();
  });

  document.getElementById('collapse').addEventListener('click', function () {
    state.expanded.clear();
    state.expanded.add(root.path);
    render();
  });

  var themes = ['auto', 'light', 'dark'];
  var themeIcons = { auto: '◑', light: '☀', dark: '☽' };
  var stored = null;
  try {
    stored = localStorage.getItem('sitemap-atlas-theme');
  } catch (err) {
    stored = null;
  }
  var theme = themes.indexOf(stored) >= 0 ? stored : 'auto';
  var themeButton = document.getElementById('theme');

  function applyTheme() {
    if (theme === 'auto') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', theme);
    themeButton.textContent = themeIcons[theme];
    themeButton.title = 'Theme: ' + theme;
  }
  themeButton.addEventListener('click', function () {
    theme = themes[(themes.indexOf(theme) + 1) % themes.length];
    try {
      localStorage.setItem('sitemap-atlas-theme', theme);
    } catch (err) {
      /* private mode — the toggle still works for this session */
    }
    applyTheme();
    if (state.view === 'graph') renderGraph();
  });
  applyTheme();

  document.addEventListener('keydown', function (event) {
    if (event.key === '/' && document.activeElement !== input) {
      event.preventDefault();
      input.focus();
      input.select();
    } else if (event.key === 'Escape' && document.activeElement === input) {
      document.getElementById('clear').click();
    }
  });

  render();
})();

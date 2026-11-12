(function () {
  'use strict';

  var THEMES = [
    { id: 'dark-pro', label: 'داكن احترافي' },
    { id: 'office-light', label: 'مكتبي فاتح' },
    { id: 'high-contrast', label: 'تباين عالٍ' },
    { id: 'signage', label: 'لافتات رقمية' },
    { id: 'studio-neutral', label: 'استوديو محايد' }
  ];
  var COLS = 6;
  var KEY = { LEFT: 37, UP: 38, RIGHT: 39, DOWN: 40, ENTER: 13, BACK: 10009, ESC: 27,
              RED: 403, GREEN: 404, YELLOW: 405, BLUE: 406 };

  var store = {
    get: function (k, d) { try { var v = localStorage.getItem('stv.' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem('stv.' + k, JSON.stringify(v)); } catch (e) {} }
  };

  var state = {
    apps: [],
    pinned: store.get('pinned', []),
    theme: store.get('theme', 'dark-pro'),
    perf: store.get('perf', false),
    focus: 0          // فهرس داخل قائمة البلاطات المرئية (المفضلة ثم الكل)
  };

  var $ = function (id) { return document.getElementById(id); };

  function tiles() { return Array.prototype.slice.call(document.querySelectorAll('.tile')); }

  // الحرف الأول بعد تجاوز "ال" التعريف حتى لا تتشابه الأيقونات
  function initial(name) { return name.replace(/^ال(?=.)/, '').charAt(0).toUpperCase(); }

  function tile(app, isPinned) {
    var el = document.createElement('div');
    el.className = 'tile' + (isPinned ? ' pinned' : '');
    el.dataset.id = app.id;
    var glyph = document.createElement('div');
    glyph.className = 'glyph';
    if (app.icon && !state.perf) {
      var img = document.createElement('img');
      img.src = app.icon; img.alt = '';
      img.onerror = function () { glyph.textContent = initial(app.name); };
      glyph.appendChild(img);
    } else {
      glyph.textContent = initial(app.name);
    }
    var label = document.createElement('div');
    label.textContent = app.name;
    el.appendChild(glyph); el.appendChild(label);
    return el;
  }

  function render() {
    var byId = {};
    state.apps.forEach(function (a) { byId[a.id] = a; });
    state.pinned = state.pinned.filter(function (id) { return byId[id]; });

    var pinnedEl = $('pinned'), appsEl = $('apps');
    pinnedEl.textContent = ''; appsEl.textContent = '';

    if (!state.pinned.length) {
      var e = document.createElement('div');
      e.className = 'empty';
      e.textContent = 'اضغط الزر الأخضر على أي تطبيق لإضافته هنا';
      pinnedEl.appendChild(e);
    }
    state.pinned.forEach(function (id) { pinnedEl.appendChild(tile(byId[id], true)); });
    state.apps.forEach(function (a) {
      if (state.pinned.indexOf(a.id) === -1) appsEl.appendChild(tile(a, false));
    });

    var all = tiles();
    state.focus = Math.max(0, Math.min(state.focus, all.length - 1));
    setFocus(state.focus);
  }

  function setFocus(i) {
    var all = tiles();
    if (!all.length) return;
    all.forEach(function (t) { t.classList.remove('focused'); });
    state.focus = i;
    all[i].classList.add('focused');
    if (all[i].scrollIntoView) all[i].scrollIntoView({ block: 'nearest' });
  }

  // التنقل يحسب الصفوف داخل كل قسم على حدة حتى لا يقفز المؤشر بشكل غريب
  function move(dx, dy) {
    var all = tiles();
    if (!all.length) return;
    var pinnedCount = document.querySelectorAll('#pinned .tile').length;
    var i = state.focus;
    var inPinned = i < pinnedCount;
    var base = inPinned ? 0 : pinnedCount;
    var size = inPinned ? pinnedCount : all.length - pinnedCount;
    var local = i - base;

    // الاتجاه RTL: السهم الأيمن يرجع للخلف
    if (dx) {
      var next = local - dx;
      if (next >= 0 && next < size) setFocus(base + next);
      return;
    }
    var target = local + dy * COLS;
    if (target >= 0 && target < size) { setFocus(base + target); return; }
    if (dy > 0 && inPinned && all.length > pinnedCount) {
      setFocus(pinnedCount + Math.min(local % COLS, all.length - pinnedCount - 1));
    } else if (dy < 0 && !inPinned && pinnedCount) {
      var col = local % COLS, lastRowStart = Math.floor((pinnedCount - 1) / COLS) * COLS;
      setFocus(Math.min(lastRowStart + col, pinnedCount - 1));
    } else if (dy > 0 && target >= size && Math.floor(local / COLS) < Math.floor((size - 1) / COLS)) {
      setFocus(base + size - 1);
    }
  }

  function toast(msg) {
    var t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { t.classList.remove('show'); }, 1800);
  }

  function applyTheme() {
    var th = THEMES.filter(function (t) { return t.id === state.theme; })[0] || THEMES[0];
    state.theme = th.id;
    document.body.setAttribute('data-theme', th.id);
    $('theme-name').textContent = th.label + (state.perf ? ' · وضع الأداء' : '');
  }

  function cycleTheme() {
    var idx = THEMES.map(function (t) { return t.id; }).indexOf(state.theme);
    state.theme = THEMES[(idx + 1) % THEMES.length].id;
    store.set('theme', state.theme);
    applyTheme();
    toast('السمة: ' + $('theme-name').textContent);
  }

  function togglePerf() {
    state.perf = !state.perf;
    store.set('perf', state.perf);
    document.body.classList.toggle('perf', state.perf);
    applyTheme();
    render();
    toast(state.perf ? 'وضع الأداء: بلا حركة ولا أيقونات' : 'تم إيقاف وضع الأداء');
  }

  function togglePin() {
    var el = tiles()[state.focus];
    if (!el) return;
    var id = el.dataset.id, at = state.pinned.indexOf(id);
    if (at === -1) { state.pinned.push(id); toast('أُضيف إلى المفضّلة'); }
    else { state.pinned.splice(at, 1); toast('أُزيل من المفضّلة'); }
    store.set('pinned', state.pinned);
    render();
  }

  function refresh() {
    AppsAPI.list(function (apps) { state.apps = apps; render(); });
  }

  function tick() {
    var d = new Date();
    $('clock').textContent = ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
  }

  document.addEventListener('keydown', function (e) {
    switch (e.keyCode) {
      case KEY.LEFT: move(-1, 0); break;
      case KEY.RIGHT: move(1, 0); break;
      case KEY.UP: move(0, -1); break;
      case KEY.DOWN: move(0, 1); break;
      case KEY.ENTER: {
        var el = tiles()[state.focus];
        if (el) AppsAPI.launch(el.dataset.id, toast);
        break;
      }
      case KEY.RED: case 82 /* R */: cycleTheme(); break;
      case KEY.GREEN: case 71 /* G */: togglePin(); break;
      case KEY.YELLOW: case 89 /* Y */: togglePerf(); break;
      case KEY.BLUE: case 66 /* B */: refresh(); toast('تم تحديث القائمة'); break;
      case KEY.BACK: case KEY.ESC: AppsAPI.exit(); break;
      default: return;
    }
    e.preventDefault();
  });

  AppsAPI.registerKeys(['ColorF0Red', 'ColorF1Green', 'ColorF2Yellow', 'ColorF3Blue']);
  document.body.classList.toggle('perf', state.perf);
  applyTheme();
  tick(); setInterval(tick, 15000);
  refresh();
  // عند العودة للتطبيق، حدّث القائمة لالتقاط أي تطبيق مثبّت حديثاً
  document.addEventListener('visibilitychange', function () { if (!document.hidden) refresh(); });
})();

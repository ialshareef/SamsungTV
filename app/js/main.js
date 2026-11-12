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
    perf: store.get('perf', AppsAPI.onTV), // مفعّل افتراضياً على الشاشة (معالج KSU2E محدود)
    focus: 0          // فهرس داخل كل العناصر القابلة للتركيز (المفضلة، الكل، شريط الأوامر)
  };

  var $ = function (id) { return document.getElementById(id); };

  function tiles() { return Array.prototype.slice.call(document.querySelectorAll('.tile, .action')); }

  // الأقسام بالترتيب من الأعلى للأسفل، مع عدد الأعمدة لكل قسم
  function sections() {
    var q = function (sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); };
    var actions = q('.action');
    return [
      { items: q('#pinned .tile'), cols: COLS },
      { items: q('#apps .tile'), cols: COLS },
      { items: actions, cols: actions.length }
    ].filter(function (s) { return s.items.length; });
  }

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

  // التنقل داخل كل قسم على حدة، والانتقال بين الأقسام يحافظ على العمود قدر الإمكان
  function move(dx, dy) {
    var all = tiles(), secs = sections(), cur = all[state.focus];
    if (!cur) return;
    var si = 0, local = 0;
    secs.forEach(function (s, i) { var at = s.items.indexOf(cur); if (at !== -1) { si = i; local = at; } });
    var sec = secs[si];
    var go = function (el) { setFocus(all.indexOf(el)); };

    if (dx) {                       // RTL: السهم الأيمن يرجع للخلف
      var n = local - dx;
      if (n >= 0 && n < sec.items.length) go(sec.items[n]);
      return;
    }
    var target = local + dy * sec.cols;
    if (target >= 0 && target < sec.items.length) { go(sec.items[target]); return; }
    var lastRow = Math.floor((sec.items.length - 1) / sec.cols);
    if (dy > 0 && Math.floor(local / sec.cols) < lastRow) { go(sec.items[sec.items.length - 1]); return; }

    var next = secs[si + dy];
    if (!next) return;
    var col = Math.min(local % sec.cols, next.cols - 1);
    var idx = dy > 0 ? col : Math.floor((next.items.length - 1) / next.cols) * next.cols + col;
    go(next.items[Math.min(idx, next.items.length - 1)]);
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
    if (!el || !el.classList.contains('tile')) { toast('اختر تطبيقاً أولاً'); return; }
    var id = el.dataset.id, at = state.pinned.indexOf(id);
    if (at === -1) { state.pinned.push(id); toast('أُضيف إلى المفضّلة'); }
    else { state.pinned.splice(at, 1); toast('أُزيل من المفضّلة'); }
    store.set('pinned', state.pinned);
    render();
  }

  // أوامر شريط الأسفل — متاحة بالأسهم وOK لأن ريموت بعض طرازات CU7000 بلا أزرار ملوّنة
  var ACTIONS = {
    theme: function () { cycleTheme(); },
    pin: function () { toast('حدد تطبيقاً ثم اضغط مطولاً على OK أو الزر الأخضر'); },
    perf: function () { togglePerf(); },
    refresh: function () { refresh(); toast('تم تحديث القائمة'); }
  };

  function refresh() {
    AppsAPI.list(function (apps) { state.apps = apps; render(); });
  }

  function tick() {
    var d = new Date();
    $('clock').textContent = ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
  }

  var enter = { down: false, long: false, timer: null };

  document.addEventListener('keydown', function (e) {
    switch (e.keyCode) {
      case KEY.LEFT: move(-1, 0); break;
      case KEY.RIGHT: move(1, 0); break;
      case KEY.UP: move(0, -1); break;
      case KEY.DOWN: move(0, 1); break;
      case KEY.ENTER:
        // ضغط قصير = تشغيل، ضغط مطوّل (0.6 ث) على تطبيق = إضافة/إزالة من المفضّلة
        if (!enter.down) {
          enter.down = true; enter.long = false;
          enter.timer = setTimeout(function () {
            var el = tiles()[state.focus];
            if (el && el.classList.contains('tile')) { enter.long = true; togglePin(); }
          }, 600);
        }
        break;
      case KEY.RED: case 82 /* R */: cycleTheme(); break;
      case KEY.GREEN: case 71 /* G */: togglePin(); break;
      case KEY.YELLOW: case 89 /* Y */: togglePerf(); break;
      case KEY.BLUE: case 66 /* B */: refresh(); toast('تم تحديث القائمة'); break;
      case KEY.BACK: case KEY.ESC: AppsAPI.exit(); break;
      default: return;
    }
    e.preventDefault();
  });

  document.addEventListener('keyup', function (e) {
    if (e.keyCode !== KEY.ENTER || !enter.down) return;
    clearTimeout(enter.timer);
    enter.down = false;
    if (enter.long) return;
    var el = tiles()[state.focus];
    if (!el) return;
    if (el.classList.contains('action')) ACTIONS[el.dataset.action]();
    else AppsAPI.launch(el.dataset.id, toast);
  });

  AppsAPI.registerKeys(['ColorF0Red', 'ColorF1Green', 'ColorF2Yellow', 'ColorF3Blue']);
  document.body.classList.toggle('perf', state.perf);
  applyTheme();
  tick(); setInterval(tick, 15000);
  refresh();
  // عند العودة للتطبيق، حدّث القائمة لالتقاط أي تطبيق مثبّت حديثاً
  document.addEventListener('visibilitychange', function () { if (!document.hidden) refresh(); });
})();

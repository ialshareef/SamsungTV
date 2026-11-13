/* الويدجت: مواقيت الصلاة (حساب محلي بطريقة أم القرى)، التاريخ الهجري، العدّ لرمضان، الطقس، الأخبار.
   يعمل بدون إنترنت للصلاة والهجري ورمضان؛ الطقس والأخبار تُخزَّن مؤقتاً لآخر قيمة ناجحة. */
(function (global) {
  'use strict';

  // ───────────── مواقيت الصلاة (خوارزمية PrayTimes المبسطة) ─────────────
  var D2R = Math.PI / 180;
  function sin(d) { return Math.sin(d * D2R); }
  function cos(d) { return Math.cos(d * D2R); }
  function tan(d) { return Math.tan(d * D2R); }
  function asin(x) { return Math.asin(x) / D2R; }
  function acos(x) { return Math.acos(x) / D2R; }
  function acot(x) { return Math.atan(1 / x) / D2R; }
  function atan2(y, x) { return Math.atan2(y, x) / D2R; }
  function fix(a, b) { a = a - b * Math.floor(a / b); return a < 0 ? a + b : a; }

  function julian(y, m, d) {
    if (m <= 2) { y -= 1; m += 12; }
    var A = Math.floor(y / 100), B = 2 - A + Math.floor(A / 4);
    return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + d + B - 1524.5;
  }

  function sunPosition(jd) {
    var D = jd - 2451545.0;
    var g = fix(357.529 + 0.98560028 * D, 360);
    var q = fix(280.459 + 0.98564736 * D, 360);
    var L = fix(q + 1.915 * sin(g) + 0.020 * sin(2 * g), 360);
    var e = 23.439 - 0.00000036 * D;
    var RA = atan2(cos(e) * sin(L), cos(L)) / 15;
    return { decl: asin(sin(e) * sin(L)), eqt: q / 15 - fix(RA, 24) };
  }

  /** يرجع أوقات اليوم بالساعات العشرية (بتوقيت tz). isha90: دقائق العشاء بعد المغرب (90 أو 120 في رمضان). */
  function prayerTimes(date, lat, lng, tz, ishaMinutes) {
    var jd = julian(date.getFullYear(), date.getMonth() + 1, date.getDate()) - lng / (15 * 24);
    function midDay(t) { return fix(12 - sunPosition(jd + t).eqt, 24); }
    function angleTime(angle, t, ccw) {
      var decl = sunPosition(jd + t).decl;
      var v = acos((-sin(angle) - sin(decl) * sin(lat)) / (cos(decl) * cos(lat))) / 15;
      return midDay(t) + (ccw ? -v : v);
    }
    function asrTime(factor, t) {
      var decl = sunPosition(jd + t).decl;
      return angleTime(-acot(factor + tan(Math.abs(lat - decl))), t);
    }
    // تقريب أولي ثم دورة تحسين واحدة (كافية لدقة الدقيقة)
    var t = { fajr: 5, sunrise: 6, dhuhr: 12, asr: 13, maghrib: 18 };
    for (var i = 0; i < 2; i++) {
      var p = {}; for (var k in t) p[k] = t[k] / 24;
      t = {
        fajr: angleTime(18.5, p.fajr, true),
        sunrise: angleTime(0.833, p.sunrise, true),
        dhuhr: midDay(p.dhuhr),
        asr: asrTime(1, p.asr),
        maghrib: angleTime(0.833, p.maghrib)
      };
    }
    var adj = tz - lng / 15;
    for (var n in t) t[n] += adj;
    t.isha = t.maghrib + ishaMinutes / 60;
    return t;
  }

  var PRAYERS = [
    ['fajr', 'الفجر'], ['sunrise', 'الشروق'], ['dhuhr', 'الظهر'],
    ['asr', 'العصر'], ['maghrib', 'المغرب'], ['isha', 'العشاء']
  ];

  function hhmm(h) {
    var m = Math.round(h * 60);
    m = ((m % 1440) + 1440) % 1440;
    return ('0' + Math.floor(m / 60)).slice(-2) + ':' + ('0' + (m % 60)).slice(-2);
  }

  // ───────────── الهجري ورمضان ─────────────
  // احتياطي إن لم يدعم المتصفح تقويم أم القرى: بداية رمضان (ميلادي) حسب تقويم أم القرى
  var RAMADAN_TABLE = { 1448: '2027-02-08', 1449: '2028-01-28', 1450: '2029-01-16', 1451: '2030-01-05', 1452: '2030-12-26' };
  var HIJRI_MONTHS = ['محرم', 'صفر', 'ربيع الأول', 'ربيع الآخر', 'جمادى الأولى', 'جمادى الآخرة',
                      'رجب', 'شعبان', 'رمضان', 'شوال', 'ذو القعدة', 'ذو الحجة'];

  var hijriFmt = null;
  try {
    hijriFmt = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', { day: 'numeric', month: 'numeric', year: 'numeric' });
    if (!/^\d+\/\d+\/\d+/.test(hijriFmt.format(new Date()))) hijriFmt = null;
  } catch (e) { hijriFmt = null; }

  function hijri(date) {
    if (!hijriFmt) return null;
    var parts = hijriFmt.format(date).match(/(\d+)\/(\d+)\/(\d+)/); // M/D/Y
    return { month: +parts[1], day: +parts[2], year: +parts[3] };
  }

  function dayStart(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
  function daysBetween(a, b) { return Math.round((dayStart(b) - dayStart(a)) / 86400000); }

  function ramadanInfo(now) {
    var h = hijri(now);
    if (h && h.month === 9) return { inRamadan: true, day: h.day };
    if (h) {
      // ابحث عن أول يوم من رمضان القادم
      for (var i = 1; i < 400; i++) {
        var d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
        var x = hijri(d);
        if (x.month === 9 && x.day === 1) return { inRamadan: false, days: i, start: d, year: x.year };
      }
    }
    for (var y in RAMADAN_TABLE) {
      var p = RAMADAN_TABLE[y].split('-'), s = new Date(+p[0], +p[1] - 1, +p[2]);
      var diff = daysBetween(now, s);
      if (diff > 0) return { inRamadan: false, days: diff, start: s, year: +y };
      if (diff > -30) return { inRamadan: true, day: 1 - diff };
    }
    return null;
  }

  // ───────────── الطقس ─────────────
  function weatherText(code) {
    if (code === 0) return 'صحو';
    if (code <= 2) return 'غائم جزئياً';
    if (code === 3) return 'غائم';
    if (code === 45 || code === 48) return 'ضباب';
    if (code >= 51 && code <= 57) return 'رذاذ';
    if (code >= 61 && code <= 67) return 'ممطر';
    if (code >= 71 && code <= 77) return 'ثلوج';
    if (code >= 80 && code <= 82) return 'زخات مطر';
    if (code >= 95) return 'عواصف رعدية';
    return '';
  }

  // ───────────── أدوات ─────────────
  var store = {
    get: function (k) { try { return JSON.parse(localStorage.getItem('stv.w.' + k)); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem('stv.w.' + k, JSON.stringify(v)); } catch (e) {} }
  };

  function get(url, type, cb) {
    var x = new XMLHttpRequest();
    x.open('GET', url, true);
    x.timeout = 15000;
    x.onload = function () { if (x.status >= 200 && x.status < 300) cb(null, type === 'json' ? JSON.parse(x.responseText) : x.responseText); else cb(x.status); };
    x.onerror = x.ontimeout = function () { cb('network'); };
    x.send();
  }

  function $(id) { return document.getElementById(id); }
  function text(id, v) { var el = $(id); if (el) el.textContent = v; }

  // ───────────── العرض ─────────────
  var cfg, news = [], newsIdx = 0;

  function renderPrayers() {
    var now = new Date();
    var r = ramadanInfo(now);
    var t = prayerTimes(now, cfg.lat, cfg.lng, cfg.tz, r && r.inRamadan ? 120 : 90);
    var hNow = now.getHours() + now.getMinutes() / 60 + now.getSeconds() / 3600;
    var next = null;
    var list = $('w-prayer-list');
    list.textContent = '';
    PRAYERS.forEach(function (p) {
      var li = document.createElement('li');
      var isNext = !next && p[0] !== 'sunrise' && t[p[0]] > hNow;
      if (isNext) { next = { name: p[1], at: t[p[0]] }; li.className = 'next'; }
      li.innerHTML = '<span></span><b></b>';
      li.firstChild.textContent = p[1];
      li.lastChild.textContent = hhmm(t[p[0]]);
      list.appendChild(li);
    });
    if (!next) { // بعد العشاء: الفجر غداً
      var tom = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      next = { name: 'الفجر', at: prayerTimes(tom, cfg.lat, cfg.lng, cfg.tz, 90).fajr + 24 };
    }
    var left = Math.max(0, Math.round((next.at - hNow) * 60));
    text('w-prayer-next', next.name + ' بعد ' + Math.floor(left / 60) + ':' + ('0' + (left % 60)).slice(-2));
    text('w-prayer-city', cfg.city);
  }

  function renderHijri() {
    var now = new Date(), h = hijri(now), r = ramadanInfo(now);
    text('w-hijri', h ? h.day + ' ' + HIJRI_MONTHS[h.month - 1] + ' ' + h.year + 'هـ' : '');
    if (!r) { text('w-ramadan-num', '—'); text('w-ramadan-label', ''); return; }
    if (r.inRamadan) {
      text('w-ramadan-num', r.day);
      text('w-ramadan-label', 'من رمضان — رمضان مبارك');
    } else {
      text('w-ramadan-num', r.days);
      text('w-ramadan-label', (r.days === 1 ? 'يوم' : r.days <= 10 ? 'أيام' : 'يوماً') + ' على رمضان ' + r.year);
    }
  }

  function loadWeather() {
    var cached = store.get('weather');
    if (cached) showWeather(cached);
    var url = 'https://api.open-meteo.com/v1/forecast?latitude=' + cfg.lat + '&longitude=' + cfg.lng +
      '&current=temperature_2m,weather_code,relative_humidity_2m&daily=temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=1';
    get(url, 'json', function (err, d) {
      if (err || !d.current) { if (!cached) text('w-weather-desc', 'الطقس غير متاح'); return; }
      var w = { t: Math.round(d.current.temperature_2m), c: d.current.weather_code, h: d.current.relative_humidity_2m,
                max: Math.round(d.daily.temperature_2m_max[0]), min: Math.round(d.daily.temperature_2m_min[0]) };
      store.set('weather', w);
      showWeather(w);
    });
  }

  function showWeather(w) {
    text('w-weather-temp', w.t + '°');
    text('w-weather-desc', weatherText(w.c));
    text('w-weather-range', 'العظمى ' + w.max + '° · الصغرى ' + w.min + '° · رطوبة ' + w.h + '٪');
  }

  function loadNews() {
    var cached = store.get('news');
    if (cached && cached.length) { news = cached; showNews(); }
    var pending = cfg.feeds.length, all = [];
    cfg.feeds.forEach(function (feed) {
      get(feed.url, 'text', function (err, xml) {
        if (!err) {
          try {
            var doc = new DOMParser().parseFromString(xml, 'text/xml');
            var items = doc.querySelectorAll('item > title, entry > title');
            for (var i = 0; i < items.length && i < 8; i++) {
              var t = items[i].textContent.trim().replace(/\s+-\s+[^-]+$/, '');
              if (t) all.push({ src: feed.name, title: t, i: i });
            }
          } catch (e) {}
        }
        if (--pending === 0 && all.length) {
          all.sort(function (a, b) { return a.i - b.i; }); // تناوب بين المصادر
          news = all; store.set('news', all); newsIdx = 0; showNews(); }
        if (pending === 0 && !all.length && !news.length) text('w-news-title', 'الأخبار غير متاحة حالياً');
      });
    });
  }

  function showNews() {
    if (!news.length) return;
    var n = news[newsIdx % news.length];
    text('w-news-src', n.src);
    text('w-news-title', n.title);
  }

  // ───────────── المباريات القادمة (TheSportsDB) ─────────────
  var TEAM_AR = {
    'Al-Hilal': 'الهلال', 'Al-Nassr': 'النصر', 'Barcelona': 'برشلونة', 'Real Madrid': 'ريال مدريد',
    'Al-Ittihad': 'الاتحاد', 'Al-Ahli': 'الأهلي', 'Al-Shabab': 'الشباب', 'Al-Ettifaq': 'الاتفاق',
    'Al-Taawoun': 'التعاون', 'Al-Fateh': 'الفتح', 'Al-Fayha': 'الفيحاء', 'Al-Qadsiah': 'القادسية',
    'Al-Raed': 'الرائد', 'Al-Khaleej': 'الخليج', 'Al-Riyadh': 'الرياض', 'Al-Okhdood': 'الأخدود',
    'Al-Kholood': 'الخلود', 'Al-Hazem': 'الحزم', 'Al-Najma': 'النجمة', 'Damac': 'ضمك', 'NEOM': 'نيوم',
    'Al-Diriyah': 'الدرعية', 'Al-Feiha': 'الفيحاء', 'Atletico Madrid': 'أتلتيكو مدريد', 'Sevilla': 'إشبيلية',
    'Valencia': 'فالنسيا', 'Villarreal': 'فياريال', 'Real Sociedad': 'ريال سوسيداد', 'Athletic Bilbao': 'أتلتيك بلباو',
    'Real Betis': 'ريال بيتيس', 'Girona': 'جيرونا', 'Celta Vigo': 'سيلتا فيغو', 'Osasuna': 'أوساسونا',
    'Getafe': 'خيتافي', 'Mallorca': 'مايوركا', 'Espanyol': 'إسبانيول', 'Rayo Vallecano': 'رايو فاليكانو',
    'Alaves': 'ألافيس', 'Deportivo Alavés': 'ألافيس', 'Elche': 'إلتشي', 'Levante': 'ليفانتي', 'Real Oviedo': 'ريال أوفييدو', 'Neftchi Fergana': 'نفتشي فرغانة'
  };
  var DAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
  function ar(name) { return TEAM_AR[name] || name; }

  function loadMatches() {
    var cached = store.get('matches');
    if (cached) showMatches(cached);
    var pending = cfg.teams.length, found = {};
    cfg.teams.forEach(function (team) {
      get('https://www.thesportsdb.com/api/v1/json/123/eventsnext.php?id=' + team.id, 'json', function (err, d) {
        var e = !err && d && d.events && d.events[0];
        if (e) found[e.idEvent] = { home: e.strHomeTeam, away: e.strAwayTeam, ts: e.strTimestamp, league: e.strLeague };
        if (--pending === 0) {
          var list = Object.keys(found).map(function (k) { return found[k]; })
            .sort(function (a, b) { return a.ts < b.ts ? -1 : 1; });
          if (list.length) { store.set('matches', list); showMatches(list); }
          else if (!cached) text('w-matches-empty', 'لا توجد بيانات مباريات حالياً');
        }
      });
    });
  }

  function showMatches(list) {
    var ul = $('w-matches-list');
    ul.textContent = '';
    var now = new Date();
    list.slice(0, 4).forEach(function (m) {
      var at = new Date(m.ts + (/Z|[+-]\d\d:?\d\d$/.test(m.ts) ? '' : 'Z')); // التوقيت من المصدر بـ UTC
      if (at < new Date(now - 3 * 3600 * 1000)) return;
      var li = document.createElement('li');
      li.innerHTML = '<span class="teams"></span><span class="when"></span>';
      li.firstChild.textContent = ar(m.home) + ' × ' + ar(m.away);
      var days = daysBetween(now, at);
      var day = days === 0 ? 'اليوم' : days === 1 ? 'غداً' : DAYS[at.getDay()] + ' ' + at.getDate() + '/' + (at.getMonth() + 1);
      li.lastChild.textContent = day + ' ' + ('0' + at.getHours()).slice(-2) + ':' + ('0' + at.getMinutes()).slice(-2);
      ul.appendChild(li);
    });
    text('w-matches-empty', ul.children.length ? '' : 'لا توجد مباريات قريبة');
  }

  function applyWallpaper() {
    if (!cfg.wallpaper) return;
    document.body.classList.add('has-wallpaper');
    document.body.style.backgroundImage = 'url("' + cfg.wallpaper.replace(/"/g, '') + '")';
  }

  function start(config) {
    cfg = config;
    applyWallpaper();
    renderPrayers(); renderHijri();
    loadWeather(); loadNews(); if (cfg.teams && cfg.teams.length) loadMatches();
    setInterval(renderPrayers, 30 * 1000);
    setInterval(renderHijri, 10 * 60 * 1000);
    setInterval(loadWeather, 30 * 60 * 1000);
    setInterval(loadNews, 15 * 60 * 1000);
    setInterval(function () { if (cfg.teams && cfg.teams.length) loadMatches(); }, 3 * 3600 * 1000);
    setInterval(function () { newsIdx++; showNews(); }, 8000);
  }

  global.Widgets = { start: start, prayerTimes: prayerTimes, ramadanInfo: ramadanInfo, hijri: hijri, hhmm: hhmm };
})(typeof window !== 'undefined' ? window : globalThis);

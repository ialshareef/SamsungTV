/* طبقة الوصول إلى التطبيقات: تستخدم Tizen API على الشاشة، وبيانات تجريبية في المتصفح للمعاينة */
(function (global) {
  'use strict';

  var onTV = typeof global.tizen !== 'undefined' && global.tizen.application;

  // معرّفات التطبيقات تختلف حسب سنة الطراز والمنطقة؛ تُستخدم هنا فقط في وضع المعاينة.
  var MOCK_APPS = [
    { id: 'org.tizen.browser', name: 'المتصفح' },
    { id: 'com.samsung.tv.mediaplayer', name: 'الوسائط' },
    { id: 'com.samsung.tv.screen-mirroring', name: 'عرض الشاشة' },
    { id: 'com.samsung.tv.settings', name: 'الإعدادات' },
    { id: 'demo.office365', name: 'Office' },
    { id: 'demo.teams', name: 'Teams' },
    { id: 'demo.youtube', name: 'YouTube' },
    { id: 'demo.zoom', name: 'Zoom' },
    { id: 'demo.signage', name: 'MagicInfo' },
    { id: 'demo.calendar', name: 'التقويم' }
  ];

  var SELF_ID = onTV ? safe(function () { return global.tizen.application.getAppInfo().id; }) : null;

  function safe(fn) { try { return fn(); } catch (e) { return null; } }

  function list(callback) {
    if (!onTV) { callback(MOCK_APPS.slice()); return; }
    global.tizen.application.getAppsInfo(function (infos) {
      var apps = infos
        .filter(function (a) { return a.show && a.id !== SELF_ID; })
        .map(function (a) { return { id: a.id, name: a.name, icon: a.iconPath || null }; })
        .sort(function (a, b) { return a.name.localeCompare(b.name); });
      callback(apps);
    }, function () { callback([]); });
  }

  function launch(id, onError) {
    if (!onTV) { onError && onError('معاينة: سيتم تشغيل ' + id + ' على الشاشة'); return; }
    global.tizen.application.launch(id, null, function (e) { onError && onError(e.message || String(e)); });
  }

  function exit() {
    if (onTV) safe(function () { global.tizen.application.getCurrentApplication().hide(); });
  }

  function registerKeys(names) {
    if (!(global.tizen && global.tizen.tvinputdevice)) return;
    names.forEach(function (n) { safe(function () { global.tizen.tvinputdevice.registerKey(n); }); });
  }

  global.AppsAPI = { onTV: !!onTV, list: list, launch: launch, exit: exit, registerKeys: registerKeys };
})(window);

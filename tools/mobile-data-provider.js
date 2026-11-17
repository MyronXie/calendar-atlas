// data-less mobile: store user data in IndexedDB; serve data/place.json|config.json|calendar.ics from it;
// provide an in-app "导入/更新数据" UI (pick 3 files exported from PC).
(function () {
  var DB = 'atlas-data', STORE = 'files';
  function open() { return new Promise(function (res, rej) { var r = indexedDB.open(DB, 1); r.onupgradeneeded = function () { r.result.createObjectStore(STORE); }; r.onsuccess = function () { res(r.result); }; r.onerror = function () { rej(r.error); }; }); }
  function get(k) { return open().then(function (db) { return new Promise(function (res) { try { var t = db.transaction(STORE, 'readonly').objectStore(STORE).get(k); t.onsuccess = function () { res(t.result == null ? null : t.result); }; t.onerror = function () { res(null); }; } catch (e) { res(null); } }); }); }
  function put(k, v) { return open().then(function (db) { return new Promise(function (res) { try { var t = db.transaction(STORE, 'readwrite').objectStore(STORE).put(v, k); t.onsuccess = function () { res(true); }; t.onerror = function () { res(false); }; } catch (e) { res(false); } }); }); }
  var orig = window.fetch ? window.fetch.bind(window) : null;
  window.fetch = function (input, init) {
    try {
      var url = typeof input === 'string' ? input : (input && input.url) || '';
      var m = url.match(/data\/(place\.json|config\.json|calendar\.ics)(?:[?#].*)?$/);
      if (m) {
        var name = m[1];
        return get(name).then(function (v) {
          if (v == null) { return Promise.reject(new Error('NO_DATA:' + name)); }
          var ct = name.slice(-4) === '.ics' ? 'text/calendar; charset=utf-8' : 'application/json; charset=utf-8';
          return new Response(v, { status: 200, headers: { 'Content-Type': ct } });
        });
      }
    } catch (e) { }
    return orig.apply(this, arguments);
  };
  function ui() {
    var old = document.getElementById('atlas-import-card'); if (old) old.remove();
    var wrap = document.createElement('div'); wrap.id = 'atlas-import-card';
    wrap.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:99999;display:flex;align-items:center;justify-content:center;padding:16px;';
    wrap.innerHTML = '<div style="background:#fff;max-width:430px;width:100%;border-radius:12px;padding:18px;font:14px/1.5 system-ui,-apple-system,sans-serif;color:#222">'
      + '<h2 style="margin:0 0 6px">导入 / 更新数据</h2>'
      + '<p style="margin:0 0 10px;color:#555">选择电脑导出的 3 个文件：place.json、calendar.ics、config.json。导入后立即生效，可随时再次更新。</p>'
      + '<label style="display:block;margin:6px 0">地点 place.json<input id="imp-place" type="file" accept=".json,application/json" style="display:block;margin-top:4px"></label>'
      + '<label style="display:block;margin:6px 0">日历 calendar.ics<input id="imp-ics" type="file" accept=".ics,text/calendar" style="display:block;margin-top:4px"></label>'
      + '<label style="display:block;margin:6px 0">配置 config.json<input id="imp-config" type="file" accept=".json,application/json" style="display:block;margin-top:4px"></label>'
      + '<div style="display:flex;gap:8px;margin-top:12px"><button id="imp-go" style="flex:1;padding:10px;background:#2563eb;color:#fff;border:0;border-radius:8px">导入并进入</button><button id="imp-close" style="padding:10px;border:1px solid #ccc;background:#fff;border-radius:8px">关闭</button></div>'
      + '<div id="imp-msg" style="color:#b45309;margin-top:8px;min-height:18px"></div></div>';
    document.body.appendChild(wrap);
    document.getElementById('imp-close').onclick = function () { wrap.remove(); };
    document.getElementById('imp-go').onclick = async function () {
      var msg = document.getElementById('imp-msg');
      var fp = document.getElementById('imp-place').files[0], fi = document.getElementById('imp-ics').files[0], fc = document.getElementById('imp-config').files[0];
      if (!fp || !fi || !fc) { msg.textContent = '请选择全部 3 个文件'; return; }
      msg.textContent = '导入中…';
      try {
        await put('place.json', await fp.text());
        await put('calendar.ics', await fi.text());
        await put('config.json', await fc.text());
        msg.textContent = '导入完成，正在进入…';
        setTimeout(function () { location.reload(); }, 400);
      } catch (e) { msg.textContent = '导入失败：' + e.message; }
    };
  }
  window.__atlasImport = ui;
  function ensureButton() {
    if (document.getElementById('atlas-import-btn')) return;
    var b = document.createElement('button'); b.id = 'atlas-import-btn'; b.textContent = '导入/更新数据';
    b.style.cssText = 'position:fixed;right:12px;bottom:12px;z-index:9999;padding:9px 12px;border-radius:20px;border:0;background:#2563eb;color:#fff;font-size:13px;box-shadow:0 2px 8px rgba(0,0,0,.3)';
    b.onclick = ui; document.body.appendChild(b);
  }
  function check() {
    Promise.all([get('place.json'), get('calendar.ics'), get('config.json')]).then(function (a) {
      var missing = !a[0] || !a[1] || !a[2];
      ensureButton();
      if (missing) ui();
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', check); else check();
})();

// Read-only shim for mobile build.
document.documentElement.dataset.mobile = '1';
const css = document.createElement('style');
css.textContent = '#toggle-settings{display:none!important}.settings-backdrop,#settings-drawer{display:none!important}';
document.head.appendChild(css);
// block place editing popups
document.addEventListener('click', e => {
  const t = e.target.closest('[data-edit],[data-edit-rank]');
  if (t) { e.stopImmediatePropagation(); e.preventDefault(); }
}, true);
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => { }));
}

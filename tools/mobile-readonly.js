// block place editing popups
document.addEventListener('click', e => {
  const t = e.target.closest('[data-edit],[data-edit-rank]');
  if (t) { e.stopImmediatePropagation(); e.preventDefault(); }
}, true);
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => { }));
}

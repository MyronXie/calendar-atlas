if ('serviceWorker' in navigator) {
  const workers=navigator.serviceWorker;
  let controlled=Boolean(workers.controller), updateReady=false;
  function reloadIfReady(){
    if(updateReady&&!document.hidden&&!document.querySelector('dialog[open]')&&!document.body.classList.contains('settings-open')){
      location.reload();
    }
  }
  workers.addEventListener('controllerchange',()=>{
    updateReady=controlled&&Boolean(workers.controller);
    controlled=Boolean(workers.controller);
    reloadIfReady();
  });
  window.addEventListener('load',async()=>{
    try{
      const registration=await workers.register('sw.js',{updateViaCache:'none'});
      document.addEventListener('visibilitychange',()=>{
        if(document.hidden)return;
        reloadIfReady();
        registration.update().catch(()=>{});
      });
    }catch{}
  });
}

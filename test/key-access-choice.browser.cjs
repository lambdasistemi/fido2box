// Exercise the real session/view together without writing a hardware credential.
module.exports=async({run,ok})=>{
  const results=await run(`(async()=>{
    const {createGitHubAccess}=await import('./github-access-session.js');
    const {createGitHubAccessView}=await import('./github-access-view.js');
    const results=[],host=document.createElement('div'),app=document.getElementById('app');app.replaceWith(host);
    let read=async()=>{throw new DOMException('No answer','NotAllowedError');},validate=async()=>{},writes=0;
    const session=createGitHubAccess({change:()=>render(),publish(){},validate:()=>validate(),read:(...args)=>read(...args),save:async()=>{writes++;throw Error('Unexpected write');}});
    const view=createGitHubAccessView(session,()=>render());
    const render=()=>host.replaceChildren(view());
    const check=(name,f)=>{try{results.push([!!f(),name]);}catch{results.push([false,name]);}};
    const click=id=>host.querySelector(id).click();
    try{
      render();
      check('first visit has one visible Use security key action; setup is a secondary disclosure',()=>host.querySelector('#connectKey').textContent==='Use security key'&&!host.querySelector('#setupKey').checkVisibility()&&!!host.querySelector('summary'));
      await session.connect();
      check('an unanswered key request explains uncertainty and offers retry without opening a token form',()=>host.querySelector('#connectKey').textContent==='Try key again'&&host.querySelector('#setupKey').checkVisibility()&&!host.querySelector('#keyToken')&&session.view().message.includes('no matching')&&writes===0);
      click('#setupKey');
      check('setup only opens after an explicit choice and never writes by opening the form',()=>!!host.querySelector('#keyToken')&&writes===0);
      click('#cancelKeySetup');
      check('canceling setup restores a visible setup control and drops the token form',()=>!host.querySelector('#keyToken')&&host.querySelector('#setupKey').checkVisibility()&&document.activeElement===host.querySelector('#setupKey'));
      session.disconnect();
      let release;read=()=>new Promise(r=>release=r);const pending=session.connect();session.cancel();
      release({access:{repo:'owner/recovery',token:'synthetic'},reference:{id:'synthetic-id'}});await pending;
      check('cancelled discovery cannot create a profile or turn a late result into a connection',()=>writes===0&&!session.view().repo&&!host.querySelector('#keyToken')&&session.view().message.includes('not determined'));
      read=async()=>({access:{repo:'owner/recovery',token:'synthetic'},reference:{id:'synthetic-id'}});await session.connect();
      check('recognized access connects directly and offers renewal rather than first-time setup',()=>session.view().repo==='owner/recovery'&&host.querySelector('#setupKey').textContent==='Renew access'&&!host.querySelector('#keyToken')&&writes===0);
      validate=async()=>{throw Object.assign(Error(),{name:'BadToken'});};await session.connect();
      check('a recognized profile with a refused token promotes renewal as the next action',()=>!session.view().repo&&host.querySelector('#setupKey').classList.contains('primary')&&!host.querySelector('#connectKey').classList.contains('primary')&&writes===0);
    }finally{session.disconnect();host.replaceWith(app);}
    return results;
  })()`);
  for(const [pass,name]of results)ok(pass,name);
};

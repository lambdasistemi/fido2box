import { element as h } from './dom.js';
/** @param {ReturnType<typeof import('./github-access-session.js').createGitHubAccess>} session @param {()=>void} change */
export function createGitHubAccessView(session,change) {
  let setup=false, helpOpen=false;
  return () => {
    const state=session.view();
    const repo=h('input',{id:'keyRepo',value:state.repo,placeholder:'owner/repository',class:'wide'});
    const token=h('input',{id:'keyToken',type:'password',class:'wide',autocomplete:'off'});
    const setupButton=h('button',{id:'setupKey',class:state.renew&&!state.repo?'primary':'',disabled:state.busy,on:{click:()=>{setup=true;helpOpen=true;change();document.getElementById('keyRepo')?.focus();}}},state.renew?'Renew access':'Set up GitHub access on this key');
    return h('section',{class:'card',id:'keyAccess'},h('h2',null,'GitHub access on your security key'),
      h('p',{class:'small'},state.repo?'Connected to '+state.repo+'. Choose a box and Pull it to this browser.':'Start with Use security key. If it has saved GitHub access, we connect and list your boxes. Your boxes still need their enrolled keys to unlock.'),
      h('p',{class:'small'},'Use the same website address for setup and recovery. Key credentials created on a preview address are separate from fido2box.dev.'),
      !setup?h('div',{class:'row'},h('button',{id:'connectKey',class:state.repo||state.renew?'':'primary',disabled:state.busy,on:{click:()=>{setup=false;helpOpen=false;void session.connect();}}},state.busy?'Using security key…':state.repo?'Use another security key':state.checked?'Try key again':'Use security key'),
        state.renew&&!state.busy?setupButton:null,
        state.busy?h('button',{id:'cancelKeyAccess',on:{click:()=>{token.value='';setup=false;session.cancel();}}},'Cancel'):null,
        state.repo?h('button',{on:{click:()=>{setup=false;helpOpen=false;session.disconnect();}}},'Disconnect'):null):null,
      h('p',{id:'keyAccessStatus',role:'status','aria-live':'polite',class:'small'},state.message),
      !setup&&!state.busy&&!state.renew?h('details',{id:'keySetupHelp',open:helpOpen||state.checked,on:{toggle:event=>{if(event.target.isConnected)helpOpen=event.target.open;}}},
        h('summary',null,state.checked?'Need to set up access?':'First time with this key?'),
        h('p',{class:'small'},'If you have never saved GitHub access on this key for this website, set it up once below. Otherwise try the key again and select its GitHub access credential. An unanswered request does not prove the key is empty.'),setupButton):null,
      setup&&!state.busy?h('form',{on:{submit:event=>{event.preventDefault();const access={repo:repo.value.trim(),token:token.value.trim()};token.value='';setup=false;void session.save(access);}}},
        h('p',{class:'small'},'One-time setup: create a GitHub token for only your box repository, with Contents read and write. The token is encrypted and stored on the key. Requires a key and browser supporting PRF and largeBlob. Setup may ask for your PIN several times; the current step is shown below. Later connections use one key request.'),
        h('a',{href:'https://github.com/settings/personal-access-tokens/new',target:'_blank',rel:'noopener noreferrer'},'Create a GitHub token ↗'),
        h('label',{for:'keyRepo'},'Repository (owner/name)'),repo,h('label',{for:'keyToken'},'GitHub token'),token,
        h('p',{class:'row'},h('button',{id:'saveKeyAccess',type:'submit',class:'primary'},state.renew?'Save renewed access on key':'Save access on key'),
          h('button',{id:'cancelKeySetup',type:'button',on:{click:()=>{token.value='';setup=false;change();document.getElementById('setupKey')?.focus();}}},'Cancel setup'))):null);
  };
}

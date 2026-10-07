import { element as h } from './dom.js';
/** @param {ReturnType<typeof import('./github-access-session.js').createGitHubAccess>} session @param {()=>void} change */
export function createGitHubAccessView(session,change) {
  let setup=false;
  return () => {
    const state=session.view();
    const repo=h('input',{id:'keyRepo',value:state.repo,placeholder:'owner/repository',class:'wide'});
    const token=h('input',{id:'keyToken',type:'password',class:'wide',autocomplete:'off'});
    return h('section',{class:'card',id:'keyAccess'},h('h2',null,'GitHub access on your security key'),
      h('p',{class:'small'},'Connect before importing any boxes. After one-time setup, your key supplies the repository and token on a fresh browser. Your boxes still need their enrolled keys to unlock.'),
      h('p',{class:'small'},'Use the same website address for setup and recovery. Key credentials created on a preview address are separate from fido2box.dev.'),
      h('div',{class:'row'},h('button',{id:'connectKey',class:'primary',disabled:state.busy,on:{click:()=>{setup=false;void session.connect();}}},'Connect with security key'),
        h('button',{id:'setupKey',disabled:state.busy,on:{click:()=>{setup=true;change();document.getElementById('keyRepo')?.focus();}}},state.renew?'Renew access':'Set up key'),
        state.busy?h('button',{id:'cancelKeyAccess',on:{click:()=>{token.value='';setup=false;session.cancel();}}},'Cancel'):null,
        state.repo?h('button',{on:{click:()=>{setup=false;session.disconnect();}}},'Disconnect'):null),
      setup&&!state.busy?h('form',{on:{submit:event=>{event.preventDefault();const access={repo:repo.value.trim(),token:token.value.trim()};token.value='';setup=false;void session.save(access);}}},
        h('p',{class:'small'},'One-time setup: create a GitHub token for only your box repository, with Contents read and write. The token is encrypted and stored on the key. Requires a key and browser supporting PRF and largeBlob. Setup may ask for your PIN several times; the current step is shown below. Later connections use one key request.'),
        h('a',{href:'https://github.com/settings/personal-access-tokens/new',target:'_blank',rel:'noopener noreferrer'},'Create a GitHub token ↗'),
        h('label',{for:'keyRepo'},'Repository (owner/name)'),repo,h('label',{for:'keyToken'},'GitHub token'),token,
        h('p',{class:'row'},h('button',{id:'saveKeyAccess',type:'submit',class:'primary'},state.renew?'Save renewed access on key':'Save access on key'),
          h('button',{id:'cancelKeySetup',type:'button',on:{click:()=>{token.value='';setup=false;change();document.getElementById('setupKey')?.focus();}}},'Cancel setup'))):null,
      h('p',{id:'keyAccessStatus',role:'status','aria-live':'polite',class:'small'},state.message));
  };
}

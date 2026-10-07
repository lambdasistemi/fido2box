// Own cancellation and credentials in memory. Views receive no token.
import { readAccess, saveAccess } from './key-access.js';
import { encodeAccess } from './key-access-codec.js';
import { listRemote } from './github.js';
/** @typedef {import('./key-access-codec.js').Access} Access */
/** @param {{read?:typeof readAccess,save?:typeof saveAccess,validate?:(access:Access,signal:AbortSignal)=>Promise<unknown>,change:()=>void,publish:(access:Access|null)=>void}} ports */
export function createGitHubAccess(ports) {
  let epoch=0, controller=new AbortController(), busy=false, message='';
  /** @type {import('./key-access.js').Reference|undefined} */ let reference;
  /** @type {Access|null} */ let connected=null;
  const cancel = () => { ++epoch; controller.abort(); controller=new AbortController(); busy=false; };
  const validate = ports.validate || ((/** @type {Access} */ a,/** @type {AbortSignal} */ signal)=>listRemote(a.repo,a.token,undefined,signal));
  /** @param {Access} [input] */
  async function execute(input) {
    if(!input)reference=undefined;
    cancel(); const generation=epoch, signal=controller.signal; busy=true; connected=null;ports.publish(null);message=input?'Checking GitHub access before saving to the key.':'Waiting for your key. Enter its PIN and touch it when asked.';ports.change();
    /** @param {import('./key-access.js').Stage} stage */
    const progress=stage=>{
      if(epoch!==generation||signal.aborted)return;
      message={create:'Create GitHub access on the key. Enter its PIN and touch it when asked.',derive:'Prepare encryption. This key needs another PIN/touch request for its encryption secret.',write:'Save encrypted access on the key. Confirm the next PIN/touch request.',verify:'Verify saved access by reading it back. Confirm the final PIN/touch request.'}[stage];ports.change();
    };
    try {
      let result;
      if(input) { encodeAccess(input);await validate(input,signal);signal.throwIfAborted(); result=await (ports.save||saveAccess)(input,signal,reference,progress); }
      else result=await (ports.read||readAccess)(signal);
      signal.throwIfAborted();if(epoch!==generation)return;
      reference=result.reference;
      await validate(result.access,signal);signal.throwIfAborted();if(epoch!==generation)return;
      connected=result.access;ports.publish(connected);message=input?'Saved on key and verified. GitHub connected.':'GitHub connected from your key.';
    } catch(error) {
      if(epoch!==generation)return;
      const e=/** @type {Error} */(error);
      message=e.name==='NotAllowedError'?(input?'Setup was cancelled, timed out, or the key/browser lacks required storage support. Nothing has been verified. Retry with a key supporting PRF and largeBlob.':'Key request cancelled or timed out. Select GitHub access, or choose Set up key if it has never been configured.'):e.name==='BadToken'?'GitHub refused this token. Use Renew access to save a new token on the key.':e.name==='NoRepo'?'GitHub cannot see that repository. Check the repository and token permissions.':e.name==='NotSupportedError'?'This browser/key does not support the required key storage (largeBlob and PRF).':e.name==='AbortError'?'Cancelled.':e.message || 'GitHub access failed.';
    } finally { if(epoch===generation){busy=false;ports.change();} }
  }
  return {connect:()=>execute(),save:(/** @type {Access} */ a)=>execute(a),
    cancel:()=>{cancel();message='Cancelled. A key write already accepted may remain; connect to check it.';ports.change();},
    disconnect:()=>{cancel();connected=null;reference=undefined;message='Disconnected from GitHub.';ports.publish(null);ports.change();},
    view:()=>({busy,message,repo:connected?.repo||'',renew:!!reference}),reference:()=>connected ? reference : undefined};
}

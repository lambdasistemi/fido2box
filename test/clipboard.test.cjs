const assert = require('node:assert/strict');
module.exports = async () => {
  const {createClipboardController} = await import('../web/clipboard.js');
  const deferred = () => { let resolve; return {promise:new Promise(r=>{resolve=r;}),resolve:v=>resolve(v)}; };
  const setup = () => {
    let text = '', fail = false, readFail = false, clock = 0;
    const timers = new Map(), notices = [], writes = [];
    const ports = {writeText:async value=>{if(fail) throw Error('denied'); text=value; writes.push(value);},readText:async()=>{if(readFail) throw Error('denied');return text;},
      fingerprint:async value=>Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))).toString('hex'),
      schedule:(callback,delay)=>{assert.equal(delay,60000);timers.set(++clock,callback);return clock;},cancel:id=>timers.delete(id),notice:code=>notices.push(code)};
    const control = createClipboardController(ports);
    return {control,ports,timers,notices,writes,text:()=>text,external:v=>{text=v;},fail:v=>{fail=v;},readFail:v=>{readFail=v;},fire:async()=>{const callbacks=[...timers.values()];timers.clear();for(const callback of callbacks) await callback();}};
  };
  let count=0, failed=0;
  const check=async(name,test)=>{count++;try{await test();console.log('ok  '+name);}catch(e){failed++;console.error('FAIL '+name+': '+e.message);}};
  await check('clipboard copies exact text and conditionally clears after one minute',async()=>{const s=setup();assert.equal((await s.control.copy(' 00\r\nend ')).status,'copied');assert.equal(s.text(),' 00\r\nend ');assert.equal(s.timers.size,1);await s.fire();assert.equal(s.text(),'');});
  await check('external clipboard content is never overwritten by the delayed clear',async()=>{const s=setup();await s.control.copy('synthetic');s.external('someone else');await s.fire();assert.equal(s.text(),'someone else');assert.equal(s.writes.length,1);});
  await check('failed subsequent copy retains the prior successful clear timer',async()=>{const s=setup();await s.control.copy('old');s.fail(true);assert.equal((await s.control.copy('new')).status,'failed');assert.equal(s.timers.size,1);s.fail(false);await s.fire();assert.equal(s.text(),'');});
  await check('denied clear is announced without retaining or announcing the copied text',async()=>{const s=setup();await s.control.copy('synthetic-private');s.readFail(true);await s.fire();assert.ok(s.notices.includes('ClearFailed'));assert.ok(s.notices.every(n=>!n.includes('synthetic-private')));});
  await check('in-flight clear finishes before a newer copy starts writing',async()=>{const s=setup();assert.equal((await s.control.copy('old')).status,'copied');const gate=deferred(),started=deferred(),write=s.ports.writeText;s.ports.writeText=async value=>{if(value===''){started.resolve();await gate.promise;}return write(value);};const clear=s.fire();await started.promise;const copy=s.control.copy('new');gate.resolve();await Promise.all([clear,copy]);assert.equal(s.text(),'new');assert.deepEqual(s.writes,['old','','new']);});
  await check('successful copies replace the old timer and teardown cancels clearing',async()=>{const s=setup();await s.control.copy('old');await s.control.copy('new');assert.equal(s.timers.size,1);s.control.dispose();assert.equal(s.timers.size,0);await s.fire();assert.equal(s.text(),'new');});
  if(failed) throw Error(failed+' of '+count+' clipboard checks failed');
  console.log(count+' clipboard checks passed');
};

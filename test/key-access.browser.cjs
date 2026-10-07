// Real app + WebAuthn PRF/largeBlob. Preserve the virtual key while clearing
// browser state: CDP credential export does not transfer its PRF secret.
module.exports=async({run,send,ok,base,open,click,fill,btn,until,auth,addRecord,screenshot})=>{
  const key=await auth({hasResidentKey:true,hasLargeBlob:true});
  const wipe=async()=>{await send('Page.navigate',{url:'about:blank'});await until("location.href==='about:blank'");await send('Storage.clearDataForOrigin',{origin:base.slice(0,-1),storageTypes:'all'});};
  await wipe();
  await open();await require('./key-access-prompts.browser.cjs')({run,ok});await click('#setupKey');
  ok(await run("document.querySelector('#keyToken').type==='password' && !!document.querySelector('label[for=keyToken]')"),'setup is masked and labeled before any box exists');
  await fill('#keyToken','synthetic-discard');await click('#cancelKeySetup');
  ok(await run("!document.querySelector('#keyToken') && document.activeElement.id==='setupKey' && !document.body.innerHTML.includes('synthetic-discard')"),'canceling setup drops the token form and restores focus');
  await click('#setupKey');
  await run("{window.__setupKeyCalls=0;const create=navigator.credentials.create.bind(navigator.credentials),get=navigator.credentials.get.bind(navigator.credentials);navigator.credentials.create=async options=>{window.__setupKeyCalls++;const c=await create(options);window.__setupEarlyPRF=!!c.getClientExtensionResults().prf?.results?.first;return c;};navigator.credentials.get=options=>{window.__setupKeyCalls++;return get(options);};}");
  await fill('#keyRepo','owner/recovery');await fill('#keyToken','ghp_FAKE');await click('#saveKeyAccess');
  ok(await until("document.querySelector('#keyAccessStatus').textContent.includes('Saved on key and verified')"),'setup validates GitHub and writes and reads back encrypted access on a real virtual key');
  ok(await run('window.__setupKeyCalls===(window.__setupEarlyPRF?3:4)'),'real virtual-key setup uses three ceremonies when creation returns PRF, four otherwise');
  const creds=await send('WebAuthn.getCredentials',{authenticatorId:key.authenticatorId});
  ok(creds.credentials.length===1&&!!creds.credentials[0].largeBlob&&!Buffer.from(creds.credentials[0].largeBlob,'base64').toString().includes('ghp_FAKE'),'the key holds ciphertext, not a plaintext token');
  ok(await run("!document.body.innerHTML.includes('ghp_FAKE') && !JSON.stringify(localStorage).includes('ghp_FAKE')"),'setup clears token input and never persists it in browser storage');
  await click('#newBtn');await fill('#newName','key-recovery');await click('#newKeyFind');await until("document.querySelector('#newKeyHint').textContent.includes('Recognized')");await click('#createBox');
  ok(await until("!!document.querySelector('#lockBtn')"),'the GitHub access credential can also enroll in a new box');
  await addRecord('Recovered account','https://example.org','synthetic-recovery-secret');await click('#tab-sync');await click('#pushBtn');
  ok(await until("!!window.__gh.files['boxes/key-recovery.json']"),'UI pushes an encrypted box using access from the key');
  const files=await run('window.__gh.files');
  await wipe();
  await open();
  ok(await run("localStorage.getItem('box-repo')===null && lib.list().then(x=>x.length===0)"),'recovery begins with no local box or repository setting');
  await run(`window.__gh.files=${JSON.stringify(files)}`);
  await click('#connectKey');
  ok(await until("document.querySelector('#keyAccessStatus').textContent.includes('connected from your key') && !!document.querySelector('a[href=\"#/box/key-recovery\"]')"),'empty browser discovers key-held repository and token and lists the remote box');
  await click('a[href="#/box/key-recovery"]');await until("!!document.querySelector('#tab-sync')");await click('#tab-sync');await click('#pullBtn');
  ok(await until("document.querySelector('#status').textContent.includes('Pulled rev')"),'fresh-browser recovery pulls the remote box');
  await click('#tab-items');await click('#unlockBtn');
  ok(await until("document.body.innerText.includes('Recovered account')"),'enrolled key unlocks the pulled box after complete browser-state removal');
  await btn('Reveal');
  ok(await run("document.body.innerText.includes('synthetic-recovery-secret')"),'recovered record retains the exact secret');
  const beforePull=await run("lib.get('key-recovery').then(r=>r.sourceText)");
  await run("{const box=JSON.parse(window.__gh.files['boxes/key-recovery.json']);box.rev+=10;window.__gh.files['boxes/key-recovery.json']=JSON.stringify(box);window.__fetchBeforeKeyPull=window.fetch;window.fetch=async(...args)=>{const response=await window.__fetchBeforeKeyPull(...args);if(String(args[0]).endsWith('/contents/boxes/key-recovery.json'))await new Promise(resolve=>window.__releaseKeyPull=resolve);return response;};}");
  await click('#tab-sync');await click('#pullBtn');await until('!!window.__releaseKeyPull');await btn('Disconnect');
  await run('window.fetch=window.__fetchBeforeKeyPull;window.__releaseKeyPull();');
  await until("document.querySelector('#status').textContent.includes('Cancelled')");
  ok(await run("lib.get('key-recovery').then(r=>r.sourceText)")===beforePull,'disconnect prevents a late GitHub Pull from replacing the local box');
  await open();await click('#connectKey');await until("document.querySelector('#keyAccessStatus').textContent.includes('connected from your key')");
  await click('#setupKey');await fill('#keyRepo','owner/recovery');await fill('#keyToken','ghp_FAKE');
  ok(await run('document.documentElement.scrollWidth<=innerWidth'),'key setup fits 320px');await screenshot('key-access-phone');
  await click('#saveKeyAccess');ok(await until("document.querySelector('#keyAccessStatus').textContent.includes('Saved on key and verified')"),'renewal verifies storage on the existing credential');
  ok((await send('WebAuthn.getCredentials',{authenticatorId:key.authenticatorId})).credentials.length===1,'renewal does not consume another resident credential');
  const results=await run(`(async()=>{
    const {createGitHubAccess}=await import('./github-access-session.js');const C=await import('./key-access-codec.js');
    const results=[];const check=async(name,f)=>{try{if(!await f())throw Error();results.push([true,name]);}catch{results.push([false,name]);}};
    const access={repo:'owner/recovery',token:'synthetic-token'},reference={id:'synthetic-id'};
    await check('key-access codec refuses unknown versions and members without leaking token',()=>{for(const x of [{v:2,...access},{v:1,...access,extra:true}]){try{C.decodeAccess(JSON.stringify(x));return false;}catch(e){if(e.message.includes(access.token))return false;}}return true;});
    await check('canceled key result cannot publish a connection',async()=>{let release;let publishes=[];const s=createGitHubAccess({change(){},publish:a=>publishes.push(a),validate:async()=>{},read:()=>new Promise(r=>release=r)});const p=s.connect();s.cancel();release({access,reference});await p;return publishes.every(a=>a===null)&&!s.view().repo;});
    await check('a failed key write cannot publish or report successful setup',async()=>{const s=createGitHubAccess({change(){},publish(){},validate:async()=>{},save:async()=>{throw Error('Write refused');}});await s.save(access);return !s.view().repo&&s.view().message==='Write refused';});
    await check('expired token retains only the verified reference for renewal',async()=>{let target;const s=createGitHubAccess({change(){},publish(){},validate:async()=>{throw Object.assign(Error(),{name:'BadToken'});},read:async()=>({access,reference})});await s.connect();return !s.view().repo&&s.view().renew&&s.view().message.includes('Renew access');});
    await check('canceling a GitHub read prevents the subsequent remote PUT',async()=>{const {saveToGitHub}=await import('./github.js');const c=new AbortController();let writes=0;try{await saveToGitHub(access.repo,access.token,'{}',1,async()=>{writes++;c.abort();return{status:404,ok:false,json:async()=>({})};},undefined,c.signal);}catch(e){return e.name==='AbortError'&&writes===1;}return false;});
    const {readAccess,saveAccess}=await import('./key-access.js');const cryptoModule=await import('./crypto.js');
    const original=navigator.credentials.get.bind(navigator.credentials),prf=new Uint8Array(32).fill(7).buffer;
    const handle=cryptoModule.enc.encode(C.ACCESS_PREFIX+'synthetic').buffer;
    const goodBlob=C.encodeEnvelope(await cryptoModule.encryptText(prf,C.encodeAccess(access))).buffer;
    const answer=(options={})=>({rawId:new Uint8Array([1]).buffer,response:{authenticatorData:new Uint8Array([...new Array(32).fill(0),options.noUV?0:4]).buffer,userHandle:options.wrongHandle?cryptoModule.enc.encode('my label').buffer:handle},getClientExtensionResults:()=>({prf:options.noPRF?{}:{results:{first:prf}},largeBlob:{blob:options.corrupt?new Uint8Array([1]).buffer:goodBlob,written:options.written}})});
    try {
      for(const [name,options,expected]of [['wrong credential',{wrongHandle:true},'not GitHub access'],['missing PIN verification',{noUV:true},'verify your PIN'],['missing PRF',{noPRF:true},'PRF'],['corrupt profile',{corrupt:true},'damaged']]){
        await check(name+' is refused before connection',async()=>{navigator.credentials.get=async()=>answer(options);try{await readAccess(new AbortController().signal);return false;}catch(e){return e.message.includes(expected)&&!e.message.includes(access.token);}});
      }
      await check('unconfirmed hardware write never counts as successful setup',async()=>{navigator.credentials.get=async()=>answer({written:false});try{await saveAccess(access,new AbortController().signal,{id:'AQ=='});return false;}catch(e){return e.message.includes('did not confirm');}});
      await check('write success followed by damaged readback reports unverified outcome',async()=>{let count=0;navigator.credentials.get=async()=>answer({written:true,corrupt:++count===3});try{await saveAccess(access,new AbortController().signal,{id:'AQ=='});return false;}catch(e){return e.message.includes('readback could not verify');}});
    }finally{navigator.credentials.get=original;}
    return results;
  })()`);
  for(const [pass,name]of results)ok(pass,name);
  await send('WebAuthn.removeVirtualAuthenticator',{authenticatorId:key.authenticatorId});
  await auth({hasResidentKey:true,hasLargeBlob:false});await open();
  await run("{const create=navigator.credentials.create.bind(navigator.credentials);navigator.credentials.create=options=>{options.publicKey.timeout=1000;return create(options);};}");
  await click('#setupKey');await fill('#keyRepo','owner/recovery');await fill('#keyToken','ghp_FAKE');await click('#saveKeyAccess');
  ok(await until("document.querySelector('#keyAccessStatus').textContent.includes('support') && !document.querySelector('#keyAccessStatus').textContent.includes('Saved on key')"),'unsupported key storage is refused without claiming setup succeeded');
};

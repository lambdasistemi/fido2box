// The final save check reads ciphertext using a secret already obtained with UV.
module.exports=async({run,ok})=>{
  const results=await run(`(async()=>{
    const {saveAccess,readAccess}=await import('./key-access.js');
    const C=await import('./crypto.js'),A=await import('./key-access-codec.js');
    const create=navigator.credentials.create.bind(navigator.credentials),get=navigator.credentials.get.bind(navigator.credentials);
    const access={repo:'owner/recovery',token:'synthetic-token'},id=new Uint8Array([7]).buffer,prf=new Uint8Array(32).fill(3).buffer;
    const flags=n=>new Uint8Array([...new Array(32).fill(0),n]).buffer;
    const results=[],check=async(name,f)=>{try{results.push([!!await f(),name]);}catch{results.push([false,name]);}};
    let calls,blob;
    function install({early=false,badUV=false,badWriteUV=false,wrongWritePRF=false,badRead='',cancelRead}={}){
      calls=[];blob=undefined;
      navigator.credentials.create=async options=>{calls.push({op:'create',uv:options.publicKey.authenticatorSelection.userVerification});return {rawId:id,response:{getAuthenticatorData:()=>flags(5)},getClientExtensionResults:()=>({prf:{enabled:true,...(early?{results:{first:prf}}:{})},largeBlob:{supported:true}})};};
      navigator.credentials.get=async options=>{
        const ext=options.publicKey.extensions,write=ext.largeBlob.write,readback=!write&&!!blob;
        calls.push({op:write?'write':readback?'verify':'derive',uv:options.publicKey.userVerification,prf:!!ext.prf,ids:options.publicKey.allowCredentials?.length});
        if(write)blob=write;
        if(readback&&cancelRead)cancelRead.abort();
        const returned=readback&&badRead==='corrupt'?new Uint8Array([1]):readback&&badRead==='missing'?undefined:readback&&badRead==='different'?A.encodeEnvelope(await C.encryptText(prf,A.encodeAccess({...access,repo:'owner/other'}))):blob;
        return {rawId:readback&&badRead==='credential'?new Uint8Array([8]).buffer:id,response:{authenticatorData:flags(readback&&badRead==='presence'?4:ext.prf?(badUV||write&&badWriteUV?1:5):1),userHandle:C.enc.encode(A.ACCESS_PREFIX+'synthetic').buffer},getClientExtensionResults:()=>({...(ext.prf?{prf:{results:{first:write&&wrongWritePRF?new Uint8Array(32).fill(4).buffer:prf}}}:{}),largeBlob:{written:!!write,blob:returned?.buffer}})};
      };
    }
    try{
      for(const early of [false,true])await check('setup '+(early?'with':'without')+' creation-time PRF verifies ciphertext without requesting another PIN or PRF',async()=>{install({early});const saved=await saveAccess(access,new AbortController().signal);const last=calls.at(-1);return saved.access.token===access.token&&last.uv==='discouraged'&&!last.prf&&last.ids===1&&calls.filter(x=>x.uv==='required').length===(early?2:3)&&Object.keys(saved).sort().join(',')==='access,reference';});
      await check('renewal also uses ciphertext-only readback after verified secret acquisition and write',async()=>{install();await saveAccess(access,new AbortController().signal,{id:C.b64(id)});return calls.map(x=>x.uv).join(',')==='required,required,discouraged'&&!calls.at(-1).prf;});
      await check('readback optimization cannot bypass PIN verification while acquiring the encryption secret',async()=>{install({badUV:true});try{await saveAccess(access,new AbortController().signal);return false;}catch{return !calls.some(x=>x.op==='write');}});
      await check('the write still requires PIN verification before readback can count as success',async()=>{install({badWriteUV:true});try{await saveAccess(access,new AbortController().signal);return false;}catch{return calls.some(x=>x.op==='write')&&!calls.some(x=>x.op==='verify');}});
      await check('verification still rejects an encryption secret that cannot be reproduced during the write',async()=>{install({wrongWritePRF:true});try{await saveAccess(access,new AbortController().signal);return false;}catch(e){return e.message.includes('readback could not verify');}});
      for(const badRead of ['credential','presence','missing','corrupt','different'])await check('ciphertext-only readback refuses '+badRead+' response without verified success',async()=>{install({badRead});try{await saveAccess(access,new AbortController().signal);return false;}catch(e){return e.message.includes('readback could not verify')&&!e.message.includes(access.token);}});
      await check('cancellation during ciphertext verification refuses the late result',async()=>{const controller=new AbortController();install({cancelRead:controller});try{await saveAccess(access,controller.signal);return false;}catch(e){return e.name==='AbortError';}});
      await check('a later connection still requires PIN verification and a fresh PRF result',async()=>{install();await saveAccess(access,new AbortController().signal);calls=[];const saved=await readAccess(new AbortController().signal);return saved.access.token===access.token&&calls.length===1&&calls[0].uv==='required'&&calls[0].prf;});
    }finally{navigator.credentials.create=create;navigator.credentials.get=get;}
    return results;
  })()`);
  for(const [pass,name]of results)ok(pass,name);
};

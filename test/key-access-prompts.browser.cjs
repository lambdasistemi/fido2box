// Count WebAuthn ceremonies, not physical PIN prompts controlled by the client.
module.exports=async({run,ok})=>{
  const results=await run(`(async()=>{
    const {saveAccess,readAccess}=await import('./key-access.js');
    const C=await import('./crypto.js'),{ACCESS_PREFIX}=await import('./key-access-codec.js');
    const create=navigator.credentials.create.bind(navigator.credentials),get=navigator.credentials.get.bind(navigator.credentials);
    const results=[];const check=async(name,f)=>{try{if(!await f())throw Error();results.push([true,name]);}catch{results.push([false,name]);}};
    const access={repo:'owner/recovery',token:'synthetic-token'},prf=new Uint8Array(32).fill(9).buffer,id=new Uint8Array([2]).buffer;
    const flags=uv=>new Uint8Array([...new Array(32).fill(0),uv?5:1]).buffer;
    let calls,blob;
    const install=({early=true,uv=true,hasData=true,length=32}={})=>{
      calls=[];blob=undefined;
      navigator.credentials.create=async options=>{
        calls.push('create');
        return {rawId:id,response:hasData?{getAuthenticatorData:()=>flags(uv)}:{},getClientExtensionResults:()=>({largeBlob:{supported:true},prf:{enabled:true,...(early&&options.publicKey.extensions.prf.eval?{results:{first:prf.slice(0,length)}}:{})}})};
      };
      navigator.credentials.get=async options=>{
        const ext=options.publicKey.extensions;
        if(ext.prf||ext.largeBlob.write){if(options.publicKey.userVerification!=='required')throw Error('Secret or write UV weakened');}
        else if(options.publicKey.userVerification!=='discouraged')throw Error('Ciphertext check requests unnecessary UV');
        calls.push(ext.largeBlob.write?'write':'read');
        if(ext.largeBlob.write)blob=ext.largeBlob.write.buffer;
        return {rawId:id,response:{authenticatorData:flags(!!ext.prf),userHandle:C.enc.encode(ACCESS_PREFIX+'synthetic').buffer},getClientExtensionResults:()=>({...ext.prf?{prf:{results:{first:prf}}}:{},largeBlob:{blob,written:true}})};
      };
    };
    try{
      await check('registration-time PRF saves one key ceremony and still reads back the stored ciphertext',async()=>{install();const saved=await saveAccess(access,new AbortController().signal);return saved.access.token===access.token&&calls.join(',')==='create,write,read'&&!C.dec.decode(blob).includes(access.token);});
      await check('keys without registration-time PRF retain the verified four-ceremony fallback',async()=>{install({early:false});const saved=await saveAccess(access,new AbortController().signal);return saved.access.token===access.token&&calls.join(',')==='create,read,write,read';});
      await check('setup announces each required key operation before requesting it',async()=>{install({early:false});const stages=[];await saveAccess(access,new AbortController().signal,undefined,stage=>stages.push(stage));return stages.join(',')==='create,derive,write,verify';});
      await check('registration PRF without verified UV cannot cause a write',async()=>{install({uv:false});try{await saveAccess(access,new AbortController().signal);return false;}catch{return calls.join(',')==='create';}});
      await check('unavailable registration auth-data uses a fresh UV assertion before writing',async()=>{install({hasData:false});await saveAccess(access,new AbortController().signal);return calls.join(',')==='create,read,write,read';});
      await check('malformed registration PRF is refused before writing',async()=>{install({length:16});try{await saveAccess(access,new AbortController().signal);return false;}catch{return calls.join(',')==='create';}});
      await check('ordinary connection reads access with one verified key ceremony',async()=>{install();await saveAccess(access,new AbortController().signal);calls=[];const recovered=await readAccess(new AbortController().signal);return recovered.access.token===access.token&&calls.join(',')==='read';});
    }finally{navigator.credentials.create=create;navigator.credentials.get=get;}
    return results;
  })()`);
  for(const [pass,name]of results)ok(pass,name);
};

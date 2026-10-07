const assert=require('node:assert/strict');
module.exports=async()=>{
  const G=await import('../web/github.js');
  const source=' {"v":3,"rev":2,"rpId":"localhost","keys":[],"items":[]}\n';
  const response=text=>({status:200,ok:true,json:async()=>({sha:'synthetic',content:Buffer.from(text).toString('base64')})});
  let failed=0;
  try {const got=await G.fetchRemote('o/r','synthetic','box',async()=>response(source));assert.equal(got.text,source);assert.deepEqual(got.value,JSON.parse(source));console.log('ok  GitHub ingress preserves exact original source');}catch{failed++;console.error('FAIL GitHub ingress preserves exact original source');}
  for(const remote of ['{bad','null','{"rev":0}','{"v":99,"rev":0}',JSON.stringify({v:2,keys:[],items:[],extra:true}),JSON.stringify({v:2,keys:[],items:[],rev:'0'})]){
    let writes=0,refused=false;
    try{await G.saveToGitHub('o/r','synthetic',source,2,async(url,options)=>{if(options.method){writes++;return{ok:true,status:200,json:async()=>({commit:{sha:'synthetic'}})};}return response(remote);});}catch(e){refused=e.name==='UnsupportedRemote';}
    if(!refused||writes){failed++;console.error('FAIL malformed or unsupported remote is preserved');}else console.log('ok  malformed or unsupported remote is preserved');
  }
  if(failed)throw Error(failed+' transport cases failed');
};

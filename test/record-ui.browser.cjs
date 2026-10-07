module.exports = async ({run,ok}) => {
  const results = await run(`(async()=>{
    const {recordView}=await import('./record-view.js'), {recordEditor}=await import('./record-editor.js');
    const {createRecordSession}=await import('./record-session.js');
    const R=await import('./records.js');
    const results=[], assert=value=>{if(!value)throw Error('Unexpected record interaction');};
    const check=async(name,test)=>{try{await test();results.push([true,name]);}catch{results.push([false,name]);}};
    const field=(id,value,hidden=true,kind='text')=>({id,name:'Duplicate',value,hidden,kind});
    const record={...R.createRecord('record','<img src=x onerror=alert(1)>'),fields:[field('secret',' 0001\\r\\nline\\rend '),field('url','https://example.org/path',false,'url'),field('empty','',false),field('bad','javascript:alert(1)',false,'url')]};
    const host=document.createElement('div');document.body.append(host);
    const click=text=>{const button=[...host.querySelectorAll('button')].find(b=>b.textContent===text);assert(button);button.click();};
    await check('record values are literal, URLs are policy checked, and hidden values are absent from DOM',async()=>{
      host.replaceChildren(recordView(record,new Set(),{copy:async()=>{},reveal:()=>{},hide:()=>{},edit:()=>{}}));
      assert(host.textContent.includes(record.title) && !host.querySelector('img'));
      assert(!host.outerHTML.includes('0001') && host.querySelectorAll('a').length===1);
      const link=host.querySelector('a');assert(link.textContent===record.fields[1].value && link.target==='_blank' && link.rel.includes('noreferrer') && link.rel.includes('noopener'));
      assert(host.querySelectorAll('button.copy').length===4 && ![...host.querySelectorAll('button')].some(b=>b.textContent==='Open'));
    });
    await check('copy targets stable field identity including hidden and empty duplicate labels',async()=>{
      const copied=[];host.replaceChildren(recordView(record,new Set(),{copy:async id=>{copied.push(id);},reveal:()=>{},hide:()=>{},edit:()=>{}}));
      const controls=[...host.querySelectorAll('button.copy')];assert(controls.length===4);controls.forEach(b=>b.click());
      assert(copied.join()===record.fields.map(f=>f.id).join() && controls.every((b,i)=>b.getAttribute('aria-label').includes('field '+(i+1))));
    });
    await check('hidden URLs become links only on deliberate reveal and hide removes them',async()=>{
      const hidden={...record,fields:[field('url','https://example.org/hidden',true,'url')]};
      host.replaceChildren(recordView(hidden,new Set(),{copy:async()=>{},reveal:()=>{},hide:()=>{},edit:()=>{}}));
      assert(!host.querySelector('a') && !host.outerHTML.includes('/hidden'));
      host.replaceChildren(recordView(hidden,new Set(['url']),{copy:async()=>{},reveal:()=>{},hide:()=>{},edit:()=>{}}));assert(host.querySelector('a'));
      host.replaceChildren(recordView(hidden,new Set(),{copy:async()=>{},reveal:()=>{},hide:()=>{},edit:()=>{}}));assert(!host.querySelector('a'));
    });
    const setup=()=>{
      let view={token:{name:'box',generation:1,sourceIdentity:'encrypted'},payloads:[record],writable:true,code:'',version:3};
      const saved=[], notices=[], copied=[];let allow=false,fail=false;
      const boxes={get:()=>view,mutate:async(name,token,mutation)=>{if(fail)return {ok:false,code:'StorageFailed'};saved.push(mutation.record);view={...view,payloads:[mutation.record]};return {ok:true,value:view};}};
      const session=createRecordSession({boxes,copy:async value=>{copied.push(value);},confirmDiscard:()=>allow,approveMigration:async()=>false,notice:code=>notices.push(code),newId:()=>crypto.randomUUID()});
      session.open('box','record');host.replaceChildren(session.render(view));
      return {session,saved,notices,copied,view:()=>view,allow:()=>{allow=true;},fail:()=>{fail=true;}};
    };
    const input=(selector,value)=>{const el=host.querySelector(selector);assert(el);el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}));};
    const tick=()=>new Promise(r=>setTimeout(r,30));
    await check('existing secret stays absent in editor until reveal or empty replacement',async()=>{
      const s=setup();click('Edit');assert(host.querySelector('#record-title') && !host.outerHTML.includes('0001'));
      click('Reveal');assert(host.querySelector('textarea').value.includes('0001') && host.textContent.includes('line endings'));
      click('Hide');assert(!host.outerHTML.includes('0001'));
      click('Replace');assert(host.querySelector('textarea').value==='');
    });
    await check('untouched CR and CRLF values survive reveal and unrelated title editing',async()=>{
      const s=setup();click('Edit');click('Reveal');input('#record-title','Renamed');click('Save');await tick();
      assert(s.saved.length===1 && s.saved[0].fields[0].value===record.fields[0].value && s.saved[0].title==='Renamed');
      assert(!host.outerHTML.includes('0001'));
    });
    await check('optional secret confirmation starts empty, blocks exact mismatch and can be disabled',async()=>{
      const s=setup();click('Edit');click('Replace');input('textarea[data-value]',' typed\\nvalue ');
      const toggle=host.querySelector('[data-confirm-toggle]');assert(toggle && !toggle.checked);toggle.click();
      const second=host.querySelector('textarea[data-confirmation]');assert(second && second.value==='');
      input('textarea[data-confirmation]','typed\\nvalue');click('Save');await tick();assert(s.saved.length===0 && host.textContent.includes('match exactly'));
      input('textarea[data-confirmation]',' typed\\nvalue ');click('Save');await tick();
      assert(s.saved.length===1 && s.saved[0].fields[0].value===' typed\\nvalue ' && !('confirmations' in s.saved[0]));
    });
    await check('removal undo preserves ordering and failed save retains the live draft',async()=>{
      const s=setup();click('Edit');click('Remove field');assert(host.querySelectorAll('[data-editor-field]').length===3);click('Undo Duplicate');
      assert(host.querySelectorAll('[data-editor-field]').length===4);input('#record-title','Unsaved');s.fail();click('Save');await tick();
      assert(host.querySelector('#record-title').value==='Unsaved' && s.view().payloads[0].title===record.title);
    });
    await check('dirty departure can be refused while lock discards immediately',async()=>{
      const s=setup();click('Edit');input('#record-title','Unsaved');assert(!s.session.requestLeave());
      assert(host.querySelector('#record-title').value==='Unsaved');s.session.reset('lock');host.replaceChildren(s.session.render(s.view()));
      assert(!host.querySelector('#record-title') && !host.outerHTML.includes('0001'));
    });
    await check('new secret-only and zero-field records have no required address',async()=>{
      const s=setup();click('New record');input('#record-title','Secret only');click('Password or recovery key');input('textarea[data-value]','new secret');click('Save');await tick();
      assert(s.saved.length===1 && s.saved[0].fields.length===1 && s.saved[0].fields[0].hidden);
      click('New record');input('#record-title','Title only');click('Save');await tick();assert(s.saved[1].fields.length===0);
    });
    await check('save success followed by refresh failure stays saved and restores an actionable focus',async()=>{
      const view={token:{name:'box',generation:1,sourceIdentity:'source'},payloads:[record],writable:true,code:'',version:3};
      const notices=[];let saved=false;
      const session=createRecordSession({boxes:{get:()=>view,mutate:async()=>{saved=true;return {ok:true,value:view};}},copy:async()=>{},confirmDiscard:()=>true,approveMigration:async()=>false,notice:code=>notices.push(code),newId:()=>crypto.randomUUID(),refresh:async()=>{throw Error('synthetic refresh failure');}});
      session.open('box','record');host.replaceChildren(session.render(view));click('Edit');input('#record-title','Committed');click('Save');await tick();
      assert(saved && !host.querySelector('#record-title') && notices.includes('SavedRefreshFailed') && !notices.includes('StorageFailed'));
      assert(document.activeElement?.textContent==='Edit');
    });
    host.remove();return results;
  })()`);
  for(const [passed,name] of results) ok(passed,name);
};

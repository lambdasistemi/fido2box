import {element as h} from './dom.js';
import {createRecord,beginDraft,changeDraft,finishDraft,validateDraft,suggestField} from './records.js';
import {recordView} from './record-view.js';
import {recordEditor} from './record-editor.js';
/** @typedef {import('./box-session.js').SessionView} SessionView */
/** @typedef {{boxes:ReturnType<typeof import('./box-session.js').createBoxSessions>,copy:(value:string)=>Promise<unknown>,confirmDiscard:()=>boolean,approveMigration:(view:SessionView)=>Promise<boolean>,notice:(code:string)=>void,newId:()=>string,refresh?:()=>Promise<void>}} RecordSessionPorts */
/** @param {RecordSessionPorts} ports */
export function createRecordSession(ports) {
  let boxName='', generation=0, busy=false, validated=false;
  /** @type {string|null} */ let active=null;
  /** @type {import('./records.js').RecordDraft|null} */ let draft=null;
  /** @type {import('./box-session.js').SessionToken|null} */ let token=null;
  /** @type {SessionView|null} */ let view=null;
  const revealed=new Set(), replacing=new Set(), confirmationRevealed=new Set();
  const root=h('div',null);
  const dirty=()=>!!draft&&(JSON.stringify(draft.candidate)!==JSON.stringify(draft.original)||draft.confirmations.length>0);
  function requestLeave() { return !dirty()||ports.confirmDiscard(); }
  /** @param {'leave'|'lock'|'replace'} reason */
  function reset(reason) { generation++;draft=null;token=null;view=null;busy=false;validated=false;revealed.clear();replacing.clear();confirmationRevealed.clear();root.replaceChildren(); }
  /** @param {string} name @param {string|null} recordId */
  function open(name,recordId) { if(!requestLeave())return false;reset('leave');boxName=name;active=recordId;return true; }
  /** @param {string|null} id */
  function beginEdit(id) {
    if(!requestLeave())return;
    const current=ports.boxes.get(boxName);if(!current?.writable){ports.notice('Unsupported');return;}
    const record=id===null?createRecord(ports.newId(),''):current.payloads.find(p=>p.type==='recovery'&&p.id===id);
    if(!record||record.type!=='recovery')return;
    reset('leave');view=current;active=record.id;token=current.token;draft=beginDraft(record);draw();root.querySelector('input')?.focus();
  }
  /** Restore focus after a structural render without rereading any field values. */
  function draw() {
    const focus=document.activeElement, id=focus instanceof HTMLElement&&root.contains(focus)?focus.id:'';
    const selection=focus instanceof HTMLInputElement||focus instanceof HTMLTextAreaElement?[focus.selectionStart,focus.selectionEnd]:null;
    root.replaceChildren(content());
    const next=id?document.getElementById(id):null;
    if(next&&root.contains(next)){next.focus();if(selection&&(next instanceof HTMLInputElement||next instanceof HTMLTextAreaElement)&&selection[0]!==null)try{next.setSelectionRange(selection[0],selection[1]);}catch{/* Non-text input. */}}
  }
  /** @param {import('./records.js').DraftChange} change */
  function change(change) {
    if(!draft||busy)return;
    draft=changeDraft(draft,change);
    if(change.kind==='remove'){revealed.delete(change.fieldId);replacing.delete(change.fieldId);confirmationRevealed.delete(change.fieldId);}
    if(change.kind==='confirmation'&&change.value===null)confirmationRevealed.delete(change.fieldId);
    draw();
  }
  async function save() {
    if(!draft||!token||busy)return;
    validated=true;const result=finishDraft(draft);
    if(!result.ok){draw();const invalid=/** @type {HTMLElement|null} */(root.querySelector('[aria-invalid="true"]'));invalid?.scrollIntoView({block:'nearest'});invalid?.focus();return;}
    const captured=generation, current=ports.boxes.get(boxName), capturedToken=token;
    if(!current||current.token!==capturedToken){ports.notice('Stale');return;}
    busy=true;draw();
    try {
      /** @type {import('./box-session.js').MigrationApproval|null} */let approval=null;
      if(current.version!==3){
        const approved=await ports.approveMigration(current);if(captured!==generation)return;
        const prepared=await ports.boxes.prepareMigration(boxName,capturedToken,approved);if(captured!==generation)return;
        if(!prepared.ok){ports.notice(prepared.code);return;}approval=prepared.value;
      }
      const saved=await ports.boxes.mutate(boxName,capturedToken,{kind:'upsert-record',record:result.value},approval);
      if(captured!==generation)return;
      if(!saved.ok){ports.notice(saved.code);return;}
      reset('leave');view=saved.value;active=result.value.id;draw();ports.notice('Saved');
      const completed=generation;
      try {await ports.refresh?.();}catch{ports.notice('SavedRefreshFailed');}
      if(generation===completed)root.querySelector(/** @type {'button'} */('#edit-record'))?.focus();
    } catch {if(captured===generation)ports.notice('StorageFailed');}
    finally {if(captured===generation){busy=false;draw();}}
  }
  /** @param {Set<string>} set @param {string} id @param {boolean} enabled */
  function reveal(set,id,enabled){if(enabled)set.add(id);else set.delete(id);draw();}
  function content() {
    const current=view;if(!current)return h('div',null);
    const records=current.payloads.filter(p=>p.type==='recovery');
    const list=h('div',{class:'card'},h('h2',null,'Records'),records.length?h('div',{class:'row'},records.map(record=>h('button',{'data-record':record.id,on:{click:()=>{if(open(boxName,record.id)){view=ports.boxes.get(boxName);draw();}}}},record.title.trim()?record.title:'Untitled'))):h('p',null,'No records yet.'),
      h('button',{id:'new-record',disabled:!current.writable,on:{click:()=>beginEdit(null)}},'New record'));
    if(draft)return h('div',null,list,recordEditor(draft,{revealed,replacing,confirmationRevealed,issues:validated?validateDraft(draft):[],busy},{change,
      reveal:id=>reveal(revealed,id,true),hide:id=>reveal(revealed,id,false),revealConfirmation:id=>reveal(confirmationRevealed,id,true),hideConfirmation:id=>reveal(confirmationRevealed,id,false),
      replace:id=>{replacing.add(id);revealed.delete(id);change({kind:'update',fieldId:id,patch:{value:''}});},save,
      cancel:()=>{const latest=ports.boxes.get(boxName);reset('leave');view=latest;draw();root.querySelector('button')?.focus();},
      add:suggestion=>{const id=ports.newId();replacing.add(id);change({kind:'add',field:suggestion?suggestField(suggestion,id):{id,name:'',kind:'text',hidden:true,value:''}});const fields=root.querySelectorAll('fieldset');/** @type {HTMLElement|null} */(fields[fields.length-1]?.querySelector('input'))?.focus();}
    }));
    const record=records.find(r=>r.id===active)||records[0];
    return h('div',null,list,!current.writable?h('p',{class:'card'},'Read-only: this box contains unsupported data. Download the original encrypted file from Sync.'):null,
      record?recordView(record,revealed,{copy:async id=>{const field=record.fields.find(f=>f.id===id);if(field)await ports.copy(field.value);},
        reveal:id=>reveal(revealed,id,true),hide:id=>reveal(revealed,id,false),edit:()=>beginEdit(record.id)}):null,
      record&&current.writable?h('button',{class:'danger',on:{click:async()=>{
        if(!ports.confirmDiscard())return;const captured=generation;let approval=null;
        if(current.version!==3){const approved=await ports.approveMigration(current);if(captured!==generation)return;const prepared=await ports.boxes.prepareMigration(boxName,current.token,approved);if(!prepared.ok){ports.notice(prepared.code);return;}approval=prepared.value;}
        if(captured!==generation)return;const result=await ports.boxes.mutate(boxName,current.token,{kind:'delete-record',recordId:record.id},approval);
        if(captured!==generation)return;if(result.ok){reset('leave');view=result.value;active=null;draw();try{await ports.refresh?.();}catch{ports.notice('SavedRefreshFailed');}}else ports.notice(result.code);
      }}},'Delete record'):null);
  }
  /** @param {SessionView} session */
  function render(session) {view=session;draw();return root;}
  return {open,beginEdit,requestLeave,reset,render,dirty};
}

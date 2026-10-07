import {element as h} from './dom.js';
/** @typedef {{revealed:ReadonlySet<string>,replacing:ReadonlySet<string>,confirmationRevealed:ReadonlySet<string>,issues:readonly import('./records.js').ValidationIssue[],busy:boolean}} EditorPresentation */
/** @typedef {{change:(change:import('./records.js').DraftChange)=>void,reveal:(id:string)=>void,hide:(id:string)=>void,replace:(id:string)=>void,revealConfirmation:(id:string)=>void,hideConfirmation:(id:string)=>void,save:()=>Promise<void>,cancel:()=>void,add:(suggestion:import('./records.js').SuggestionName|null)=>void}} RecordEditorActions */
/** @param {string} code */
const message=code=>code==='ConfirmationMismatch'?'Entries must match exactly, including spaces and line breaks.':code==='ReservedTitle'?'This title is reserved for the GitHub service.':code==='InvalidTitle'?'Enter a nonblank title.':'Enter a nonblank field name.';
/** @param {import('./records.js').RecordDraft} draft @param {EditorPresentation} state @param {RecordEditorActions} actions */
export function recordEditor(draft,state,actions) {
  const titleError=state.issues.find(issue=>!issue.fieldId);
  /** @type {HTMLInputElement} */ const title=h('input',{id:'record-title',value:draft.candidate.title,'aria-invalid':!!titleError,'aria-describedby':titleError?'record-title-error':null,on:{input:()=>actions.change({kind:'title',value:title.value})}});
  return h('section',{class:'card record-editor','aria-busy':state.busy},h('h2',null,'Edit record'),h('label',{for:title.id},'Title'),title,
    titleError?h('p',{id:'record-title-error',class:'bad'},message(titleError.code)):null,
    draft.candidate.fields.map((field,index)=>{
      const prefix='field-'+encodeURIComponent(field.id), label=field.name+', field '+(index+1);
      const editable=!field.hidden||state.revealed.has(field.id)||state.replacing.has(field.id), shown=!field.hidden||state.revealed.has(field.id);
      const issue=state.issues.find(i=>i.fieldId===field.id), errorId=prefix+'-error';
      /** @type {HTMLInputElement} */ const name=h('input',{id:prefix+'-name',value:field.name,'aria-invalid':issue?.code==='InvalidFieldName','aria-describedby':issue?errorId:null,on:{input:()=>actions.change({kind:'update',fieldId:field.id,patch:{name:name.value}})}});
      /** @type {HTMLSelectElement} */ const kind=h('select',{id:prefix+'-kind',on:{change:()=>actions.change({kind:'update',fieldId:field.id,patch:{kind:/** @type {import('./records.js').FieldKind} */(kind.value)}})}},['text','multiline','url'].map(k=>h('option',{value:k,selected:k===field.kind},k)));
      /** @type {HTMLInputElement} */ const hidden=h('input',{id:prefix+'-hidden',type:'checkbox',checked:field.hidden,on:{change:()=>actions.change({kind:'update',fieldId:field.id,patch:{hidden:hidden.checked}})}});
      const confirmation=draft.confirmations.find(c=>c.fieldId===field.id);
      /** @type {HTMLInputElement} */ const confirmToggle=h('input',{id:prefix+'-confirm-toggle','data-confirm-toggle':field.id,type:'checkbox',checked:!!confirmation,on:{change:()=>actions.change({kind:'confirmation',fieldId:field.id,value:confirmToggle.checked?'':null})}});
      /** @type {HTMLTextAreaElement} */ const value=h('textarea',{id:prefix+'-value','data-value':field.id,rows:3,value:editable?field.value:'',class:shown?'':'masked-entry','aria-describedby':field.value.includes('\r')?prefix+'-endings':null,on:{input:()=>actions.change({kind:'update',fieldId:field.id,patch:{value:value.value}})}});
      /** @type {HTMLTextAreaElement} */ const second=h('textarea',{id:prefix+'-confirmation','data-confirmation':field.id,rows:3,value:confirmation?.value||'',class:state.confirmationRevealed.has(field.id)?'':'masked-entry','aria-invalid':issue?.code==='ConfirmationMismatch','aria-describedby':issue?errorId:null,on:{input:()=>actions.change({kind:'confirmation',fieldId:field.id,value:second.value})}});
      return h('fieldset',{'data-editor-field':field.id},h('legend',null,'Field '+(index+1)),h('label',{for:name.id},'Name'),name,h('label',{for:kind.id},'Kind'),kind,
        h('label',{for:hidden.id,class:'check-row'},hidden,'Hidden when viewing'),
        field.value.includes('\r')?h('p',{id:prefix+'-endings',class:'small'},'Editing this value changes CR or CRLF line endings to LF. Reveal alone preserves the original.'):null,
        editable?[h('label',{for:value.id},'Value'),value]:h('p',{class:'field-mask'},'••••••••'),
        h('div',{class:'row'},field.hidden?h('button',{id:prefix+'-reveal',on:{click:()=>state.revealed.has(field.id)?actions.hide(field.id):actions.reveal(field.id)}},state.revealed.has(field.id)?'Hide':editable?'Show':'Reveal'):null,
          field.hidden&&!state.replacing.has(field.id)?h('button',{on:{click:()=>actions.replace(field.id)}},'Replace'):null,
          h('button',{on:{click:()=>actions.change({kind:'remove',fieldId:field.id})}},'Remove field')),
        editable&&field.hidden?h('label',{for:confirmToggle.id,class:'check-row'},confirmToggle,'Confirm this value (optional)'):null,
        confirmation?[h('label',{for:second.id},'Confirm value'),second,h('button',{on:{click:()=>state.confirmationRevealed.has(field.id)?actions.hideConfirmation(field.id):actions.revealConfirmation(field.id)}},state.confirmationRevealed.has(field.id)?'Hide confirmation':'Show confirmation')]:null,
        issue?h('p',{id:errorId,class:'bad'},message(issue.code)):null);
    }),
    h('div',{class:'row'},draft.removed.map(field=>h('button',{on:{click:()=>actions.change({kind:'undo',fieldId:field.id})}},'Undo '+field.name))),
    h('h3',null,'Add a field'),h('div',{class:'row'},h('button',{on:{click:()=>actions.add(null)}},'Add field'),
      /** @type {import('./records.js').SuggestionName[]} */(['Account','Password or recovery key','Website','Backup codes','Notes']).map(name=>h('button',{on:{click:()=>actions.add(name)}},name))),
    h('div',{class:'row'},h('button',{id:'save-record',class:'primary',disabled:state.busy,on:{click:actions.save}},'Save'),h('button',{on:{click:actions.cancel}},'Cancel')));
}

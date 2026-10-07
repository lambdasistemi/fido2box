import {element as h} from './dom.js';
import {safeUrl} from './url.js';
/** @typedef {{copy:(id:string)=>Promise<void>,reveal:(id:string)=>void,hide:(id:string)=>void,edit:()=>void}} RecordViewActions */
/** @param {import('./records.js').RecoveryRecord} record @param {ReadonlySet<string>} revealed @param {RecordViewActions} actions */
export function recordView(record,revealed,actions) {
  return h('section',{class:'card record-detail'},h('h2',null,record.title.trim()?record.title:'Untitled'),
    record.fields.map((field,index)=>{
      const shown=!field.hidden||revealed.has(field.id), href=shown&&field.kind==='url'?safeUrl(field.value):'';
      const label=field.name+', field '+(index+1);
      return h('section',{'data-field':field.id,class:'record-field','aria-label':label},h('h3',null,label),
        shown ? href ? h('a',{class:'field-value',href,target:'_blank',rel:'noopener noreferrer'},field.value) : h('p',{class:'field-value'},field.value||'(empty)') : h('p',{class:'field-mask'},'••••••••'),
        shown&&field.kind==='url'&&field.value&&!href?h('p',{class:'small'},'Invalid address: saved text can be copied, but cannot be opened.'):null,
        h('div',{class:'row'},h('button',{class:'copy','aria-label':'Copy '+label,on:{click:()=>actions.copy(field.id)}},'Copy'),
          field.hidden?h('button',{'aria-label':(shown?'Hide ':'Reveal ')+label,on:{click:()=>shown?actions.hide(field.id):actions.reveal(field.id)}},shown?'Hide':'Reveal'):null));
    }),h('button',{id:'edit-record',on:{click:actions.edit}},'Edit'));
}

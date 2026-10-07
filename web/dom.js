// Literal text/node construction shared by presentation owners.
/** @typedef {Node|string|number|boolean|null|undefined|readonly Child[]} Child */
/** @typedef {{[key:string]:unknown,on?:Record<string,(event:any)=>unknown>}} ElementProps */
/** @template {keyof HTMLElementTagNameMap} K @param {K} tag @param {ElementProps|null} props @param {...Child} children @returns {HTMLElementTagNameMap[K]} */
export function element(tag,props,...children) {
  const node=document.createElement(tag);
  if(tag==='input'||tag==='textarea') for(const [key,value] of Object.entries({'data-1p-ignore':'','data-lpignore':'true','data-bwignore':'true',autocomplete:'off'})) node.setAttribute(key,value);
  for(const [key,value] of Object.entries(props||{})) {
    if(key==='on') for(const [event,handler] of Object.entries(props?.on||{})) node.addEventListener(event,handler);
    else if(key==='value' && (node instanceof HTMLInputElement||node instanceof HTMLTextAreaElement||node instanceof HTMLSelectElement)) node.value=String(value);
    else if(key.startsWith('aria-') && value!=null) node.setAttribute(key,String(value));
    else if(value!==false && value!=null) node.setAttribute(key,value===true?'':String(value));
  }
  /** @param {Child} child */
  const append=child=>{if(Array.isArray(child)) child.forEach(append);else if(child instanceof Node) node.append(child);else if(child!=null&&child!==false) node.append(document.createTextNode(String(child)));};
  children.forEach(append);return node;
}

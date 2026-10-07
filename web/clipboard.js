/** @typedef {{readText:()=>Promise<string>,writeText:(value:string)=>Promise<void>,fingerprint:(value:string)=>Promise<string>,schedule:(callback:()=>void,milliseconds:number)=>number,cancel:(timer:number)=>void,notice:(code:string)=>void}} ClipboardPorts */
/** @typedef {{status:'copied'|'failed'}} CopyResult */
/** @param {ClipboardPorts} ports */
export function createClipboardController(ports) {
  let generation = 0, disposed = false;
  /** @type {number|null} */ let timer = null;
  /** @type {Promise<unknown>} */ let queue = Promise.resolve();
  /** @template T @param {()=>Promise<T>} operation @returns {Promise<T>} */
  function serial(operation) { const next = queue.then(operation); queue = next.catch(() => {}); return next; }
  /** The timer closes over a digest only, never over copied plaintext. @param {string} fingerprint @param {number} captured */
  function schedule(fingerprint,captured) {
    timer = ports.schedule(() => serial(async () => {
      if (disposed || captured !== generation) return;
      timer = null;
      try {
        const matches = await ports.fingerprint(await ports.readText()) === fingerprint;
        if (matches && !disposed && captured === generation) { await ports.writeText(''); ports.notice('Cleared'); }
      } catch { ports.notice('ClearFailed'); }
    }),60000);
  }
  /** @param {string} value @returns {Promise<CopyResult>} */
  function copy(value) {
    return serial(async () => {
      if (disposed) return {status:'failed'};
      try {
        const fingerprint = await ports.fingerprint(value);
        await ports.writeText(value);
        if (timer !== null) ports.cancel(timer);
        generation++;
        if (!disposed) schedule(fingerprint,generation);
        ports.notice('Copied'); return {status:'copied'};
      } catch { ports.notice('CopyFailed'); return {status:'failed'}; }
    });
  }
  function dispose() { disposed = true; generation++; if(timer !== null) ports.cancel(timer); timer = null; }
  return {copy,dispose};
}

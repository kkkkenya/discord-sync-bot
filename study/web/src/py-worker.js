// The worker that runs a student's code (fixplan-f F9, fixplan-g G6): Python (MicroPython), SQL (SQLite) or
// JavaScript. One run per worker: the page ends it after 3 s, so a program that never stops costs nothing. Each
// engine downloads only when its language is first run (Python about 200 KB, SQL about 320 KB; JavaScript nothing);
// after that the browser keeps it.
import { runJs } from './js-run.js';

self.onmessage = async ({ data }) => {
  try {
    if (data.lang === 'sql') {
      const [{ default: initSqlJs }, { default: wasm }, { runSql }] = await Promise.all([import('sql.js/dist/sql-wasm.js'), import('sql.js/dist/sql-wasm.wasm?url'), import('./sql-run.js')]);
      const SQL = await initSqlJs({ locateFile: () => wasm });
      self.postMessage({ ok: true, result: runSql(SQL, data.code, data.setup || '') });
      return;
    }
    if (data.lang === 'js') { self.postMessage({ ok: true, result: runJs(data.code, data.input) }); return; }
    const [{ loadMicroPython }, { default: wasm }, { runPython }] = await Promise.all([
      import('@micropython/micropython-webassembly-pyscript/micropython.mjs'), import('@micropython/micropython-webassembly-pyscript/micropython.wasm?url'), import('./py-run.js'),
    ]);
    self.postMessage({ ok: true, result: await runPython((opts) => loadMicroPython({ ...opts, url: wasm }), data.code, data.input) });
  } catch (e) {
    self.postMessage({ ok: false, error: String(e?.message || e) });
  }
};

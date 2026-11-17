// The worker that runs a student's Python (fixplan-f F9). One run per worker: the page ends the worker after 3 s, so a
// program that never stops costs nothing. The interpreter file (about 200 KB) downloads on first use; after that the
// browser keeps it, and each run only starts it again (a fraction of a second).
import { loadMicroPython } from '@micropython/micropython-webassembly-pyscript/micropython.mjs';
import wasm from '@micropython/micropython-webassembly-pyscript/micropython.wasm?url';
import { runPython } from './py-run.js';

self.onmessage = async ({ data }) => {
  try {
    const result = await runPython((opts) => loadMicroPython({ ...opts, url: wasm }), data.code, data.input);
    self.postMessage({ ok: true, result });
  } catch (e) {
    self.postMessage({ ok: false, error: String(e?.message || e) });
  }
};

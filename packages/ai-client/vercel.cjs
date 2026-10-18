/**
 * CJS entry for `@workspace/ai-client/vercel`.
 *
 * `tsc` emits `exports.default = fn` (with `__esModule: true`). Node ESM
 * `import x from '…'` then receives `{ default: fn }` instead of `fn`, so
 * apps with `"type": "module"` crash after auth with FUNCTION_INVOCATION_FAILED
 * when they call the handler. Exporting the function as `module.exports`
 * makes the ESM default import unwrap correctly.
 */
const mod = require("./dist/vercel.js");
const handler = mod && mod.default ? mod.default : mod;
module.exports = handler;
module.exports.default = handler;

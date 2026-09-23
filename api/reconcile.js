// Vercel serverless function: POST /api/reconcile?account= with { settings?, ledger }
import { createRuntime } from '../src/runtime.js';
import { createReconcileHandler } from '../src/app.js';

const runtime = createRuntime(process.env);
const handler = createReconcileHandler({ service: runtime.activity, auth: runtime.auth });

export default function reconcile(req, res) {
  return handler(req, res);
}

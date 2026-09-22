// Vercel serverless function: GET /api/balances
import { createRuntime } from '../src/runtime.js';
import { createBalancesHandler } from '../src/app.js';

// Built once per instance, so the balance cache survives across warm invocations.
const runtime = createRuntime(process.env);
const handler = createBalancesHandler({ service: runtime.service, auth: runtime.auth });

export default function balances(req, res) {
  return handler(req, res);
}

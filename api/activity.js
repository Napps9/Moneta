// Vercel serverless function: GET /api/activity?account=&from=&to=
import { createRuntime } from '../src/runtime.js';
import { createActivityHandler } from '../src/app.js';

const runtime = createRuntime(process.env);
const handler = createActivityHandler({ service: runtime.activity, auth: runtime.auth });

export default function activity(req, res) {
  return handler(req, res);
}

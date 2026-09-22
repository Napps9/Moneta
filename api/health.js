// Vercel serverless function: GET /api/health
import { createRuntime } from '../src/runtime.js';
import { createHealthHandler } from '../src/app.js';

const runtime = createRuntime(process.env);
const handler = createHealthHandler({ auth: runtime.auth });

export default function health(req, res) {
  return handler(req, res);
}

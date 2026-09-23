// Vercel serverless function: GET or POST /api/sheet?account=&to=YYYY-MM&months=6
import { createRuntime } from '../src/runtime.js';
import { createSheetHandler } from '../src/app.js';

const runtime = createRuntime(process.env);
const handler = createSheetHandler({ service: runtime.activity, auth: runtime.auth });

export default function sheet(req, res) {
  return handler(req, res);
}

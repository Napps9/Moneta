// Vercel serverless function: GET and PUT /api/settings
import { createRuntime } from '../src/runtime.js';
import { createSettingsHandler } from '../src/app.js';

const runtime = createRuntime(process.env);
const handler = createSettingsHandler({ service: runtime.service, auth: runtime.auth });

export default function settings(req, res) {
  return handler(req, res);
}

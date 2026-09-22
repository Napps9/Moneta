import { readFileSync } from 'node:fs';

/**
 * Parse the contents of a `.env` file into a plain object.
 * Supports `KEY=value`, `export KEY=value`, quoted values, blank lines and `#` comments.
 */
export function parseEnv(text) {
  const out = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim().replace(/^export\s+/, '');
    if (!key) continue;
    let value = line.slice(eq + 1).trim();
    const quoted = value.match(/^(["'])(.*)\1(?:\s+#.*)?$/);
    if (quoted) {
      value = quoted[2];
    } else {
      const comment = value.indexOf(' #');
      if (comment !== -1) value = value.slice(0, comment).trim();
    }
    out[key] = value;
  }
  return out;
}

/**
 * Load a `.env` file into `env` without overriding variables that are already set.
 * A missing file is not an error.
 */
export function loadEnv(file, env = process.env) {
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch (err) {
    if (err && err.code === 'ENOENT') return {};
    throw err;
  }
  const parsed = parseEnv(text);
  for (const [key, value] of Object.entries(parsed)) {
    if (!(key in env)) env[key] = value;
  }
  return parsed;
}

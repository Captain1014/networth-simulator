/**
 * Encrypted-backup handoff worker (stores ciphertext only; no passwords).
 * Deploy: npm i -g wrangler && wrangler kv namespace create BACKUP_KV
 *   -> put the id in wrangler.toml as BACKUP_KV id, then wrangler deploy
 * In the app backup modal, set "Relay URL" to https://<your-worker>.workers.dev
 */
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}

function normalizeKey(id) {
  return String(id).replace(/-/g, '').toLowerCase().replace(/[^a-f0-9]/g, '');
}

function randomId() {
  const a = new Uint8Array(6);
  crypto.getRandomValues(a);
  const h = [...a].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 4)}-${h.slice(4, 8)}-${h.slice(8, 12)}`;
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS });
    }
    const url = new URL(request.url);

    if (url.pathname === '/v1/store' && request.method === 'POST') {
      let body;
      try {
        body = await request.json();
      } catch {
        return json({ error: 'invalid_json' }, 400);
      }
      if (!body || typeof body.blob !== 'string' || body.blob.length > 12_000_000) {
        return json({ error: 'invalid_blob' }, 400);
      }
      const id = randomId();
      const key = normalizeKey(id);
      if (key.length !== 12) {
        return json({ error: 'id_error' }, 500);
      }
      await env.BACKUP_KV.put(key, body.blob, { expirationTtl: 172800 });
      return json({ id });
    }

    const m = url.pathname.match(/^\/v1\/([^/]+)$/);
    if (m && request.method === 'GET') {
      const key = normalizeKey(m[1]);
      if (key.length !== 12) {
        return json({ error: 'not_found' }, 404);
      }
      const blob = await env.BACKUP_KV.get(key);
      if (!blob) {
        return json({ error: 'not_found' }, 404);
      }
      return json({ blob });
    }

    return new Response('Not found', { status: 404, headers: CORS });
  },
};

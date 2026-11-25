import http from 'node:http';
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { locateAppRoot } from './desktop/patch.mjs';

const PORT = 39124;
const here = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.join(here, 'desktop', 'patch.mjs');

function findNode() {
  const cands = [
    process.env.DSH_TRANSPARENT_NODE,
    'D:\\Program Files\\nodejs\\node.exe',
    'C:\\Program Files\\nodejs\\node.exe',
    ...(process.env.PATH || '').split(';').filter(Boolean).map((d) => path.join(d, 'node.exe')),
  ].filter(Boolean);
  for (const c of cands) {
    try {
      if (fs.existsSync(c)) return c;
    } catch {}
  }
  return 'node.exe';
}

function run(cmd, args, timeout = 120000) {
  return new Promise((resolve) => {
    let out = '';
    let err = '';
    const child = spawn(cmd, args, {
      windowsHide: true,
    });
    const timer = setTimeout(() => child.kill(), timeout);
    child.stdout.on('data', (d) => (out += d.toString()));
    child.stderr.on('data', (d) => (err += d.toString()));
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, out, err });
    });
    child.on('error', (e) => {
      clearTimeout(timer);
      resolve({ code: -1, out, err: String(e && e.message) });
    });
  });
}

function parseStatus(text) {
  const state = /state:\s*(.+)/.exec(text);
  const root = /root:\s*(.+)/.exec(text);
  const backup = /backup:\s*(.+)/.exec(text);
  const s = state ? state[1].trim() : 'unknown';
  const m = /patched \(([a-z]+)\)/.exec(s);
  return {
    patched: /^patched/.test(s),
    material: m ? m[1] : null,
    root: root ? root[1].trim() : null,
    backup: backup ? backup[1].trim() : null,
  };
}

export function apply(ctx) {
  if (process.platform !== 'win32') return;
  let disposed = false;
  const root = (() => {
    try {
      return locateAppRoot();
    } catch {
      return null;
    }
  })();

  const server = http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'content-type');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    if (req.method === 'OPTIONS') {
      res.end('{}');
      return;
    }
    const send = (obj, code = 200) => {
      res.statusCode = code;
      res.end(JSON.stringify(obj));
    };
    try {
      const url = new URL(req.url, 'http://127.0.0.1');
      if (!root) return send({ ok: false, error: 'installation not found' }, 500);

      if (url.pathname === '/status') {
        const r = await run(findNode(), [SCRIPT, 'status', '--root', root]);
        return send({ ok: r.code === 0, ...parseStatus(r.out), error: r.err || undefined });
      }
      if (url.pathname === '/material') {
        const mode = url.searchParams.get('mode') === 'none' ? 'none' : 'acrylic';
        const r = await run(findNode(), [SCRIPT, 'apply', '--material', mode, '--root', root]);
        if (r.code !== 0) return send({ ok: false, error: r.err || r.out }, 500);
        return send({ ok: true, material: mode, restartRequired: true, output: r.out.trim() });
      }
      if (url.pathname === '/restart') {
        send({ ok: true });
        spawn(
          'cmd.exe',
          ['/c', `timeout /t 2 >nul & taskkill /IM "DeepSeek Harness.exe" /F >nul 2>&1 & start "" "${path.join(root, 'DeepSeek Harness.exe')}"`],
          { windowsHide: true, detached: true, stdio: 'ignore' },
        ).unref();
        return;
      }
      send({ ok: false, error: 'unknown endpoint' }, 404);
    } catch (e) {
      send({ ok: false, error: String((e && e.message) || e) }, 500);
    }
  });
  server.on('error', (e) => console.warn('[dsh-transparent] local server:', e.message));
  server.listen(PORT, '127.0.0.1');

  ctx.effect(() => () => {
    disposed = true;
    server.close();
    void disposed;
  });
}

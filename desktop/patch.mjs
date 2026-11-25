#!/usr/bin/env node
/**
 * dsh-transparent / desktop patch
 *
 * Makes the DSH Desktop window translucent (Windows 11 acrylic) by patching
 * `resources/app.asar`'s `lib/main.js` in place: the new main.js is appended to
 * the archive and the header table is rewritten, so nothing is repacked.
 *
 * The page-side colors are owned by the plugin's client.js, so this patcher
 * only changes window material options.
 *
 * CLI: node desktop/patch.mjs <status|apply|restore> [--root <app dir>]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MARKER = '/* dsh-transparent-window */';
const MARKERS = ['/* dsh-transparent-window', '/* dsh-acrylic-window */'];

function asarOf(root) {
  return path.join(root, 'resources', 'app.asar');
}

function backupOf(root) {
  return path.join(root, 'resources', 'app.asar.original');
}

export function locateAppRoot() {
  const candidates = [];
  const exe = process.execPath || '';
  if (/deepseek[ -]?harness\.exe$/i.test(exe)) candidates.push(path.dirname(exe));
  if (process.resourcesPath) candidates.push(path.dirname(process.resourcesPath));
  if (process.env.DSH_DESKTOP_ROOT) candidates.push(process.env.DSH_DESKTOP_ROOT);
  const local = process.env.LOCALAPPDATA;
  if (local) candidates.push(path.join(local, 'Programs', 'DeepSeek Harness'));
  candidates.push('D:\\DeepSeek Harness', 'C:\\Program Files\\DeepSeek Harness');
  for (const dir of candidates) {
    try {
      if (dir && fs.existsSync(asarOf(dir))) return dir;
    } catch {}
  }
  return null;
}

function readHeader(file) {
  const fd = fs.openSync(file, 'r');
  try {
    const head = Buffer.alloc(16);
    if (fs.readSync(fd, head, 0, 16, 0) !== 16) throw new Error('cannot read asar header');
    const size = fs.fstatSync(fd).size;
    const headerSize = head.readUInt32LE(4);
    const jsonLen = head.readUInt32LE(12);
    if (headerSize < 8 || headerSize > size) throw new Error('asar header size looks wrong');
    const jsonBuf = Buffer.alloc(jsonLen);
    fs.readSync(fd, jsonBuf, 0, jsonLen, 16);
    const header = JSON.parse(jsonBuf.toString('utf8'));
    return { header, headerSize, jsonLen, jsonStart: 16, payloadStart: 8 + headerSize };
  } finally {
    fs.closeSync(fd);
  }
}

function lookup(header, relPath) {
  let node = header;
  for (const part of relPath.split('/')) {
    if (!node || !node.files || !node.files[part]) return undefined;
    node = node.files[part];
  }
  return node;
}

function readEntry(file, meta, relPath) {
  const info = lookup(meta.header, relPath);
  if (!info || info.size === undefined) throw new Error('missing in asar: ' + relPath);
  const fd = fs.openSync(file, 'r');
  try {
    const buf = Buffer.alloc(info.size);
    fs.readSync(fd, buf, 0, info.size, meta.payloadStart + Number(info.offset));
    return buf;
  } finally {
    fs.closeSync(fd);
  }
}

function patchMain(source) {
  let s = source;
  const rep = (needle, repl, label) => {
    const count = s.split(needle).length - 1;
    if (count !== 1) throw new Error(`${label}: expected 1 match, found ${count} (DSH build changed?)`);
    s = s.replace(needle, repl);
  };

  rep(
    '\t\t\tbackgroundColor: chromeFallbackFill(),\n' +
      '\t\t\ttitleBarStyle: "hidden",\n' +
      '\t\t\ttitleBarOverlay: {\n' +
      '\t\t\t\theight: 40,\n' +
      '\t\t\t\tcolor: chromeFallbackFill(),',
    '\t\t\tbackgroundColor: "#00000000",\n' +
      '\t\t\tbackgroundMaterial: "acrylic",\n' +
      '\t\t\ttitleBarStyle: "hidden",\n' +
      '\t\t\ttitleBarOverlay: {\n' +
      '\t\t\t\theight: 40,\n' +
      '\t\t\t\tcolor: "#00000000",',
    'window options'
  );

  rep(
    '\t\t\tif (!window.isDestroyed()) window.setBackgroundColor(chromeFallbackFill());',
    '\t\t\tif (!window.isDestroyed()) window.setBackgroundColor("#00000000");',
    'nativeTheme reset'
  );

  rep(
    '\t\tif (process.platform === "win32") window.setBackgroundColor(chromeFallbackFill());',
    '\t\tif (process.platform === "win32") window.setBackgroundColor("#00000000");',
    'enterWorkspace reset'
  );

  rep(
    '\t\t\tif (validColor(color) && validColor(symbolColor)) mainWindow.setTitleBarOverlay({\n' +
      '\t\t\t\tcolor,\n' +
      '\t\t\t\tsymbolColor\n' +
      '\t\t\t});',
    '\t\t\tif (validColor(color) && validColor(symbolColor)) mainWindow.setTitleBarOverlay({\n' +
      '\t\t\t\tcolor: "#00000000",\n' +
      '\t\t\t\tsymbolColor\n' +
      '\t\t\t});',
    'title bar sync'
  );

  return MARKER + '\n' + s;
}

function writePatched(archive, newMain, outFile) {
  const meta = readHeader(archive);
  const entry = lookup(meta.header, 'lib/main.js');
  if (!entry || entry.unpacked) throw new Error('lib/main.js is not packed in the asar');
  const newOffset = fs.statSync(archive).size - meta.payloadStart;
  if (newOffset <= 0) throw new Error('bad asar offset');
  entry.offset = String(newOffset);
  entry.size = newMain.length;
  entry.executable = false;
  delete entry.integrity;
  let json = Buffer.from(JSON.stringify(meta.header), 'utf8');
  if (json.length > meta.jsonLen) {
    throw new Error('patched header is larger than the original; repack with @electron/asar instead');
  }
  json = Buffer.concat([json, Buffer.alloc(meta.jsonLen - json.length, 0x20)]);
  fs.copyFileSync(archive, outFile);
  const fd = fs.openSync(outFile, 'r+');
  try {
    fs.writeSync(fd, json, 0, json.length, meta.jsonStart);
  } finally {
    fs.closeSync(fd);
  }
  fs.appendFileSync(outFile, newMain);
}

function isPatched(file) {
  const meta = readHeader(file);
  const main = readEntry(file, meta, 'lib/main.js');
  const head = main.subarray(0, 32).toString('utf8');
  return MARKERS.some((m) => head.startsWith(m));
}

function materialOf(file) {
  const meta = readHeader(file);
  const head = readEntry(file, meta, 'lib/main.js').subarray(0, 64).toString('utf8');
  const m = /dsh-transparent-window:(\w+)/.exec(head);
  return m ? m[1] : 'acrylic';
}

export function status(root) {
  const asar = asarOf(root);
  if (!fs.existsSync(asar)) return { found: false, patched: false, backup: false, asar };
  let patched = false;
  try {
    patched = isPatched(asar);
  } catch {}
  let material = null;
  try {
    if (patched) material = materialOf(asar);
  } catch {}
  return { found: true, patched, material, backup: fs.existsSync(backupOf(root)), asar, backupPath: backupOf(root) };
}

export function applyPatch(root, material = 'acrylic') {
  const asar = asarOf(root);
  if (!fs.existsSync(asar)) throw new Error('app.asar not found: ' + asar);
  const st = status(root);
  if (st.patched && st.material === material) return { changed: false, reason: 'already-patched', material };

  const backup = backupOf(root);
  if (st.patched && st.material !== material) {
    if (!fs.existsSync(backup)) throw new Error('no original backup; cannot switch material (reinstall DSH)');
    fs.copyFileSync(backup, asar);
    st.patched = false;
  }
  if (!fs.existsSync(backup)) fs.copyFileSync(asar, backup);

  const meta = readHeader(asar);
  const originalMain = readEntry(asar, meta, 'lib/main.js');
  let text = patchMain(originalMain.toString('utf8'));
  if (material === 'none') {
    const body = text.slice(MARKER.length);
    text = '/* dsh-transparent-window:none */' +
      body.replace('backgroundMaterial: "acrylic",', 'transparent: true,');
  }
  const patchedMain = Buffer.from(text, 'utf8');

  const tmp = asar + '.dsh-transparent.tmp';
  try {
    writePatched(asar, patchedMain, tmp);
    const check = readHeader(tmp);
    const got = readEntry(tmp, check, 'lib/main.js');
    if (!got.equals(patchedMain)) throw new Error('verify failed: lib/main.js mismatch');
    JSON.parse(readEntry(tmp, check, 'package.json').toString('utf8'));
    fs.copyFileSync(tmp, asar);
  } finally {
    try {
      fs.rmSync(tmp, { force: true });
    } catch {}
  }
  return { changed: true, material, mainBytes: patchedMain.length, restartRequired: true };
}

export function restorePatch(root) {
  const backup = backupOf(root);
  if (!fs.existsSync(backup)) throw new Error('no backup at ' + backup);
  fs.copyFileSync(backup, asarOf(root));
  return { restored: true, restartRequired: true };
}

/** Called from the Host half: patch once, silently, never throw. */
export function ensurePatched(root = locateAppRoot(), material = 'acrylic') {
  if (!root) return { skipped: 'desktop app not found' };
  if (process.env.DSH_TRANSPARENT_SKIP_PATCH === '1') return { skipped: 'disabled by env' };
  const st = status(root);
  if (!st.found) return { skipped: 'no app.asar' };
  if (st.patched) return { patched: true, changed: false, material: st.material };
  return applyPatch(root, material);
}

const isCli = Boolean(process.argv[1]) && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  const cmd = process.argv[2] || 'status';
  const i = process.argv.indexOf('--root');
  const root = i > 0 ? path.resolve(process.argv[i + 1]) : locateAppRoot();
  const mi = process.argv.indexOf('--material');
  const material = mi > 0 ? process.argv[mi + 1] : 'acrylic';
  if (material !== 'acrylic' && material !== 'none') {
    console.error('--material 只支持 acrylic | none');
    process.exit(2);
  }
  if (!root) {
    console.error('找不到 DSH 桌面版安装目录，请用 --root 指定');
    process.exit(1);
  }
  try {
    if (cmd === 'status') {
      const st = status(root);
      console.log('root: ' + root);
      console.log('state: ' + (st.patched ? 'patched (' + st.material + ')' : 'original'));
      console.log('backup: ' + (st.backup ? st.backupPath : 'none'));
    } else if (cmd === 'apply') {
      console.log(JSON.stringify(applyPatch(root, material)));
      console.log('重启 DSH 后生效。');
    } else if (cmd === 'restore') {
      console.log(JSON.stringify(restorePatch(root)));
    } else {
      console.error('用法: node desktop/patch.mjs <status|apply|restore> [--root <dir>] [--material acrylic|none]');
      process.exit(2);
    }
  } catch (e) {
    console.error('错误: ' + (e && e.message ? e.message : e));
    process.exit(1);
  }
}

/* dsh-transparent — translucent window background with adjustable opacity.
 *
 * The window material (Windows 11 acrylic) is provided by the Desktop shell.
 * This Client module paints the Web surface with translucent theme tokens and
 * exposes a small opacity control in the shell overlay.
 */
window.__ModuleLoader__.load({
  id: 'dsh-transparent',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    const STORAGE_KEY = 'dsh-transparent.alpha';
    const DEFAULT_ALPHA = 0.34;
    const MIN_ALPHA = 0;
    const MAX_ALPHA = 0.62;

    const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

    function readAlpha() {
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        const n = raw == null ? NaN : Number(raw);
        return Number.isFinite(n) ? clamp(n, MIN_ALPHA, MAX_ALPHA) : DEFAULT_ALPHA;
      } catch (_) {
        return DEFAULT_ALPHA;
      }
    }

    function writeAlpha(value) {
      try {
        window.localStorage.setItem(STORAGE_KEY, String(value));
      } catch (_) {
        /* storage unavailable: keep the value in memory only */
      }
    }

    function rgba(r, g, b, a) {
      return 'rgba(' + r + ', ' + g + ', ' + b + ', ' + a.toFixed(3) + ')';
    }

    function palette(alpha) {
      const a = clamp(alpha, MIN_ALPHA, MAX_ALPHA);
      const up = (d) => Math.min(0.97, a + d);
      const light = {
        base: rgba(250, 251, 253, a),
        layer1: rgba(255, 255, 255, up(0.26)),
        layer2: rgba(255, 255, 255, up(0.38)),
        layer3: rgba(255, 255, 255, up(0.38)),
        sidebar: rgba(255, 255, 255, Math.min(0.9, a * 0.7)),
        input: rgba(255, 255, 255, up(0.26)),
        menu: rgba(252, 253, 254, up(0.46)),
      };
      const da = Math.min(0.9, a * 1.15 + 0.02);
      const dup = (d) => Math.min(0.97, da + d);
      const dark = {
        base: rgba(21, 21, 23, da),
        layer1: rgba(35, 35, 36, dup(0.24)),
        layer2: rgba(44, 44, 46, dup(0.36)),
        layer3: rgba(44, 44, 46, dup(0.36)),
        sidebar: rgba(27, 27, 28, Math.min(0.88, da * 0.86)),
        input: rgba(52, 53, 56, dup(0.26)),
        menu: rgba(48, 49, 54, dup(0.44)),
      };
      return { light, dark };
    }

    function buildCss(alpha) {
      const p = palette(alpha);
      const vars = (t) =>
        '--dsw-alias-bg-base: ' + t.base + ' !important;' +
        '--dsw-alias-bg-layer-1: ' + t.layer1 + ' !important;' +
        '--dsw-alias-bg-layer-2: ' + t.layer2 + ' !important;' +
        '--dsw-alias-bg-layer-3: ' + t.layer3 + ' !important;' +
        '--dsw-specific-sidebar-fill: ' + t.sidebar + ' !important;' +
        '--dsw-specific-input-major: ' + t.input + ' !important;' +
        '--dsw-specific-menu: ' + t.menu + ' !important;';

      return [
        'html, body { background: transparent !important; }',
        'html[data-ds-theme-source] body { ' + vars(p.light) + ' }',
        'html[data-ds-theme-source] body[data-ds-dark-theme] { ' + vars(p.dark) + ' }',

        /* Modal sheets keep an opaque surface: the settings dialog must stay
         * readable on top of the acrylic window. */
        '[data-shortcut-modal="settings"] {' +
          '--dsw-alias-bg-base: #ffffff !important;' +
          '--dsw-alias-bg-layer-1: #ffffff !important;' +
          '--dsw-alias-bg-layer-2: #ffffff !important;' +
          '--dsw-alias-bg-layer-3: #f4f5f7 !important;' +
          '--dsw-specific-input-major: #ffffff !important;' +
          '--dsw-specific-menu: #ffffff !important;' +
          'background-color: #ffffff !important;' +
          '}',
        'html[data-ds-theme-source] body[data-ds-dark-theme] [data-shortcut-modal="settings"] {' +
          '--dsw-alias-bg-base: #151517 !important;' +
          '--dsw-alias-bg-layer-1: #202022 !important;' +
          '--dsw-alias-bg-layer-2: #232324 !important;' +
          '--dsw-alias-bg-layer-3: #2c2c2e !important;' +
          '--dsw-specific-input-major: #343538 !important;' +
          '--dsw-specific-menu: #2b2c30 !important;' +
          'background-color: #232324 !important;' +
          '}',

        /* One tint layer per region: the frame paints nothing itself, the title
         * band paints sidebar colour on the left and content colour on the
         * right, and the 16px content corner is removed so no brighter
         * rounded tab appears where the card meets the band. */
        'html[data-windows-titlebar] [style*="--dsh-windows-sidebar-width"] {' +
          'background: transparent !important;' +
          '--dsh-windows-content-radius: 0px !important;' +
          '}',
        'html[data-windows-titlebar] [style*="--dsh-windows-sidebar-width"]::before {' +
          'background: linear-gradient(to right, var(--dsw-specific-sidebar-fill) 0 var(--dsh-windows-sidebar-width), var(--dsw-alias-bg-base) var(--dsh-windows-sidebar-width) 100%) !important;' +
          '}',

        /* Control surface (rendered in the shell overlay). */
        '.dsh-tr-root { position: fixed; right: 14px; top: 50%; transform: translateY(-50%);' +
          'z-index: 2147483000; pointer-events: none; font: inherit; }',
        '.dsh-tr-btn { pointer-events: auto; width: 34px; height: 34px; border-radius: 50%;' +
          'border: 1px solid rgba(120, 130, 145, .35); cursor: pointer;' +
          'background: rgba(255, 255, 255, .55); color: #3b4250; display: flex;' +
          'align-items: center; justify-content: center; box-shadow: 0 2px 10px rgba(15, 20, 30, .18);' +
          'backdrop-filter: blur(10px); transition: transform .15s ease, background .15s ease; }',
        'body[data-ds-dark-theme] .dsh-tr-btn { background: rgba(40, 42, 48, .6); color: #e6e8ee;' +
          'border-color: rgba(255, 255, 255, .18); }',
        '.dsh-tr-btn:hover { transform: scale(1.06); }',
        '.dsh-tr-panel { pointer-events: auto; position: absolute; right: 48px; top: 50%;' +
          'transform: translateY(-50%); width: 252px; padding: 14px 16px 12px; border-radius: 14px;' +
          'background: rgba(252, 253, 255, .96); border: 1px solid rgba(120, 130, 145, .28);' +
          'box-shadow: 0 18px 44px rgba(12, 18, 28, .28); color: #22262e; }',
        'body[data-ds-dark-theme] .dsh-tr-panel { background: rgba(32, 34, 40, .97); color: #e8eaf0;' +
          'border-color: rgba(255, 255, 255, .14); }',
        '.dsh-tr-title { font-size: 13px; font-weight: 600; letter-spacing: .01em; }',
        '.dsh-tr-sub { margin-top: 6px; font-size: 11px; line-height: 1.5; opacity: .62; }',
        '.dsh-tr-row { display: flex; align-items: center; gap: 10px; margin-top: 12px; }',
        '.dsh-tr-range { flex: 1; accent-color: #4f7cff; height: 18px; }',
        '.dsh-tr-value { width: 40px; text-align: right; font-variant-numeric: tabular-nums;' +
          'font-size: 12px; opacity: .8; }',
        '.dsh-tr-presets { display: flex; gap: 6px; margin-top: 10px; }',
        '.dsh-tr-preset { flex: 1; padding: 5px 0; font-size: 11px; border-radius: 8px; cursor: pointer;' +
          'border: 1px solid rgba(120, 130, 145, .3); background: transparent; color: inherit; }',
        '.dsh-tr-on { background: #2563eb; border-color: #2563eb; color: #fff; }',
        '.dsh-tr-preset:hover { background: rgba(120, 140, 180, .12); }',
        '.dsh-tr-note { margin-top: 10px; font-size: 10.5px; line-height: 1.45; opacity: .55; }',
      ].join('\n');
    }

    let styleEl = null;
    let currentAlpha = DEFAULT_ALPHA;
    const listeners = new Set();

    function apply(alpha) {
      currentAlpha = clamp(alpha, MIN_ALPHA, MAX_ALPHA);
      if (styleEl) styleEl.textContent = buildCss(currentAlpha);
      writeAlpha(currentAlpha);
      listeners.forEach((fn) => fn(currentAlpha));
    }

    function ensureStyle() {
      if (styleEl && styleEl.isConnected) return;
      styleEl = document.createElement('style');
      styleEl.setAttribute('data-dsh-transparent', '');
      (document.head || document.documentElement).appendChild(styleEl);
      styleEl.textContent = buildCss(currentAlpha);
    }

    function Control() {
      const [open, setOpen] = React.useState(false);
      const [alpha, setAlpha] = React.useState(currentAlpha);

      React.useEffect(() => {
        const fn = (v) => setAlpha(v);
        listeners.add(fn);
        return () => { listeners.delete(fn); };
      }, []);

      const pct = Math.round(alpha * 100);
      const HOST = 'http://127.0.0.1:39124';
      const [material, setMaterial] = React.useState(null);
      const [materialMsg, setMaterialMsg] = React.useState('');
      React.useEffect(() => {
        fetch(HOST + '/status').then((r) => r.json()).then((d) => setMaterial(d.material || 'acrylic')).catch(() => setMaterial(null));
      }, []);
      const chooseMaterial = (m) => {
        if (m === material) return;
        setMaterialMsg('切换中…');
        fetch(HOST + '/material?mode=' + m, { method: 'POST' })
          .then((r) => r.json())
          .then((d) => {
            if (!d.ok) { setMaterialMsg('切换失败：' + (d.error || '未知错误')); return; }
            setMaterial(m);
            setMaterialMsg('切换窗口材质，重启 DSH 后生效。');
          })
          .catch(() => setMaterialMsg('桌面 Host 未响应：端口 39124 不通。'));
      };


      const set = (v) => apply(clamp(v, MIN_ALPHA, MAX_ALPHA));

      return h('div', { className: 'dsh-tr-root' },
        open
          ? h('div', { className: 'dsh-tr-panel', role: 'dialog', 'aria-label': '背景透明度' },
              h('div', { className: 'dsh-tr-title' }, '背景透明度'),
              h('div', { className: 'dsh-tr-sub' }, '数值越低，窗口越透、壁纸越明显。'),
              h('div', { className: 'dsh-tr-row' },
                h('input', {
                  className: 'dsh-tr-range',
                  type: 'range',
                  min: Math.round(MIN_ALPHA * 100),
                  max: Math.round(MAX_ALPHA * 100),
                  step: 1,
                  value: pct,
                  'aria-label': '背景不透明度',
                  onChange: (e) => set(Number(e.target.value) / 100),
                }),
                h('span', { className: 'dsh-tr-value' }, pct + '%'),
              ),
              h('div', { className: 'dsh-tr-presets' },
                [['全透', 0], ['更透', 0.22], ['推荐', 0.34], ['更实', 0.46]].map(([label, v]) =>
                  h('button', {
                    key: label,
                    type: 'button',
                    className: 'dsh-tr-preset',
                    onClick: () => set(v),
                  }, label),
                ),
              ),
              h('div', { className: 'dsh-tr-sub', style: { marginTop: 12 } }, '窗口材质'),
              h('div', { className: 'dsh-tr-presets' },
                [['磨砂', 'acrylic'], ['无磨砂', 'none']].map(([label, m]) =>
                  h('button', {
                    key: m,
                    type: 'button',
                    className: 'dsh-tr-preset' + (material === m ? ' dsh-tr-on' : ''),
                    onClick: () => chooseMaterial(m),
                  }, label),
                ),
              ),
              h('div', { className: 'dsh-tr-note' },
                materialMsg || ('当前：' + (material === 'none' ? '无磨砂（原始壁纸）' : material === 'acrylic' ? '磨砂（亚克力）' : '检测中…'))),
            )
          : null,
        h('button', {
          type: 'button',
          className: 'dsh-tr-btn',
          title: '背景透明度',
          'aria-label': '背景透明度',
          onClick: () => setOpen((v) => !v),
        }, h('span', { style: { fontSize: 16, lineHeight: 1 } }, '◐')),
      );
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        ensureStyle();
        if (ctx && typeof ctx.effect === 'function') {
          ctx.effect(() => {
            ensureStyle();
            return () => {
              if (styleEl) { styleEl.remove(); styleEl = null; }
            };
          });
        }
        if (ctx && ctx.slots) {
          ctx.slots.inject('shell.overlay', () => ctx.slots.register({
            name: 'shell.overlay',
            id: 'dsh-transparent',
            order: 40,
            label: '背景透明度',
          }, Control));
        }
        window.__DSH_TRANSPARENT__ = {
          get: () => currentAlpha,
          set: (v) => apply(Number(v)),
          el: () => styleEl,
        };
      },
    };
  },
});

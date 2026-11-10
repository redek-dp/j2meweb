/*
 * Startup diagnostics for freej2me-web.
 *
 * This is a classic (non-module) script loaded before the CheerpJ loader and
 * before the app modules, so it can catch failures that happen before or while
 * those are loading. On phones there are no developer tools, so a startup
 * failure is shown on screen with the environment and collected log lines,
 * which can be copied and sent to whoever maintains the page.
 *
 * Public API: window.__freej2meDiag.show(title, detail)
 * Add ?diag=1 to the page URL to open the panel manually.
 */
(function () {
    'use strict';

    const MAX_LOGS = 20;

    const logs = [];
    let overlay = null;
    let dismissed = false;

    function describe(value) {
        if (!value) return 'Erro desconhecido';
        if (typeof value === 'string') return value;
        if (value.name || value.message) {
            return (value.name ? value.name + ': ' : '') + (value.message || String(value));
        }
        try {
            return JSON.stringify(value);
        } catch (e) {
            return String(value);
        }
    }

    function stackOf(value) {
        return value && value.stack ? String(value.stack) : '';
    }

    function timestamp() {
        return new Date().toISOString().replace('T', ' ').slice(0, 19);
    }

    function addLog(kind, text, stack) {
        logs.push({ time: timestamp(), kind, text, stack });
        if (logs.length > MAX_LOGS) logs.shift();
    }

    function appStarted() {
        const display = document.getElementById('display');
        return !!(
            display &&
            display.width > 0 &&
            getComputedStyle(display).display !== 'none'
        );
    }

    function envInfo() {
        const info = [];

        function add(label, value) {
            info.push([label, String(value)]);
        }

        function attempt(label, fn) {
            try {
                add(label, fn());
            } catch (e) {
                add(label, 'erro: ' + describe(e));
            }
        }

        add('URL', location.href);
        add('User agent', navigator.userAgent);
        add('Plataforma', navigator.platform || '-');
        add('Idioma', navigator.language || '-');
        add(
            'Tela',
            screen.width + 'x' + screen.height + ' (dpr ' + (window.devicePixelRatio || 1) + ')'
        );
        add('Janela', window.innerWidth + 'x' + window.innerHeight);

        attempt('Online', () => (navigator.onLine ? 'sim' : 'não'));
        attempt('WebAssembly', () =>
            typeof WebAssembly === 'object' && typeof WebAssembly.instantiate === 'function'
                ? 'sim'
                : 'não'
        );
        attempt('CheerpJ', () =>
            typeof window.cheerpjInit === 'function' ? 'carregado' : 'NÃO carregado'
        );
        attempt('Canvas 2D', () => {
            const canvas = document.createElement('canvas');
            return canvas.getContext('2d') ? 'sim' : 'não';
        });
        attempt('AudioContext', () =>
            typeof window.AudioContext === 'function' ? 'sim' : 'não'
        );
        attempt('AudioWorklet', () =>
            window.AudioContext && 'audioWorklet' in AudioContext.prototype ? 'sim' : 'não'
        );
        attempt('localStorage', () => {
            localStorage.setItem('__freej2me_diag_test', '1');
            localStorage.removeItem('__freej2me_diag_test');
            return 'disponível';
        });
        attempt('Cross-origin isolated', () => (window.crossOriginIsolated ? 'sim' : 'não'));
        attempt('Tela do jogo', () => {
            const display = document.getElementById('display');
            if (!display) return 'elemento #display ausente';
            return (
                display.width +
                'x' +
                display.height +
                ', visível: ' +
                (getComputedStyle(display).display !== 'none') +
                ', zoom: ' +
                (display.style.zoom || '1')
            );
        });

        return info;
    }

    function reportText(title, detail) {
        const lines = [title];
        if (detail) lines.push('', describe(detail));

        lines.push('', '--- Ambiente ---');
        for (const [label, value] of envInfo()) {
            lines.push(label + ': ' + value);
        }

        if (logs.length) {
            lines.push('', '--- Registros ---');
            for (const entry of logs) {
                lines.push(
                    '[' + entry.time + '] ' + entry.kind + ': ' + entry.text
                );
                if (entry.stack) lines.push(entry.stack);
            }
        }

        return lines.join('\n');
    }

    async function copyText(text) {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch (e) {
            // clipboard API needs a secure context, fall back to a selection
        }

        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.cssText = 'position:fixed;top:0;left:0;opacity:0;';
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();

        let copied = false;
        try {
            copied = document.execCommand('copy');
        } catch (e) {
            copied = false;
        }

        textarea.remove();
        return copied;
    }

    function button(label) {
        const el = document.createElement('button');
        el.type = 'button';
        el.textContent = label;
        el.style.cssText = [
            'min-height:44px',
            'padding:10px 14px',
            'border:1px solid #555',
            'border-radius:8px',
            'background:#3a3a3a',
            'color:#eee',
            'font:inherit',
            'cursor:pointer',
        ].join(';');
        return el;
    }

    function buildOverlay() {
        if (overlay) return overlay;

        const wrap = document.createElement('div');
        wrap.id = 'diagnostic-screen';
        wrap.setAttribute('role', 'dialog');
        wrap.setAttribute('aria-modal', 'true');
        wrap.style.cssText = [
            'position:fixed',
            'inset:0',
            'z-index:2147483647',
            'background:#141414',
            'color:#eee',
            'font:14px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif',
            'padding:16px',
            'overflow:auto',
            '-webkit-overflow-scrolling:touch',
            'box-sizing:border-box',
        ].join(';');

        const titleEl = document.createElement('h1');
        titleEl.style.cssText = 'font-size:18px;margin:0 0 6px;color:#ff8a80;';
        wrap.appendChild(titleEl);

        const detailEl = document.createElement('p');
        detailEl.style.cssText =
            'margin:0 0 12px;white-space:pre-wrap;word-break:break-word;';
        wrap.appendChild(detailEl);

        const actions = document.createElement('div');
        actions.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;';

        const copyBtn = button('Copiar diagnóstico');
        const reloadBtn = button('Recarregar');
        const closeBtn = button('Fechar');
        actions.append(copyBtn, reloadBtn, closeBtn);
        wrap.appendChild(actions);

        const report = document.createElement('pre');
        report.style.cssText = [
            'margin:0',
            'padding:12px',
            'background:#0a0a0a',
            'border:1px solid #333',
            'border-radius:8px',
            'color:#ddd',
            'font:12px/1.5 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace',
            'white-space:pre-wrap',
            'word-break:break-word',
            'user-select:text',
            '-webkit-user-select:text',
        ].join(';');
        wrap.appendChild(report);

        const hint = document.createElement('p');
        hint.textContent =
            'No celular, copie este texto e envie para quem mantém o site. Para abrir esta tela sem erro, use ?diag=1 no endereço.';
        hint.style.cssText = 'margin:12px 0 0;color:#aaa;font-size:12px;';
        wrap.appendChild(hint);

        copyBtn.addEventListener('click', async () => {
            const ok = await copyText(report.textContent);
            copyBtn.textContent = ok ? 'Copiado!' : 'Selecione e copie';
            setTimeout(() => {
                copyBtn.textContent = 'Copiar diagnóstico';
            }, 2000);
        });

        reloadBtn.addEventListener('click', () => location.reload());

        closeBtn.addEventListener('click', () => {
            dismissed = true;
            wrap.style.display = 'none';
        });

        document.body.appendChild(wrap);
        overlay = { wrap, titleEl, detailEl, report };
        return overlay;
    }

    function show(title, detail) {
        if (!document.body) {
            document.addEventListener(
                'DOMContentLoaded',
                () => show(title, detail),
                { once: true }
            );
            return;
        }

        dismissed = false;

        const ui = buildOverlay();
        title = title || 'Erro ao iniciar';
        ui.titleEl.textContent = title;
        ui.detailEl.textContent = detail ? describe(detail) : '';
        ui.report.textContent = reportText(title, detail);
        ui.wrap.style.display = 'block';
    }

    function autoShow(title, detail) {
        // never cover a game that is already running
        if (dismissed || appStarted()) return;
        show(title, detail);
    }

    window.__freej2meDiag = { show, addLog };

    // Uncaught exceptions (including errors thrown while modules load).
    window.addEventListener(
        'error',
        (event) => {
            if (event.error) {
                addLog('erro', describe(event.error), stackOf(event.error));
                autoShow('Erro ao iniciar', event.error);
            } else if (event.target && (event.target.src || event.target.href)) {
                addLog(
                    'recurso',
                    'Falhou ao carregar: ' + (event.target.src || event.target.href)
                );
            }
        },
        true
    );

    window.addEventListener('unhandledrejection', (event) => {
        const reason = event.reason;
        addLog('promise', describe(reason), stackOf(reason));
        autoShow('Erro ao iniciar', reason);
    });

    // CheerpJ reports some failures only through console.error.
    const originalConsoleError = console.error;
    console.error = function () {
        const args = Array.prototype.slice.call(arguments);
        addLog('console', args.map(describe).join(' '));
        return originalConsoleError.apply(this, args);
    };

    // Watchdog: if the game canvas never shows up, offer the report instead of
    // leaving the page on "Loading..." forever (common on slow phones).
    const thisScript = document.currentScript;
    if (thisScript && thisScript.hasAttribute('data-watch-startup')) {
        const timeout = Number(thisScript.dataset.watchTimeout) || 60000;
        const startedAt = Date.now();

        const timer = setInterval(() => {
            if (dismissed || appStarted()) {
                clearInterval(timer);
                return;
            }

            if (Date.now() - startedAt >= timeout) {
                clearInterval(timer);
                show(
                    'O jogo não abriu',
                    'A tela do jogo não apareceu em ' +
                        Math.round(timeout / 1000) +
                        ' s. Pode ser conexão lenta, falta de suporte a WebAssembly ou um erro no navegador.'
                );
            }
        }, 1000);
    }

    // Manual access: ?diag=1
    if (new URLSearchParams(location.search).has('diag')) {
        document.addEventListener(
            'DOMContentLoaded',
            () => show('Diagnóstico', 'Tela aberta manualmente com ?diag=1.'),
            { once: true }
        );
    }
})();

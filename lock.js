// =====================================================================
//  PIN-ZÁR (látszatvédelem) – a monitor és a dashboard közös zárja
//  A PIN nincs a kódban, csak az „ujjlenyomata”. Egy eszközön egyszer kell
//  megadni (a böngésző megjegyzi). PIN-csere: a böngésző konzoljában
//  kaisaPinHash('1234') → az eredményt írd a PIN_HASH helyére (ekkor
//  mindenkitől újra kéri).
// =====================================================================
(function () {
    var PIN_HASH = 'eu4th3';
    var KEY = 'kaisa-unlock';
    var LEN = 4;

    function hash(s) {
        var h = 2166136261; s = 'kaisa-sauna:' + s;
        for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
        return h.toString(36);
    }
    window.kaisaPinHash = hash;

    try { if (localStorage.getItem(KEY) === PIN_HASH) return; } catch (e) {}

    var root = document.documentElement;
    root.classList.add('pin-locked');
    var st = document.createElement('style');
    st.textContent =
        'html.pin-locked body > *:not(#pinLock) { visibility: hidden !important; }' +
        'html.pin-locked, html.pin-locked body { overflow: hidden !important; }' +
        '#pinLock { position: fixed; inset: 0; z-index: 10000; display: flex; align-items: center; justify-content: center; padding: 12px;' +
        '  background: var(--bg, #f0f0f0); transition: opacity .25s ease; -webkit-user-select: none; user-select: none; }' +
        '#pinLock.out { opacity: 0; }' +
        '#pinLock .pl-box { width: min(320px, 100%); background: var(--card, #fff); border: 1px solid var(--border, #ddd); border-radius: 12px;' +
        '  box-shadow: 0 2px 8px rgba(0,0,0,0.05); padding: 22px 18px 18px; text-align: center; color: var(--text, #333); }' +
        '#pinLock .pl-logo { display: block; height: 52px; width: auto; margin: 0 auto; }' +
        '#pinLock .pl-logo.dk, [data-theme="dark"] #pinLock .pl-logo.lt { display: none; }' +
        '[data-theme="dark"] #pinLock .pl-logo.dk { display: block; }' +
        '#pinLock .pl-title { font-weight: 700; font-size: 16px; margin: 6px 0 2px; }' +
        '#pinLock .pl-msg { font-size: 12px; color: var(--text-dim, #666); min-height: 16px; }' +
        '#pinLock .pl-msg.err { color: var(--header-red, #d32f2f); font-weight: 700; }' +
        '#pinLock .pl-dots { display: flex; justify-content: center; gap: 14px; margin: 16px 0 18px; }' +
        '#pinLock .pl-dots i { width: 14px; height: 14px; border-radius: 50%; border: 2px solid var(--border, #ddd); transition: background .12s, border-color .12s; }' +
        '#pinLock .pl-dots i.on { background: var(--header-red, #d32f2f); border-color: var(--header-red, #d32f2f); }' +
        '#pinLock .pl-dots.err i { border-color: var(--header-red, #d32f2f); }' +
        '#pinLock .pl-dots.err { animation: plShake .35s ease; }' +
        '#pinLock .pl-dots.ok i { background: #2e7d32; border-color: #2e7d32; }' +
        '@keyframes plShake { 0%,100% { transform: none; } 20%,60% { transform: translateX(-8px); } 40%,80% { transform: translateX(8px); } }' +
        '#pinLock .pl-pad { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }' +
        '#pinLock .pl-pad button { height: 56px; border: 1px solid var(--border, #ddd); border-radius: 8px; background: var(--card, #fff);' +
        '  color: var(--text, #333); font-size: 22px; font-weight: 700; cursor: pointer; padding: 0; touch-action: manipulation;' +
        '  font-family: inherit; transition: transform .08s, filter .08s, background .15s; }' +
        '[data-theme="dark"] #pinLock .pl-pad button { background: #252525; }' +
        '#pinLock .pl-pad button.fn { font-size: 18px; color: var(--text-dim, #666); }' +
        '#pinLock .pl-pad button:active, #pinLock .pl-pad button.hit { transform: scale(0.95); filter: brightness(0.8); }' +
        '@media (hover: hover) { #pinLock .pl-pad button:hover { border-color: var(--header-red, #d32f2f); } }' +
        '#pinLock .pl-pad .sp { visibility: hidden; }' +
        '';
    document.head.appendChild(st);

    var code = '', box, dots, msg, errTimer = null;

    function paint() {
        for (var i = 0; i < LEN; i++) dots.children[i].classList.toggle('on', i < code.length);
    }
    function press(d) {
        if (!box || box.classList.contains('out')) return;
        if (code.length >= LEN) return;
        code += d;
        dots.classList.remove('err');
        paint();
        if (code.length === LEN) check();
    }
    function back() { code = code.slice(0, -1); paint(); }
    function check() {
        if (hash(code) === PIN_HASH) {
            try { localStorage.setItem(KEY, PIN_HASH); } catch (e) {}
            dots.classList.add('ok');
            msg.className = 'pl-msg'; msg.textContent = 'Jó szaunázást! 🔥';
            setTimeout(function () {
                box.classList.add('out');
                setTimeout(function () {
                    window.removeEventListener('keydown', onKey, true);
                    root.classList.remove('pin-locked');
                    box.remove();
                    window.dispatchEvent(new Event('resize'));   // a grafikonok igazodjanak
                }, 260);
            }, 200);
            return;
        }
        // Rossz kód: azonnal üres, rögtön újra lehet ütni
        code = '';
        paint();
        dots.classList.remove('err'); void dots.offsetWidth; dots.classList.add('err');
        msg.className = 'pl-msg err'; msg.textContent = 'Nem stimmel, próbáld újra';
        if (navigator.vibrate) try { navigator.vibrate(120); } catch (e) {}
        clearTimeout(errTimer);
        errTimer = setTimeout(function () { dots.classList.remove('err'); }, 600);
    }
    function flash(key) {
        var b = box && box.querySelector('[data-k="' + key + '"]');
        if (!b) return;
        b.classList.add('hit');
        setTimeout(function () { b.classList.remove('hit'); }, 120);
    }
    // Billentyűzet (PC): számok (a numerikus billentyűzeté is), Backspace, Esc.
    // Zárt állapotban minden billentyűt elnyel, hogy az oldal (pl. napléptetés) ne reagáljon.
    function onKey(e) {
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        if (/^[0-9]$/.test(e.key)) { flash(e.key); press(e.key); }
        else if (e.key === 'Backspace') { flash('back'); back(); }
        else if (e.key === 'Escape') { code = ''; paint(); }
        else if (e.key === 'Tab') return;
        e.preventDefault();
        e.stopPropagation();
    }

    function build() {
        box = document.createElement('div');
        box.id = 'pinLock';
        box.setAttribute('role', 'dialog');
        box.setAttribute('aria-label', 'PIN-kód');
        var keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];
        var pad = keys.map(function (k) { return '<button type="button" data-k="' + k + '">' + k + '</button>'; }).join('') +
            '<button type="button" class="sp" tabindex="-1" aria-hidden="true"></button>' +
            '<button type="button" data-k="0">0</button>' +
            '<button type="button" class="fn" data-k="back" aria-label="Törlés"><i class="fas fa-delete-left"></i></button>';
        box.innerHTML =
            '<div class="pl-box">' +
            // a szauna logója, a téma szerint: világosban heat.png, sötétben heat-dark.png
            '<img class="pl-logo lt" src="heat.png" alt="">' +
            '<img class="pl-logo dk" src="heat-dark.png" alt="">' +
            '<div class="pl-title">Kaisa Sauna</div>' +
            '<div class="pl-msg" id="plMsg">Add meg a PIN-kódot</div>' +
            '<div class="pl-dots">' + new Array(LEN + 1).join('<i></i>') + '</div>' +
            '<div class="pl-pad">' + pad + '</div>' +
            '</div>';
        document.body.appendChild(box);
        dots = box.querySelector('.pl-dots');
        msg = box.querySelector('.pl-msg');
        box.querySelector('.pl-pad').addEventListener('click', function (e) {
            var b = e.target.closest('button[data-k]');
            if (!b) return;
            b.blur();
            if (b.dataset.k === 'back') back(); else press(b.dataset.k);
        });
    }

    window.addEventListener('keydown', onKey, true);
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build); else build();
})();

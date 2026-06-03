/* ============================================
   ShopHub — ShopBot AI Assistant
   Calls /api/chat (Vercel serverless proxy)
   Users just open and chat. No key screens.
   ============================================ */

(function () {
    'use strict';

    const MAX_HISTORY    = 20; // 10 exchanges
    const QUICK_CHIPS    = [
        "What's on sale?",
        "Top rated products",
        "What's in my cart?",
        "Electronics under $200",
        "Best for home office",
        "New arrivals"
    ];

    /* ---- State ---- */
    let history   = [];
    let isOpen    = false;
    let streaming = false;
    let greeted   = false;

    /* ================================================
       BUILD WIDGET
    ================================================ */
    function build() {
        const root = document.createElement('div');
        root.id = 'shopbot-root';
        root.innerHTML = `
<button id="shopbot-fab" aria-label="Open ShopBot" title="Chat with ShopBot">
    <svg id="sb-icon-chat" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
    <svg id="sb-icon-close" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="display:none"><path d="M18 6 6 18M6 6l12 12"/></svg>
    <span class="shopbot-pulse-ring"></span>
</button>

<div id="shopbot-panel" role="dialog" aria-label="ShopBot" aria-hidden="true">

    <div id="shopbot-header">
        <div class="shopbot-hdr-left">
            <div class="shopbot-avatar">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            </div>
            <div>
                <div class="shopbot-hdr-name">ShopBot</div>
                <div class="shopbot-hdr-sub">
                    <span class="shopbot-online-dot"></span>AI Shopping Assistant
                </div>
            </div>
        </div>
        <button id="sb-clear" title="New chat" aria-label="Start new chat">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.59"/></svg>
        </button>
    </div>

    <div id="sb-messages" role="log" aria-live="polite"></div>

    <div id="sb-footer">
        <div id="sb-chips"></div>
        <div id="sb-input-row">
            <input
                id="sb-input"
                type="text"
                placeholder="Ask me anything…"
                autocomplete="off"
                spellcheck="false"
                maxlength="500"
                aria-label="Message ShopBot"
            />
            <button id="sb-send" aria-label="Send">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
            </button>
        </div>
    </div>

</div>`;
        document.body.appendChild(root);
    }

    /* ================================================
       GREET
    ================================================ */
    function greet() {
        if (greeted) return;
        greeted = true;

        const products  = getProducts();
        const page      = document.body.dataset.page || 'home';
        const saleCount = products.filter(p => p.badge === 'Sale').length;

        let msg = '👋 Hey! I\'m **ShopBot**, your AI shopping assistant.';

        if (page === 'checkout') {
            msg += ' Need help before you place your order? Just ask!';
        } else if (page === 'product') {
            msg += ' Got questions about this product or want to compare alternatives? I\'m here!';
        } else {
            msg += ` We have **${products.length} premium products** across Electronics, Fashion, Accessories & Home.`;
            if (saleCount > 0) msg += ` **${saleCount} items are on sale right now!**`;
            msg += ' What are you shopping for?';
        }

        addMessage('assistant', msg);
    }

    /* ================================================
       QUICK CHIPS
    ================================================ */
    function renderChips() {
        const c = document.getElementById('sb-chips');
        if (!c) return;
        if (history.length > 0) { c.innerHTML = ''; return; }
        c.innerHTML = QUICK_CHIPS.slice(0, 4)
            .map(t => `<button class="shopbot-chip">${esc(t)}</button>`)
            .join('');
        c.querySelectorAll('.shopbot-chip').forEach(b =>
            b.addEventListener('click', () => send(b.textContent))
        );
    }

    /* ================================================
       MESSAGES
    ================================================ */
    function addMessage(role, text, placeholder) {
        const log = document.getElementById('sb-messages');
        if (!log) return null;

        const wrap   = document.createElement('div');
        wrap.className = `shopbot-msg shopbot-msg-${role}`;
        if (placeholder) wrap.id = 'sb-stream';

        const bubble = document.createElement('div');
        bubble.className = 'shopbot-bubble';
        bubble.innerHTML = md(text);
        wrap.appendChild(bubble);

        if (role === 'assistant') {
            const ts = document.createElement('div');
            ts.className = 'shopbot-ts';
            ts.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            wrap.appendChild(ts);
        }

        log.appendChild(wrap);
        log.scrollTop = log.scrollHeight;
        return wrap;
    }

    function updateStream(text) {
        const el  = document.getElementById('sb-stream');
        const bub = el && el.querySelector('.shopbot-bubble');
        if (bub) bub.innerHTML = md(text);
        const log = document.getElementById('sb-messages');
        if (log) log.scrollTop = log.scrollHeight;
    }

    function finalizeStream() {
        const el = document.getElementById('sb-stream');
        if (el) el.removeAttribute('id');
    }

    function showDots() {
        const log = document.getElementById('sb-messages');
        if (!log || document.getElementById('sb-dots')) return;
        const el = document.createElement('div');
        el.id        = 'sb-dots';
        el.className = 'shopbot-msg shopbot-msg-assistant';
        el.innerHTML = `<div class="shopbot-bubble shopbot-typing-bubble"><span></span><span></span><span></span></div>`;
        log.appendChild(el);
        log.scrollTop = log.scrollHeight;
    }

    function hideDots() {
        document.getElementById('sb-dots')?.remove();
    }

    /* ================================================
       SEND MESSAGE → /api/chat
    ================================================ */
    async function send(text) {
        text = (text || '').trim();
        if (!text || streaming) return;

        const input   = document.getElementById('sb-input');
        const sendBtn = document.getElementById('sb-send');
        if (input) input.value = '';

        addMessage('user', text);
        history.push({ role: 'user', content: text });
        renderChips();

        // Keep history bounded
        if (history.length > MAX_HISTORY) history = history.slice(-MAX_HISTORY);

        streaming = true;
        if (sendBtn) sendBtn.disabled = true;
        if (input)   input.disabled   = true;
        showDots();

        try {
            const res = await fetch('/api/chat', {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({
                    messages: history,
                    context: {
                        page:     document.body.dataset.page || 'home',
                        cart:     getCartSummary(),
                        products: getProducts(),
                    },
                }),
            });

            hideDots();

            if (!res.ok) {
                const errMsg = res.status === 429
                    ? '⚠️ Too many messages — please wait a moment and try again.'
                    : res.status === 503
                    ? '⚠️ ShopBot is setting up — check back in a moment.'
                    : '⚠️ Something went wrong. Please try again.';
                addMessage('assistant', errMsg);
                history.pop();
            } else {
                /* ---- Stream the SSE response ---- */
                const reader  = res.body.getReader();
                const decoder = new TextDecoder();
                let fullText  = '';
                let msgEl     = null;

                outer: while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    const lines = decoder.decode(value, { stream: true }).split('\n');
                    for (const line of lines) {
                        if (!line.startsWith('data: ')) continue;
                        const raw = line.slice(6).trim();
                        if (raw === '[DONE]') break outer;
                        try {
                            // Groq uses OpenAI-compatible SSE format
                            const delta = JSON.parse(raw)?.choices?.[0]?.delta?.content;
                            if (delta) {
                                fullText += delta;
                                if (!msgEl) msgEl = addMessage('assistant', fullText, true);
                                else        updateStream(fullText);
                            }
                        } catch { /* skip malformed chunks */ }
                    }
                }

                finalizeStream();
                if (fullText) history.push({ role: 'assistant', content: fullText });
            }

        } catch {
            hideDots();
            addMessage('assistant', '⚠️ Network error — check your connection and try again.');
            history.pop();
        }

        streaming = false;
        if (sendBtn) sendBtn.disabled = false;
        if (input)   { input.disabled = false; input.focus(); }
    }

    /* ================================================
       TOGGLE PANEL
    ================================================ */
    function toggle() {
        isOpen = !isOpen;

        const panel = document.getElementById('shopbot-panel');
        const ico1  = document.getElementById('sb-icon-chat');
        const ico2  = document.getElementById('sb-icon-close');
        const pulse = document.querySelector('.shopbot-pulse-ring');

        panel.classList.toggle('open', isOpen);
        panel.setAttribute('aria-hidden', String(!isOpen));
        if (ico1)  ico1.style.display  = isOpen ? 'none'  : 'block';
        if (ico2)  ico2.style.display  = isOpen ? 'block' : 'none';
        if (pulse) pulse.remove();

        if (isOpen) {
            setTimeout(greet, 200);
            setTimeout(() => document.getElementById('sb-input')?.focus(), 320);
        }
    }

    /* ================================================
       STORE HELPERS (reads from app.js state)
    ================================================ */
    function getProducts() {
        return window.ShopHub?.getProducts() || [];
    }

    function getCartSummary() {
        const cart = window.ShopHub?.getCart();
        if (!cart || cart.length === 0) return 'Empty';
        return cart.map(i => {
            const name  = i.product?.name  ?? `#${i.id}`;
            const price = i.product?.price != null ? `$${i.product.price.toFixed(2)}` : '';
            return `${name} ×${i.quantity} @ ${price}`;
        }).join('; ');
    }

    /* ================================================
       UTILS
    ================================================ */
    function md(text) {
        return text
            .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
            .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.+?)\*/g,     '<em>$1</em>')
            .replace(/`([^`]+)`/g,     '<code>$1</code>')
            .replace(/\n/g, '<br>');
    }

    function esc(s) {
        return String(s).replace(/[&<>"']/g, c =>
            ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])
        );
    }

    /* ================================================
       BIND EVENTS
    ================================================ */
    function bindEvents() {
        document.getElementById('shopbot-fab')
            .addEventListener('click', toggle);

        document.addEventListener('keydown', e => {
            if (e.key === 'Escape' && isOpen) toggle();
        });

        document.getElementById('sb-send')
            .addEventListener('click', () => send(document.getElementById('sb-input')?.value));

        document.getElementById('sb-input')
            .addEventListener('keydown', e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    send(e.target.value);
                }
            });

        document.getElementById('sb-clear')
            .addEventListener('click', () => {
                history = [];
                greeted = false;
                const log = document.getElementById('sb-messages');
                if (log) log.innerHTML = '';
                renderChips();
                setTimeout(greet, 100);
            });
    }

    /* ================================================
       INIT
    ================================================ */
    function init() {
        build();
        bindEvents();
        renderChips();
        window.ShopBot = { send };
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();

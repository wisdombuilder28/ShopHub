/* ============================================
   ShopHub — ShopBot AI Assistant
   Calls /api/chat (Vercel Node.js proxy)
   Secure: textContent for user input,
   escaped markdown for AI responses.
   ============================================ */

(function () {
    'use strict';

    const MAX_HISTORY = 20;
    const QUICK_CHIPS = [
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
       SECURITY UTILS
    ================================================ */
    function escapeHTML(str) {
        return String(str)
            .replace(/&/g,  '&amp;')
            .replace(/</g,  '&lt;')
            .replace(/>/g,  '&gt;')
            .replace(/"/g,  '&quot;')
            .replace(/'/g,  '&#39;');
    }

    /* Safe markdown — escape ALL HTML first, then apply only
       our own known-safe tags. AI responses only, never user input. */
    function renderMarkdown(text) {
        return escapeHTML(text)
            .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.+?)\*/g,     '<em>$1</em>')
            .replace(/`([^`]+)`/g,     '<code>$1</code>')
            .replace(/\n/g,            '<br>');
    }

    /* ================================================
       BUILD WIDGET — createElement only, no innerHTML
    ================================================ */
    function build() {
        const fab = document.createElement('button');
        fab.id = 'shopbot-fab';
        fab.setAttribute('aria-label', 'Open ShopBot');
        fab.title = 'Chat with ShopBot';

        const iconChat = createSVG('M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z');
        iconChat.id = 'sb-icon-chat';
        const iconClose = createSVG('M18 6 6 18M6 6l12 12');
        iconClose.id = 'sb-icon-close';
        iconClose.style.display = 'none';
        const pulse = document.createElement('span');
        pulse.className = 'shopbot-pulse-ring';
        fab.append(iconChat, iconClose, pulse);

        const panel = document.createElement('div');
        panel.id = 'shopbot-panel';
        panel.setAttribute('role', 'dialog');
        panel.setAttribute('aria-label', 'ShopBot');
        panel.setAttribute('aria-hidden', 'true');

        /* Header */
        const header = document.createElement('div');
        header.id = 'shopbot-header';
        const hdrLeft = document.createElement('div');
        hdrLeft.className = 'shopbot-hdr-left';
        const avatar = document.createElement('div');
        avatar.className = 'shopbot-avatar';
        avatar.appendChild(createSVG('M3 11h18a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2z M7 11V7a5 5 0 0 1 10 0v4', 18));
        const hdrText = document.createElement('div');
        const hdrName = document.createElement('div');
        hdrName.className = 'shopbot-hdr-name';
        hdrName.textContent = 'ShopBot';
        const hdrSub = document.createElement('div');
        hdrSub.className = 'shopbot-hdr-sub';
        const dot = document.createElement('span');
        dot.className = 'shopbot-online-dot';
        hdrSub.append(dot, document.createTextNode('AI Shopping Assistant'));
        hdrText.append(hdrName, hdrSub);
        hdrLeft.append(avatar, hdrText);
        const clearBtn = document.createElement('button');
        clearBtn.id = 'sb-clear';
        clearBtn.title = 'New chat';
        clearBtn.setAttribute('aria-label', 'Start new chat');
        clearBtn.appendChild(createSVG('M1 4v6h6 M3.51 15a9 9 0 1 0 .49-3.59', 15));
        header.append(hdrLeft, clearBtn);

        /* Messages */
        const messages = document.createElement('div');
        messages.id = 'sb-messages';
        messages.setAttribute('role', 'log');
        messages.setAttribute('aria-live', 'polite');

        /* Footer */
        const footer = document.createElement('div');
        footer.id = 'sb-footer';
        const chips = document.createElement('div');
        chips.id = 'sb-chips';
        const inputRow = document.createElement('div');
        inputRow.id = 'sb-input-row';
        const input = document.createElement('input');
        input.id = 'sb-input';
        input.type = 'text';
        input.placeholder = 'Ask me anything…';
        input.setAttribute('autocomplete', 'off');
        input.setAttribute('spellcheck', 'false');
        input.maxLength = 500;
        input.setAttribute('aria-label', 'Message ShopBot');
        const sendBtn = document.createElement('button');
        sendBtn.id = 'sb-send';
        sendBtn.setAttribute('aria-label', 'Send');
        sendBtn.appendChild(createSVG('M22 2L11 13 M22 2L15 22l-4-9-9-4 22-7', 16));
        inputRow.append(input, sendBtn);
        footer.append(chips, inputRow);

        panel.append(header, messages, footer);

        const root = document.createElement('div');
        root.id = 'shopbot-root';
        root.append(fab, panel);
        document.body.appendChild(root);
    }

    function createSVG(pathD, size = 22) {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('width', size);
        svg.setAttribute('height', size);
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('fill', 'none');
        svg.setAttribute('stroke', 'currentColor');
        svg.setAttribute('stroke-width', '2');
        svg.setAttribute('stroke-linecap', 'round');
        svg.setAttribute('stroke-linejoin', 'round');
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', pathD);
        svg.appendChild(path);
        return svg;
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
            msg += ' Questions about this product or want alternatives? I\'m here!';
        } else {
            msg += ` We have **${products.length} premium products** across Electronics, Fashion, Accessories & Home.`;
            if (saleCount > 0) msg += ` **${saleCount} items on sale right now!**`;
            msg += ' What are you shopping for?';
        }
        addMessage('assistant', msg);
    }

    /* ================================================
       QUICK CHIPS — createElement, no innerHTML
    ================================================ */
    function renderChips() {
        const container = document.getElementById('sb-chips');
        if (!container) return;
        while (container.firstChild) container.removeChild(container.firstChild);
        if (history.length > 0) return;
        QUICK_CHIPS.slice(0, 4).forEach(text => {
            const btn = document.createElement('button');
            btn.className = 'shopbot-chip';
            btn.textContent = text;
            btn.addEventListener('click', () => send(text));
            container.appendChild(btn);
        });
    }

    /* ================================================
       MESSAGES — secure rendering
    ================================================ */
    function addMessage(role, text) {
        const log = document.getElementById('sb-messages');
        if (!log) return;

        const wrap = document.createElement('div');
        wrap.className = `shopbot-msg shopbot-msg-${role}`;

        const bubble = document.createElement('div');
        bubble.className = 'shopbot-bubble';

        if (role === 'user') {
            // ✅ User input: textContent only — zero XSS risk
            bubble.textContent = text;
        } else {
            // ✅ AI response: escape ALL HTML first, then safe markdown only
            bubble.innerHTML = renderMarkdown(text);
        }

        wrap.appendChild(bubble);

        if (role === 'assistant') {
            const ts = document.createElement('div');
            ts.className = 'shopbot-ts';
            ts.textContent = new Date().toLocaleTimeString([], {
                hour: '2-digit', minute: '2-digit'
            });
            wrap.appendChild(ts);
        }

        log.appendChild(wrap);
        log.scrollTop = log.scrollHeight;
    }

    function showDots() {
        const log = document.getElementById('sb-messages');
        if (!log || document.getElementById('sb-dots')) return;
        const wrap = document.createElement('div');
        wrap.id = 'sb-dots';
        wrap.className = 'shopbot-msg shopbot-msg-assistant';
        const bubble = document.createElement('div');
        bubble.className = 'shopbot-bubble shopbot-typing-bubble';
        for (let i = 0; i < 3; i++) bubble.appendChild(document.createElement('span'));
        wrap.appendChild(bubble);
        log.appendChild(wrap);
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
                    ? '⚠️ Too many messages — wait a moment and try again.'
                    : res.status === 503
                    ? '⚠️ ShopBot is not configured yet.'
                    : '⚠️ Something went wrong. Please try again.';
                addMessage('assistant', errMsg);
                history.pop();
            } else {
                const data  = await res.json();
                const reply = data.reply;
                if (reply) {
                    addMessage('assistant', reply);
                    history.push({ role: 'assistant', content: reply });
                } else {
                    addMessage('assistant', '⚠️ No response received. Please try again.');
                    history.pop();
                }
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
       STORE STATE HELPERS
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
       BIND EVENTS
    ================================================ */
    function bindEvents() {
        document.getElementById('shopbot-fab')
            .addEventListener('click', toggle);

        document.addEventListener('keydown', e => {
            if (e.key === 'Escape' && isOpen) toggle();
        });

        document.getElementById('sb-send')
            .addEventListener('click', () =>
                send(document.getElementById('sb-input')?.value)
            );

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
                if (log) while (log.firstChild) log.removeChild(log.firstChild);
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

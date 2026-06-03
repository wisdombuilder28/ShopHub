/* ================================================
   ShopHub — Secure Groq API Proxy
   Vercel Edge Function

   The GROQ_API_KEY lives only here (Vercel env var).
   The frontend never sees it. Users just chat.
   ================================================ */

export const config = { runtime: 'edge' };

const SYSTEM_PROMPT = `You are ShopBot, the friendly AI shopping assistant for ShopHub — a premium online store.

STORE POLICIES:
- 30-day hassle-free returns on all items
- Free standard shipping on orders over $50
- Standard delivery: 5-7 business days | Express: 2-3 days
- Accepts Visa, Mastercard, Amex, PayPal
- Secure SSL checkout

RESPONSE GUIDELINES:
- Be warm, helpful, and concise — 1-3 sentences unless more detail is needed
- Always mention specific product names and prices when making recommendations
- Highlight Sale badges, star ratings, and low/out-of-stock warnings when relevant
- If a product is out of stock, suggest a similar in-stock alternative
- Never invent products or policies not listed in the catalog below`;

export default async function handler(req) {
    /* ---- CORS preflight ---- */
    if (req.method === 'OPTIONS') {
        return new Response(null, {
            status: 204,
            headers: {
                'Access-Control-Allow-Origin':  '*',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
            },
        });
    }

    if (req.method !== 'POST') {
        return new Response('Method not allowed', { status: 405 });
    }

    /* ---- Check API key is configured ---- */
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
        console.error('[ShopBot] GROQ_API_KEY environment variable is not set');
        return new Response(
            JSON.stringify({ error: 'ShopBot is not configured yet.' }),
            { status: 503, headers: { 'Content-Type': 'application/json' } }
        );
    }

    /* ---- Parse request body ---- */
    let body;
    try {
        body = await req.json();
    } catch {
        return new Response('Invalid JSON', { status: 400 });
    }

    const { messages, context } = body;
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
        return new Response('Invalid messages', { status: 400 });
    }

    /* ---- Build system prompt with live store context ---- */
    const pageNames = {
        home:     'Shop (product listing)',
        product:  'Product detail page',
        checkout: 'Checkout page',
    };

    const fullSystemPrompt = `${SYSTEM_PROMPT}

CURRENT PAGE: ${pageNames[context?.page] || context?.page || 'Shop'}
CUSTOMER CART: ${context?.cart || 'Empty'}

PRODUCT CATALOG (${(context?.products || []).length} products):
${JSON.stringify(context?.products || [], null, 2)}`;

    /* ---- Call Groq API with streaming ---- */
    try {
        const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type':  'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model:       'llama-3.3-70b-versatile',
                max_tokens:  600,
                temperature: 0.7,
                stream:      true,
                messages: [
                    { role: 'system', content: fullSystemPrompt },
                    ...messages.slice(-20), // last 10 exchanges max
                ],
            }),
        });

        if (!groqRes.ok) {
            const errText = await groqRes.text();
            console.error('[ShopBot] Groq error:', groqRes.status, errText);

            const status = groqRes.status === 429 ? 429 : 502;
            return new Response(
                JSON.stringify({ error: `API error ${groqRes.status}` }),
                { status, headers: { 'Content-Type': 'application/json' } }
            );
        }

        /* ---- Stream Groq's SSE response directly to browser ---- */
        return new Response(groqRes.body, {
            status: 200,
            headers: {
                'Content-Type':      'text/event-stream',
                'Cache-Control':     'no-cache, no-transform',
                'X-Accel-Buffering': 'no',
            },
        });

    } catch (err) {
        console.error('[ShopBot] Handler error:', err);
        return new Response(
            JSON.stringify({ error: 'Internal server error' }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
    }
}

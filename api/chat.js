/* ================================================
   ShopHub — Groq API Proxy
   Standard Node.js Vercel Serverless Function
   ================================================ */

const SYSTEM_PROMPT = `You are ShopBot, the friendly AI shopping assistant for ShopHub — a premium online store.

STORE POLICIES:
- 30-day hassle-free returns on all items
- Free standard shipping on orders over $50
- Standard delivery: 5-7 business days | Express: 2-3 days
- Accepts Visa, Mastercard, Amex, PayPal
- Secure SSL checkout

RESPONSE GUIDELINES:
- Be warm, helpful and concise — 1-3 sentences unless more detail is needed
- Always mention specific product names and prices when recommending
- Highlight Sale badges, ratings and stock warnings when relevant
- If a product is out of stock suggest a similar in-stock alternative
- Never invent products or policies not listed in the catalog`;

export default async function handler(req, res) {
    /* ---- CORS headers ---- */
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    /* ---- Check API key ---- */
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
        console.error('[ShopBot] GROQ_API_KEY is not set');
        return res.status(503).json({ error: 'ShopBot is not configured yet.' });
    }

    /* ---- Parse body ---- */
    const { messages, context } = req.body || {};
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
        return res.status(400).json({ error: 'Invalid messages' });
    }

    /* ---- Build system prompt with live store context ---- */
    const pageNames = {
        home:     'Shop / product listing',
        product:  'Product detail page',
        checkout: 'Checkout page',
    };

    const fullSystemPrompt = `${SYSTEM_PROMPT}

CURRENT PAGE: ${pageNames[context?.page] || context?.page || 'Shop'}
CUSTOMER CART: ${context?.cart || 'Empty'}

PRODUCT CATALOG (${(context?.products || []).length} products):
${JSON.stringify(context?.products || [], null, 2)}`;

    /* ---- Call Groq ---- */
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
                stream:      false,
                messages: [
                    { role: 'system', content: fullSystemPrompt },
                    ...messages.slice(-20),
                ],
            }),
        });

        if (!groqRes.ok) {
            const errData = await groqRes.json().catch(() => ({}));
            console.error('[ShopBot] Groq error:', groqRes.status, errData);
            const status = groqRes.status === 429 ? 429 : 502;
            return res.status(status).json({ error: errData?.error?.message || 'Groq API error' });
        }

        const data  = await groqRes.json();
        const reply = data.choices?.[0]?.message?.content;

        if (!reply) {
            return res.status(502).json({ error: 'Empty response from Groq' });
        }

        return res.status(200).json({ reply });

    } catch (err) {
        console.error('[ShopBot] Handler error:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
}

// api/generate.js
// Deploy this to Vercel. Set ANTHROPIC_API_KEY in Vercel environment variables.
// This file goes in a folder called "api" in your Vercel project.

export default async function handler(req, res) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // CORS — allow your domains only
  const allowedOrigins = [
    'https://crossholdinggroup.com',
    'https://nestly.com',
    'https://clauze.com',
    'https://listpro.com',
    'https://shopscribe.com',
    'https://rentscribe.com',
    'https://sermonly.com',
    'https://gymscript.com',
    'https://pitchkit.com',
    'https://deskjoy.com',
    // Allow local dev and Vercel preview URLs
    'http://localhost:3000',
    'http://127.0.0.1:5500',
  ];

  const origin = req.headers.origin || '';
  // Also allow any vercel.app preview URL
  const isVercelPreview = origin.endsWith('.vercel.app');
  if (allowedOrigins.includes(origin) || isVercelPreview) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Session-Token');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // ── RATE LIMITING (free tier = 1 generation per IP) ──
  const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress || 'unknown';
  const sessionToken = req.headers['x-session-token'] || '';
  const isPaid = await checkPaidStatus(sessionToken);

  if (!isPaid) {
    // Check free usage — stored in Vercel KV (or fall back to in-memory for now)
    const usageKey = `usage:${ip}`;
    const used = await getUsage(usageKey);
    if (used >= 1) {
      return res.status(402).json({
        error: 'free_limit_reached',
        message: 'You have used your free generation. Upgrade to continue.',
        upgrade_url: process.env.LEMON_SQUEEZY_CHECKOUT_URL || '/upgrade'
      });
    }
    await incrementUsage(usageKey);
  }

  // ── VALIDATE INPUT ──
  const { prompt, maxTokens = 1200, site } = req.body;
  if (!prompt || typeof prompt !== 'string') {
    return res.status(400).json({ error: 'Missing prompt' });
  }
  if (prompt.length > 8000) {
    return res.status(400).json({ error: 'Prompt too long' });
  }

  // ── CALL ANTHROPIC (key is secret on server) ──
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: maxTokens,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const err = await response.json();
      console.error('Anthropic error:', err);
      return res.status(502).json({ error: 'AI service error. Please try again.' });
    }

    const data = await response.json();
    const text = data.content?.find(b => b.type === 'text')?.text || '';
    return res.status(200).json({ result: text });

  } catch (err) {
    console.error('Generate error:', err);
    return res.status(500).json({ error: 'Server error. Please try again.' });
  }
}

// ── PAID STATUS CHECK ──
// Checks Lemon Squeezy subscription via stored token
async function checkPaidStatus(token) {
  if (!token || !process.env.LEMON_SQUEEZY_API_KEY) return false;
  try {
    const res = await fetch(`https://api.lemonsqueezy.com/v1/license-key-instances?filter[key]=${token}`, {
      headers: {
        'Authorization': `Bearer ${process.env.LEMON_SQUEEZY_API_KEY}`,
        'Accept': 'application/vnd.api+json',
      }
    });
    const data = await res.json();
    return data?.data?.length > 0;
  } catch {
    return false;
  }
}

// ── USAGE TRACKING ──
// Uses Vercel KV if available, otherwise simple in-memory (resets on cold start)
const memStore = {};

async function getUsage(key) {
  // Try Vercel KV first
  if (process.env.KV_REST_API_URL) {
    try {
      const { kv } = await import('@vercel/kv');
      return (await kv.get(key)) || 0;
    } catch { /* fall through */ }
  }
  return memStore[key] || 0;
}

async function incrementUsage(key) {
  if (process.env.KV_REST_API_URL) {
    try {
      const { kv } = await import('@vercel/kv');
      await kv.incr(key);
      await kv.expire(key, 60 * 60 * 24 * 30); // 30 days
      return;
    } catch { /* fall through */ }
  }
  memStore[key] = (memStore[key] || 0) + 1;
}

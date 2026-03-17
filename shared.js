// shared.js — include this in every site
// Handles: secure API calls, free tier, paywall modal, session tokens

(function() {
  const BASE_URL = window.location.origin;
  const LS_TOKEN_KEY = 'ch_session_token';
  const LS_FREE_USED = 'ch_free_used';

  // ── CALL THE SECURE BACKEND ──
  window.CHGenerate = async function({ prompt, maxTokens = 1200, onLoading, onError }) {
    const token = localStorage.getItem(LS_TOKEN_KEY) || '';

    if (onLoading) onLoading(true);
    try {
      const res = await fetch(`${BASE_URL}/api/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Session-Token': token,
        },
        body: JSON.stringify({ prompt, maxTokens }),
      });

      const data = await res.json();

      if (res.status === 402) {
        // Free limit hit — show paywall
        if (onLoading) onLoading(false);
        showPaywall(data.upgrade_url);
        return null;
      }

      if (!res.ok) {
        throw new Error(data.error || 'Something went wrong. Please try again.');
      }

      // Mark free generation as used
      localStorage.setItem(LS_FREE_USED, '1');
      if (onLoading) onLoading(false);
      return data.result;

    } catch (err) {
      if (onLoading) onLoading(false);
      if (onError) onError(err.message);
      return null;
    }
  };

  // ── CHECK IF PAID ──
  window.CHIsPaid = function() {
    return !!localStorage.getItem(LS_TOKEN_KEY);
  };

  window.CHFreeUsed = function() {
    return localStorage.getItem(LS_FREE_USED) === '1';
  };

  // ── SAVE TOKEN AFTER PAYMENT ──
  // Lemon Squeezy redirects to ?token=xxx after checkout
  window.CHActivateToken = function() {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token') || params.get('license_key');
    if (token) {
      localStorage.setItem(LS_TOKEN_KEY, token);
      localStorage.removeItem(LS_FREE_USED);
      // Clean URL
      window.history.replaceState({}, '', window.location.pathname);
      return true;
    }
    return false;
  };

  // ── PAYWALL MODAL ──
  function showPaywall(upgradeUrl) {
    // Remove existing if any
    const existing = document.getElementById('ch-paywall');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'ch-paywall';
    modal.style.cssText = `
      position:fixed;inset:0;z-index:9999;
      background:rgba(0,0,0,0.75);backdrop-filter:blur(6px);
      display:flex;align-items:center;justify-content:center;padding:24px;
    `;

    // Get site-specific details
    const site = window.CH_SITE || {};
    const price = site.price || '$24';
    const name = site.name || 'this tool';
    const color = site.color || '#3B6FE8';
    const checkoutUrl = site.checkoutUrl || upgradeUrl || '#';

    modal.innerHTML = `
      <div style="
        background:#fff;border-radius:16px;padding:40px;
        max-width:420px;width:100%;text-align:center;
        box-shadow:0 24px 64px rgba(0,0,0,0.3);
      ">
        <div style="
          width:52px;height:52px;border-radius:12px;
          background:${color};display:flex;align-items:center;
          justify-content:center;margin:0 auto 20px;font-size:24px;
        ">✦</div>
        <h2 style="font-size:22px;font-weight:700;color:#0D0D0F;margin-bottom:8px;font-family:system-ui">
          You used your free generation
        </h2>
        <p style="font-size:15px;color:#7A7870;line-height:1.6;margin-bottom:28px;font-family:system-ui">
          Unlock unlimited generations of ${name} for just ${price}/month.
          Cancel anytime.
        </p>
        <a href="${checkoutUrl}" style="
          display:block;background:${color};color:#fff;
          padding:14px 24px;border-radius:10px;
          font-size:15px;font-weight:600;text-decoration:none;
          margin-bottom:12px;font-family:system-ui;
          transition:opacity .2s;
        " onmouseover="this.style.opacity='.85'" onmouseout="this.style.opacity='1'">
          Unlock unlimited — ${price}/mo →
        </a>
        <button onclick="document.getElementById('ch-paywall').remove()" style="
          background:none;border:none;font-size:13px;
          color:#B5B3AC;cursor:pointer;font-family:system-ui;
          padding:8px;
        ">
          No thanks, I'll stick with 1 generation
        </button>
      </div>
    `;

    document.body.appendChild(modal);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.remove();
    });
  }

  // Run on load — activate token if returning from checkout
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', window.CHActivateToken);
  } else {
    window.CHActivateToken();
  }
})();

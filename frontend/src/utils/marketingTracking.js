import API from './api';

function deviceType() {
  const width = window.innerWidth;
  return width < 768 ? 'mobile' : width < 1024 ? 'tablet' : 'desktop';
}

export function trackMarketingEvent(eventType, data = {}) {
  // The backend rejects events unless the authenticated customer has explicit
  // consent and tracking is enabled. Failures are intentionally silent so
  // analytics can never disrupt storefront behavior.
  // Analytics must never interrupt checkout or cart actions. Some browsers,
  // privacy modes, embedded webviews, and storage policies throw synchronously
  // when sessionStorage is accessed, before the API promise can be created.
  try {
    const sessionKey = 'shopzen_marketing_session';
    let sessionId = null;
    try { sessionId = window.sessionStorage.getItem(sessionKey); } catch {}
    if (!sessionId) {
      sessionId = window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      try { window.sessionStorage.setItem(sessionKey, sessionId); } catch {}
    }
    API.post('/marketing/events', {
      eventId: window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      eventType, sessionId, deviceType: deviceType(), source: 'storefront',
      occurredAt: new Date().toISOString(), pagePath: `${window.location.pathname}${window.location.search}`,
      referrer: document.referrer ? document.referrer.slice(0, 500) : '', ...data,
    }).catch(() => {});
  } catch {
    // Tracking is optional; cart and checkout functionality must continue.
  }
}

/**
 * PitchApp Viewer Analytics — Lightweight engagement tracking
 *
 * Usage: <script src="https://launchpad.bonfire.tools/api/analytics/script.js" data-project-id="uuid" defer></script>
 *
 * Tracks: page views, scroll depth, session duration, device type, referrer
 * Privacy: No cookies, no PII, no fingerprinting — session-level data only
 * Size: < 5KB minified
 */
(function() {
  'use strict';

  // Find the script tag to read data-project-id
  var scripts = document.querySelectorAll('script[data-project-id]');
  var scriptTag = scripts[scripts.length - 1];
  if (!scriptTag) return;

  var projectId = scriptTag.getAttribute('data-project-id');
  if (!projectId) return;

  // Endpoint — same origin as the script source, or fallback
  var endpoint = scriptTag.src
    ? scriptTag.src.replace(/\/api\/analytics\/script\.js.*$/, '/api/analytics')
    : '/api/analytics';

  // Generate a random session ID (no persistence across reloads)
  var sessionId = 'ses_' + Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
  var startTime = Date.now();
  var maxScroll = 0;
  var scrollTimer = null;
  var sent = { pageView: false, sessionEnd: false };

  // Device detection
  function getDeviceType() {
    var width = window.innerWidth;
    var isCoarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    if (isCoarse && width < 768) return 'mobile';
    if (isCoarse || (width >= 768 && width < 1024)) return 'tablet';
    return 'desktop';
  }

  // Send event to collection endpoint
  function sendEvent(eventType, data) {
    var payload = JSON.stringify({
      project_id: projectId,
      session_id: sessionId,
      event_type: eventType,
      data: data || {},
      device_type: getDeviceType(),
      referrer: document.referrer ? document.referrer.substring(0, 500) : '',
      viewport_width: window.innerWidth
    });

    // Prefer sendBeacon for reliability on page unload
    if (navigator.sendBeacon) {
      navigator.sendBeacon(endpoint, new Blob([payload], { type: 'application/json' }));
    } else {
      var xhr = new XMLHttpRequest();
      xhr.open('POST', endpoint, true);
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.send(payload);
    }
  }

  // Calculate scroll depth as percentage
  function getScrollDepth() {
    var scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    var docHeight = Math.max(
      document.body.scrollHeight,
      document.documentElement.scrollHeight
    );
    var winHeight = window.innerHeight;
    var scrollable = docHeight - winHeight;
    if (scrollable <= 0) return 100;
    return Math.min(Math.round((scrollTop / scrollable) * 100), 100);
  }

  // Track scroll depth — debounced to every 2 seconds
  function onScroll() {
    var depth = getScrollDepth();
    if (depth > maxScroll) {
      maxScroll = depth;
    }
    if (scrollTimer) return;
    scrollTimer = setTimeout(function() {
      scrollTimer = null;
      sendEvent('scroll_depth', {
        depth: maxScroll,
        time_on_page: Math.round((Date.now() - startTime) / 1000)
      });
    }, 2000);
  }

  // Send session end with final stats
  function endSession() {
    if (sent.sessionEnd) return;
    sent.sessionEnd = true;
    sendEvent('session_end', {
      duration: Math.round((Date.now() - startTime) / 1000),
      max_scroll_depth: maxScroll
    });
  }

  // Send initial page view
  function init() {
    if (sent.pageView) return;
    sent.pageView = true;
    sendEvent('page_view', {
      url: window.location.href.substring(0, 500),
      title: document.title.substring(0, 200)
    });
  }

  // Attach listeners
  window.addEventListener('scroll', onScroll, { passive: true });
  document.addEventListener('visibilitychange', function() {
    if (document.visibilityState === 'hidden') {
      endSession();
    }
  });
  window.addEventListener('beforeunload', endSession);

  // Respect prefers-reduced-motion — still track, but skip scroll tracking
  // (reduced motion users may not scroll at all)

  // Initialize
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

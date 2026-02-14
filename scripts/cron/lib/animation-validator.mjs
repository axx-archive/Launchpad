/**
 * Animation validator for PitchApp GSAP code.
 *
 * Pure-function module that checks JS and CSS content against known
 * GSAP anti-patterns and PitchApp conventions. Used by the pipeline
 * executor as a post-write safety net and by the animation specialist
 * agent's validate_animation tool.
 *
 * Every check is independent — order doesn't matter, and each returns
 * a violation object with level + rule + message.
 */

// ---------------------------------------------------------------------------
// Violation levels
// ---------------------------------------------------------------------------

const CRITICAL = "critical";
const WARNING = "warning";

// ---------------------------------------------------------------------------
// Individual checks
// ---------------------------------------------------------------------------

/**
 * CRITICAL: gsap.from() causes FOUC — elements flash at full opacity
 * then snap to the hidden state. Use gsap.to() with CSS defaults.
 */
function checkGsapFrom(jsContent) {
  if (/gsap\.from\s*\(/.test(jsContent)) {
    return {
      level: CRITICAL,
      rule: "no-gsap-from",
      message:
        "gsap.from() detected — causes FOUC. Use gsap.to() with CSS initial states instead.",
    };
  }
  return null;
}

/**
 * CRITICAL: CSS scroll-behavior: smooth conflicts with GSAP
 * ScrollToPlugin, causing double-scroll jank.
 */
function checkCssSmoothScroll(cssContent) {
  if (/scroll-behavior\s*:\s*smooth/.test(cssContent)) {
    return {
      level: CRITICAL,
      rule: "no-css-smooth-scroll",
      message:
        "CSS scroll-behavior: smooth detected — conflicts with GSAP ScrollToPlugin. Remove from html selector.",
    };
  }
  return null;
}

/**
 * WARNING: ScrollTrigger is referenced but never appears in a
 * gsap.registerPlugin() call. Unregistered plugins silently fail.
 */
function checkUnregisteredScrollTrigger(jsContent) {
  if (
    /ScrollTrigger/.test(jsContent) &&
    !/registerPlugin[^)]*ScrollTrigger/.test(jsContent)
  ) {
    return {
      level: WARNING,
      rule: "register-scrolltrigger",
      message:
        "ScrollTrigger used but not found in registerPlugin() call — plugins must be registered explicitly.",
    };
  }
  return null;
}

/**
 * WARNING: scrollTo behaviour is used but ScrollToPlugin is not
 * registered. Smooth-scroll links will silently fail.
 */
function checkUnregisteredScrollToPlugin(jsContent) {
  if (
    /scrollTo/.test(jsContent) &&
    !/registerPlugin[^)]*ScrollToPlugin/.test(jsContent)
  ) {
    return {
      level: WARNING,
      rule: "register-scrolltoplugin",
      message:
        "scrollTo used but ScrollToPlugin not found in registerPlugin() call — smooth scroll links will silently fail.",
    };
  }
  return null;
}

/**
 * WARNING: Common reusable classes (.hero-grid-bg, .hero-glow,
 * .bg-layer) used in gsap calls without a section-scoped parent
 * selector. This causes animations to hit elements in multiple sections.
 */
function checkUnscopedSelectors(jsContent) {
  const violations = [];
  const reusedClasses = ["hero-grid-bg", "hero-glow", "bg-layer"];
  const pattern = /gsap\.(to|set|fromTo)\s*\(\s*['"](\.[\w-]+)['"]/g;

  let match;
  while ((match = pattern.exec(jsContent)) !== null) {
    const selector = match[2];
    const className = selector.replace(/^\./, "");
    if (reusedClasses.includes(className)) {
      violations.push({
        level: WARNING,
        rule: "scope-selectors",
        message: `Potentially unscoped selector '${selector}' in gsap.${match[1]}() — scope to parent section: '.section-x ${selector}'`,
      });
    }
  }
  return violations;
}

/**
 * WARNING: Dimensions (offsetWidth, offsetHeight, clientWidth, etc.)
 * cached in a const at module/init level. Mobile orientation changes
 * invalidate these values — read fresh inside animation callbacks.
 */
function checkCachedDimensions(jsContent) {
  if (
    /const\s+(?:width|height|w|h)\s*=\s*\w+\.(?:offsetWidth|offsetHeight|clientWidth|clientHeight|getBoundingClientRect)/.test(
      jsContent
    )
  ) {
    return {
      level: WARNING,
      rule: "no-cached-dimensions",
      message:
        "Dimensions cached at init level — read offsetWidth/offsetHeight fresh inside animation callbacks for mobile orientation support.",
    };
  }
  return null;
}

/**
 * WARNING: ScrollTrigger is used but there is no prefers-reduced-motion
 * check. Accessibility requires respecting this media query.
 */
function checkReducedMotion(jsContent) {
  if (
    /ScrollTrigger/.test(jsContent) &&
    !/prefers-reduced-motion/.test(jsContent)
  ) {
    return {
      level: WARNING,
      rule: "reduced-motion",
      message:
        "ScrollTrigger used but no prefers-reduced-motion check found — add reduced motion handling for accessibility.",
    };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Validate JS and CSS content against known GSAP anti-patterns.
 *
 * @param {string} jsContent  - Contents of js/app.js (or equivalent)
 * @param {string} cssContent - Contents of css/style.css (or equivalent)
 * @returns {Array<{level: string, rule: string, message: string}>}
 */
export function validateAnimation(jsContent = "", cssContent = "") {
  const violations = [];

  const single = [
    checkGsapFrom(jsContent),
    checkCssSmoothScroll(cssContent),
    checkUnregisteredScrollTrigger(jsContent),
    checkUnregisteredScrollToPlugin(jsContent),
    checkCachedDimensions(jsContent),
    checkReducedMotion(jsContent),
  ];

  for (const v of single) {
    if (v) violations.push(v);
  }

  // Unscoped selectors can produce multiple violations
  violations.push(...checkUnscopedSelectors(jsContent));

  return violations;
}

/**
 * Format violations into a human-readable string for logging.
 *
 * @param {Array<{level: string, rule: string, message: string}>} violations
 * @returns {string}
 */
export function formatViolations(violations) {
  if (violations.length === 0) {
    return "No issues found. Animation code looks clean.";
  }

  const lines = violations.map(
    (v, i) => `${i + 1}. [${v.level.toUpperCase()}] ${v.rule}: ${v.message}`
  );
  return `Found ${violations.length} issue(s):\n${lines.join("\n")}`;
}

/**
 * Check whether any violation is critical.
 *
 * @param {Array<{level: string, rule: string, message: string}>} violations
 * @returns {boolean}
 */
export function hasCriticalViolations(violations) {
  return violations.some((v) => v.level === CRITICAL);
}

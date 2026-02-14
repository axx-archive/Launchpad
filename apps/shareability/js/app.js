/* ===================================
   SHAREABILITY — We Speak Internet
   Scroll-driven GSAP animation system
   =================================== */

document.addEventListener('DOMContentLoaded', () => {
    document.body.classList.add('js-loaded');
    gsap.registerPlugin(ScrollTrigger, ScrollToPlugin);
    initSmoothScroll();
    initLoader();
});

/* ===== LOADER ===== */
function initLoader() {
    const loader = document.getElementById('loader');
    setTimeout(() => {
        loader.classList.add('hidden');
        setTimeout(revealHero, 200);
    }, 1200);
}

/* ===== HERO REVEAL ===== */
function revealHero() {
    const isMobile = window.matchMedia('(pointer: coarse)').matches;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Reduced motion: skip all animation, show everything immediately
    if (reducedMotion) {
        gsap.set('.section-hero .hero-dots-bg', { opacity: 1 });
        gsap.set('.hero-glow', { opacity: 1 });
        gsap.set('.hero-eyebrow', { opacity: 1 });
        gsap.set('.hero-title-main', { opacity: 1, y: 0, scale: 1 });
        gsap.set('.hero-tagline', { opacity: 0.9, y: 0 });
        gsap.set('.hero-scroll-prompt', { opacity: 1 });
        document.getElementById('nav').classList.add('visible');
        initScrollAnimations();
        initNavigation();
        initGlowInteraction();
        initCounters();
        initFlowchart();
        initClosingVideoLazy();
        return;
    }

    // Create feed fragments
    const fragments = createFragments(isMobile);

    const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });

    // Fade in fragments (staggered, random order)
    const shuffled = gsap.utils.shuffle([...fragments]);
    tl.to(shuffled, {
        opacity: (i, el) => parseFloat(el.dataset.baseOpacity),
        duration: 1.2, stagger: 0.03, ease: 'power2.out'
    }, 0);

    // Start drift immediately
    tl.add(() => startDrift(fragments), 0.2);

    // Dot matrix bg
    tl.to('.section-hero .hero-dots-bg', { opacity: 1, duration: 2, ease: 'power2.out' }, 0);

    // Glow
    tl.to('.hero-glow', { opacity: 1, scale: 1, duration: 2.5, ease: 'power2.out' }, 0.2);

    // Eyebrow
    tl.to('.hero-eyebrow', { opacity: 1, duration: 1 }, 0.5);

    // Character decode at 0.8s
    tl.add(() => decodeTitle(), 0.8);

    // Tagline typing at 2.4s
    tl.add(() => typeTagline(), 2.4);

    // Scroll prompt
    tl.to('.hero-scroll-prompt', { opacity: 1, duration: 1 }, 3.0);

    // Nav
    tl.add(() => { document.getElementById('nav').classList.add('visible'); }, 1.5);

    // Init all systems
    tl.add(() => {
        initScrollAnimations();
        initNavigation();
        initGlowInteraction();
        initLensEffect(fragments);
        initCounters();
        initFlowchart();
        initFeedScrollExit(fragments);
        initCardFlip();
        initClientWall();
        initContactOverlay();
        initClosingVideoLazy();
    }, 1);
}

/* ===== FEED FRAGMENTS ===== */
function createFragments(isMobile) {
    const container = document.querySelector('.hero-feed-container');
    const count = isMobile ? 22 : 38;
    const fragments = [];

    // Fragment size templates (w, h, class)
    const templates = [
        { w: 120, h: 80, cls: '' },           // tweet
        { w: 160, h: 90, cls: '' },            // video landscape
        { w: 80, h: 120, cls: '' },            // video portrait
        { w: 90, h: 90, cls: '' },             // square post
        { w: 140, h: 32, cls: '' },            // reaction bar
        { w: 100, h: 40, cls: '' },            // comment
        { w: 180, h: 28, cls: '' },            // notification
        { w: 44, h: 44, cls: 'feed-fragment--circle' },  // avatar
    ];

    // Color variants
    const colorClasses = ['', '', '', 'feed-fragment--purple', 'feed-fragment--green'];

    const heroW = container.offsetWidth || window.innerWidth;
    const heroH = container.offsetHeight || window.innerHeight;
    const centerX = heroW / 2;
    const centerY = heroH / 2;
    const deadZone = 200; // pixels from center — no fragments

    for (let i = 0; i < count; i++) {
        const tmpl = templates[Math.floor(Math.random() * templates.length)];
        const scale = 0.7 + Math.random() * 0.6; // size variation
        const w = Math.round(tmpl.w * scale);
        const h = Math.round(tmpl.h * scale);

        // Position in columns, avoiding center dead zone
        let x, y;
        let attempts = 0;
        do {
            x = Math.random() * heroW;
            y = Math.random() * (heroH + 400) - 200; // extend above/below viewport
            attempts++;
        } while (
            Math.abs(x + w / 2 - centerX) < deadZone &&
            Math.abs(y + h / 2 - centerY) < deadZone &&
            attempts < 20
        );

        const baseOpacity = 0.03 + Math.random() * 0.09;
        const color = colorClasses[Math.floor(Math.random() * colorClasses.length)];

        const el = document.createElement('div');
        el.className = 'feed-fragment' + (tmpl.cls ? ' ' + tmpl.cls : '') + (color ? ' ' + color : '');
        el.style.width = w + 'px';
        el.style.height = h + 'px';
        el.style.left = x + 'px';
        el.style.top = y + 'px';
        el.style.opacity = '0';
        el.dataset.baseOpacity = baseOpacity.toFixed(3);
        el.dataset.driftSpeed = (15 + Math.random() * 20).toFixed(1);

        container.appendChild(el);
        fragments.push(el);
    }

    return fragments;
}

/* ===== FRAGMENT DRIFT ===== */
function startDrift(fragments) {
    const hero = document.querySelector('.section-hero');
    let heroH = hero.offsetHeight;
    window.addEventListener('resize', () => { heroH = hero.offsetHeight; });

    fragments.forEach(el => {
        const speed = parseFloat(el.dataset.driftSpeed);

        // Continuous upward drift
        gsap.to(el, {
            y: -(heroH + 400),
            duration: speed,
            ease: 'none',
            repeat: -1,
            modifiers: {
                y: gsap.utils.unitize(val => {
                    // Use fresh heroH on each frame (updates on resize)
                    return gsap.utils.wrap(-(heroH + 200), 200)(val);
                })
            }
        });

        // Subtle horizontal wobble
        gsap.to(el, {
            x: -20 + Math.random() * 40,
            duration: 3 + Math.random() * 4,
            ease: 'sine.inOut',
            yoyo: true,
            repeat: -1
        });
    });
}

/* ===== CHARACTER DECODE ===== */
function decodeTitle() {
    const chars = document.querySelectorAll('.hero-title-main .char');
    const glyphs = '!@#$%&*QWXZ01?/><{}[]|';
    const targetWord = 'SHAREABILITY';

    // Set all chars visible but scrambled
    gsap.set('.hero-title-main', { opacity: 1, y: 0, scale: 1 });

    chars.forEach((char, i) => {
        const targetChar = targetWord[i];
        const totalCycles = 4 + i * 2; // more cycles for later chars
        let cycle = 0;

        const interval = setInterval(() => {
            if (cycle < totalCycles) {
                char.textContent = glyphs[Math.floor(Math.random() * glyphs.length)];
                cycle++;
            } else {
                clearInterval(interval);
                char.textContent = targetChar;
                // Flash accent on lock
                gsap.fromTo(char,
                    { color: 'var(--color-accent)' },
                    { color: 'var(--color-text)', duration: 0.6, ease: 'power2.out' }
                );
            }
        }, 50);
    });
}

/* ===== TAGLINE TYPING ===== */
function typeTagline() {
    const tagline = document.querySelector('.hero-tagline');
    const text = 'We speak internet';
    tagline.textContent = '';
    gsap.set(tagline, { opacity: 0.9, y: 0 });
    tagline.classList.add('typing');

    let i = 0;
    const interval = setInterval(() => {
        if (i < text.length) {
            tagline.textContent += text[i];
            i++;
        } else {
            clearInterval(interval);
            // Keep cursor blinking for 1.5s then remove
            setTimeout(() => tagline.classList.remove('typing'), 1500);
        }
    }, 55);
}

/* ===== LENS EFFECT ===== */
function initLensEffect(fragments) {
    const isMobile = window.matchMedia('(pointer: coarse)').matches;
    const hero = document.querySelector('.section-hero');

    if (isMobile) {
        // Tap-to-brighten on mobile
        hero.addEventListener('touchstart', (e) => {
            const touch = e.touches[0];
            const rect = hero.getBoundingClientRect();
            const tx = touch.clientX - rect.left;
            const ty = touch.clientY - rect.top;
            const radius = 250;

            fragments.forEach(el => {
                const elRect = el.getBoundingClientRect();
                const ex = elRect.left - rect.left + elRect.width / 2;
                const ey = elRect.top - rect.top + elRect.height / 2;
                const dist = Math.hypot(tx - ex, ty - ey);

                if (dist < radius) {
                    const strength = 1 - dist / radius;
                    gsap.to(el, {
                        opacity: parseFloat(el.dataset.baseOpacity) + strength * 0.18,
                        duration: 0.3, ease: 'power2.out'
                    });
                    // Fade back
                    gsap.to(el, {
                        opacity: parseFloat(el.dataset.baseOpacity),
                        duration: 1.2, delay: 1.5, ease: 'power2.out'
                    });
                }
            });
        }, { passive: true });
    } else {
        // Desktop: continuous proximity detection via ticker
        let mouseX = -1000, mouseY = -1000;
        const radius = 200;

        hero.addEventListener('mousemove', (e) => {
            const rect = hero.getBoundingClientRect();
            mouseX = e.clientX - rect.left;
            mouseY = e.clientY - rect.top;
        });

        hero.addEventListener('mouseleave', () => {
            mouseX = -1000;
            mouseY = -1000;
        });

        const tickerCallback = () => {
            const heroRect = hero.getBoundingClientRect();
            fragments.forEach(el => {
                const elRect = el.getBoundingClientRect();
                const ex = elRect.left - heroRect.left + elRect.width / 2;
                const ey = elRect.top - heroRect.top + elRect.height / 2;
                const dist = Math.hypot(mouseX - ex, mouseY - ey);
                const base = parseFloat(el.dataset.baseOpacity);

                if (dist < radius) {
                    const strength = 1 - dist / radius;
                    const target = base + strength * 0.18;
                    const current = parseFloat(el.style.opacity) || base;
                    el.style.opacity = current + (target - current) * 0.12;
                } else {
                    const current = parseFloat(el.style.opacity) || base;
                    el.style.opacity = current + (base - current) * 0.04;
                }
            });
        };

        gsap.ticker.add(tickerCallback);

        // Pause ticker when hero is out of viewport to save CPU
        ScrollTrigger.create({
            trigger: hero,
            start: 'top bottom',
            end: 'bottom top',
            onLeave: () => gsap.ticker.remove(tickerCallback),
            onEnterBack: () => gsap.ticker.add(tickerCallback),
            onLeaveBack: () => gsap.ticker.remove(tickerCallback),
            onEnter: () => gsap.ticker.add(tickerCallback)
        });
    }
}

/* ===== FEED SCROLL EXIT ===== */
function initFeedScrollExit(fragments) {
    const feedContainer = document.querySelector('.hero-feed-container');
    if (!feedContainer) return;

    gsap.to(feedContainer, {
        y: -200,
        opacity: 0,
        ease: 'none',
        scrollTrigger: {
            trigger: '.section-hero',
            start: 'top top',
            end: '80% top',
            scrub: 1.5
        }
    });
}

/* ===== SCROLL ANIMATIONS ===== */
function initScrollAnimations() {
    document.querySelectorAll('.anim-fade').forEach(el => {
        const section = el.closest('.section');
        const siblings = section ? Array.from(section.querySelectorAll('.anim-fade')) : [el];
        const idx = siblings.indexOf(el);

        ScrollTrigger.create({
            trigger: el,
            start: 'top 88%',
            once: true,
            onEnter: () => {
                gsap.to(el, {
                    opacity: 1, y: 0, duration: 0.9,
                    delay: idx * 0.12, ease: 'power2.out',
                    onStart: () => el.classList.add('visible')
                });
            }
        });
    });

    // Content lift on scroll
    document.querySelectorAll('.section').forEach(section => {
        const content = section.querySelector('[class$="-content"]') ||
                        section.querySelector('[class$="-inner"]');
        if (!content || section.classList.contains('section-hero')) return;

        gsap.fromTo(content, { y: 24 }, {
            y: 0, ease: 'none',
            scrollTrigger: { trigger: section, start: 'top bottom', end: 'top 40%', scrub: 1.5 }
        });
    });

    // Card tilt — equation cards (skip flippable ones — flip handles those)
    document.querySelectorAll('.equation-card').forEach(card => {
        if (card.classList.contains('equation-card-flippable')) return;
        card.addEventListener('mousemove', (e) => {
            const rect = card.getBoundingClientRect();
            const x = (e.clientX - rect.left) / rect.width - 0.5;
            const y = (e.clientY - rect.top) / rect.height - 0.5;
            gsap.to(card, { rotateY: x * 4, rotateX: -y * 4, duration: 0.4, ease: 'power2.out', transformPerspective: 800 });
        });
        card.addEventListener('mouseleave', () => {
            gsap.to(card, { rotateY: 0, rotateX: 0, duration: 0.6, ease: 'power2.out' });
        });
    });
}

/* ===== NAVIGATION ===== */
function initNavigation() {
    const nav = document.getElementById('nav');
    const progressBar = document.getElementById('scrollProgress');
    const sectionLabel = document.getElementById('navSectionLabel');
    const sections = document.querySelectorAll('.section[data-section-name]');
    const lightSections = document.querySelectorAll('.section-light');

    window.addEventListener('scroll', () => {
        const scrollTop = window.scrollY;
        const docHeight = document.documentElement.scrollHeight - window.innerHeight;
        progressBar.style.width = (scrollTop / docHeight) * 100 + '%';

        if (scrollTop > 80) { nav.classList.add('scrolled'); }
        else { nav.classList.remove('scrolled'); }

        let currentSection = '';
        sections.forEach(section => {
            const rect = section.getBoundingClientRect();
            if (rect.top <= window.innerHeight * 0.4 && rect.bottom > 0) {
                currentSection = section.getAttribute('data-section-name');
            }
        });

        if (currentSection) {
            sectionLabel.textContent = currentSection;
            sectionLabel.classList.add('active');
        } else {
            sectionLabel.classList.remove('active');
        }

        // Nav light/dark based on section background
        let inLightSection = false;
        lightSections.forEach(s => {
            const r = s.getBoundingClientRect();
            if (r.top <= 60 && r.bottom > 60) inLightSection = true;
        });
        if (inLightSection) nav.classList.add('nav-light');
        else nav.classList.remove('nav-light');
    }, { passive: true });
}

/* ===== HERO GLOW ===== */
function initGlowInteraction() {
    const heroGlow = document.querySelector('.hero-glow');
    if (!heroGlow) return;

    gsap.set(heroGlow, { xPercent: -50, yPercent: -50 });
    const isMobile = window.matchMedia('(pointer: coarse)').matches;
    const hero = document.querySelector('.section-hero');

    if (isMobile) {
        function glowDrift() {
            const hw = hero.offsetWidth;
            const hh = hero.offsetHeight;
            gsap.to(heroGlow, {
                left: hw * (0.2 + Math.random() * 0.6),
                top: hh * (0.25 + Math.random() * 0.5),
                xPercent: -50, yPercent: -50,
                duration: 1.5 + Math.random() * 1.5, ease: 'sine.inOut',
                onComplete: glowDrift
            });
        }
        glowDrift();

        hero.addEventListener('touchstart', (e) => {
            const touch = e.touches[0];
            const rect = hero.getBoundingClientRect();
            gsap.killTweensOf(heroGlow);
            gsap.to(heroGlow, {
                left: touch.clientX - rect.left, top: touch.clientY - rect.top,
                xPercent: -50, yPercent: -50,
                duration: 0.6, ease: 'power2.out', onComplete: glowDrift
            });
        }, { passive: true });
    } else {
        hero.addEventListener('mousemove', (e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            gsap.to(heroGlow, {
                left: e.clientX - rect.left, top: e.clientY - rect.top,
                xPercent: -50, yPercent: -50,
                duration: 1.5, ease: 'power2.out'
            });
        });
    }
}

/* ===== COUNTERS ===== */
function initCounters() {
    document.querySelectorAll('.metric-val[data-count]').forEach(el => {
        const target = parseInt(el.getAttribute('data-count'), 10);
        const suffix = el.getAttribute('data-suffix') || '';
        const prefix = el.getAttribute('data-prefix') || '';

        ScrollTrigger.create({
            trigger: el, start: 'top 82%', once: true,
            onEnter: () => {
                const obj = { val: 0 };
                gsap.to(obj, {
                    val: target, duration: 2.2, ease: 'power2.out',
                    onUpdate: () => { el.textContent = prefix + Math.round(obj.val) + suffix; }
                });
            }
        });
    });
}

/* ===== SCROLL DECODE (reusable) ===== */
function initScrollDecode(elementId, targetText) {
    const el = document.getElementById(elementId);
    if (!el) return;

    const chars = el.querySelectorAll('.char');
    const glyphs = '!@#$%&*QWXZ01?/><{}[]|';

    // Scramble immediately so the word starts as glyphs
    chars.forEach(c => {
        c.textContent = glyphs[Math.floor(Math.random() * glyphs.length)];
    });

    ScrollTrigger.create({
        trigger: el,
        start: 'top 85%',
        once: true,
        onEnter: () => {
            // Delay so the headline text settles first
            setTimeout(() => {
                const batchSize = 3;
                const batches = [];
                for (let b = 0; b < chars.length; b += batchSize) {
                    batches.push(Array.from(chars).slice(b, b + batchSize));
                }

                batches.forEach((batch, batchIdx) => {
                    setTimeout(() => {
                        batch.forEach((char, i) => {
                            const charIdx = batchIdx * batchSize + i;
                            const targetChar = targetText[charIdx];
                            const totalCycles = 6;
                            let cycle = 0;

                            const interval = setInterval(() => {
                                if (cycle < totalCycles) {
                                    char.textContent = glyphs[Math.floor(Math.random() * glyphs.length)];
                                    cycle++;
                                } else {
                                    clearInterval(interval);
                                    char.textContent = targetChar;
                                    gsap.fromTo(char,
                                        { color: 'var(--color-accent-light)' },
                                        { color: 'var(--color-accent)', duration: 0.6, ease: 'power2.out' }
                                    );
                                }
                            }, 70);
                        });
                    }, batchIdx * 350);
                });
            }, 400);
        }
    });
}

/* ===== EMAIL DECODE ===== */
function initEmailDecode() {
    const email = document.getElementById('closingEmail');
    if (!email) return;

    const chars = email.querySelectorAll('.char');
    const target = 'E@Shareability.com';
    const glyphs = '!@#$%&*QWXZ01?/><{}[]|';

    // Hide chars initially
    chars.forEach(c => { c.style.opacity = '0'; });

    ScrollTrigger.create({
        trigger: email,
        start: 'top 85%',
        once: true,
        onEnter: () => {
            // Fade in all chars first
            gsap.to(chars, { opacity: 1, duration: 0.3, stagger: 0.02 });

            // Then decode left-to-right
            chars.forEach((char, i) => {
                const targetChar = target[i];
                const totalCycles = 3 + i;
                let cycle = 0;

                setTimeout(() => {
                    char.textContent = glyphs[Math.floor(Math.random() * glyphs.length)];
                    const interval = setInterval(() => {
                        if (cycle < totalCycles) {
                            char.textContent = glyphs[Math.floor(Math.random() * glyphs.length)];
                            cycle++;
                        } else {
                            clearInterval(interval);
                            char.textContent = targetChar;
                            gsap.fromTo(char,
                                { color: 'var(--color-accent)' },
                                { color: '', duration: 0.5, ease: 'power2.out' }
                            );
                        }
                    }, 40);
                }, i * 30);
            });
        }
    });
}

/* ===== CARD FLIP (MOBILE) ===== */
function initCardFlip() {
    // Equation card flip works on all devices (tap/click to flip)
    document.querySelectorAll('.equation-card-flippable').forEach(card => {
        card.addEventListener('click', () => {
            card.classList.toggle('flipped');
        });
    });

    // Case study card flip is mobile-only
    if (!window.matchMedia('(pointer: coarse)').matches) return;
    document.querySelectorAll('.case-card-container').forEach(container => {
        container.addEventListener('click', (e) => {
            if (e.target.closest('a')) return;
            container.classList.toggle('flipped');
        });
    });
}

/* ===== CLIENT WALL PUSH/PULL ===== */
function initClientWall() {
    const wall = document.getElementById('clientWall');
    if (!wall) return;

    const names = wall.querySelectorAll('.client-name');
    const isMobile = window.matchMedia('(pointer: coarse)').matches;
    const radius = 150;   // px — how far the repulsion reaches
    const strength = 35;  // px — max displacement at epicenter

    if (isMobile) {
        // On mobile: gentle wobble on scroll instead of mouse tracking
        names.forEach((name, i) => {
            ScrollTrigger.create({
                trigger: wall,
                start: 'top 90%',
                end: 'bottom 10%',
                onUpdate: (self) => {
                    const offset = Math.sin(self.progress * Math.PI * 2 + i * 0.7) * 8;
                    const offsetY = Math.cos(self.progress * Math.PI * 1.5 + i * 0.5) * 5;
                    gsap.set(name, { x: offset, y: offsetY });
                }
            });
        });
        return;
    }

    // Desktop: magnetic repulsion from cursor
    let mouseX = -1000, mouseY = -1000;

    wall.addEventListener('mousemove', (e) => {
        const rect = wall.getBoundingClientRect();
        mouseX = e.clientX - rect.left;
        mouseY = e.clientY - rect.top;
    });

    wall.addEventListener('mouseleave', () => {
        mouseX = -1000;
        mouseY = -1000;
        // Spring all names back to origin
        names.forEach(name => {
            gsap.to(name, { x: 0, y: 0, duration: 0.8, ease: 'elastic.out(1, 0.5)' });
        });
    });

    const tickerFn = () => {
        const wallRect = wall.getBoundingClientRect();
        names.forEach(name => {
            const nameRect = name.getBoundingClientRect();
            const cx = nameRect.left - wallRect.left + nameRect.width / 2;
            const cy = nameRect.top - wallRect.top + nameRect.height / 2;
            const dx = cx - mouseX;
            const dy = cy - mouseY;
            const dist = Math.hypot(dx, dy);

            if (dist < radius && dist > 0) {
                const force = (1 - dist / radius) * strength;
                const angle = Math.atan2(dy, dx);
                const targetX = Math.cos(angle) * force;
                const targetY = Math.sin(angle) * force;

                // Lerp toward target for smooth motion
                const curX = gsap.getProperty(name, 'x') || 0;
                const curY = gsap.getProperty(name, 'y') || 0;
                gsap.set(name, {
                    x: curX + (targetX - curX) * 0.18,
                    y: curY + (targetY - curY) * 0.18
                });
            } else {
                // Spring back toward origin
                const curX = gsap.getProperty(name, 'x') || 0;
                const curY = gsap.getProperty(name, 'y') || 0;
                if (Math.abs(curX) > 0.3 || Math.abs(curY) > 0.3) {
                    gsap.set(name, {
                        x: curX * 0.92,
                        y: curY * 0.92
                    });
                }
            }
        });
    };

    gsap.ticker.add(tickerFn);

    // Pause when out of viewport
    ScrollTrigger.create({
        trigger: wall,
        start: 'top bottom',
        end: 'bottom top',
        onLeave: () => gsap.ticker.remove(tickerFn),
        onEnterBack: () => gsap.ticker.add(tickerFn),
        onLeaveBack: () => gsap.ticker.remove(tickerFn),
        onEnter: () => gsap.ticker.add(tickerFn)
    });
}

/* ===== SIGNAL PATH ANIMATION ===== */
function initFlowchart() {
    const container = document.getElementById('signalPath');
    if (!container) return;

    const svg = document.getElementById('signalSvg');
    const stages = container.querySelectorAll('.signal-stage');
    const nodes = container.querySelectorAll('.signal-node');
    const titles = container.querySelectorAll('.signal-title');
    const descs = container.querySelectorAll('.signal-desc');
    const tags = container.querySelectorAll('.signal-tag');
    const isMobile = window.matchMedia('(max-width: 767px)').matches;

    // JS takes over: hide everything for animation reveal
    gsap.set(nodes, { opacity: 0, scale: 0 });
    gsap.set(titles, { opacity: 0, y: 16 });
    gsap.set(descs, { opacity: 0, y: 12 });
    gsap.set(tags, { opacity: 0, scale: 0.8 });

    // Build SVG connecting path (desktop only)
    if (!isMobile && svg) {
        // Use double rAF to ensure layout is fully settled
        requestAnimationFrame(() => { requestAnimationFrame(() => {
            const cRect = container.getBoundingClientRect();
            const w = container.offsetWidth;
            const h = container.offsetHeight;
            svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
            svg.innerHTML = '';

            // Get center points of each node
            const pts = Array.from(nodes).map(n => {
                const r = n.getBoundingClientRect();
                return {
                    x: r.left - cRect.left + r.width / 2,
                    y: r.top - cRect.top + r.height / 2
                };
            });

            // SVG gradient: blue → green
            const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
            const grad = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient');
            grad.id = 'signalGrad';
            grad.setAttribute('x1', '0%'); grad.setAttribute('y1', '0%');
            grad.setAttribute('x2', '100%'); grad.setAttribute('y2', '0%');
            const s1 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
            s1.setAttribute('offset', '0%'); s1.setAttribute('stop-color', '#4D8EFF');
            const s2 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
            s2.setAttribute('offset', '100%'); s2.setAttribute('stop-color', '#34d399');
            grad.appendChild(s1); grad.appendChild(s2);
            defs.appendChild(grad);
            svg.appendChild(defs);

            // Build smooth cubic bezier through all 4 node centers
            let d = `M ${pts[0].x},${pts[0].y}`;
            for (let i = 0; i < pts.length - 1; i++) {
                const cpx = (pts[i].x + pts[i + 1].x) / 2;
                d += ` C ${cpx},${pts[i].y} ${cpx},${pts[i + 1].y} ${pts[i + 1].x},${pts[i + 1].y}`;
            }

            // Ghost path (faint preview of full path)
            const ghost = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            ghost.setAttribute('d', d);
            ghost.classList.add('signal-line-ghost');
            ghost.setAttribute('stroke', 'url(#signalGrad)');
            svg.appendChild(ghost);

            // Animated path (draws itself)
            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            path.setAttribute('d', d);
            path.classList.add('signal-line');
            path.setAttribute('stroke', 'url(#signalGrad)');
            svg.appendChild(path);

            const pathLen = path.getTotalLength();
            path.style.strokeDasharray = pathLen;
            path.style.strokeDashoffset = pathLen;
        }); });
    }

    // Scroll-triggered animation
    ScrollTrigger.create({
        trigger: container,
        start: 'top 80%',
        once: true,
        onEnter: () => {
            const tl = gsap.timeline();
            const path = svg ? svg.querySelector('.signal-line') : null;

            // Draw the connecting path over 2.5s
            if (path) {
                tl.to(path, {
                    strokeDashoffset: 0,
                    duration: 2.5,
                    ease: 'power2.inOut'
                }, 0);
            }

            // Bloom each node sequentially, with content following
            nodes.forEach((node, i) => {
                const delay = i * 0.55;
                const stage = stages[i];

                // Node blooms from scale(0) with overshoot
                tl.fromTo(node,
                    { opacity: 0, scale: 0 },
                    { opacity: 1, scale: 1, duration: 0.5, ease: 'back.out(1.7)' },
                delay);

                // Title fades up
                tl.fromTo(stage.querySelector('.signal-title'),
                    { opacity: 0, y: 16 },
                    { opacity: 1, y: 0, duration: 0.5, ease: 'power2.out' },
                delay + 0.15);

                // Description fades up
                tl.fromTo(stage.querySelector('.signal-desc'),
                    { opacity: 0, y: 12 },
                    { opacity: 1, y: 0, duration: 0.5, ease: 'power2.out' },
                delay + 0.25);

                // Tags pop in with spring
                tl.fromTo(stage.querySelectorAll('.signal-tag'),
                    { opacity: 0, scale: 0.8 },
                    { opacity: 1, scale: 1, duration: 0.4, stagger: 0.08, ease: 'back.out(1.4)' },
                delay + 0.35);
            });

            // Stage 4 node green glow pulse
            tl.to(nodes[3], {
                boxShadow: '0 0 30px rgba(52, 211, 153, 0.25)',
                duration: 0.8, ease: 'power2.out',
                yoyo: true, repeat: 1
            }, 2.5);
        }
    });
}

/* ===== CONTACT OVERLAY ===== */
function initContactOverlay() {
    const btn = document.getElementById('contactBtn');
    const overlay = document.getElementById('contactOverlay');
    const backdrop = document.getElementById('contactBackdrop');
    const closeBtn = document.getElementById('contactClose');
    if (!btn || !overlay) return;

    let trapHandler = null;

    function openOverlay() {
        overlay.classList.add('active');
        overlay.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';

        // Focus trap: query all focusable elements inside the modal
        const modal = overlay.querySelector('.contact-modal');
        const focusable = modal.querySelectorAll(
            'input, button, textarea, select, a[href], [tabindex]:not([tabindex="-1"])'
        );
        const firstFocusable = focusable[0];
        const lastFocusable = focusable[focusable.length - 1];

        // Set initial focus to first input
        if (firstFocusable) firstFocusable.focus();

        // Tab trap
        trapHandler = (e) => {
            if (e.key !== 'Tab') return;
            if (e.shiftKey) {
                if (document.activeElement === firstFocusable) {
                    e.preventDefault();
                    lastFocusable.focus();
                }
            } else {
                if (document.activeElement === lastFocusable) {
                    e.preventDefault();
                    firstFocusable.focus();
                }
            }
        };
        document.addEventListener('keydown', trapHandler);
    }

    function closeOverlay() {
        overlay.classList.remove('active');
        overlay.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = '';

        // Clean up focus trap and return focus to trigger
        if (trapHandler) {
            document.removeEventListener('keydown', trapHandler);
            trapHandler = null;
        }
        btn.focus();
    }

    btn.addEventListener('click', openOverlay);
    backdrop.addEventListener('click', closeOverlay);
    closeBtn.addEventListener('click', closeOverlay);
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && overlay.classList.contains('active')) closeOverlay();
    });
}

/* ===== CLOSING VIDEO LAZY-LOAD ===== */
function initClosingVideoLazy() {
    const closingVideo = document.querySelector('.section-closing .hero-video-bg');
    if (!closingVideo) return;

    const source = closingVideo.querySelector('source');
    if (source) {
        const src = source.getAttribute('data-src');
        if (!src) return; // no data-src means nothing to lazy-load
        source.removeAttribute('data-src');
        closingVideo.removeAttribute('src');

        ScrollTrigger.create({
            trigger: '.section-closing',
            start: 'top 120%',
            once: true,
            onEnter: () => {
                source.setAttribute('src', src);
                closingVideo.load();
                closingVideo.play().catch(() => {});
            }
        });
    }
}

/* ===== SMOOTH SCROLL ===== */
function initSmoothScroll() {
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', e => {
            e.preventDefault();
            const target = document.querySelector(anchor.getAttribute('href'));
            if (target) {
                gsap.to(window, { scrollTo: { y: target, autoKill: false }, duration: 1.2, ease: 'power3.inOut' });
            }
        });
    });
}

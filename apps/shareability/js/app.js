/* ===================================
   SHAREABILITY — We Speak Internet
   Scroll-driven GSAP animation system
   =================================== */

document.addEventListener('DOMContentLoaded', () => {
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
        initScienceArt();
        initEmailDecode();
        initFeedScrollExit(fragments);
        initCardFlip();
        initClientWall();
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

    // Card tilt — equation cards
    document.querySelectorAll('.equation-card').forEach(card => {
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

/* ===== SCIENCE + ART ANIMATION ===== */
function initScienceArt() {
    const container = document.getElementById('scienceArt');
    if (!container) return;

    const science = container.querySelector('#saScience');
    const art = container.querySelector('#saArt');
    const connector = container.querySelector('.sa-connector');

    // Start words pushed apart
    gsap.set(science, { x: 30 });
    gsap.set(art, { x: -30 });

    ScrollTrigger.create({
        trigger: container,
        start: 'top 85%',
        once: true,
        onEnter: () => {
            // Words slide in from opposite sides
            gsap.to(science, { x: 0, duration: 0.7, ease: 'power3.out' });
            gsap.to(art, { x: 0, duration: 0.7, ease: 'power3.out', delay: 0.15 });

            // Fade in words
            setTimeout(() => {
                science.classList.add('visible');
                art.classList.add('visible');
            }, 100);

            // Connector expands between them
            setTimeout(() => {
                connector.classList.add('visible');
            }, 400);
        }
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

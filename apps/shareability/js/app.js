/* ===================================
   SHAREABILITY — An Ideation + Packaging Company
   Cinematic Scroll-Driven Experience
   =================================== */

document.addEventListener('DOMContentLoaded', () => {
    gsap.registerPlugin(ScrollTrigger, ScrollToPlugin);
    initLoader();
});

/* ===== LOADER ===== */
function initLoader() {
    const loader = document.getElementById('loader');
    const fill = document.getElementById('loaderFill');
    const images = document.querySelectorAll('img[src]');
    let loaded = 0;
    const total = images.length || 1;

    const updateProgress = () => {
        loaded++;
        const pct = Math.min((loaded / total) * 100, 100);
        fill.style.width = pct + '%';
        if (loaded >= total) {
            setTimeout(() => {
                loader.classList.add('hidden');
                setTimeout(revealHero, 200);
            }, 600);
        }
    };

    images.forEach(img => {
        if (img.complete) updateProgress();
        else {
            img.addEventListener('load', updateProgress);
            img.addEventListener('error', updateProgress);
        }
    });

    // Fallback timeout
    setTimeout(() => {
        if (!loader.classList.contains('hidden')) {
            fill.style.width = '100%';
            setTimeout(() => {
                loader.classList.add('hidden');
                setTimeout(revealHero, 200);
            }, 400);
        }
    }, 5000);
}

/* ===== HERO REVEAL ===== */
function revealHero() {
    const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });

    // Eyebrow line
    tl.to('.hero-eyebrow', {
        opacity: 1,
        duration: 1
    }, 0.3);

    // Title main (the big "Shareability")
    tl.to('.hero-title-main', {
        opacity: 1,
        y: 0,
        scale: 1,
        duration: 1.4,
        ease: 'power3.out'
    }, 0.5);

    // Tagline
    tl.to('.hero-tagline', {
        opacity: 0.9,
        y: 0,
        duration: 1
    }, 1.0);

    // Click prompt (replaces scroll prompt on main panel)
    tl.to('.hero-click-prompt', {
        opacity: 1,
        duration: 1
    }, 1.6);

    // Start other initializations after hero is revealed (but NOT nav yet)
    tl.add(() => {
        initHeroClickHandler();
        initNavigation();
        initParallax();
    }, 1);
}

/* ===== HERO CLICK TO ADVANCE ===== */
function initHeroClickHandler() {
    const hero = document.getElementById('hero');
    const heroMain = document.getElementById('heroMain');
    const heroHistory = document.getElementById('heroHistory');
    const nav = document.getElementById('nav');

    if (!hero || !heroMain || !heroHistory) return;

    let hasAdvanced = false;

    hero.addEventListener('click', () => {
        if (hasAdvanced) return;
        hasAdvanced = true;

        // Add class to trigger CSS transition
        hero.classList.add('hero-advanced');

        // After transition, show scroll prompt and nav, then init scroll animations
        setTimeout(() => {
            // Show scroll prompt on history panel
            gsap.to('.hero-panel-history .hero-scroll-prompt', {
                opacity: 1,
                duration: 0.8,
                ease: 'power2.out'
            });

            // Show nav
            nav.classList.add('visible');

            // Initialize scroll animations now
            initScrollAnimations();
        }, 900); // Match CSS transition duration
    });
}

/* ===== REUSABLE DOT-RECTANGLE ANIMATION ===== */
function animateDotRect(container, timeline, startLabel) {
    const dots = container.querySelectorAll('.dot-rect-dot');
    const lineTop = container.querySelector('.dot-line-top');
    const lineBottom = container.querySelector('.dot-line-bottom');
    const lineLeft = container.querySelector('.dot-line-left');
    const lineRight = container.querySelector('.dot-line-right');

    const pos = startLabel || '>';

    // Dots appear (scale from 0)
    timeline.to(dots, {
        opacity: 1,
        scale: 1,
        duration: 0.4,
        stagger: 0.08,
        ease: 'back.out(2)'
    }, pos);

    // Top line grows from center outward
    timeline.to(lineTop, {
        opacity: 0.35,
        scaleX: 1,
        duration: 0.5,
        ease: 'power2.out'
    }, pos + '+=0.3');

    // Bottom line grows from center outward
    timeline.to(lineBottom, {
        opacity: 0.35,
        scaleX: 1,
        duration: 0.5,
        ease: 'power2.out'
    }, pos + '+=0.4');

    // Left line grows top to bottom
    timeline.to(lineLeft, {
        opacity: 0.35,
        scaleY: 1,
        duration: 0.5,
        ease: 'power2.out'
    }, pos + '+=0.5');

    // Right line grows top to bottom
    timeline.to(lineRight, {
        opacity: 0.35,
        scaleY: 1,
        duration: 0.5,
        ease: 'power2.out'
    }, pos + '+=0.5');
}

/* ===== SCROLL ANIMATIONS ===== */
function initScrollAnimations() {
    // Animate all .anim-fade elements
    const fadeElements = document.querySelectorAll('.anim-fade');

    fadeElements.forEach(el => {
        const section = el.closest('.section');
        const siblings = section ? Array.from(section.querySelectorAll('.anim-fade')) : [el];
        const idx = siblings.indexOf(el);

        ScrollTrigger.create({
            trigger: el,
            start: 'top 88%',
            once: true,
            onEnter: () => {
                gsap.to(el, {
                    opacity: 1,
                    y: 0,
                    duration: 0.9,
                    delay: idx * 0.12,
                    ease: 'power2.out',
                    onStart: () => el.classList.add('visible')
                });
            }
        });
    });

    // Two Companies panels — scale in
    document.querySelectorAll('.tc-panel').forEach((panel, i) => {
        gsap.from(panel, {
            scale: 0.94,
            opacity: 0.4,
            duration: 1.4,
            delay: i * 0.15,
            ease: 'power2.out',
            scrollTrigger: {
                trigger: panel,
                start: 'top 82%',
                once: true
            }
        });
    });

    // Packaging grid cards — scale in with stagger
    document.querySelectorAll('.pack-card').forEach((card, i) => {
        gsap.from(card, {
            scale: 0.92,
            opacity: 0,
            duration: 1.2,
            delay: i * 0.12,
            ease: 'power2.out',
            scrollTrigger: {
                trigger: card,
                start: 'top 85%',
                once: true
            }
        });
    });

    // Portfolio cards — scale in
    document.querySelectorAll('.portfolio-card').forEach((card, i) => {
        gsap.from(card, {
            scale: 0.92,
            opacity: 0,
            duration: 1.0,
            delay: i * 0.12,
            ease: 'power2.out',
            scrollTrigger: {
                trigger: card,
                start: 'top 85%',
                once: true
            }
        });
    });

    // Down Home press images — staggered fade in with rotation
    const shakeProofFrames = document.querySelectorAll('.shake-proof-frame');
    if (shakeProofFrames.length) {
        shakeProofFrames.forEach((frame, i) => {
            gsap.from(frame, {
                opacity: 0,
                scale: 0.8,
                x: 60,
                duration: 1.0,
                delay: 0.3 + i * 0.25,
                ease: 'power3.out',
                scrollTrigger: {
                    trigger: '.shake-proof',
                    start: 'top 80%',
                    once: true
                }
            });
        });
    }

    // Advantages of EXIT — Staggered card animation
    initExitAdvantagesAnimation();

    // Mandate cards — scale in (also animate the plus sign)
    document.querySelectorAll('.mandate-card').forEach((card, i) => {
        gsap.from(card, {
            scale: 0.92,
            opacity: 0,
            duration: 1.2,
            delay: i * 0.15,
            ease: 'power2.out',
            scrollTrigger: {
                trigger: card,
                start: 'top 85%',
                once: true
            }
        });
    });

    // In Retrospect — row-by-row animation (tension box removed in Change 2)
    const retroHeader = document.querySelector('.retro-header');
    const retroRows = document.querySelectorAll('.retro-row');

    if (retroHeader) {
        gsap.from(retroHeader, {
            opacity: 0,
            y: 12,
            duration: 0.7,
            ease: 'power2.out',
            scrollTrigger: {
                trigger: retroHeader,
                start: 'top 88%',
                once: true
            }
        });
    }

    // Stagger rows with 1 second gaps for deliberate timing
    retroRows.forEach((row, i) => {
        gsap.from(row, {
            x: i % 2 === 0 ? -20 : 20,
            opacity: 0,
            duration: 0.8,
            delay: 0.5 + i * 1.0, // 1 second between each row
            ease: 'power2.out',
            scrollTrigger: {
                trigger: '.retrospect-table',
                start: 'top 85%',
                once: true
            }
        });
    });

    // Future headline — special scale entrance
    const futureHeadline = document.querySelector('.future-headline');
    if (futureHeadline) {
        gsap.from(futureHeadline, {
            scale: 0.8,
            opacity: 0,
            duration: 1.6,
            ease: 'power3.out',
            scrollTrigger: {
                trigger: futureHeadline,
                start: 'top 80%',
                once: true
            }
        });
    }

    // Why Packaging — click-to-advance interaction
    initWhyPackagingClickHandler();

    // Intelligence Grew — crowding out animation (Enhancement 6)
    initIntelGrewAnimation();

    // Intelligence = EXIT — staged reveal (Enhancement 9)
    initExitIntroAnimation();

    // Mission Statement — staggered word reveal
    initMissionAnimation();
}

/* ===== INTELLIGENCE GREW — STACKED WORD ANIMATION ===== */
function initIntelGrewAnimation() {
    const container = document.querySelector('.intel-grew-content');
    const contentWord = document.querySelector('.intel-era-content');
    const ventureWord = document.querySelector('.intel-era-venture');
    const intelWord = document.querySelector('.intel-era-intelligence');
    const body = document.querySelector('.intel-grew-body');

    if (!container || !contentWord || !ventureWord || !intelWord || !body) return;

    const tl = gsap.timeline({
        scrollTrigger: {
            trigger: container,
            start: 'top 78%',
            once: true
        }
    });

    // Step 1: All three words fade in at similar size
    tl.to([contentWord, ventureWord, intelWord], {
        opacity: 1,
        duration: 0.8,
        stagger: 0.15,
        ease: 'power2.out'
    }, 0);

    // Step 2: Intelligence grows large and turns blue; Content/Venture shrink and fade
    tl.to(intelWord, {
        fontSize: 'clamp(60px, 14vw, 120px)',
        color: '#5b7fb5',
        duration: 1.2,
        ease: 'power3.out'
    }, 1.0);

    tl.to(contentWord, {
        opacity: 0.08,
        fontSize: '16px',
        letterSpacing: '2px',
        duration: 1.0,
        ease: 'power2.in'
    }, 1.0);

    tl.to(ventureWord, {
        opacity: 0.08,
        fontSize: '16px',
        letterSpacing: '2px',
        duration: 1.0,
        ease: 'power2.in'
    }, 1.0);

    // Step 3: Body text fades in last
    tl.to(body, {
        opacity: 1,
        y: 0,
        duration: 0.9,
        ease: 'power2.out'
    }, 1.8);
}

/* ===== EXIT INTRO — WHITEBOARD ANIMATION ===== */
function initExitIntroAnimation() {
    const section = document.querySelector('.section-exit-intro');
    if (!section) return;

    const row1 = section.querySelector('.wb-row-1');
    const defineNote = section.querySelector('.wb-define-note');
    const arrow = section.querySelector('.wb-arrow');
    const arrowLine = section.querySelector('.wb-arrow-line');
    const arrowHead = section.querySelector('.wb-arrow-head');
    const row2 = section.querySelector('.wb-row-2');
    const highlights = section.querySelectorAll('.wb-highlight');
    const row3 = section.querySelector('.wb-row-3');
    const row4 = section.querySelector('.wb-row-4');
    const exitText = section.querySelector('.wb-exit-text');
    const boxLines = section.querySelectorAll('.wb-box-line');

    const tl = gsap.timeline({
        scrollTrigger: {
            trigger: section,
            start: 'top 70%',
            once: true
        }
    });

    // Step 1: INTELLIGENCE appears
    tl.to(row1, {
        opacity: 1,
        duration: 0.6,
        ease: 'power2.out'
    });

    // Step 2: "Define?" note appears centered below INTELLIGENCE
    tl.to(defineNote, {
        opacity: 1,
        duration: 0.5,
        ease: 'power2.out'
    }, '+=0.3');

    // Step 3: Blue arrow draws
    tl.to(arrow, { opacity: 1, duration: 0.2 }, '+=0.4');
    tl.to(arrowLine, {
        strokeDashoffset: 0,
        duration: 0.5,
        ease: 'power2.inOut'
    });
    tl.to(arrowHead, {
        strokeDashoffset: 0,
        duration: 0.3,
        ease: 'power2.out'
    });

    // Step 4: Definition appears
    tl.to(row2, {
        opacity: 1,
        duration: 0.6,
        ease: 'power2.out'
    }, '+=0.2');

    // Step 5: Highlight boxes draw around EX, I, T (staggered)
    highlights.forEach((hl, i) => {
        tl.to(hl, {
            '--highlight-opacity': 1,
            duration: 0.1
        }, '+=0.4');

        // Animate the ::after pseudo-element via a class
        tl.add(() => {
            hl.classList.add('highlighted');
        });
    });

    // Step 6: "aka" appears
    tl.to(row3, {
        opacity: 1,
        duration: 0.5,
        ease: 'power2.out'
    }, '+=0.5');

    // Step 7: EXIT text scales up
    tl.to(row4, { opacity: 1, duration: 0.2 }, '+=0.3');
    tl.to(exitText, {
        opacity: 1,
        scale: 1,
        duration: 0.8,
        ease: 'back.out(1.5)'
    });

    // Step 8: Box draws around EXIT
    tl.to('.wb-box-top', {
        opacity: 1,
        scaleX: 1,
        duration: 0.3,
        ease: 'power2.out'
    }, '+=0.2');
    tl.to('.wb-box-bottom', {
        opacity: 1,
        scaleX: 1,
        duration: 0.3,
        ease: 'power2.out'
    }, '-=0.1');
    tl.to('.wb-box-left', {
        opacity: 1,
        scaleY: 1,
        duration: 0.3,
        ease: 'power2.out'
    }, '-=0.2');
    tl.to('.wb-box-right', {
        opacity: 1,
        scaleY: 1,
        duration: 0.3,
        ease: 'power2.out'
    }, '-=0.2');
}

/* ===== NAVIGATION ===== */
function initNavigation() {
    const nav = document.getElementById('nav');
    const progressBar = document.getElementById('scrollProgress');
    const sectionLabel = document.getElementById('navSectionLabel');
    const sections = document.querySelectorAll('.section[data-section-name]');

    window.addEventListener('scroll', () => {
        const scrollTop = window.scrollY;
        const docHeight = document.documentElement.scrollHeight - window.innerHeight;
        const scrollPercent = (scrollTop / docHeight) * 100;
        progressBar.style.width = scrollPercent + '%';

        // Nav background
        if (scrollTop > 80) {
            nav.classList.add('scrolled');
        } else {
            nav.classList.remove('scrolled');
        }

        // Section label in nav
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
    }, { passive: true });
}

/* ===== PARALLAX ===== */
function initParallax() {
    // Background images parallax
    document.querySelectorAll('.bg-layer-img').forEach(img => {
        gsap.to(img, {
            y: '15%',
            ease: 'none',
            scrollTrigger: {
                trigger: img.closest('.section'),
                start: 'top bottom',
                end: 'bottom top',
                scrub: 1.5
            }
        });
    });

    // Subtle content lift as sections scroll in
    document.querySelectorAll('.section').forEach(section => {
        const content = section.querySelector('[class$="-content"]') ||
                        section.querySelector('[class$="-inner"]') ||
                        section.querySelector('[class$="-panels"]');
        if (!content) return;
        // Skip the hero — it has its own reveal
        if (section.classList.contains('section-hero')) return;

        gsap.from(content, {
            y: 24,
            ease: 'none',
            scrollTrigger: {
                trigger: section,
                start: 'top bottom',
                end: 'top 40%',
                scrub: 1.5
            }
        });
    });
}

/* ===== WHY PACKAGING — CLICK TO ADVANCE ===== */
function initWhyPackagingClickHandler() {
    const section = document.querySelector('.section-why-packaging');
    const introPanel = document.getElementById('wpIntro');
    const clickPrompt = section ? section.querySelector('.wp-click-prompt') : null;

    if (!section || !introPanel) return;

    let hasAdvanced = false;

    // Fade in click prompt when section enters viewport
    ScrollTrigger.create({
        trigger: section,
        start: 'top 80%',
        once: true,
        onEnter: () => {
            gsap.to(clickPrompt, {
                opacity: 1,
                duration: 0.8,
                delay: 0.5,
                ease: 'power2.out'
            });
        }
    });

    section.addEventListener('click', () => {
        if (hasAdvanced) return;
        hasAdvanced = true;

        section.classList.add('wp-advanced');

        // After panel slide transition, animate the contrast lines with stagger
        setTimeout(() => {
            const contrastContent = section.querySelector('.wp-contrast-content');
            if (contrastContent) {
                const dimLine = contrastContent.querySelector('.wp-contrast-dim');
                const boldLine = contrastContent.querySelector('.wp-contrast-bold');

                const tl = gsap.timeline();

                // First line fades in and slides up
                tl.to(dimLine, {
                    opacity: 0.5,
                    y: 0,
                    duration: 0.8,
                    ease: 'power2.out',
                    onComplete: () => dimLine.classList.add('visible')
                });

                // Second line fades in after a staggered delay
                tl.to(boldLine, {
                    opacity: 1,
                    y: 0,
                    duration: 1.0,
                    ease: 'power3.out'
                }, '+=0.3');
            }
        }, 800);
    });
}

/* ===== MISSION STATEMENT ANIMATION ===== */
function initMissionAnimation() {
    const section = document.querySelector('.section-mission');
    if (!section) return;

    const label = section.querySelector('.mission-label');
    const words = section.querySelectorAll('.mission-word');

    const tl = gsap.timeline({
        scrollTrigger: {
            trigger: section,
            start: 'top 70%',
            once: true
        }
    });

    // Step 1: Label fades in
    tl.to(label, {
        opacity: 1,
        y: 0,
        duration: 0.6,
        ease: 'power2.out'
    });

    // Step 2: Words reveal one by one with stagger
    tl.to(words, {
        opacity: 1,
        y: 0,
        duration: 0.5,
        stagger: 0.08,
        ease: 'power3.out'
    }, '-=0.2');
}

/* ===== ADVANTAGES OF EXIT — STAGGERED CARD ANIMATION ===== */
function initExitAdvantagesAnimation() {
    const section = document.querySelector('.section-exit-advantages');
    const cards = document.querySelectorAll('.exit-adv-card');

    if (!section || !cards.length) return;

    // Animate cards with stagger
    ScrollTrigger.create({
        trigger: section,
        start: 'top 75%',
        once: true,
        onEnter: () => {
            gsap.to(cards, {
                opacity: 1,
                y: 0,
                duration: 0.8,
                stagger: 0.15,
                ease: 'power2.out'
            });
        }
    });
}

/* ===== SMOOTH SCROLL ===== */
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', e => {
        e.preventDefault();
        const target = document.querySelector(anchor.getAttribute('href'));
        if (target) {
            gsap.to(window, {
                scrollTo: { y: target, autoKill: false },
                duration: 1.2,
                ease: 'power3.inOut'
            });
        }
    });
});

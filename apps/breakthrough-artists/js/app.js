/* ===================================
   BREAKTHROUGH PLAYBOOK — PITCHAPP
   Scroll-driven GSAP animation system
   =================================== */

document.addEventListener('DOMContentLoaded', () => {
    gsap.registerPlugin(ScrollTrigger);
    initLoader();
});

/* ===== LOADER ===== */
function initLoader() {
    const loader = document.getElementById('loader');
    const fill = document.getElementById('loaderFill');

    // Simulate loading progress
    let progress = 0;
    const interval = setInterval(() => {
        progress += Math.random() * 15;
        if (progress >= 100) {
            progress = 100;
            clearInterval(interval);
            fill.style.width = '100%';
            setTimeout(() => {
                loader.classList.add('hidden');
                setTimeout(revealHero, 200);
            }, 400);
        } else {
            fill.style.width = progress + '%';
        }
    }, 100);

    // Fallback: force reveal after 3 seconds
    setTimeout(() => {
        if (!loader.classList.contains('hidden')) {
            fill.style.width = '100%';
            setTimeout(() => {
                loader.classList.add('hidden');
                setTimeout(revealHero, 200);
            }, 400);
        }
    }, 3000);
}

/* ===== HERO REVEAL ===== */
function revealHero() {
    const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });

    // Eyebrow
    tl.to('.hero-eyebrow', {
        opacity: 1,
        duration: 1
    }, 0.2);

    // Title top ("The")
    tl.to('.hero-title-top', {
        opacity: 1,
        y: 0,
        duration: 1
    }, 0.4);

    // Title main ("Breakthrough")
    tl.to('.hero-title-main', {
        opacity: 1,
        y: 0,
        scale: 1,
        duration: 1.4,
        ease: 'power3.out'
    }, 0.6);

    // Title bottom ("Playbook")
    tl.to('.hero-title-bottom', {
        opacity: 1,
        y: 0,
        duration: 1
    }, 0.9);

    // Tagline
    tl.to('.hero-tagline', {
        opacity: 0.9,
        y: 0,
        duration: 1
    }, 1.2);

    // Scroll prompt
    tl.to('.hero-scroll-prompt', {
        opacity: 1,
        duration: 1
    }, 1.6);

    // Nav
    tl.add(() => {
        document.getElementById('nav').classList.add('visible');
    }, 1.4);

    // Start other initializations after hero is revealed
    tl.add(() => {
        initScrollAnimations();
        initNavigation();
        initCaseCards();
    }, 1);
}

/* ===== SCROLL ANIMATIONS ===== */
function initScrollAnimations() {
    // Helper: reliable scroll-reveal that locks visibility permanently
    function lockVisible(el) {
        gsap.set(el, { clearProps: 'opacity,y,x,scale,transform' });
        el.style.opacity = '1';
        el.style.transform = 'none';
        el.classList.add('visible');
    }

    // Track elements with specific animations so generic handler skips them
    const handled = new Set();

    // Pattern cards — scale in
    document.querySelectorAll('.pattern-card').forEach((card, i) => {
        handled.add(card);
        ScrollTrigger.create({
            trigger: card,
            start: 'top 85%',
            once: true,
            onEnter: () => {
                gsap.fromTo(card,
                    { scale: 0.95, opacity: 0 },
                    { scale: 1, opacity: 1, duration: 0.8, delay: i * 0.1, ease: 'power2.out', onComplete: () => lockVisible(card) }
                );
            }
        });
    });

    // Playbook items — slide from left
    const playbooks = document.querySelectorAll('.playbook-item');
    playbooks.forEach(item => handled.add(item));
    if (playbooks.length) {
        ScrollTrigger.create({
            trigger: '.playbooks-list',
            start: 'top 80%',
            once: true,
            onEnter: () => {
                playbooks.forEach((item, i) => {
                    gsap.fromTo(item,
                        { x: -24, opacity: 0 },
                        { x: 0, opacity: 1, duration: 0.6, delay: i * 0.08, ease: 'power2.out', onComplete: () => lockVisible(item) }
                    );
                });
            }
        });
    }

    // Case cards — staggered fade
    document.querySelectorAll('.case-card').forEach((card, i) => {
        handled.add(card);
        ScrollTrigger.create({
            trigger: card,
            start: 'top 90%',
            once: true,
            onEnter: () => {
                gsap.fromTo(card,
                    { y: 24, opacity: 0 },
                    { y: 0, opacity: 1, duration: 0.8, delay: i * 0.06, ease: 'power2.out', onComplete: () => lockVisible(card) }
                );
            }
        });
    });

    // Decision blocks — slide up
    document.querySelectorAll('.decision-block').forEach((block, i) => {
        handled.add(block);
        ScrollTrigger.create({
            trigger: block,
            start: 'top 85%',
            once: true,
            onEnter: () => {
                gsap.fromTo(block,
                    { y: 32, opacity: 0 },
                    { y: 0, opacity: 1, duration: 0.9, delay: i * 0.15, ease: 'power2.out', onComplete: () => lockVisible(block) }
                );
            }
        });
    });

    // Experiment cards — scale and fade
    document.querySelectorAll('.experiment-card').forEach((card, i) => {
        handled.add(card);
        ScrollTrigger.create({
            trigger: card,
            start: 'top 85%',
            once: true,
            onEnter: () => {
                gsap.fromTo(card,
                    { scale: 0.95, opacity: 0 },
                    { scale: 1, opacity: 1, duration: 0.8, delay: (i % 2) * 0.12, ease: 'power2.out', onComplete: () => lockVisible(card) }
                );
            }
        });
    });

    // Risk items — slide from left
    const risks = document.querySelectorAll('.risk-item');
    risks.forEach(item => handled.add(item));
    if (risks.length) {
        ScrollTrigger.create({
            trigger: '.risks-list',
            start: 'top 80%',
            once: true,
            onEnter: () => {
                risks.forEach((item, i) => {
                    gsap.fromTo(item,
                        { x: -20, opacity: 0 },
                        { x: 0, opacity: 1, duration: 0.6, delay: i * 0.1, ease: 'power2.out', onComplete: () => lockVisible(item) }
                    );
                });
            }
        });
    }

    // Next step items — stagger in
    document.querySelectorAll('.next-step-item').forEach((item, i) => {
        handled.add(item);
        ScrollTrigger.create({
            trigger: item,
            start: 'top 85%',
            once: true,
            onEnter: () => {
                gsap.fromTo(item,
                    { y: 24, opacity: 0 },
                    { y: 0, opacity: 1, duration: 0.8, delay: i * 0.15, ease: 'power2.out', onComplete: () => lockVisible(item) }
                );
            }
        });
    });

    // Exec summary items — scale in
    document.querySelectorAll('.exec-item').forEach((item, i) => {
        handled.add(item);
        ScrollTrigger.create({
            trigger: item,
            start: 'top 88%',
            once: true,
            onEnter: () => {
                gsap.fromTo(item,
                    { scale: 0.95, opacity: 0 },
                    { scale: 1, opacity: 1, duration: 0.7, delay: i * 0.1, ease: 'power2.out', onComplete: () => lockVisible(item) }
                );
            }
        });
    });

    // Ladder steps — stagger in
    document.querySelectorAll('.ladder-step').forEach((step, i) => {
        handled.add(step);
        ScrollTrigger.create({
            trigger: '.ladder-container',
            start: 'top 85%',
            once: true,
            onEnter: () => {
                gsap.fromTo(step,
                    { scale: 0.9, opacity: 0 },
                    { scale: 1, opacity: 1, duration: 0.5, delay: i * 0.06, ease: 'power2.out', onComplete: () => lockVisible(step) }
                );
            }
        });
    });

    // Generic anim-fade for remaining elements (not handled above)
    document.querySelectorAll('.anim-fade').forEach(el => {
        if (handled.has(el)) return;
        const section = el.closest('.section');
        const siblings = section ? Array.from(section.querySelectorAll('.anim-fade')).filter(s => !handled.has(s)) : [el];
        const idx = siblings.indexOf(el);

        ScrollTrigger.create({
            trigger: el,
            start: 'top 88%',
            once: true,
            onEnter: () => {
                gsap.to(el, {
                    opacity: 1,
                    y: 0,
                    duration: 0.8,
                    delay: idx * 0.1,
                    ease: 'power2.out',
                    onComplete: () => lockVisible(el)
                });
            }
        });
    });

    // Closing animation
    ScrollTrigger.create({
        trigger: '.section-closing',
        start: 'top 70%',
        once: true,
        onEnter: () => {
            const closingTl = gsap.timeline({ defaults: { ease: 'power2.out' } });

            closingTl.to('.closing-eyebrow', {
                opacity: 1,
                y: 0,
                duration: 0.8
            }, 0);

            closingTl.to('.closing-title-top', {
                opacity: 1,
                y: 0,
                duration: 0.8
            }, 0.1);

            closingTl.to('.closing-title-main', {
                opacity: 1,
                y: 0,
                scale: 1,
                duration: 1
            }, 0.2);

            closingTl.to('.closing-title-bottom', {
                opacity: 1,
                y: 0,
                duration: 0.8
            }, 0.4);

            closingTl.to('.closing-tagline', {
                opacity: 1,
                y: 0,
                duration: 0.8
            }, 0.5);

            closingTl.to('.closing-btn', {
                opacity: 1,
                y: 0,
                duration: 0.8
            }, 0.6);
        }
    });
}

/* ===== CASE CARD EXPANSION ===== */
function initCaseCards() {
    document.querySelectorAll('.case-card').forEach(card => {
        const content = card.querySelector('.case-expand-content');
        const header = card.querySelector('.case-card-header');

        // Only toggle on header click (not inner content)
        header.addEventListener('click', (e) => {
            const isExpanded = card.classList.contains('expanded');

            // Close all others with GSAP
            document.querySelectorAll('.case-card.expanded').forEach(c => {
                if (c !== card) {
                    const otherContent = c.querySelector('.case-expand-content');
                    c.classList.remove('expanded');
                    gsap.to(otherContent, {
                        height: 0,
                        duration: 0.4,
                        ease: 'power2.inOut'
                    });
                    gsap.to(otherContent.children, {
                        opacity: 0,
                        y: 10,
                        duration: 0.2,
                        stagger: 0
                    });
                }
            });

            if (!isExpanded) {
                card.classList.add('expanded');

                // Measure natural height
                content.style.height = 'auto';
                const naturalHeight = content.offsetHeight;
                content.style.height = '0px';

                // Animate open
                gsap.to(content, {
                    height: naturalHeight,
                    duration: 0.5,
                    ease: 'power2.out',
                    onComplete: () => {
                        content.style.height = 'auto';
                    }
                });

                // Fade in children
                gsap.fromTo(content.children,
                    { opacity: 0, y: 12 },
                    {
                        opacity: 1,
                        y: 0,
                        duration: 0.5,
                        delay: 0.15,
                        stagger: 0.08,
                        ease: 'power2.out'
                    }
                );

                // Smooth scroll to keep card in view
                setTimeout(() => {
                    const rect = card.getBoundingClientRect();
                    if (rect.top < 80) {
                        gsap.to(window, {
                            scrollTo: { y: window.scrollY + rect.top - 80 },
                            duration: 0.6,
                            ease: 'power2.inOut'
                        });
                    }
                }, 200);
            } else {
                card.classList.remove('expanded');
                gsap.to(content, {
                    height: 0,
                    duration: 0.4,
                    ease: 'power2.inOut'
                });
                gsap.to(content.children, {
                    opacity: 0,
                    y: 10,
                    duration: 0.2,
                    stagger: 0
                });
            }
        });

        // Prevent inner content clicks from toggling
        content.addEventListener('click', (e) => {
            e.stopPropagation();
        });
    });
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

        // Nav background on scroll
        if (scrollTop > 80) {
            nav.classList.add('scrolled');
        } else {
            nav.classList.remove('scrolled');
        }

        // Section label in nav + dark mode detection
        let currentSection = '';
        let isDarkSection = false;
        sections.forEach(section => {
            const rect = section.getBoundingClientRect();
            if (rect.top <= window.innerHeight * 0.4 && rect.bottom > 0) {
                currentSection = section.getAttribute('data-section-name');
                isDarkSection = section.classList.contains('section-dark');
            }
        });

        if (isDarkSection) {
            nav.classList.add('nav-dark');
        } else {
            nav.classList.remove('nav-dark');
        }

        if (currentSection) {
            sectionLabel.textContent = currentSection;
            sectionLabel.classList.add('active');
        } else {
            sectionLabel.classList.remove('active');
        }
    }, { passive: true });
}

/* ===== SMOOTH SCROLL ===== */
document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', e => {
            e.preventDefault();
            const target = document.querySelector(anchor.getAttribute('href'));
            if (target) {
                gsap.to(window, {
                    scrollTo: { y: target, offsetY: 0 },
                    duration: 1.2,
                    ease: 'power3.inOut'
                });
            }
        });
    });
});

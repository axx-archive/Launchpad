/* ===================================
   SHAREABILITY VENTURE STUDIO
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

    // Fallback: force reveal after 5 seconds
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

    // Zoom the background image in slowly
    tl.to('.hero-media-img', {
        scale: 1,
        duration: 2.5,
        ease: 'power2.out'
    }, 0);

    // Eyebrow
    tl.to('.hero-eyebrow', {
        opacity: 1,
        duration: 1
    }, 0.3);

    // Title top (A VENTURE STUDIO)
    tl.to('.hero-title-top', {
        opacity: 1,
        y: 0,
        duration: 1
    }, 0.5);

    // Title main (Shareability)
    tl.to('.hero-title-main', {
        opacity: 1,
        y: 0,
        scale: 1,
        duration: 1.4,
        ease: 'power3.out'
    }, 0.7);

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
    }, 1.8);

    // Nav
    tl.add(() => {
        document.getElementById('nav').classList.add('visible');
    }, 1.5);

    // Start other initializations after hero is revealed
    tl.add(() => {
        initScrollAnimations();
        initNavigation();
        initCounters();
        initParallax();
    }, 1);
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

    // Parallax on background images
    document.querySelectorAll('.hero-media-img, .bg-layer-img').forEach(img => {
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

    // Talent circles - scale and fade in with stagger
    const talentCircles = document.querySelectorAll('.talent-circle');
    if (talentCircles.length) {
        ScrollTrigger.create({
            trigger: '.talent-circles',
            start: 'top 80%',
            once: true,
            onEnter: () => {
                talentCircles.forEach((circle, i) => {
                    gsap.from(circle, {
                        scale: 0.6,
                        opacity: 0,
                        duration: 0.8,
                        delay: i * 0.1,
                        ease: 'back.out(1.5)'
                    });
                });
            }
        });
    }

    // Focus pillars - slide in from sides
    const focusPillars = document.querySelectorAll('.focus-pillar');
    if (focusPillars.length) {
        ScrollTrigger.create({
            trigger: '.focus-diagram',
            start: 'top 75%',
            once: true,
            onEnter: () => {
                focusPillars.forEach((pillar, i) => {
                    const direction = i === 0 ? -40 : (i === 2 ? 40 : 0);
                    const yDir = i === 1 ? -40 : 0;
                    gsap.from(pillar, {
                        x: direction,
                        y: yDir,
                        opacity: 0,
                        duration: 0.9,
                        delay: i * 0.15,
                        ease: 'power2.out'
                    });
                });
            }
        });
    }

    // Focus center - scale up
    const focusCenter = document.querySelector('.focus-center');
    if (focusCenter) {
        gsap.from(focusCenter, {
            scale: 0.8,
            opacity: 0,
            duration: 1.2,
            ease: 'power2.out',
            scrollTrigger: {
                trigger: focusCenter,
                start: 'top 80%',
                once: true
            }
        });
    }

    // Portfolio cards - scale in with stagger
    document.querySelectorAll('.section-portfolio').forEach(section => {
        const cards = section.querySelectorAll('.portfolio-card');
        if (cards.length) {
            ScrollTrigger.create({
                trigger: section,
                start: 'top 70%',
                once: true,
                onEnter: () => {
                    cards.forEach((card, i) => {
                        gsap.from(card, {
                            y: 30,
                            opacity: 0,
                            duration: 0.8,
                            delay: i * 0.1,
                            ease: 'power2.out'
                        });
                    });
                }
            });
        }
    });

    // Packaging steps - stagger in from bottom
    const packagingSteps = document.querySelectorAll('.packaging-step');
    if (packagingSteps.length) {
        ScrollTrigger.create({
            trigger: '.packaging-grid',
            start: 'top 75%',
            once: true,
            onEnter: () => {
                packagingSteps.forEach((step, i) => {
                    gsap.from(step, {
                        y: 40,
                        opacity: 0,
                        duration: 0.8,
                        delay: i * 0.1,
                        ease: 'power2.out'
                    });
                });
            }
        });
    }

    // Mandate cards - slide in from sides
    const mandateCards = document.querySelectorAll('.mandate-card');
    if (mandateCards.length) {
        ScrollTrigger.create({
            trigger: '.mandate-cards',
            start: 'top 78%',
            once: true,
            onEnter: () => {
                mandateCards.forEach((card, i) => {
                    gsap.from(card, {
                        x: i === 0 ? -40 : 40,
                        opacity: 0,
                        duration: 1,
                        delay: i * 0.15,
                        ease: 'power2.out'
                    });
                });
            }
        });
    }
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

        // Nav background blur on scroll
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

/* ===== COUNTER ANIMATIONS ===== */
function initCounters() {
    const statValues = document.querySelectorAll('[data-count]');

    statValues.forEach(stat => {
        const target = parseInt(stat.getAttribute('data-count'));
        const prefix = stat.getAttribute('data-prefix') || '';
        const suffix = stat.getAttribute('data-suffix') || '';

        ScrollTrigger.create({
            trigger: stat,
            start: 'top 82%',
            once: true,
            onEnter: () => {
                animateCounter(stat, target, prefix, suffix);
            }
        });
    });
}

function animateCounter(element, target, prefix, suffix) {
    const obj = { val: 0 };
    gsap.to(obj, {
        val: target,
        duration: 2.2,
        ease: 'power2.out',
        onUpdate: () => {
            element.textContent = prefix + Math.round(obj.val) + suffix;
        }
    });
}

/* ===== PARALLAX ===== */
function initParallax() {
    // Subtle content lift as sections scroll in
    document.querySelectorAll('.section').forEach(section => {
        const content = section.querySelector('[class$="-content"]') ||
                        section.querySelector('[class$="-inner"]') ||
                        section.querySelector('[class$="-layout"]') ||
                        section.querySelector('[class$="-diagram"]');
        if (!content) return;

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

/* ===================================
   ONE NIGHT IN NASHVILLE — Elevated
   Cinematic Scroll-Driven Experience
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

    // Fallback
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

    // Title top
    tl.to('.hero-title-top', {
        opacity: 1,
        y: 0,
        duration: 1
    }, 0.5);

    // Title main (the big "Nashville")
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
    document.querySelectorAll('.hero-media-img, .show-bg-img, .ilm-bg-img, .location-bg-img, .district-bg-img, .closing-bg-img, .abba-bg-img, .limits-bg-img').forEach(img => {
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

    // Stars gallery — scale in
    document.querySelectorAll('.stars-card').forEach((card, i) => {
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

    // Limitations — slide from left
    const limitsItems = document.querySelectorAll('.limits-item');
    if (limitsItems.length) {
        ScrollTrigger.create({
            trigger: '.limits-list',
            start: 'top 78%',
            once: true,
            onEnter: () => {
                limitsItems.forEach((item, i) => {
                    gsap.from(item, {
                        x: -24,
                        opacity: 0,
                        duration: 0.7,
                        delay: i * 0.12,
                        ease: 'power2.out'
                    });
                });
            }
        });
    }

    // Day/Night panels — scale
    document.querySelectorAll('.daynight-panel').forEach((panel, i) => {
        gsap.from(panel, {
            scale: 0.94,
            opacity: 0.4,
            duration: 1.4,
            delay: i * 0.2,
            ease: 'power2.out',
            scrollTrigger: {
                trigger: panel,
                start: 'top 82%',
                once: true
            }
        });
    });

    // Summary blocks — alternating slide
    document.querySelectorAll('.summary-block').forEach((block, i) => {
        gsap.from(block, {
            x: i % 2 === 0 ? -20 : 20,
            opacity: 0,
            duration: 0.8,
            delay: i * 0.1,
            ease: 'power2.out',
            scrollTrigger: {
                trigger: block,
                start: 'top 88%',
                once: true
            }
        });
    });

    // Venue image clip reveal
    const venueImg = document.querySelector('.venue-img-wrap');
    if (venueImg) {
        gsap.from(venueImg, {
            clipPath: 'inset(0 100% 0 0)',
            duration: 1.4,
            ease: 'power3.inOut',
            scrollTrigger: {
                trigger: venueImg,
                start: 'top 75%',
                once: true
            }
        });
    }

    // Ernest image clip reveal
    const ernestImg = document.querySelector('.ernest-img-wrap');
    if (ernestImg) {
        gsap.from(ernestImg, {
            clipPath: 'inset(0 100% 0 0)',
            duration: 1.4,
            ease: 'power3.inOut',
            scrollTrigger: {
                trigger: ernestImg,
                start: 'top 75%',
                once: true
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

/* ===== COUNTER ANIMATIONS ===== */
function initCounters() {
    const statValues = document.querySelectorAll('.abba-stat-val[data-count]');

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
                        section.querySelector('[class$="-layout"]');
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

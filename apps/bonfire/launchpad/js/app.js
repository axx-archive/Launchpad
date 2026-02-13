/* ===================================
   LAUNCHPAD — Marketing Page
   Scroll-driven GSAP animation system
   =================================== */

document.addEventListener('DOMContentLoaded', () => {
    gsap.registerPlugin(ScrollTrigger, ScrollToPlugin);
    initLoader();
});

/* ===== LOADER ===== */
function initLoader() {
    const loader = document.getElementById('loader');

    // Letter animation is the intro — wait for it, then reveal hero
    setTimeout(() => {
        loader.classList.add('hidden');
        setTimeout(revealHero, 200);
    }, 1000);
}

/* ===== HERO REVEAL ===== */
function revealHero() {
    const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });

    // Grid background (scoped to hero)
    tl.to('.section-hero .hero-grid-bg', {
        opacity: 1,
        duration: 2,
        ease: 'power2.out'
    }, 0);

    // Glow
    const glow = document.querySelector('.hero-glow');
    if (glow) {
        gsap.set(glow, { xPercent: -50, yPercent: -50 });
        tl.to(glow, {
            opacity: 1,
            scale: 1,
            duration: 2.5,
            ease: 'power2.out'
        }, 0.2);
    }

    // Eyebrow
    tl.to('.hero-eyebrow', {
        opacity: 1,
        duration: 1
    }, 0.3);

    // Title main
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

    // Scroll prompt
    tl.to('.hero-scroll-prompt', {
        opacity: 1,
        duration: 1
    }, 1.6);

    // Nav
    tl.add(() => {
        document.getElementById('nav').classList.add('visible');
    }, 1.2);

    // Init other systems
    tl.add(() => {
        initScrollAnimations();
        initNavigation();
        initGlowInteraction();
        initTerminal();
    }, 0.8);
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

    // Feature cards — scale in (CSS default: opacity: 0; transform: scale(0.94))
    document.querySelectorAll('.feature-card').forEach((card, i) => {
        gsap.to(card, {
            scale: 1,
            opacity: 1,
            duration: 1,
            delay: i * 0.12,
            ease: 'power2.out',
            scrollTrigger: {
                trigger: card,
                start: 'top 88%',
                once: true
            }
        });
    });

    // Contrast cards — scale in
    document.querySelectorAll('.contrast-card').forEach((card, i) => {
        gsap.to(card, {
            scale: 1,
            opacity: 1,
            duration: 1,
            delay: i * 0.15,
            ease: 'power2.out',
            scrollTrigger: {
                trigger: card,
                start: 'top 85%',
                once: true
            }
        });
    });

    // Subtle content lift on section scroll
    document.querySelectorAll('.section').forEach(section => {
        const content = section.querySelector('[class$="-content"]') ||
                        section.querySelector('[class$="-inner"]');
        if (!content || section.classList.contains('section-hero')) return;

        gsap.fromTo(content,
            { y: 24 },
            {
                y: 0,
                ease: 'none',
                scrollTrigger: {
                    trigger: section,
                    start: 'top bottom',
                    end: 'top 40%',
                    scrub: 1.5
                }
            }
        );
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

        if (scrollTop > 80) {
            nav.classList.add('scrolled');
        } else {
            nav.classList.remove('scrolled');
        }

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

/* ===== GLOW INTERACTION ===== */
function initGlowInteraction() {
    const heroGlow = document.querySelector('.hero-glow');
    if (!heroGlow) return;

    gsap.set(heroGlow, { xPercent: -50, yPercent: -50 });

    const isMobile = window.matchMedia('(pointer: coarse)').matches;
    const hero = document.querySelector('.section-hero');

    if (isMobile) {
        // Ambient drift on mobile + tap to reposition
        function glowDrift() {
            const hw = hero.offsetWidth;
            const hh = hero.offsetHeight;
            gsap.to(heroGlow, {
                left: hw * (0.2 + Math.random() * 0.6),
                top: hh * (0.25 + Math.random() * 0.5),
                xPercent: -50,
                yPercent: -50,
                duration: 1.5 + Math.random() * 1.5,
                ease: 'sine.inOut',
                onComplete: glowDrift
            });
        }
        glowDrift();

        hero.addEventListener('touchstart', (e) => {
            const touch = e.touches[0];
            const rect = hero.getBoundingClientRect();
            gsap.killTweensOf(heroGlow);
            gsap.to(heroGlow, {
                left: touch.clientX - rect.left,
                top: touch.clientY - rect.top,
                xPercent: -50,
                yPercent: -50,
                duration: 0.6,
                ease: 'power2.out',
                onComplete: glowDrift
            });
        }, { passive: true });
    } else {
        // Desktop — cursor following
        hero.addEventListener('mousemove', (e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            gsap.to(heroGlow, {
                left: e.clientX - rect.left,
                top: e.clientY - rect.top,
                xPercent: -50,
                yPercent: -50,
                duration: 1.5,
                ease: 'power2.out'
            });
        });
    }
}

/* ===== TERMINAL TYPING ===== */
function initTerminal() {
    const terminal = document.getElementById('terminal');
    const body = document.getElementById('terminalBody');
    if (!terminal || !body) return;

    const lines = [
        { type: 'cmd', prompt: '$ ', text: 'launchpad init --project "your pitch"' },
        { type: 'output', text: 'scanning uploaded materials...' },
        { type: 'success', text: '✓ transcript processed' },
        { type: 'success', text: '✓ narrative extracted' },
        { type: 'success', text: '✓ sections designed' },
        { type: 'output', text: '' },
        { type: 'cmd', prompt: '$ ', text: 'launchpad build --deploy' },
        { type: 'success', text: '✓ pitchapp built' },
        { type: 'success', text: '✓ deployed to vercel' },
        { type: 'success', text: '✓ analytics enabled' },
        { type: 'output', text: '' },
        { type: 'highlight', text: 'your pitch is live. share the URL.' },
        { type: 'cmd', prompt: '$ ', text: '', cursor: true }
    ];

    let fired = false;

    ScrollTrigger.create({
        trigger: terminal,
        start: 'top 80%',
        once: true,
        onEnter: () => {
            if (fired) return;
            fired = true;

            gsap.to(terminal, {
                opacity: 1,
                y: 0,
                duration: 0.8,
                ease: 'power2.out',
                onComplete: () => typeLines(body, lines, 0)
            });
        }
    });
}

function typeLines(container, lines, index) {
    if (index >= lines.length) return;

    const line = lines[index];
    const div = document.createElement('div');
    div.className = 'terminal-line';
    container.appendChild(div);

    if (line.type === 'output' && line.text === '') {
        div.innerHTML = '&nbsp;';
        setTimeout(() => typeLines(container, lines, index + 1), 150);
        return;
    }

    let prefix = '';
    let spanClass = line.type;
    if (line.type === 'cmd') {
        prefix = '<span class="prompt">' + line.prompt + '</span>';
        spanClass = 'cmd';
    }

    const textToType = line.text;

    if (line.cursor && !textToType) {
        div.innerHTML = prefix + '<span class="terminal-cursor"></span>';
        return;
    }

    div.innerHTML = prefix + '<span class="' + spanClass + '"></span>';
    const span = div.querySelector('.' + spanClass);
    let charIdx = 0;
    const speed = line.type === 'cmd' ? 35 : 18;

    const typeChar = () => {
        if (charIdx < textToType.length) {
            span.textContent += textToType[charIdx];
            charIdx++;
            container.scrollTop = container.scrollHeight;
            setTimeout(typeChar, speed);
        } else {
            const pause = line.type === 'cmd' ? 400 : 120;
            setTimeout(() => typeLines(container, lines, index + 1), pause);
        }
    };

    typeChar();
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

/* ===================================
   BONFIRE LABS — Venture Studio
   Scroll-driven GSAP animation system
   =================================== */

document.addEventListener('DOMContentLoaded', () => {
    gsap.registerPlugin(ScrollTrigger, ScrollToPlugin);
    initLoader();
});

/* ===== LOADER ===== */
function initLoader() {
    const loader = document.getElementById('loader');

    // Letter animation is the intro — no fake progress bar
    // Wait for letters to animate in (~800ms), then reveal hero
    setTimeout(() => {
        loader.classList.add('hidden');
        setTimeout(revealHero, 200);
    }, 1000);
}

/* ===== HERO REVEAL ===== */
function revealHero() {
    const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });

    // Grid background fade in (scoped to hero to avoid hitting closing section)
    tl.from('.section-hero .hero-grid-bg', {
        opacity: 0,
        duration: 2,
        ease: 'power2.out'
    }, 0);

    // Glow pulse in
    tl.from('.hero-glow', {
        opacity: 0,
        scale: 0.6,
        duration: 2.5,
        ease: 'power2.out'
    }, 0.2);

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

    // Title main
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

    // Init other systems
    tl.add(() => {
        initScrollAnimations();
        initNavigation();
        initCardInteractions();
        initTerminal();
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

    // Product cards — staggered scale-in (using gsap.to with CSS default hidden state)
    document.querySelectorAll('.product-card').forEach((card, i) => {
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

    // Subtle content lift as sections scroll in
    document.querySelectorAll('.section').forEach(section => {
        const content = section.querySelector('[class$="-content"]') ||
                        section.querySelector('[class$="-inner"]');
        if (!content || section.classList.contains('section-hero')) return;

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

/* ===== CARD INTERACTIONS ===== */
function initCardInteractions() {
    // All cards — subtle tilt on mousemove
    document.querySelectorAll('.product-card').forEach(card => {
        card.addEventListener('mousemove', (e) => {
            const rect = card.getBoundingClientRect();
            const x = (e.clientX - rect.left) / rect.width - 0.5;
            const y = (e.clientY - rect.top) / rect.height - 0.5;

            gsap.to(card, {
                rotateY: x * 4,
                rotateX: -y * 4,
                duration: 0.4,
                ease: 'power2.out',
                transformPerspective: 800
            });
        });

        card.addEventListener('mouseleave', () => {
            gsap.to(card, {
                rotateY: 0,
                rotateX: 0,
                duration: 0.6,
                ease: 'power2.out'
            });
        });
    });

    // Glow interaction on hero
    const heroGlow = document.querySelector('.hero-glow');
    if (heroGlow) {
        gsap.set(heroGlow, { xPercent: -50, yPercent: -50 });

        const isMobile = window.matchMedia('(pointer: coarse)').matches;

        if (isMobile) {
            // Fast ambient drift + tap to move
            const hero = document.querySelector('.section-hero');

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

            // Tap to move glow
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
            // Desktop — follows cursor
            document.querySelector('.section-hero').addEventListener('mousemove', (e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const y = e.clientY - rect.top;

                gsap.to(heroGlow, {
                    left: x,
                    top: y,
                    xPercent: -50,
                    yPercent: -50,
                    duration: 1.5,
                    ease: 'power2.out'
                });
            });
        }
    }
}

/* ===== TERMINAL TYPING ===== */
function initTerminal() {
    const terminal = document.getElementById('terminal');
    const body = document.getElementById('terminalBody');
    if (!terminal || !body) return;

    const lines = [
        { type: 'cmd', prompt: '$ ', text: 'bonfire init --session new' },
        { type: 'output', text: 'initializing bonfire labs agent cluster...' },
        { type: 'output', text: '' },
        { type: 'success', text: '✓ telescope scanning cultural signals' },
        { type: 'success', text: '✓ bullseye loading development pipeline' },
        { type: 'success', text: '✓ horizon syncing deal flow' },
        { type: 'success', text: '✓ moonshot packaging engine online' },
        { type: 'success', text: '✓ mirage rendering engine standby' },
        { type: 'output', text: '' },
        { type: 'highlight', text: '6 agents online. ready to build.' },
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

            // Fade in the terminal
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

    // Empty line — just pause and move on
    if (line.type === 'output' && line.text === '') {
        div.innerHTML = '&nbsp;';
        setTimeout(() => typeLines(container, lines, index + 1), 150);
        return;
    }

    // Build the content to type
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

    // Type character by character
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
            // Line done — pause then next
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

/* ===================================
   LAUNCHPAD — Pitch Experiences
   Scroll-driven GSAP animation system
   =================================== */

document.addEventListener('DOMContentLoaded', () => {
    gsap.registerPlugin(ScrollTrigger, ScrollToPlugin);
    initLoader();
});

/* ===== LOADER ===== */
function initLoader() {
    const loader = document.getElementById('loader');

    // Rocket liftoff animation runs via CSS (~1.8s delay + flight)
    // Wait for the full sequence, then reveal hero
    setTimeout(() => {
        loader.classList.add('hidden');
        setTimeout(revealHero, 200);
    }, 2800);
}

/* ===== HERO REVEAL ===== */
function revealHero() {
    const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });

    tl.from('.section-hero .hero-grid-bg', {
        opacity: 0,
        duration: 2,
        ease: 'power2.out'
    }, 0);

    tl.from('.hero-glow', {
        opacity: 0,
        scale: 0.6,
        duration: 2.5,
        ease: 'power2.out'
    }, 0.2);

    tl.to('.hero-eyebrow', {
        opacity: 1,
        duration: 1
    }, 0.3);

    tl.to('.hero-title-main', {
        opacity: 1,
        y: 0,
        scale: 1,
        duration: 1.4,
        ease: 'power3.out'
    }, 0.5);

    tl.to('.hero-tagline', {
        opacity: 0.9,
        y: 0,
        duration: 1
    }, 1.0);

    tl.to('.hero-scroll-prompt', {
        opacity: 1,
        duration: 1
    }, 1.6);

    tl.add(() => {
        document.getElementById('nav').classList.add('visible');
    }, 1.3);

    tl.add(() => {
        initScrollAnimations();
        initNavigation();
        initCardInteractions();
        initTerminalForm();
    }, 0.8);
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

    // Product cards stagger
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

    // Process steps stagger
    document.querySelectorAll('.process-step').forEach((step, i) => {
        gsap.to(step, {
            opacity: 1,
            y: 0,
            duration: 0.9,
            delay: i * 0.12,
            ease: 'power2.out',
            scrollTrigger: {
                trigger: step,
                start: 'top 88%',
                once: true
            }
        });
    });

    // Content lift on scroll
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

/* ===== CARD INTERACTIONS ===== */
function initCardInteractions() {
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

    // Hero glow interaction
    const heroGlow = document.querySelector('.hero-glow');
    if (heroGlow) {
        gsap.set(heroGlow, { xPercent: -50, yPercent: -50 });

        const isMobile = window.matchMedia('(pointer: coarse)').matches;

        if (isMobile) {
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
            document.querySelector('.section-hero').addEventListener('mousemove', (e) => {
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
}

/* ===== TERMINAL FORM ===== */
function initTerminalForm() {
    const terminal = document.getElementById('requestTerminal');
    if (!terminal) return;

    // Fade in terminal on scroll
    ScrollTrigger.create({
        trigger: terminal,
        start: 'top 80%',
        once: true,
        onEnter: () => {
            gsap.to(terminal, {
                opacity: 1,
                y: 0,
                duration: 0.8,
                ease: 'power2.out'
            });
        }
    });

    // Option button selection
    document.querySelectorAll('.terminal-options').forEach(group => {
        group.querySelectorAll('.terminal-option').forEach(btn => {
            btn.addEventListener('click', () => {
                group.querySelectorAll('.terminal-option').forEach(b => b.classList.remove('selected'));
                btn.classList.add('selected');
            });
        });
    });

    // Form submission
    const form = document.getElementById('launchpadForm');
    form.addEventListener('submit', handleFormSubmit);
}

function handleFormSubmit(e) {
    e.preventDefault();

    const form = e.target;
    const formData = new FormData(form);

    // Collect option button values
    document.querySelectorAll('.terminal-options').forEach(group => {
        const name = group.dataset.name;
        const selected = group.querySelector('.terminal-option.selected');
        if (selected) {
            formData.set(name, selected.dataset.value);
        }
    });

    const data = Object.fromEntries(formData.entries());
    const company = data.company || 'Unknown';

    // Transition: fade out form, show confirmation
    const formState = document.getElementById('formState');
    const confirmState = document.getElementById('confirmState');
    const titleEl = document.getElementById('terminalTitle');

    gsap.to(formState, {
        opacity: 0,
        duration: 0.4,
        ease: 'power2.in',
        onComplete: () => {
            formState.style.display = 'none';
            confirmState.style.display = 'block';
            titleEl.textContent = 'launchpad — agents activated';
            titleEl.style.color = '#28c840';

            // Type the confirmation lines
            const lines = [
                { type: 'cmd', prompt: '$ ', text: 'launchpad init --company "' + company + '"' },
                { type: 'output', text: 'initializing launchpad pipeline...' },
                { type: 'output', text: '' },
                { type: 'success', text: '✓ @narrative-strategist activated — finding your story' },
                { type: 'success', text: '✓ @copywriter on standby — ready for copy generation' },
                { type: 'success', text: '✓ @pitchapp-developer queued — build pipeline ready' },
                { type: 'success', text: '✓ @visual-qa scheduled — quality review pending' },
                { type: 'success', text: '✓ @code-reviewer armed — GSAP + responsive checks loaded' },
                { type: 'output', text: '' },
                { type: 'highlight', text: '5 agents online. your launchpad is in the queue.' },
                { type: 'output', text: '' },
                { type: 'output', text: 'you\'ll hear from us within 48 hours.' },
                { type: 'cmd', prompt: '$ ', text: '', cursor: true }
            ];

            typeLines(confirmState, lines, 0);

            // Send the data (non-blocking)
            submitToBackend(data);
        }
    });
}

function submitToBackend(data) {
    // POST to serverless function — fails silently if not configured
    fetch('/api/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    }).catch(() => {
        // Silent fail — the animation is the experience
        // Backend can be wired up later
    });
}

/* ===== TERMINAL TYPING ENGINE ===== */
function typeLines(container, lines, index) {
    if (index >= lines.length) return;

    const line = lines[index];
    const div = document.createElement('div');
    div.className = 'terminal-line';
    container.appendChild(div);

    // Empty line
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
    const speed = line.type === 'cmd' ? 30 : 15;

    const typeChar = () => {
        if (charIdx < textToType.length) {
            span.textContent += textToType[charIdx];
            charIdx++;
            container.scrollTop = container.scrollHeight;
            setTimeout(typeChar, speed);
        } else {
            const pause = line.type === 'cmd' ? 400 : 100;
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

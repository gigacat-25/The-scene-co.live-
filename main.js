// 1. Custom Interactive Cursor
const cursorDot = document.getElementById('cursor-dot');
const cursorRing = document.getElementById('cursor-ring');

if (cursorDot && cursorRing) {
    let mouseX = 0, mouseY = 0;
    let ringX = 0, ringY = 0;

    document.addEventListener('mousemove', (e) => {
        mouseX = e.clientX;
        mouseY = e.clientY;
        
        cursorDot.style.transform = `translate3d(${mouseX}px, ${mouseY}px, 0) translate(-50%, -50%)`;
    });

    // Smooth trailing effect for cursor ring
    function animateRing() {
        const ease = 0.12;
        ringX += (mouseX - ringX) * ease;
        ringY += (mouseY - ringY) * ease;
        
        cursorRing.style.transform = `translate3d(${ringX}px, ${ringY}px, 0) translate(-50%, -50%)`;
        
        requestAnimationFrame(animateRing);
    }
    animateRing();

    // Hover target scaling using event delegation
    document.addEventListener('mouseover', (e) => {
        if (e.target.closest('.hover-target')) {
            document.body.classList.add('custom-cursor-hover');
        } else {
            document.body.classList.remove('custom-cursor-hover');
        }
    });

    // Hide cursor when leaving window
    document.addEventListener('mouseleave', () => {
        cursorDot.style.opacity = '0';
        cursorRing.style.opacity = '0';
    });
    document.addEventListener('mouseenter', () => {
        cursorDot.style.opacity = '1';
        cursorRing.style.opacity = '1';
    });
}

// 2. Mobile Menu Toggle
const mobileToggle = document.getElementById('mobile-toggle');
const navLinks = document.getElementById('nav-links');

if (mobileToggle && navLinks) {
    mobileToggle.addEventListener('click', () => {
        navLinks.classList.toggle('active');
        const icon = mobileToggle.querySelector('span');
        if (navLinks.classList.contains('active')) {
            icon.textContent = 'close';
        } else {
            icon.textContent = 'menu';
        }
    });

    // Close menu on nav click
    navLinks.querySelectorAll('a').forEach(link => {
        link.addEventListener('click', () => {
            navLinks.classList.remove('active');
            mobileToggle.querySelector('span').textContent = 'menu';
        });
    });
}

// 3. Scroll Reveal using Intersection Observer
const revealCallback = (entries, observer) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.classList.add('active');
            observer.unobserve(entry.target); // Performance optimization: stop observing once revealed
        }
    });
};

const revealObserver = new IntersectionObserver(revealCallback, {
    root: null,
    threshold: 0.1,
    rootMargin: '0px 0px -50px 0px'
});

document.querySelectorAll('.reveal').forEach(el => {
    revealObserver.observe(el);
});

// 4. FAQ Accordion functionality
const faqTriggers = document.querySelectorAll('.faq-trigger');
if (faqTriggers.length > 0) {
    faqTriggers.forEach(trigger => {
        trigger.addEventListener('click', () => {
            const item = trigger.parentElement;
            const content = item.querySelector('.faq-content');
            const isActive = item.classList.contains('active');

            // Collapse all items first
            document.querySelectorAll('.faq-item').forEach(otherItem => {
                otherItem.classList.remove('active');
                const otherContent = otherItem.querySelector('.faq-content');
                if (otherContent) otherContent.style.maxHeight = null;
            });

            // Toggle target item
            if (!isActive && content) {
                item.classList.add('active');
                content.style.maxHeight = content.scrollHeight + 'px';
            }
        });
    });
}

// 5. Contact Form floating label behavior & simple submit feedback
const briefForm = document.getElementById('brief-form');
if (briefForm) {
    briefForm.addEventListener('submit', (e) => {
        e.preventDefault();
        
        // Simple success toast
        const btn = briefForm.querySelector('button');
        if (btn) {
            const originalText = btn.textContent;
            btn.textContent = 'Brief Sent Successfully!';
            btn.style.backgroundColor = 'var(--lime)';
            btn.style.borderColor = 'var(--lime)';
            btn.style.color = 'var(--bg-dark)';
            
            setTimeout(() => {
                briefForm.reset();
                btn.textContent = originalText;
                btn.style.backgroundColor = '';
                btn.style.borderColor = '';
                btn.style.color = '';
            }, 3000);
        }
    });
}

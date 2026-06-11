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

// 5. Contact Form submission to Cloudflare API
const briefForm = document.getElementById('brief-form');
if (briefForm) {
    briefForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const btn = briefForm.querySelector('button');
        if (!btn) return;
        
        const originalText = btn.textContent;
        btn.textContent = 'Sending Brief...';
        btn.disabled = true;
        
        // Retrieve values
        const nameVal = document.getElementById('name')?.value;
        const orgVal = document.getElementById('org')?.value || 'N/A';
        const emailVal = document.getElementById('email')?.value;
        
        const classificationSelect = document.getElementById('classification');
        const classificationText = classificationSelect?.options[classificationSelect.selectedIndex]?.text || '';
        
        const budgetSelect = document.getElementById('budget');
        const budgetText = budgetSelect?.options[budgetSelect.selectedIndex]?.text || '';
        
        const dateRegionVal = document.getElementById('date-region')?.value;
        const briefVal = document.getElementById('brief')?.value;
        
        const payload = {
            name: nameVal,
            email: emailVal,
            project_type: classificationText,
            budget: budgetText,
            timeline: dateRegionVal,
            details: `Organization: ${orgVal}\n\nBrief Vision Summary: ${briefVal}`
        };
        
        try {
            const res = await fetch('/api/inquiries', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to submit inquiry');
            
            btn.textContent = 'Brief Sent Successfully!';
            btn.style.backgroundColor = 'var(--lime)';
            btn.style.borderColor = 'var(--lime)';
            btn.style.color = 'var(--bg-dark)';
            
            briefForm.reset();
        } catch (err) {
            console.error('Error submitting brief:', err);
            btn.textContent = 'Error sending brief. Try again.';
            btn.style.backgroundColor = '#ef4444';
            btn.style.borderColor = '#ef4444';
            btn.style.color = '#fff';
        } finally {
            setTimeout(() => {
                btn.textContent = originalText;
                btn.style.backgroundColor = '';
                btn.style.borderColor = '';
                btn.style.color = '';
                btn.disabled = false;
            }, 4000);
        }
    });
}

// 6. Dynamic Content Loading from Cloudflare D1
async function loadDynamicContent() {
    // 6a. Load Projects on index.html (recent works) and portfolio.html
    const featuredGrid = document.querySelector('.featured-grid');
    const portfolioGrid = document.querySelector('.portfolio-grid');
    
    if (featuredGrid || portfolioGrid) {
        try {
            const res = await fetch('/api/projects');
            if (res.ok) {
                const projects = await res.json();
                
                if (projects && projects.length > 0) {
                    // Render portfolio page grid
                    if (portfolioGrid) {
                        portfolioGrid.innerHTML = projects.map(proj => {
                            const colSpan = proj.col_span || 3;
                            const cardClass = proj.card_class || 'card-magenta';
                            const accentColor = cardClass.split('-')[1] || 'magenta';
                            return `
                                <div class="portfolio-card col-span-${colSpan} ${cardClass} hover-target">
                                    <img class="portfolio-image" alt="Project ${proj.title}" src="${proj.image_url}" loading="lazy" decoding="async" />
                                    <div class="portfolio-overlay">
                                        <div class="portfolio-meta">
                                            <span class="portfolio-tag tag-${accentColor}">${proj.category}</span>
                                            <span class="portfolio-tag tag-blue">${proj.location}</span>
                                        </div>
                                        <h3>Project: ${proj.title}</h3>
                                        <p>${proj.description}</p>
                                    </div>
                                </div>
                            `;
                        }).join('');
                    }
                    
                    // Render homepage highlights grid (first 3 items)
                    if (featuredGrid) {
                        const homepageProjects = projects.slice(0, 3);
                        featuredGrid.innerHTML = homepageProjects.map(proj => {
                            const cardClass = proj.card_class || 'card-magenta';
                            const accentColor = cardClass.split('-')[1] || 'magenta';
                            return `
                                <div class="featured-card hover-target">
                                    <div class="featured-image-wrapper">
                                        <img class="featured-image" alt="Project ${proj.title}" src="${proj.image_url}" loading="lazy" decoding="async" />
                                        <div class="featured-overlay">
                                            <span class="portfolio-tag tag-${accentColor}">${proj.category}</span>
                                            <span class="portfolio-tag tag-blue">${proj.location}</span>
                                        </div>
                                    </div>
                                    <div class="featured-info">
                                        <h3>Project: ${proj.title}</h3>
                                        <p>${proj.description}</p>
                                    </div>
                                </div>
                            `;
                        }).join('');
                    }
                }
            }
        } catch (err) {
            console.warn('API unavailable, falling back to static HTML elements for projects.', err);
        }
    }
    
    // 6b. Load Services on services.html
    const servicesBento = document.querySelector('.services-bento');
    if (servicesBento) {
        try {
            const res = await fetch('/api/services');
            if (res.ok) {
                const services = await res.json();
                if (services && services.length > 0) {
                    servicesBento.innerHTML = services.map(ser => {
                        const accentColor = ser.card_class.split('-')[1] || 'lime';
                        return `
                            <div class="glass-card service-card service-${accentColor} ${ser.card_class} hover-target">
                                <div class="service-icon-box">
                                    <span class="material-symbols-outlined">${ser.icon}</span>
                                </div>
                                <div class="service-info">
                                    <h3>${ser.title}</h3>
                                    <p>${ser.description}</p>
                                </div>
                            </div>
                        `;
                    }).join('');
                }
            }
        } catch (err) {
            console.warn('API unavailable, falling back to static HTML elements for services.', err);
        }
    }

    // 6c. Load Global Site Settings dynamically
    try {
        const res = await fetch('/api/settings');
        if (res.ok) {
            const settings = await res.json();
            
            // Update logo sources and alt texts
            if (settings.logo_nav) {
                document.querySelectorAll('.nav-logo-img').forEach(img => {
                    img.src = settings.logo_nav;
                    if (settings.site_name) img.alt = `${settings.site_name} Logo`;
                });
                document.querySelectorAll('.footer-logo-img').forEach(img => {
                    img.src = settings.logo_nav;
                    if (settings.site_name) img.alt = `${settings.site_name} Logo`;
                });
            }
            if (settings.logo_hero) {
                document.querySelectorAll('.hero-logo-img').forEach(img => {
                    img.src = settings.logo_hero;
                    if (settings.site_name) img.alt = `${settings.site_name} Monogram`;
                });
            }
            
            // Update hero headings (homepage specific)
            const heroTitle = document.querySelector('.hero-title');
            if (heroTitle && settings.hero_title) {
                heroTitle.innerHTML = settings.hero_title;
            }
            const heroSubtitle = document.querySelector('.hero-subtitle');
            if (heroSubtitle && settings.hero_subtitle) {
                heroSubtitle.textContent = settings.hero_subtitle;
            }
            
            // Update footer statement
            const footerBrandP = document.querySelector('.footer-brand p');
            if (footerBrandP && settings.footer_desc) {
                footerBrandP.textContent = settings.footer_desc;
            }
            
            // Update contact channel info (contact page specific)
            const waLink = document.querySelector('.channel-whatsapp');
            if (waLink && settings.whatsapp) {
                waLink.href = settings.whatsapp;
            }
            const emailText = document.querySelector('.channel-email h4');
            if (emailText && settings.email) {
                emailText.textContent = settings.email;
            }
            const phoneText = document.querySelector('.channel-phone h4');
            if (phoneText && settings.phone) {
                phoneText.textContent = settings.phone;
            }
        }
    } catch (err) {
        console.warn('API unavailable, falling back to static HTML branding & settings.', err);
    }
}

// Execute dynamic loading after DOM is ready
document.addEventListener('DOMContentLoaded', loadDynamicContent);
// Fallback execute immediately in case DOMContentLoaded already fired
if (document.readyState === 'interactive' || document.readyState === 'complete') {
    loadDynamicContent();
}


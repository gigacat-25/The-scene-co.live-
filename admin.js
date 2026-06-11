// CMS Admin Client Logic for The Scene Co. Live

const API_BASE = import.meta.env.VITE_API_BASE || '/api';

// Custom Cursor (shared aesthetic)
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

    function animateRing() {
        const ease = 0.12;
        ringX += (mouseX - ringX) * ease;
        ringY += (mouseY - ringY) * ease;
        cursorRing.style.transform = `translate3d(${ringX}px, ${ringY}px, 0) translate(-50%, -50%)`;
        requestAnimationFrame(animateRing);
    }
    animateRing();

    document.addEventListener('mouseover', (e) => {
        if (e.target.closest('.hover-target') || e.target.closest('button') || e.target.closest('a') || e.target.closest('input') || e.target.closest('select') || e.target.closest('textarea')) {
            document.body.classList.add('custom-cursor-hover');
        } else {
            document.body.classList.remove('custom-cursor-hover');
        }
    });
}

// -------------------------------------------------------------
// STATE MANAGEMENT & ROUTING
// -------------------------------------------------------------
let currentInquiry = null;

const logoutBtn = document.getElementById('logout-btn');

// Toast Helper
function showToast(message, isError = false) {
    const toast = document.getElementById('toast-notification');
    const toastMsg = document.getElementById('toast-message');
    const toastIcon = document.getElementById('toast-icon');
    
    toastMsg.textContent = message;
    if (isError) {
        toast.style.borderLeftColor = '#ef4444';
        toastIcon.textContent = 'error';
        toastIcon.style.color = '#ef4444';
    } else {
        toast.style.borderLeftColor = 'var(--lime)';
        toastIcon.textContent = 'check_circle';
        toastIcon.style.color = 'var(--lime)';
    }
    
    toast.style.display = 'flex';
    setTimeout(() => {
        toast.style.display = 'none';
    }, 4000);
}

function getClerkDomain(publishableKey) {
    try {
        const base64 = publishableKey.split('_')[2];
        const normalized = base64.replace(/-/g, '+').replace(/_/g, '/');
        const decoded = atob(normalized);
        return decoded.endsWith('$') ? decoded.slice(0, -1) : decoded;
    } catch (err) {
        console.error("Failed to parse Clerk Publishable Key:", err);
        return null;
    }
}

// Clerk Authentication Management
async function initClerk() {
    const pubKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
    if (!pubKey || pubKey === 'pk_test_placeholder_key_replace_me') {
        showToast("Clerk Publishable Key is not configured. Please set VITE_CLERK_PUBLISHABLE_KEY in your .env file.", true);
        return;
    }

    const domain = getClerkDomain(pubKey);
    if (!domain) {
        showToast("Invalid Clerk Publishable Key format.", true);
        return;
    }

    return new Promise((resolve) => {
        const script = document.createElement('script');
        script.src = `https://${domain}/npm/@clerk/clerk-js@latest/dist/clerk.browser.js`;
        script.async = true;
        script.crossOrigin = 'anonymous';
        script.setAttribute('data-clerk-publishable-key', pubKey);
        
        script.onload = async () => {
            try {
                await window.Clerk.load({
                    appearance: {
                        theme: 'dark',
                        variables: {
                            colorPrimary: '#a3e635',
                            colorBackground: '#121212',
                            colorText: '#ffffff'
                        }
                    }
                });

                window.Clerk.addListener(({ user }) => {
                    handleClerkState(user);
                });

                handleClerkState(window.Clerk.user);
                resolve();
            } catch (err) {
                console.error("Clerk load error:", err);
                showToast("Clerk load failed: " + err.message, true);
            }
        };
        
        script.onerror = () => {
            showToast("Failed to load ClerkJS script from " + domain, true);
        };

        document.head.appendChild(script);
    });
}

function handleClerkState(user) {
    const authContainer = document.getElementById('auth-container');
    const adminLayout = document.getElementById('admin-layout');
    const signInDiv = document.getElementById('clerk-sign-in');
    
    if (user) {
        authContainer.style.display = 'none';
        adminLayout.style.display = 'flex';
        if (signInDiv) signInDiv.innerHTML = '';
        
        loadDashboardData();
    } else {
        authContainer.style.display = 'flex';
        adminLayout.style.display = 'none';
        
        if (signInDiv && signInDiv.innerHTML === '') {
            window.Clerk.mountSignIn(signInDiv, {
                afterSignInUrl: '/admin',
                afterSignUpUrl: '/admin'
            });
        }
    }
}

// Log Out
if (logoutBtn) {
    logoutBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        if (window.Clerk) {
            await window.Clerk.signOut();
            showToast('Logged out');
        }
    });
}

// -------------------------------------------------------------
// TAB SWITCHING
// -------------------------------------------------------------
const tabLinks = document.querySelectorAll('.sidebar-link[data-tab]');
const tabContents = document.querySelectorAll('.tab-content');
const tabTitle = document.getElementById('current-tab-title');
const tabDesc = document.getElementById('current-tab-desc');

const tabMeta = {
    'tab-inquiries': { title: 'Client Inquiries', desc: 'Review incoming briefs and qualification details.' },
    'tab-projects': { title: 'Portfolio Projects', desc: 'Add, edit, or remove spatial projects in the portfolio.' },
    'tab-services': { title: 'Capabilities Services', desc: 'Manage event production bento grid categories.' },
    'tab-settings': { title: 'Global Configurations', desc: 'Manage global branding, copywriting, and contact channels.' }
};

tabLinks.forEach(link => {
    link.addEventListener('click', (e) => {
        e.preventDefault();
        const tabId = link.getAttribute('data-tab');
        
        // Remove active states
        tabLinks.forEach(l => l.classList.remove('active'));
        tabContents.forEach(c => c.classList.remove('active'));
        
        // Set active states
        link.classList.add('active');
        document.getElementById(tabId).classList.add('active');
        
        // Update headers
        tabTitle.textContent = tabMeta[tabId].title;
        tabDesc.textContent = tabMeta[tabId].desc;
    });
});

// Helper for authenticated requests using Clerk session token
async function fetchAuth(url, options = {}) {
    if (!window.Clerk || !window.Clerk.session) {
        throw new Error('Not authenticated');
    }
    
    const token = await window.Clerk.session.getToken();
    
    const headers = {
        'Content-Type': 'application/json',
        ...options.headers,
        'Authorization': `Bearer ${token}`
    };
    
    const res = await fetch(`${API_BASE}${url}`, { ...options, headers });
    if (res.status === 401) {
        window.Clerk.signOut();
        throw new Error('Session expired. Please log in again.');
    }
    return res;
}

// Load all Dashboard data
function loadDashboardData() {
    loadInquiries();
    loadProjects();
    loadServices();
    loadSettings();
}

// -------------------------------------------------------------
// 1. INQUIRIES MANAGEMENT
// -------------------------------------------------------------
const inquiriesList = document.getElementById('inquiries-list');
const inquiryModal = document.getElementById('inquiry-modal');
const inquiryDetailsContent = document.getElementById('inquiry-details-content');

async function loadInquiries() {
    try {
        const res = await fetchAuth('/admin/inquiries');
        const inquiries = await res.json();
        
        if (inquiries.length === 0) {
            inquiriesList.innerHTML = `
                <tr>
                    <td colspan="7" style="text-align: center; color: var(--text-muted); padding: 40px;">No briefs received yet.</td>
                </tr>
            `;
            return;
        }
        
        inquiriesList.innerHTML = inquiries.map(inq => {
            const dateStr = new Date(inq.created_at).toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
            const unreadClass = inq.status === 'unread' ? 'unread' : '';
            const unreadDot = inq.status === 'unread' ? '<span class="unread-dot"></span>' : '';
            
            return `
                <tr class="inquiry-row ${unreadClass} hover-target" data-id="${inq.id}">
                    <td>${unreadDot}${inq.status.toUpperCase()}</td>
                    <td>${inq.name}</td>
                    <td>${inq.email}</td>
                    <td><span class="badge badge-read">${inq.project_type}</span></td>
                    <td style="color: var(--yellow); font-weight: 500;">${inq.budget}</td>
                    <td style="color: var(--text-muted);">${dateStr}</td>
                    <td>
                        <button class="btn btn-secondary view-inq-btn hover-target" style="padding: 6px 12px; font-size: 11px;" data-id="${inq.id}">View Details</button>
                    </td>
                </tr>
            `;
        }).join('');
        
        // Add click events to rows
        document.querySelectorAll('.inquiry-row').forEach(row => {
            row.addEventListener('click', (e) => {
                // If clicked button, let that handler deal with it
                if (e.target.classList.contains('view-inq-btn')) return;
                const inqId = row.getAttribute('data-id');
                openInquiryDetails(inquiries.find(i => i.id == inqId));
            });
        });

        document.querySelectorAll('.view-inq-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const inqId = btn.getAttribute('data-id');
                openInquiryDetails(inquiries.find(i => i.id == inqId));
            });
        });
        
    } catch (err) {
        showToast(err.message, true);
    }
}

async function openInquiryDetails(inquiry) {
    currentInquiry = inquiry;
    
    const dateStr = new Date(inquiry.created_at).toLocaleString();
    inquiryDetailsContent.innerHTML = `
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 24px; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 20px;">
            <div>
                <strong style="color: var(--text-muted); font-size: 12px; display:block; margin-bottom: 4px;">CLIENT NAME</strong>
                <span style="font-size: 16px; font-weight:600;">${inquiry.name}</span>
            </div>
            <div>
                <strong style="color: var(--text-muted); font-size: 12px; display:block; margin-bottom: 4px;">EMAIL ADDRESS</strong>
                <a href="mailto:${inquiry.email}" style="color: var(--lime); font-size: 16px; font-weight:600; text-decoration: underline;">${inquiry.email}</a>
            </div>
            <div>
                <strong style="color: var(--text-muted); font-size: 12px; display:block; margin-bottom: 4px;">PROJECT SCALE / TYPE</strong>
                <span class="badge ${inquiry.status === 'unread' ? 'badge-unread' : 'badge-read'}">${inquiry.project_type}</span>
            </div>
            <div>
                <strong style="color: var(--text-muted); font-size: 12px; display:block; margin-bottom: 4px;">ESTIMATED BUDGET</strong>
                <span style="color: var(--yellow); font-size: 16px; font-weight:700;">${inquiry.budget}</span>
            </div>
            <div>
                <strong style="color: var(--text-muted); font-size: 12px; display:block; margin-bottom: 4px;">TIMELINE EXPECTATION</strong>
                <span style="color: var(--blue); font-size: 16px; font-weight:600;">${inquiry.timeline}</span>
            </div>
            <div>
                <strong style="color: var(--text-muted); font-size: 12px; display:block; margin-bottom: 4px;">DATE RECEIVED</strong>
                <span style="color: var(--text-muted); font-size: 14px;">${dateStr}</span>
            </div>
        </div>
        <div>
            <strong style="color: var(--text-muted); font-size: 12px; display:block; margin-bottom: 8px;">CREATIVE BRIEF DETAILS & REQS</strong>
            <p style="background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.05); padding: 20px; border-radius: 12px; white-space: pre-wrap; font-size:14px; line-height:1.7;">${inquiry.details}</p>
        </div>
    `;
    
    // Set proper label on toggle button
    const toggleBtn = document.getElementById('inquiry-toggle-read');
    toggleBtn.textContent = inquiry.status === 'unread' ? 'Mark as Read' : 'Mark as Unread';
    
    inquiryModal.style.display = 'flex';
    
    // Automatically mark as read if it is unread when opened
    if (inquiry.status === 'unread') {
        updateInquiryStatus(inquiry.id, 'read', false); // silent update
    }
}

async function updateInquiryStatus(id, newStatus, showFeedback = true) {
    try {
        const res = await fetchAuth(`/admin/inquiries/${id}`, {
            method: 'PATCH',
            body: JSON.stringify({ status: newStatus })
        });
        if (res.ok) {
            if (showFeedback) {
                showToast(`Inquiry marked as ${newStatus}`);
                inquiryModal.style.display = 'none';
            }
            loadInquiries();
        }
    } catch (err) {
        showToast(err.message, true);
    }
}

// Inquiry detail actions
document.getElementById('inquiry-modal-close').addEventListener('click', () => {
    inquiryModal.style.display = 'none';
});

document.getElementById('inquiry-toggle-read').addEventListener('click', () => {
    if (!currentInquiry) return;
    const nextStatus = currentInquiry.status === 'unread' ? 'read' : 'unread';
    updateInquiryStatus(currentInquiry.id, nextStatus);
});

document.getElementById('inquiry-delete-btn').addEventListener('click', async () => {
    if (!currentInquiry) return;
    if (!confirm('Are you sure you want to permanently delete this client brief?')) return;
    
    try {
        const res = await fetchAuth(`/admin/inquiries/${currentInquiry.id}`, {
            method: 'DELETE'
        });
        if (res.ok) {
            showToast('Client inquiry brief deleted');
            inquiryModal.style.display = 'none';
            loadInquiries();
        }
    } catch (err) {
        showToast(err.message, true);
    }
});

// -------------------------------------------------------------
// 2. PORTFOLIO CRUD
// -------------------------------------------------------------
const projectsList = document.getElementById('projects-list');
const projectModal = document.getElementById('project-modal');
const projectForm = document.getElementById('project-form');

async function loadProjects() {
    try {
        const res = await fetch(`${API_BASE}/projects`);
        const projects = await res.json();
        
        if (projects.length === 0) {
            projectsList.innerHTML = `
                <div style="grid-column: span 3; text-align: center; color: var(--text-muted); padding: 40px;">No projects in portfolio. Add one to begin.</div>
            `;
            return;
        }
        
        projectsList.innerHTML = projects.map(proj => {
            return `
                <div class="cms-card card-magenta hover-target" style="border-left: 3px solid var(--${proj.card_class.split('-')[1] || 'magenta'});">
                    <div>
                        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px;">
                            <span class="badge badge-read">${proj.category}</span>
                            <span style="color: var(--yellow); font-size:12px; font-weight:600;">Span: ${proj.col_span} | Order: ${proj.sort_order}</span>
                        </div>
                        <h4 style="font-family: 'Bricolage Grotesque', sans-serif; font-size: 18px; margin-bottom: 8px;">${proj.title}</h4>
                        <p style="color: var(--text-muted); font-size: 13px; line-height: 1.5; margin-bottom: 12px; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden;">${proj.description}</p>
                        <div style="font-size: 12px; color: var(--text-muted); margin-bottom: 8px;">
                            <span class="material-symbols-outlined" style="font-size:12px; vertical-align:middle; margin-right:4px;">location_on</span>${proj.location}
                        </div>
                    </div>
                    <div class="cms-card-actions">
                        <button class="btn btn-secondary edit-proj-btn hover-target" style="padding: 6px 12px; font-size: 11px; flex-grow:1;" data-id="${proj.id}">Edit</button>
                        <button class="btn btn-secondary delete-proj-btn hover-target" style="padding: 6px 12px; font-size: 11px; border-color: #ef4444; color: #ef4444;" data-id="${proj.id}">Delete</button>
                    </div>
                </div>
            `;
        }).join('');
        
        // Click handlers for edits/deletes
        document.querySelectorAll('.edit-proj-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.getAttribute('data-id');
                const project = projects.find(p => p.id == id);
                openProjectEditor(project);
            });
        });
        
        document.querySelectorAll('.delete-proj-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const id = btn.getAttribute('data-id');
                if (!confirm('Are you sure you want to delete this portfolio project?')) return;
                
                try {
                    const res = await fetchAuth(`/admin/projects/${id}`, { method: 'DELETE' });
                    if (res.ok) {
                        showToast('Project deleted successfully');
                        loadProjects();
                    }
                } catch (err) {
                    showToast(err.message, true);
                }
            });
        });
        
    } catch (err) {
        showToast(err.message, true);
    }
}

function openProjectEditor(project = null) {
    const header = document.getElementById('project-modal-header');
    const statusSpan = document.getElementById('p-image-status');
    if (statusSpan) {
        statusSpan.style.display = 'none';
        statusSpan.textContent = '';
    }
    
    if (project) {
        header.textContent = 'Edit Portfolio Project';
        document.getElementById('project-id').value = project.id;
        document.getElementById('p-title').value = project.title;
        document.getElementById('p-category').value = project.category;
        document.getElementById('p-location').value = project.location;
        document.getElementById('p-order').value = project.sort_order;
        document.getElementById('p-image').value = project.image_url;
        document.getElementById('p-colspan').value = project.col_span;
        document.getElementById('p-class').value = project.card_class;
        document.getElementById('p-desc').value = project.description;
    } else {
        header.textContent = 'Add Portfolio Project';
        projectForm.reset();
        document.getElementById('project-id').value = '';
    }
    
    projectModal.style.display = 'flex';
}

projectForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('project-id').value;
    const title = document.getElementById('p-title').value;
    const category = document.getElementById('p-category').value;
    const location = document.getElementById('p-location').value;
    const sort_order = parseInt(document.getElementById('p-order').value) || 0;
    const image_url = document.getElementById('p-image').value;
    const col_span = parseInt(document.getElementById('p-colspan').value);
    const card_class = document.getElementById('p-class').value;
    const description = document.getElementById('p-desc').value;
    
    const payload = { title, category, location, sort_order, image_url, col_span, card_class, description };
    const method = id ? 'PUT' : 'POST';
    const endpoint = id ? `/admin/projects/${id}` : '/admin/projects';
    
    try {
        const res = await fetchAuth(endpoint, {
            method,
            body: JSON.stringify(payload)
        });
        
        if (res.ok) {
            showToast(id ? 'Project updated successfully' : 'Project added successfully');
            projectModal.style.display = 'none';
            loadProjects();
        }
    } catch (err) {
        showToast(err.message, true);
    }
});

document.getElementById('add-project-btn').addEventListener('click', () => openProjectEditor());
document.getElementById('project-modal-close').addEventListener('click', () => projectModal.style.display = 'none');
document.getElementById('project-cancel-btn').addEventListener('click', () => projectModal.style.display = 'none');

// -------------------------------------------------------------
// 3. SERVICES CRUD
// -------------------------------------------------------------
const servicesList = document.getElementById('services-list');
const serviceModal = document.getElementById('service-modal');
const serviceForm = document.getElementById('service-form');

async function loadServices() {
    try {
        const res = await fetch(`${API_BASE}/services`);
        const services = await res.json();
        
        if (services.length === 0) {
            servicesList.innerHTML = `
                <div style="grid-column: span 3; text-align: center; color: var(--text-muted); padding: 40px;">No services defined. Add one to begin.</div>
            `;
            return;
        }
        
        servicesList.innerHTML = services.map(ser => {
            return `
                <div class="cms-card card-lime hover-target" style="border-left: 3px solid var(--${ser.card_class.split('-')[1] || 'lime'});">
                    <div>
                        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px;">
                            <span class="material-symbols-outlined" style="font-size:24px; color: var(--${ser.card_class.split('-')[1] || 'lime'})">${ser.icon}</span>
                            <span style="color: var(--yellow); font-size:12px; font-weight:600;">Order: ${ser.sort_order}</span>
                        </div>
                        <h4 style="font-family: 'Bricolage Grotesque', sans-serif; font-size: 18px; margin-bottom: 8px;">${ser.title}</h4>
                        <p style="color: var(--text-muted); font-size: 13px; line-height: 1.5; margin-bottom: 12px; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden;">${ser.description}</p>
                    </div>
                    <div class="cms-card-actions">
                        <button class="btn btn-secondary edit-service-btn hover-target" style="padding: 6px 12px; font-size: 11px; flex-grow:1;" data-id="${ser.id}">Edit</button>
                        <button class="btn btn-secondary delete-service-btn hover-target" style="padding: 6px 12px; font-size: 11px; border-color: #ef4444; color: #ef4444;" data-id="${ser.id}">Delete</button>
                    </div>
                </div>
            `;
        }).join('');
        
        // Click handlers for edits/deletes
        document.querySelectorAll('.edit-service-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.getAttribute('data-id');
                const service = services.find(s => s.id == id);
                openServiceEditor(service);
            });
        });
        
        document.querySelectorAll('.delete-service-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const id = btn.getAttribute('data-id');
                if (!confirm('Are you sure you want to delete this service?')) return;
                
                try {
                    const res = await fetchAuth(`/admin/services/${id}`, { method: 'DELETE' });
                    if (res.ok) {
                        showToast('Service deleted successfully');
                        loadServices();
                    }
                } catch (err) {
                    showToast(err.message, true);
                }
            });
        });
        
    } catch (err) {
        showToast(err.message, true);
    }
}

function openServiceEditor(service = null) {
    const header = document.getElementById('service-modal-header');
    
    if (service) {
        header.textContent = 'Edit Service';
        document.getElementById('service-id').value = service.id;
        document.getElementById('s-title').value = service.title;
        document.getElementById('s-icon').value = service.icon;
        document.getElementById('s-class').value = service.card_class;
        document.getElementById('s-order').value = service.sort_order;
        document.getElementById('s-desc').value = service.description;
    } else {
        header.textContent = 'Add Service';
        serviceForm.reset();
        document.getElementById('service-id').value = '';
    }
    
    serviceModal.style.display = 'flex';
}

serviceForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('service-id').value;
    const title = document.getElementById('s-title').value;
    const icon = document.getElementById('s-icon').value;
    const card_class = document.getElementById('s-class').value;
    const sort_order = parseInt(document.getElementById('s-order').value) || 0;
    const description = document.getElementById('s-desc').value;
    
    const payload = { title, icon, card_class, sort_order, description };
    const method = id ? 'PUT' : 'POST';
    const endpoint = id ? `/admin/services/${id}` : '/admin/services';
    
    try {
        const res = await fetchAuth(endpoint, {
            method,
            body: JSON.stringify(payload)
        });
        
        if (res.ok) {
            showToast(id ? 'Service updated successfully' : 'Service added successfully');
            serviceModal.style.display = 'none';
            loadServices();
        }
    } catch (err) {
        showToast(err.message, true);
    }
});

document.getElementById('add-service-btn').addEventListener('click', () => openServiceEditor());
document.getElementById('service-modal-close').addEventListener('click', () => serviceModal.style.display = 'none');
document.getElementById('service-cancel-btn').addEventListener('click', () => serviceModal.style.display = 'none');

// -------------------------------------------------------------
// -------------------------------------------------------------
// 4. GLOBAL SETTINGS MANAGEMENT
// -------------------------------------------------------------
const settingsForm = document.getElementById('settings-form');

async function loadSettings() {
    try {
        const res = await fetch(`${API_BASE}/settings`);
        if (!res.ok) throw new Error('Failed to fetch settings');
        const settings = await res.json();
        
        document.getElementById('set-site-name').value = settings.site_name || '';
        document.getElementById('set-logo-nav').value = settings.logo_nav || '';
        document.getElementById('set-logo-hero').value = settings.logo_hero || '';
        document.getElementById('set-email').value = settings.email || '';
        document.getElementById('set-phone').value = settings.phone || '';
        document.getElementById('set-whatsapp').value = settings.whatsapp || '';
        document.getElementById('set-hero-title').value = settings.hero_title || '';
        document.getElementById('set-hero-subtitle').value = settings.hero_subtitle || '';
        document.getElementById('set-footer-desc').value = settings.footer_desc || '';

        const navStatus = document.getElementById('set-logo-nav-status');
        const heroStatus = document.getElementById('set-logo-hero-status');
        if (navStatus) {
            navStatus.style.display = 'none';
            navStatus.textContent = '';
        }
        if (heroStatus) {
            heroStatus.style.display = 'none';
            heroStatus.textContent = '';
        }
    } catch (err) {
        showToast(err.message, true);
    }
}

if (settingsForm) {
    settingsForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const payload = {
            site_name: document.getElementById('set-site-name').value,
            logo_nav: document.getElementById('set-logo-nav').value,
            logo_hero: document.getElementById('set-logo-hero').value,
            email: document.getElementById('set-email').value,
            phone: document.getElementById('set-phone').value,
            whatsapp: document.getElementById('set-whatsapp').value,
            hero_title: document.getElementById('set-hero-title').value,
            hero_subtitle: document.getElementById('set-hero-subtitle').value,
            footer_desc: document.getElementById('set-footer-desc').value
        };
        
        try {
            const res = await fetchAuth('/admin/settings', {
                method: 'PUT',
                body: JSON.stringify(payload)
            });
            
            if (res.ok) {
                showToast('Global configurations updated successfully');
                loadSettings();
            } else {
                const data = await res.json();
                throw new Error(data.error || 'Failed to update settings');
            }
        } catch (err) {
            showToast(err.message, true);
        }
    });
}

// -------------------------------------------------------------
// 5. FILE UPLOAD HANDLING (R2 BUCKET)
// -------------------------------------------------------------
async function uploadFile(fileInput, textInput, statusSpan) {
    const file = fileInput.files[0];
    if (!file) return;

    statusSpan.style.display = 'inline';
    statusSpan.style.color = 'var(--text-muted)';
    statusSpan.textContent = 'Uploading...';

    const formData = new FormData();
    formData.append('file', file);

    try {
        const token = localStorage.getItem('admin_token');
        const res = await fetch(`${API_BASE}/admin/upload`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            },
            body: formData
        });

        const data = await res.json();
        if (!res.ok) {
            throw new Error(data.error || 'Failed to upload image');
        }

        textInput.value = data.url;
        statusSpan.style.color = 'var(--lime)';
        statusSpan.textContent = `Upload success: ${file.name}`;
        showToast('Image uploaded successfully');
    } catch (err) {
        statusSpan.style.color = '#ef4444';
        statusSpan.textContent = `Error: ${err.message}`;
        showToast(err.message, true);
    } finally {
        fileInput.value = '';
    }
}

// Bind project image upload
const pImageFile = document.getElementById('p-image-file');
const pImage = document.getElementById('p-image');
const pImageStatus = document.getElementById('p-image-status');
if (pImageFile && pImage && pImageStatus) {
    pImageFile.addEventListener('change', () => {
        uploadFile(pImageFile, pImage, pImageStatus);
    });
}

// Bind settings nav logo upload
const setLogoNavFile = document.getElementById('set-logo-nav-file');
const setLogoNav = document.getElementById('set-logo-nav');
const setLogoNavStatus = document.getElementById('set-logo-nav-status');
if (setLogoNavFile && setLogoNav && setLogoNavStatus) {
    setLogoNavFile.addEventListener('change', () => {
        uploadFile(setLogoNavFile, setLogoNav, setLogoNavStatus);
    });
}

// Bind settings hero logo upload
const setLogoHeroFile = document.getElementById('set-logo-hero-file');
const setLogoHero = document.getElementById('set-logo-hero');
const setLogoHeroStatus = document.getElementById('set-logo-hero-status');
if (setLogoHeroFile && setLogoHero && setLogoHeroStatus) {
    setLogoHeroFile.addEventListener('change', () => {
        uploadFile(setLogoHeroFile, setLogoHero, setLogoHeroStatus);
    });
}

// INITIALIZATION
// -------------------------------------------------------------
initClerk();

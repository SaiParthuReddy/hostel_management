// Parthu Reddy's Hostel Management System - Shared Client JavaScript

// Toast Notification System
function showToast(message, type = 'info') {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    let iconSvg = '';
    if (type === 'success') {
        iconSvg = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg>`;
    } else if (type === 'error') {
        iconSvg = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`;
    } else {
        iconSvg = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`;
    }

    toast.innerHTML = `
        <div style="flex-shrink:0;">${iconSvg}</div>
        <div class="toast-message">${message}</div>
    `;

    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(10px)';
        toast.style.transition = 'all 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

// Live MySQL Status Checker
async function checkMySQLStatus() {
    const badge = document.getElementById('mysql-status-badge');
    const textSpan = document.getElementById('mysql-status-text');
    if (!badge || !textSpan) return;

    try {
        const response = await fetch('/api/status');
        const data = await response.json();

        if (data.online) {
            badge.className = 'mysql-status-badge online';
            textSpan.textContent = `MySQL: Online (${data.database || 'hostel_db'})`;
            badge.title = `MySQL 8 Connected | Schema: Verified | Rooms: ${data.roomCount} | Last checked: ${new Date(data.lastChecked).toLocaleTimeString()}`;
        } else {
            badge.className = 'mysql-status-badge offline';
            textSpan.textContent = 'MySQL: Offline';
            badge.title = `MySQL Offline: ${data.error || 'Connection Failed'}`;
        }
    } catch (err) {
        badge.className = 'mysql-status-badge offline';
        textSpan.textContent = 'MySQL: Offline';
        badge.title = `Server unreachable: ${err.message}`;
    }
}

// Image fallback handler
function handleImageFallback(img, label = 'Hostel Room') {
    img.onerror = null;
    img.src = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400" viewBox="0 0 600 400"><rect width="100%" height="100%" fill="%230b192c"/><path d="M150 320V120l150-80 150 80v200H150z" fill="none" stroke="%2338bdf8" stroke-width="4"/><rect x="200" y="150" width="40" height="50" rx="4" fill="%232563eb"/><rect x="280" y="150" width="40" height="50" rx="4" fill="%232563eb"/><rect x="360" y="150" width="40" height="50" rx="4" fill="%232563eb"/><rect x="270" y="240" width="60" height="80" rx="4" fill="%2338bdf8"/><text x="50%" y="370" fill="%23e2e8f0" font-family="sans-serif" font-size="18" font-weight="bold" text-anchor="middle">${encodeURIComponent(label)}</text></svg>`;
}

// Highlight active nav link based on current path
function highlightActiveNav() {
    const path = window.location.pathname.toLowerCase();
    const navLinks = document.querySelectorAll('.nav-link');
    navLinks.forEach(link => {
        const href = link.getAttribute('href').toLowerCase();
        if ((path === '/' && href === 'index.html') || (path.includes(href) && href !== 'index.html')) {
            link.classList.add('active');
        } else if (path.endsWith('/') && href === 'index.html') {
            link.classList.add('active');
        } else {
            link.classList.remove('active');
        }
    });
}

// Helper to render status badge HTML
function renderStatusBadge(status) {
    const s = (status || '').toLowerCase().trim();
    if (s === 'available' || s === 'vacant') {
        return `<span class="badge badge-available"><span style="width:6px;height:6px;border-radius:50%;background:#10b981;"></span>Available</span>`;
    } else if (s === 'occupied') {
        return `<span class="badge badge-occupied"><span style="width:6px;height:6px;border-radius:50%;background:#f59e0b;"></span>Occupied</span>`;
    } else if (s === 'under maintenance' || s === 'maintenance') {
        return `<span class="badge badge-maintenance"><span style="width:6px;height:6px;border-radius:50%;background:#ef4444;"></span>Under Maintenance</span>`;
    } else {
        return `<span class="badge badge-reserved"><span style="width:6px;height:6px;border-radius:50%;background:#8b5cf6;"></span>${status}</span>`;
    }
}

// Initialize on DOM load
document.addEventListener('DOMContentLoaded', () => {
    checkMySQLStatus();
    setInterval(checkMySQLStatus, 8000);
    highlightActiveNav();

    // Attach fallback to all images on page
    document.querySelectorAll('img').forEach(img => {
        if (!img.getAttribute('onerror')) {
            img.onerror = function() { handleImageFallback(this, img.alt || 'Hostel Room'); };
        }
    });
});

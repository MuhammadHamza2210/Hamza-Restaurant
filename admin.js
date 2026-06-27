// ============================================================
//  Zaiqa — Admin Console logic
// ============================================================
const API = '/api';
const TOKEN_KEY = 'zaiqa_admin';
let token = localStorage.getItem(TOKEN_KEY) || null;
let adminUser = JSON.parse(localStorage.getItem('zaiqa_admin_user') || 'null');
let categories = [];
let productsCache = [];
let customersCache = [];
let menuMap = {};
let charts = {};
let evtSource = null;
let notifications = [];
let IS_DEMO = false;

// Status lifecycles — kept in sync with the server. The UI only offers moves the
// backend will actually accept, so staff never hit a confusing error.
const ORDER_TRANSITIONS = {
    pending:   ['preparing', 'cancelled'],
    preparing: ['ready', 'cancelled'],
    ready:     ['delivered', 'cancelled'],
    delivered: [],
    cancelled: [],
};
const RES_TRANSITIONS = {
    pending:   ['confirmed', 'seated', 'cancelled'],
    confirmed: ['seated', 'cancelled'],
    seated:    ['completed'],
    completed: [],
    cancelled: [],
};
function todayStr() {
    const d = new Date();
    const p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
// Belt-and-suspenders: even though demo controls are disabled, stop any stray action.
function demoBlocked() {
    if (IS_DEMO) { toast('Read-only demo', 'Sign in with the owner account to make changes.', 'error', 'fa-lock'); return true; }
    return false;
}

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

async function api(path, { method = 'GET', body = null, auth = true } = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (auth && token) headers['Authorization'] = 'Bearer ' + token;
    const res = await fetch(API + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.msg || 'Request failed');
    return data;
}

// ---------- Toasts ----------
function toast(title, msg = '', type = 'success', icon = 'fa-circle-check') {
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.innerHTML = `<i class="fas ${icon} t-icon"></i><div><h5>${title}</h5>${msg ? `<p>${msg}</p>` : ''}</div>`;
    $('#toastWrap').appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 300); }, 4200);
}

// ---------- Auth ----------
function showApp() {
    $('#loginGate').style.display = 'none';
    $('#adminApp').style.display = 'flex';
    $('#adminName').textContent = adminUser ? adminUser.username : 'Admin';
    applyDemoMode();
    initRealtime();
    loadNotifications();
    switchView('dashboard');
}
// Read-only demo admin: show a banner and hide the create buttons. Per-row controls
// (status selects, edit/delete) are disabled inside their render functions.
function applyDemoMode() {
    IS_DEMO = !!(adminUser && adminUser.isDemo);
    $('#adminApp').classList.toggle('demo-mode', IS_DEMO);
    const banner = $('#demoBanner');
    if (banner) banner.style.display = IS_DEMO ? 'flex' : 'none';
}
function showLogin() {
    $('#loginGate').style.display = 'flex';
    $('#adminApp').style.display = 'none';
}

$('#adminLoginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = $('#adminEmail').value, password = $('#adminPassword').value;
    try {
        const data = await api('/login', { method: 'POST', auth: false, body: { email, password } });
        if (data.user.role !== 'admin') { $('#adminLoginError').textContent = 'This account is not an administrator.'; return; }
        token = data.token; adminUser = data.user;
        localStorage.setItem(TOKEN_KEY, token);
        localStorage.setItem('zaiqa_admin_user', JSON.stringify(adminUser));
        showApp();
    } catch (err) { $('#adminLoginError').textContent = err.message; }
});

$('#logoutBtn').addEventListener('click', () => {
    localStorage.removeItem(TOKEN_KEY); localStorage.removeItem('zaiqa_admin_user');
    token = null; adminUser = null;
    if (evtSource) evtSource.close();
    showLogin();
});

// ---------- Navigation ----------
const VIEW_TITLES = { dashboard: 'Dashboard', orders: 'Orders', products: 'Products', categories: 'Categories', reservations: 'Reservations', customers: 'Customers', reviews: 'Reviews' };
function switchView(view) {
    $$('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.view === view));
    $$('.view').forEach(v => v.classList.toggle('active', v.id === `view-${view}`));
    $('#viewTitle').textContent = VIEW_TITLES[view] || view;
    $('#sidebar').classList.remove('open');
    const loaders = { dashboard: loadDashboard, orders: loadOrders, products: loadProducts, categories: loadCategories, reservations: loadReservations, customers: loadCustomers, reviews: loadReviews };
    loaders[view] && loaders[view]();
}
$$('.nav-item').forEach(n => n.addEventListener('click', () => switchView(n.dataset.view)));
$('#menuToggle').addEventListener('click', () => $('#sidebar').classList.toggle('open'));

// ---------- Theme ----------
function applyTheme(t) {
    document.documentElement.setAttribute('data-theme', t);
    localStorage.setItem('zaiqa_admin_theme', t);
    $('#themeBtn').innerHTML = t === 'dark' ? '<i class="fas fa-sun"></i>' : '<i class="fas fa-moon"></i>';
    if ($('#adminApp').style.display !== 'none' && $('#view-dashboard').classList.contains('active')) loadDashboard();
}
$('#themeBtn').addEventListener('click', () => applyTheme((document.documentElement.getAttribute('data-theme') === 'dark') ? 'light' : 'dark'));
applyTheme(localStorage.getItem('zaiqa_admin_theme') || 'light');

// ============================================================
//  DASHBOARD
// ============================================================
const rs = n => 'Rs. ' + Number(n || 0).toLocaleString();
function hourLabel(h) { const am = h < 12; const hr = h % 12 || 12; return `${hr}${am ? 'am' : 'pm'}`; }

async function loadDashboard() {
    let a;
    try { a = await api('/admin/analytics'); } catch (e) { toast('Failed to load analytics', e.message, 'error'); return; }
    const k = a.kpi;
    const cards = [
        { label: 'Total Revenue', value: rs(k.revenue), icon: 'fa-sack-dollar', color: 'var(--primary)', sub: `${rs(k.todayRevenue)} today`, up: true },
        { label: 'Total Orders', value: k.orders, icon: 'fa-receipt', color: 'var(--secondary)', sub: `${k.todayOrders} today`, up: true },
        { label: 'Customers', value: k.customers, icon: 'fa-users', color: 'var(--purple)', sub: 'registered', up: true },
        { label: 'Avg Order Value', value: rs(k.avgOrder), icon: 'fa-chart-simple', color: '#22a45d', sub: 'per order' },
        { label: 'Active Orders', value: k.pendingCount, icon: 'fa-fire-burner', color: '#e8794b', sub: 'in progress' },
        { label: 'Peak Hour', value: k.peakHour != null ? hourLabel(k.peakHour) : '—', icon: 'fa-clock', color: '#3a86ff', sub: 'busiest time' },
        { label: 'Pending Reservations', value: k.reservationsPending, icon: 'fa-calendar-check', color: '#ff5b7f', sub: 'awaiting confirm' },
        { label: 'Total Reviews', value: k.totalReviews, icon: 'fa-star', color: 'var(--accent)', sub: 'customer feedback' },
    ];
    $('#kpiGrid').innerHTML = cards.map(c => `
        <div class="kpi" style="--accent-color:${c.color}">
            <div class="kpi-icon"><i class="fas ${c.icon}"></i></div>
            <div class="kpi-value">${c.value}</div>
            <div class="kpi-label">${c.label}</div>
            <div class="kpi-sub ${c.up ? 'up' : ''}">${c.up ? '<i class="fas fa-arrow-up"></i> ' : ''}${c.sub}</div>
        </div>`).join('');

    updateBadges(k.pendingCount, k.reservationsPending);
    drawCharts(a);
}

function chartTextColor() { return getComputedStyle(document.documentElement).getPropertyValue('--text-soft').trim() || '#6b7280'; }
function gridColor() { return document.documentElement.getAttribute('data-theme') === 'dark' ? 'rgba(255,255,255,.08)' : 'rgba(0,0,0,.06)'; }

function makeChart(id, config) {
    if (charts[id]) charts[id].destroy();
    const ctx = $('#' + id);
    if (!ctx) return;
    Chart.defaults.color = chartTextColor();
    Chart.defaults.font.family = 'Inter, sans-serif';
    charts[id] = new Chart(ctx, config);
}

function drawCharts(a) {
    const grid = gridColor();
    const axis = (extra = {}) => ({ grid: { color: grid }, ticks: { color: chartTextColor() }, ...extra });
    const ORANGE = '#FF6B35', TEAL = '#2EC4B6', PURPLE = '#7C5CFF', GOLD = '#FFD166', PINK = '#ff5b7f', BLUE = '#3a86ff';

    // Revenue trend
    makeChart('chartRevenue', {
        type: 'line',
        data: { labels: a.daily.map(d => d.date.slice(5)), datasets: [{
            label: 'Revenue', data: a.daily.map(d => d.revenue), borderColor: ORANGE,
            backgroundColor: (c) => { const g = c.chart.ctx.createLinearGradient(0,0,0,260); g.addColorStop(0,'rgba(255,107,53,.35)'); g.addColorStop(1,'rgba(255,107,53,0)'); return g; },
            fill: true, tension: .4, pointRadius: 0, borderWidth: 3 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: axis({ ticks: { maxTicksLimit: 10, color: chartTextColor() } }), y: axis({ beginAtZero: true }) } }
    });
    // Peak hours
    makeChart('chartHours', {
        type: 'bar',
        data: { labels: a.hours.map(h => hourLabel(h.hour)), datasets: [{ label: 'Orders', data: a.hours.map(h => h.orders), backgroundColor: a.hours.map(h => h.orders === Math.max(...a.hours.map(x=>x.orders)) ? ORANGE : 'rgba(255,107,53,.45)'), borderRadius: 6 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: axis({ ticks: { maxTicksLimit: 12, color: chartTextColor() } }), y: axis({ beginAtZero: true }) } }
    });
    // Top dishes
    makeChart('chartDishes', {
        type: 'bar',
        data: { labels: a.topDishes.map(d => d.name), datasets: [{ label: 'Qty sold', data: a.topDishes.map(d => d.qty), backgroundColor: [ORANGE, TEAL, PURPLE, GOLD, PINK, BLUE], borderRadius: 6 }] },
        options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: axis({ beginAtZero: true }), y: axis() } }
    });
    // Category revenue doughnut
    makeChart('chartCategory', {
        type: 'doughnut',
        data: { labels: a.categoryRevenue.map(c => c.category), datasets: [{ data: a.categoryRevenue.map(c => c.revenue), backgroundColor: [ORANGE, TEAL, PURPLE, GOLD, PINK, BLUE], borderWidth: 0 }] },
        options: { responsive: true, maintainAspectRatio: false, cutout: '62%', plugins: { legend: { position: 'right', labels: { color: chartTextColor(), boxWidth: 12 } } } }
    });
    // Customer growth
    makeChart('chartGrowth', {
        type: 'line',
        data: { labels: a.customerGrowth.map(d => d.date.slice(5)), datasets: [{ label: 'Customers', data: a.customerGrowth.map(d => d.total), borderColor: PURPLE, backgroundColor: 'rgba(124,92,255,.15)', fill: true, tension: .4, pointRadius: 0, borderWidth: 3 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: axis({ ticks: { maxTicksLimit: 8, color: chartTextColor() } }), y: axis({ beginAtZero: false }) } }
    });
    // Weekday
    makeChart('chartWeekday', {
        type: 'bar',
        data: { labels: a.weekday.map(d => d.day), datasets: [{ data: a.weekday.map(d => d.orders), backgroundColor: TEAL, borderRadius: 6 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: axis(), y: axis({ beginAtZero: true }) } }
    });
    // Status
    const statusColors = { pending: GOLD, preparing: BLUE, ready: PURPLE, delivered: '#22a45d', cancelled: PINK };
    makeChart('chartStatus', {
        type: 'doughnut',
        data: {
            labels: a.statusBreakdown.map(s => s.status),
            datasets: [{ data: a.statusBreakdown.map(s => s.count), backgroundColor: a.statusBreakdown.map(s => statusColors[s.status] || ORANGE), borderWidth: 0 }]
        },
        options: { responsive: true, maintainAspectRatio: false, cutout: '62%', plugins: { legend: { position: 'right', labels: { color: chartTextColor(), boxWidth: 12 } } } }
    });

    // Best sellers
    const max = Math.max(...a.bestSellers.map(d => d.revenue), 1);
    $('#bestSellers').innerHTML = a.bestSellers.map((d, i) => `
        <div class="bestseller">
            <span class="rank">#${i + 1}</span>
            <img src="${d.image}" onerror="this.src='images/placeholder-food.svg'">
            <span class="bs-name">${d.name}</span>
            <span class="bs-bar"><span style="width:${(d.revenue / max * 100).toFixed(0)}%"></span></span>
            <span class="bs-rev">${rs(d.revenue)}</span>
        </div>`).join('');
}

// ============================================================
//  ORDERS
// ============================================================
let orderFilter = 'all';
$$('#orderFilters .pill').forEach(p => p.addEventListener('click', () => {
    $$('#orderFilters .pill').forEach(x => x.classList.remove('active'));
    p.classList.add('active'); orderFilter = p.dataset.status; loadOrders();
}));

// Build a status <select> that only offers valid next states, locks terminal states
// (shows a padlock), and is fully disabled in read-only demo mode.
function statusCell(current, allowed, type, id) {
    const opts = [current, ...allowed];
    const locked = allowed.length === 0;
    const disabled = locked || IS_DEMO;
    const attr = type === 'order' ? 'data-order' : 'data-res';
    return `<select class="status-select" ${attr}="${id}" ${disabled ? 'disabled' : ''}>
            ${opts.map(s => `<option value="${s}" ${s === current ? 'selected' : ''}>${s}</option>`).join('')}
        </select>${locked ? ' <i class="fas fa-lock lock-ic" title="Final — can\'t be changed"></i>' : ''}`;
}

async function loadOrders() {
    let orders;
    try { orders = await api('/admin/orders' + (orderFilter !== 'all' ? `?status=${orderFilter}` : '')); }
    catch (e) { return toast('Failed to load orders', e.message, 'error'); }
    $('#ordersTable').innerHTML = `
        <thead><tr><th>Order</th><th>Customer</th><th>Items</th><th>Total</th><th>Placed</th><th>Status</th></tr></thead>
        <tbody>${orders.length ? orders.map(o => `
            <tr>
                <td class="cell-strong">#${o._id}</td>
                <td>${o.customerName || '—'}<div class="muted">${o.customerPhone || ''}</div></td>
                <td class="muted">${o.items.map(i => `${i.quantity}× ${i.name}`).join(', ')}</td>
                <td class="cell-strong">${rs(o.total)}</td>
                <td class="muted">${fmtDate(o.createdAt)}</td>
                <td>${statusCell(o.status, ORDER_TRANSITIONS[o.status] || [], 'order', o._id)}</td>
            </tr>`).join('') : `<tr><td colspan="6"><div class="empty"><i class="fas fa-receipt"></i><p>No orders found</p></div></td></tr>`}
        </tbody>`;
    $$('#ordersTable .status-select').forEach(sel => sel.addEventListener('change', async () => {
        try { await api(`/admin/orders/${sel.dataset.order}/status`, { method: 'PUT', body: { status: sel.value } });
            toast('Order updated', `#${sel.dataset.order} → ${sel.value}`); loadOrders(); }
        catch (e) { toast('Update failed', e.message, 'error'); }
    }));
}

// ============================================================
//  PRODUCTS
// ============================================================
async function loadProducts() {
    try { productsCache = await api('/admin/products'); categories = await api('/categories'); }
    catch (e) { return toast('Failed to load products', e.message, 'error'); }
    renderProducts();
}
$('#productSearch').addEventListener('input', renderProducts);
function renderProducts() {
    const q = $('#productSearch').value.toLowerCase();
    const list = productsCache.filter(p => p.name.toLowerCase().includes(q) || p.category.includes(q));
    $('#productGrid').innerHTML = list.map(p => `
        <div class="padmin">
            <div class="pimg">
                <span class="prating"><i class="fas fa-star"></i> ${p.rating} (${p.reviewCount})</span>
                <img src="${p.image}" onerror="this.src='images/placeholder-food.svg'">
                ${p.available ? '' : '<div class="unavailable-tag">Unavailable</div>'}
            </div>
            <div class="pbody">
                <div class="pname">${p.name}</div>
                <div class="pcat">${p.category}</div>
                <div class="pprice">${rs(p.price)}</div>
                <div class="pactions">
                    <button class="edit" data-id="${p._id}" ${IS_DEMO ? 'disabled' : ''}><i class="fas fa-pen"></i> Edit</button>
                    <button class="del" data-id="${p._id}" ${IS_DEMO ? 'disabled' : ''}><i class="fas fa-trash"></i></button>
                </div>
            </div>
        </div>`).join('') || `<div class="empty"><i class="fas fa-burger"></i><p>No products</p></div>`;
    $$('#productGrid .edit').forEach(b => b.addEventListener('click', () => openProductModal(b.dataset.id)));
    $$('#productGrid .del').forEach(b => b.addEventListener('click', () => deleteProduct(b.dataset.id)));
}

let editingProductId = null;
function fillCategorySelect() {
    $('#pCategory').innerHTML = categories.map(c => `<option value="${c.slug}">${c.label}</option>`).join('');
}
function openProductModal(id) {
    fillCategorySelect();
    editingProductId = id || null;
    $('#productModalTitle').textContent = id ? 'Edit Product' : 'Add Product';
    const p = id ? productsCache.find(x => x._id === id) : null;
    $('#pName').value = p ? p.name : '';
    $('#pPrice').value = p ? p.price : '';
    $('#pDesc').value = p ? p.description : '';
    $('#pCategory').value = p ? p.category : (categories[0] && categories[0].slug);
    $('#pRating').value = p ? p.rating : 4.5;
    $('#pImage').value = p ? p.image : '';
    $('#pImagePreview').src = p ? p.image : 'images/placeholder-food.svg';
    $('#pVeg').checked = p ? p.isVegetarian : false;
    $('#pSpicy').checked = p ? p.isSpicy : false;
    $('#pRec').checked = p ? p.recommended : false;
    $('#pAvail').checked = p ? p.available : true;
    $('#productModal').classList.add('open');
}
$('#addProductBtn').addEventListener('click', () => openProductModal(null));
$('#pImage').addEventListener('input', () => { $('#pImagePreview').src = $('#pImage').value || 'images/placeholder-food.svg'; });
$('#pImageFile').addEventListener('change', async (e) => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
        try {
            const r = await api('/admin/upload', { method: 'POST', body: { dataUrl: reader.result, filename: file.name.split('.')[0] } });
            $('#pImage').value = r.path; $('#pImagePreview').src = r.path;
            toast('Image uploaded');
        } catch (err) { toast('Upload failed', err.message, 'error'); }
    };
    reader.readAsDataURL(file);
});
$('#saveProductBtn').addEventListener('click', async () => {
    if (demoBlocked()) return;
    const body = {
        name: $('#pName').value.trim(), price: $('#pPrice').value, description: $('#pDesc').value.trim(),
        category: $('#pCategory').value, rating: $('#pRating').value, image: $('#pImage').value.trim() || 'images/placeholder-food.svg',
        isVegetarian: $('#pVeg').checked, isSpicy: $('#pSpicy').checked, recommended: $('#pRec').checked, available: $('#pAvail').checked,
    };
    if (!body.name || !body.price) return toast('Name and price required', '', 'error');
    try {
        if (editingProductId) await api(`/admin/products/${editingProductId}`, { method: 'PUT', body });
        else await api('/admin/products', { method: 'POST', body });
        $('#productModal').classList.remove('open');
        toast(editingProductId ? 'Product updated' : 'Product added');
        loadProducts();
    } catch (e) { toast('Save failed', e.message, 'error'); }
});
async function deleteProduct(id) {
    if (!confirm('Delete this product?')) return;
    try { await api(`/admin/products/${id}`, { method: 'DELETE' }); toast('Product deleted'); loadProducts(); }
    catch (e) { toast('Delete failed', e.message, 'error'); }
}

// ============================================================
//  CATEGORIES
// ============================================================
async function loadCategories() {
    try { categories = await api('/categories'); } catch (e) { return toast('Failed', e.message, 'error'); }
    $('#categoriesTable').innerHTML = `
        <thead><tr><th>Icon</th><th>Label</th><th>Slug</th><th>Order</th><th></th></tr></thead>
        <tbody>${categories.map(c => `
            <tr>
                <td><i class="fas ${c.icon}" style="color:var(--primary)"></i></td>
                <td class="cell-strong">${c.label}</td>
                <td class="muted">${c.slug}</td>
                <td>${c.sort_order}</td>
                <td><button class="btn btn-ghost del-cat" data-id="${c.id}" ${IS_DEMO ? 'disabled' : ''} style="padding:.4rem .8rem"><i class="fas fa-trash"></i></button></td>
            </tr>`).join('')}</tbody>`;
    $$('#categoriesTable .del-cat').forEach(b => b.addEventListener('click', async () => {
        if (!confirm('Delete category?')) return;
        try { await api(`/categories/${b.dataset.id}`, { method: 'DELETE' }); toast('Category deleted'); loadCategories(); }
        catch (e) { toast('Failed', e.message, 'error'); }
    }));
}
$('#addCategoryBtn').addEventListener('click', () => { ['cLabel','cSlug','cIcon'].forEach(i=>$('#'+i).value=''); $('#cSort').value=0; $('#categoryModal').classList.add('open'); });
$('#saveCategoryBtn').addEventListener('click', async () => {
    if (demoBlocked()) return;
    const body = { label: $('#cLabel').value.trim(), slug: $('#cSlug').value.trim().toLowerCase().replace(/\s+/g,'-'), icon: $('#cIcon').value.trim() || 'fa-utensils', sort_order: Number($('#cSort').value) || 0 };
    if (!body.label || !body.slug) return toast('Label and slug required', '', 'error');
    try { await api('/categories', { method: 'POST', body }); $('#categoryModal').classList.remove('open'); toast('Category added'); loadCategories(); }
    catch (e) { toast('Failed', e.message, 'error'); }
});

// ============================================================
//  RESERVATIONS
// ============================================================
async function loadReservations() {
    let list; try { list = await api('/admin/reservations'); } catch (e) { return toast('Failed', e.message, 'error'); }
    const today = todayStr();
    $('#reservationsTable').innerHTML = `
        <thead><tr><th>Guest</th><th>Phone</th><th>Date</th><th>Time</th><th>Party</th><th>Notes</th><th>Status</th></tr></thead>
        <tbody>${list.length ? list.map(r => {
            // A guest can only be seated on/after their booking day — hide "seated" for future bookings.
            let allowed = RES_TRANSITIONS[r.status] || [];
            if (r.date > today) allowed = allowed.filter(s => s !== 'seated');
            const future = r.date > today;
            return `
            <tr>
                <td class="cell-strong">${r.name}</td>
                <td class="muted">${r.phone}</td>
                <td>${r.date}${future ? ' <span class="res-upcoming" title="Upcoming booking">upcoming</span>' : ''}</td>
                <td>${r.time}</td>
                <td><i class="fas fa-user-group muted"></i> ${r.party_size}</td>
                <td class="muted">${r.notes || '—'}</td>
                <td>${statusCell(r.status, allowed, 'res', r.id)}</td>
            </tr>`; }).join('') : `<tr><td colspan="7"><div class="empty"><i class="fas fa-calendar-check"></i><p>No reservations</p></div></td></tr>`}</tbody>`;
    $$('#reservationsTable .status-select').forEach(sel => sel.addEventListener('change', async () => {
        try { await api(`/admin/reservations/${sel.dataset.res}/status`, { method: 'PUT', body: { status: sel.value } }); toast('Reservation updated'); loadReservations(); }
        catch (e) { toast('Failed', e.message, 'error'); }
    }));
}

// ============================================================
//  CUSTOMERS
// ============================================================
async function loadCustomers() {
    try { customersCache = await api('/admin/customers'); } catch (e) { return toast('Failed', e.message, 'error'); }
    renderCustomers();
}
$('#customerSearch').addEventListener('input', renderCustomers);
function renderCustomers() {
    const q = $('#customerSearch').value.toLowerCase();
    const list = customersCache.filter(c => c.username.toLowerCase().includes(q) || c.email.toLowerCase().includes(q));
    $('#customersTable').innerHTML = `
        <thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Role</th><th>Orders</th><th>Total Spent</th><th>Joined</th></tr></thead>
        <tbody>${list.map(c => `
            <tr>
                <td class="cell-strong">${c.username}</td>
                <td class="muted">${c.email}</td>
                <td class="muted">${c.phone || '—'}</td>
                <td><span class="badge ${c.role}">${c.role}</span></td>
                <td>${c.orderCount}</td>
                <td class="cell-strong">${rs(c.totalSpent)}</td>
                <td class="muted">${fmtDate(c.created_at)}</td>
            </tr>`).join('')}</tbody>`;
}

// ============================================================
//  REVIEWS
// ============================================================
async function loadReviews() {
    let grouped, menu;
    try { grouped = await api('/reviews', { auth: false }); menu = await api('/menu', { auth: false }); }
    catch (e) { return toast('Failed', e.message, 'error'); }
    menuMap = {}; menu.forEach(m => menuMap[m._id] = m);
    const ids = Object.keys(grouped).sort((a, b) => grouped[b].length - grouped[a].length);
    $('#reviewsAdmin').innerHTML = ids.map(id => {
        const revs = grouped[id]; const m = menuMap[id] || { name: 'Product ' + id, rating: 0 };
        const avg = (revs.reduce((s, r) => s + r.rating, 0) / revs.length).toFixed(1);
        return `<div class="rev-product">
            <h4>${m.name} <span class="rev-avg"><i class="fas fa-star"></i> ${avg}</span> <span class="muted">(${revs.length})</span></h4>
            <div class="rev-list">${revs.map(r => `
                <div class="rev-row">
                    <div class="rev-top">
                        <span class="rev-user">${r.user} ${r.verified ? '<span class="verified-tag"><i class="fas fa-check"></i> Verified</span>' : ''}</span>
                        <span class="rev-stars">${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)}</span>
                    </div>
                    ${r.comment ? `<div class="rev-text">${r.comment}</div>` : ''}
                </div>`).join('')}</div>
        </div>`;
    }).join('') || `<div class="empty"><i class="fas fa-star"></i><p>No reviews yet</p></div>`;
}

// ============================================================
//  NOTIFICATIONS + REAL-TIME
// ============================================================
function updateBadges(orders, reservations) {
    const ob = $('#ordersBadge'), rb = $('#resBadge');
    ob.textContent = orders || ''; ob.classList.toggle('show', orders > 0);
    rb.textContent = reservations || ''; rb.classList.toggle('show', reservations > 0);
}
async function loadNotifications() {
    try { notifications = await api('/notifications'); } catch (e) { return; }
    renderNotifications();
}
function renderNotifications() {
    const unread = notifications.filter(n => !n.is_read).length;
    const bc = $('#bellCount'); bc.textContent = unread; bc.classList.toggle('show', unread > 0);
    $('#bellList').innerHTML = notifications.length ? notifications.map(n => `
        <div class="bell-item ${n.is_read ? '' : 'unread'}">
            <div class="dot ${n.type.includes('reservation') ? 'reservation' : n.type.includes('customer') ? 'customer' : 'order'}">
                <i class="fas ${n.type.includes('reservation') ? 'fa-calendar-check' : n.type.includes('customer') ? 'fa-user-plus' : 'fa-receipt'}"></i>
            </div>
            <div><h5>${n.title}</h5><p>${n.message || ''}</p><time>${fmtDate(n.created_at)}</time></div>
        </div>`).join('') : `<div class="bell-empty"><i class="fas fa-bell-slash"></i><p>No notifications</p></div>`;
}
$('#bell').querySelector('i').addEventListener('click', () => $('#bellPanel').classList.toggle('open'));
document.addEventListener('click', (e) => { if (!$('#bell').contains(e.target)) $('#bellPanel').classList.remove('open'); });
$('#markRead').addEventListener('click', async () => { try { await api('/notifications/read-all', { method: 'POST' }); loadNotifications(); } catch {} });

function initRealtime() {
    if (evtSource) evtSource.close();
    evtSource = new EventSource(`${API}/events?token=${encodeURIComponent(token)}`);
    evtSource.onmessage = (e) => {
        let data; try { data = JSON.parse(e.data); } catch { return; }
        if (data.type === 'connected') return;
        toast(data.title, data.message, 'success', data.type.includes('reservation') ? 'fa-calendar-check' : data.type.includes('customer') ? 'fa-user-plus' : 'fa-receipt');
        loadNotifications();
        // live-refresh whatever is open
        const active = $('.view.active');
        if (active) { const v = active.id.replace('view-', ''); ({ dashboard: loadDashboard, orders: loadOrders, reservations: loadReservations, customers: loadCustomers })[v]?.(); }
    };
    evtSource.onerror = () => { /* browser auto-reconnects */ };
}

// ---------- helpers ----------
function fmtDate(s) {
    if (!s) return '—';
    const d = new Date(s.replace(' ', 'T') + (s.includes('T') || s.length <= 10 ? '' : 'Z'));
    if (isNaN(d)) return s;
    return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// Close modals
$$('[data-close]').forEach(b => b.addEventListener('click', () => $$('.modal').forEach(m => m.classList.remove('open'))));
$$('.modal').forEach(m => m.addEventListener('click', e => { if (e.target === m) m.classList.remove('open'); }));

// ---------- boot ----------
if (token && adminUser && adminUser.role === 'admin') {
    // verify token still valid
    api('/admin/analytics').then(() => showApp()).catch(() => { showLogin(); });
} else {
    showLogin();
}

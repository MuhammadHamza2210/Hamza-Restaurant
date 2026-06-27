// Configuration
const CONFIG = {
    // Relative path: works when served from the Node server (http://localhost:5000)
    // and harmlessly fails (falling back to browser storage) when opened as a file://.
    API_BASE_URL: '/api',
    DELIVERY_FEE: 100,
    TAX_RATE: 0.05,
    RESTAURANT_NAME: 'Zaiqa'
};

// ---- Backend API helper layer -------------------------------------------
// Every call gracefully falls back to localStorage if the server is offline.
let backendAvailable = false;

function getToken() {
    const raw = localStorage.getItem('smartOrdering_user');
    if (!raw) return null;
    try { return JSON.parse(raw).token || null; } catch (e) { return null; }
}

async function api(path, { method = 'GET', body = null, auth = false } = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (auth) {
        const token = getToken();
        if (token) headers['Authorization'] = 'Bearer ' + token;
    }
    const res = await fetch(`${CONFIG.API_BASE_URL}${path}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.msg || 'Request failed');
    return data;
}

async function checkBackend() {
    try {
        await api('/health');
        backendAvailable = true;
    } catch (e) {
        backendAvailable = false;
        console.log('Backend offline — using browser storage.');
    }
    return backendAvailable;
}

// Server stores dates as "YYYY-MM-DD HH:MM:SS"; make it reliably parseable.
function normalizeOrder(o) {
    return { ...o, createdAt: o.createdAt ? o.createdAt.replace(' ', 'T') : new Date().toISOString() };
}

// Pull the logged-in user's favorites + orders from the server
async function syncUserData() {
    if (!backendAvailable || !getToken()) return;
    try {
        const [favs, ords] = await Promise.all([
            api('/favorites', { auth: true }),
            api('/orders', { auth: true })
        ]);
        favorites = favs;
        saveFavorites();
        updateFavCount();
        orders = ords.map(normalizeOrder);
        saveOrders();
        applyFilters();
    } catch (e) {
        console.log('Could not sync user data:', e.message);
    }
}

// Load the live menu (with consistent ratings/review counts) from the database
async function fetchMenuFromServer() {
    if (!backendAvailable) return;
    try {
        const data = await api('/menu');
        if (Array.isArray(data) && data.length) {
            menuItems = data;
            applyFilters();
        }
    } catch (e) {
        console.log('Could not load live menu, using built-in list:', e.message);
    }
}

// ---- Real-time notifications (Server-Sent Events) ----------------------
let eventSource = null;
let customerNotifications = [];

function connectRealtime() {
    if (!backendAvailable || !getToken()) return;
    if (eventSource) eventSource.close();
    eventSource = new EventSource(`${CONFIG.API_BASE_URL}/events?token=${encodeURIComponent(getToken())}`);
    eventSource.onmessage = (e) => {
        let data; try { data = JSON.parse(e.data); } catch { return; }
        if (data.type === 'connected') return;
        showNotification(`${data.title}${data.message ? ' — ' + data.message : ''}`, 'success');
        loadCustomerNotifications();
        // refresh order statuses live
        syncUserData().then(() => {
            if (document.getElementById('orders').classList.contains('active')) loadUserOrders();
        });
    };
    eventSource.onerror = () => { /* browser auto-reconnects */ };
    loadCustomerNotifications();
}

async function loadCustomerNotifications() {
    if (!backendAvailable || !getToken()) return;
    try {
        customerNotifications = await api('/notifications', { auth: true });
        renderCustomerNotifications();
    } catch (e) { /* ignore */ }
}

function renderCustomerNotifications() {
    const bell = document.getElementById('bellIcon');
    const countEl = document.getElementById('bellCount');
    const listEl = document.getElementById('bellDropdownList');
    if (!bell) return;
    bell.style.display = currentUser ? 'flex' : 'none';
    const unread = customerNotifications.filter(n => !n.is_read).length;
    if (countEl) { countEl.textContent = unread; countEl.style.display = unread > 0 ? 'flex' : 'none'; }
    if (listEl) {
        listEl.innerHTML = customerNotifications.length
            ? customerNotifications.map(n => `
                <div class="bell-note ${n.is_read ? '' : 'unread'}">
                    <div class="bn-dot"><i class="fas ${n.type && n.type.includes('reservation') ? 'fa-calendar-check' : 'fa-receipt'}"></i></div>
                    <div><h5>${n.title}</h5><p>${n.message || ''}</p></div>
                </div>`).join('')
            : '<div class="bell-empty"><i class="fas fa-bell-slash"></i><p>No notifications yet</p></div>';
    }
}

// Application State
let currentUser = null;
let cart = [];
let orders = [];
let menuItems = [];
let favorites = [];
let currentOrderId = null;
let currentProductForReview = null;

// Filter / sort state
let currentCategory = 'all';
let currentSearch = '';
let currentSort = 'recommended';
let vegOnly = false;
let showFavoritesOnly = false;

// DOM Elements
const elements = {
    navLinks: document.querySelectorAll('.nav-link'),
    cartIcon: document.getElementById('cartIcon'),
    cartCount: document.getElementById('cartCount'),
    userSection: document.getElementById('userSection'),
    loginBtn: document.getElementById('loginBtn'),
    sections: document.querySelectorAll('.section'),
    exploreMenu: document.getElementById('exploreMenu'),
    checkoutBtn: document.getElementById('checkoutBtn'),
    placeOrderBtn: document.getElementById('placeOrderBtn'),
    authModal: document.getElementById('authModal'),
    productReviewModal: document.getElementById('productReviewModal'),
    closeModals: document.querySelectorAll('.close-modal'),
    loginForm: document.getElementById('loginForm'),
    signupForm: document.getElementById('signupForm'),
    authTabs: document.querySelectorAll('.auth-tab'),
    menuGrid: document.getElementById('menuGrid'),
    categoryBtns: document.querySelectorAll('.category-btn'),
    searchInput: document.getElementById('searchInput'),
    cartItems: document.getElementById('cartItems'),
    cartTotal: document.getElementById('cartTotal'),
    subtotal: document.getElementById('subtotal'),
    taxAmount: document.getElementById('taxAmount'),
    finalTotal: document.getElementById('finalTotal'),
    reviewItems: document.getElementById('reviewItems'),
    reviewTotal: document.getElementById('reviewTotal'),
    ordersContainer: document.getElementById('ordersContainer'),
    reviewProductImage: document.getElementById('reviewProductImage'),
    reviewProductName: document.getElementById('reviewProductName'),
    reviewProductCategory: document.getElementById('reviewProductCategory'),
    starRating: document.querySelectorAll('.star-rating i'),
    ratingText: document.getElementById('ratingText'),
    productReviewComment: document.getElementById('productReviewComment'),
    submitProductReview: document.getElementById('submitProductReview'),
    themeToggle: document.getElementById('themeToggle'),
    favIcon: document.getElementById('favIcon'),
    favCount: document.getElementById('favCount'),
    sortSelect: document.getElementById('sortSelect'),
    vegToggle: document.getElementById('vegToggle'),
    resultCount: document.getElementById('resultCount'),
    hamburger: document.getElementById('hamburger'),
    navMenu: document.getElementById('navMenu'),
    backToTop: document.getElementById('backToTop')
};

// Initialize Application
function init() {
    console.log('Initializing Zaiqa...');
    
    // Initialize demo data
    initializeDemoData();
    
    loadTheme();
    loadUserSession();
    loadCart();
    loadFavorites();
    loadOrders();
    setupEventListeners();
    loadMenuItems();
    updateUI();
    setupScrollReveal();

    // Connect to the database server (if running), then sync live data.
    checkBackend().then((online) => {
        if (online) {
            console.log('Connected to database server.');
            fetchMenuFromServer();
            syncUserData();
            connectRealtime();
        }
    });

    console.log('System initialized successfully');
}

// Event Listeners
function setupEventListeners() {
    elements.navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            const href = e.currentTarget.getAttribute('href');
            // Real page links (e.g. Admin -> admin.html) navigate normally
            if (!href.startsWith('#')) return;
            e.preventDefault();
            showSection(href.substring(1));
            updateActiveNav(e.currentTarget);
        });
    });

    elements.cartIcon.addEventListener('click', () => showSection('cart'));
    elements.exploreMenu.addEventListener('click', () => showSection('menu'));
    elements.loginBtn.addEventListener('click', () => showAuthModal());
    
    elements.closeModals.forEach(btn => {
        btn.addEventListener('click', () => hideAllModals());
    });

    elements.authTabs.forEach(tab => {
        tab.addEventListener('click', () => switchAuthTab(tab.dataset.tab));
    });

    elements.loginForm.addEventListener('submit', handleLogin);
    elements.signupForm.addEventListener('submit', handleSignup);
    elements.categoryBtns.forEach(btn => {
        btn.addEventListener('click', () => filterMenu(btn.dataset.category));
    });

    elements.searchInput.addEventListener('input', searchMenu);
    elements.checkoutBtn.addEventListener('click', () => showSection('checkout'));
    elements.placeOrderBtn.addEventListener('click', placeOrder);
    elements.starRating.forEach(star => {
        star.addEventListener('click', setProductRating);
        star.addEventListener('mouseover', hoverProductRating);
    });
    
    elements.starRating[0].closest('.star-rating').addEventListener('mouseleave', resetProductRating);
    elements.submitProductReview.addEventListener('click', submitProductReview);

    // Theme toggle
    elements.themeToggle.addEventListener('click', toggleTheme);

    // Sort + veg filters
    elements.sortSelect.addEventListener('change', (e) => {
        currentSort = e.target.value;
        applyFilters();
    });
    elements.vegToggle.addEventListener('change', (e) => {
        vegOnly = e.target.checked;
        applyFilters();
    });

    // Favorites quick view
    elements.favIcon.addEventListener('click', () => {
        showFavoritesOnly = true;
        currentCategory = 'all';
        elements.categoryBtns.forEach(b => b.classList.remove('active'));
        document.querySelector('[data-category="all"]').classList.add('active');
        showSection('menu');
        updateActiveNav(document.querySelector('.nav-link[href="#menu"]'));
        applyFilters();
        elements.menuGrid.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    // Mobile hamburger
    elements.hamburger.addEventListener('click', () => {
        elements.hamburger.classList.toggle('open');
        elements.navMenu.classList.toggle('open');
    });
    elements.navMenu.addEventListener('click', () => {
        elements.hamburger.classList.remove('open');
        elements.navMenu.classList.remove('open');
    });

    // Back to top
    elements.backToTop.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
    window.addEventListener('scroll', () => {
        elements.backToTop.classList.toggle('show', window.scrollY > 400);
    });

    // Close modal when clicking the backdrop
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) hideAllModals();
        });
    });
    // Close modal on Escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') hideAllModals();
    });

    // Reserve a table
    const reserveCta = document.getElementById('reserveCta');
    if (reserveCta) reserveCta.addEventListener('click', () => {
        showSection('reserve');
        updateActiveNav(document.querySelector('.nav-link[href="#reserve"]'));
    });
    const reservationForm = document.getElementById('reservationForm');
    if (reservationForm) reservationForm.addEventListener('submit', handleReservation);

    // Notifications bell (customer)
    const bellIcon = document.getElementById('bellIcon');
    if (bellIcon) {
        bellIcon.querySelector('i').addEventListener('click', (e) => {
            e.stopPropagation();
            document.getElementById('bellDropdown').classList.toggle('open');
            // mark read on open
            if (backendAvailable && getToken()) {
                api('/notifications/read-all', { method: 'POST', auth: true })
                    .then(loadCustomerNotifications).catch(() => {});
            }
        });
        document.addEventListener('click', (e) => {
            if (!bellIcon.contains(e.target)) document.getElementById('bellDropdown').classList.remove('open');
        });
    }

    // Product detail modal — filters + write review + close
    document.querySelectorAll('.detail-close').forEach(b => b.addEventListener('click', hideAllModals));
    const reviewFilters = document.getElementById('reviewFilters');
    if (reviewFilters) reviewFilters.querySelectorAll('.rf-pill').forEach(p => {
        p.addEventListener('click', () => {
            reviewFilters.querySelectorAll('.rf-pill').forEach(x => x.classList.remove('active'));
            p.classList.add('active');
            renderDetailReviews(p.dataset.filter);
        });
    });
    const writeReviewBtn = document.getElementById('writeReviewBtn');
    if (writeReviewBtn) writeReviewBtn.addEventListener('click', () => {
        if (!currentUser) { showNotification('Please login to write a review', 'error'); showAuthModal(); return; }
        if (currentDetailProduct) {
            const id = currentDetailProduct._id;
            document.getElementById('productDetailModal').classList.remove('active');
            showProductReviewModal(id);
        }
    });

    // Min date for reservations = today
    const resDate = document.getElementById('resDate');
    if (resDate) resDate.min = new Date().toISOString().slice(0, 10);
}

// Section Management
function showSection(sectionName) {
    elements.sections.forEach(section => section.classList.remove('active'));
    const targetSection = document.getElementById(sectionName);
    if (targetSection) {
        targetSection.classList.add('active');
        
        if (sectionName === 'orders') {
            loadUserOrders();
            // Pull the latest orders (and live statuses) from the database
            if (backendAvailable && getToken()) {
                syncUserData().then(loadUserOrders);
            }
        } else if (sectionName === 'checkout') {
            renderCheckoutItems();
        } else if (sectionName === 'menu') {
            applyFilters();
        }
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
}

function updateActiveNav(activeLink) {
    elements.navLinks.forEach(link => link.classList.remove('active'));
    activeLink.classList.add('active');
}

// Authentication - COMPLETELY UPDATED
function showAuthModal() {
    if (currentUser) {
        logout();
        return;
    }
    elements.authModal.classList.add('active');
}

function hideAllModals() {
    document.querySelectorAll('.modal').forEach(modal => {
        modal.classList.remove('active');
    });
}

function switchAuthTab(tabName) {
    elements.authTabs.forEach(tab => tab.classList.remove('active'));
    elements.authTabs.forEach(tab => {
        if (tab.dataset.tab === tabName) tab.classList.add('active');
    });

    document.querySelectorAll('.auth-form').forEach(form => form.classList.remove('active'));
    document.getElementById(`${tabName}Form`).classList.add('active');
}

async function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;

    if (!email || !password) {
        showNotification('Please fill in all fields', 'error');
        return;
    }

    try {
        // Try backend API first
        let data;
        try {
            const response = await fetch(`${CONFIG.API_BASE_URL}/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });

            if (response.ok) {
                data = await response.json();
            } else {
                throw new Error('Backend unavailable');
            }
        } catch (backendError) {
            console.log('Backend unavailable, using client-side authentication...');
            data = await handleClientSideLogin(email, password);
        }

        if (data && data.user) {
            currentUser = data.user;
            localStorage.setItem('smartOrdering_user', JSON.stringify(data));
            updateUI();
            hideAllModals();
            showNotification(`Welcome back, ${currentUser.username}!`, 'success');
            syncUserData();

            // Clear form
            document.getElementById('loginForm').reset();
        } else {
            throw new Error(data?.msg || 'Login failed');
        }
        
    } catch (error) {
        console.error('Login error:', error);
        showNotification(error.message || 'Login failed. Please check your credentials.', 'error');
    }
}

async function handleSignup(e) {
    e.preventDefault();
    const name = document.getElementById('signupName').value;
    const email = document.getElementById('signupEmail').value;
    const phone = document.getElementById('signupPhone').value;
    const password = document.getElementById('signupPassword').value;

    if (!name || !email || !phone || !password) {
        showNotification('Please fill in all fields', 'error');
        return;
    }

    // Basic validation
    if (password.length < 6) {
        showNotification('Password must be at least 6 characters long', 'error');
        return;
    }

    if (!isValidEmail(email)) {
        showNotification('Please enter a valid email address', 'error');
        return;
    }

    if (!isValidPhone(phone)) {
        showNotification('Please enter a valid phone number (03XX-XXXXXXX)', 'error');
        return;
    }

    try {
        // Try backend API first
        let data;
        try {
            const response = await fetch(`${CONFIG.API_BASE_URL}/signup`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: name, email, phone, password })
            });

            if (response.ok) {
                data = await response.json();
            } else {
                throw new Error('Backend unavailable');
            }
        } catch (backendError) {
            console.log('Backend unavailable, using client-side signup...');
            data = await handleClientSideSignup(name, email, phone, password);
        }

        if (data && data.user) {
            currentUser = data.user;
            localStorage.setItem('smartOrdering_user', JSON.stringify(data));
            updateUI();
            hideAllModals();
            showNotification(`Account created! Welcome, ${currentUser.username}!`, 'success');
            syncUserData();

            // Clear form
            document.getElementById('signupForm').reset();
        } else {
            throw new Error(data?.msg || 'Signup failed');
        }
        
    } catch (error) {
        console.error('Signup error:', error);
        showNotification(error.message || 'Signup failed. Please try again.', 'error');
    }
}

// Client-side authentication fallback
async function handleClientSideLogin(email, password) {
    return new Promise((resolve, reject) => {
        setTimeout(() => {
            const existingUsers = JSON.parse(localStorage.getItem('smartOrdering_users') || '[]');
            const user = existingUsers.find(u => u.email === email && u.password === password);
            
            if (user) {
                resolve({
                    user: {
                        id: user.id,
                        username: user.username,
                        email: user.email,
                        phone: user.phone
                    },
                    token: 'client-side-token-' + Date.now()
                });
            } else {
                reject(new Error('Invalid email or password'));
            }
        }, 500);
    });
}

async function handleClientSideSignup(name, email, phone, password) {
    return new Promise((resolve, reject) => {
        setTimeout(() => {
            const existingUsers = JSON.parse(localStorage.getItem('smartOrdering_users') || '[]');
            
            // Check if user already exists
            if (existingUsers.find(u => u.email === email)) {
                reject(new Error('User already exists with this email'));
                return;
            }
            
            // Create new user
            const newUser = {
                id: 'user_' + Date.now(),
                username: name,
                email: email,
                phone: phone,
                password: password,
                createdAt: new Date().toISOString()
            };
            
            // Save to localStorage
            existingUsers.push(newUser);
            localStorage.setItem('smartOrdering_users', JSON.stringify(existingUsers));
            
            resolve({
                user: {
                    id: newUser.id,
                    username: newUser.username,
                    email: newUser.email,
                    phone: newUser.phone
                },
                token: 'client-side-token-' + Date.now()
            });
        }, 500);
    });
}

// Utility functions for validation
function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

function isValidPhone(phone) {
    const phoneRegex = /^03\d{2}-\d{7}$/;
    return phoneRegex.test(phone);
}

function logout() {
    currentUser = null;
    localStorage.removeItem('smartOrdering_user');
    // Clear this user's synced data so it doesn't leak to the next person on this browser
    if (backendAvailable) {
        favorites = [];
        orders = [];
        saveFavorites();
        saveOrders();
    }
    updateUI();
    applyFilters();
    showNotification('Logged out successfully', 'success');
}

// Initialize demo data
function initializeDemoData() {
    // Create demo users if none exist
    const existingUsers = JSON.parse(localStorage.getItem('smartOrdering_users') || '[]');
    if (existingUsers.length === 0) {
        const demoUsers = [
            {
                id: 'demo_user_1',
                username: 'Demo User',
                email: 'demo@example.com',
                phone: '0300-1234567',
                password: 'password123',
                createdAt: new Date().toISOString()
            },
            {
                id: 'demo_user_2',
                username: 'Test Customer',
                email: 'test@example.com',
                phone: '0312-3456789',
                password: 'test123',
                createdAt: new Date().toISOString()
            }
        ];
        localStorage.setItem('smartOrdering_users', JSON.stringify(demoUsers));
        console.log('Demo users created');
        console.log('[email] demo@example.com / password123');
        console.log('[email] test@example.com / test123');
    }

    // Add sample order for demonstration
    const existingOrders = JSON.parse(localStorage.getItem('smartOrdering_orders') || '[]');
    if (existingOrders.length === 0) {
        const sampleOrder = {
            _id: 'SO123456',
            items: [
                { 
                    _id: '1',
                    name: 'Chicken Biryani',
                    price: 850, 
                    quantity: 1,
                    image: 'images/chicken-biryani.webp'
                },
                { 
                    _id: '22',
                    name: 'Mango Lassi',
                    price: 220, 
                    quantity: 2,
                    image: 'images/mango-lassi.jpg'
                }
            ],
            total: 1290,
            status: 'delivered',
            createdAt: new Date('2024-01-15'),
            customerName: 'Ali Ahmed',
            customerPhone: '0300-1234567',
            deliveryAddress: '123 Main Street, Karachi'
        };
        
        existingOrders.push(sampleOrder);
        localStorage.setItem('smartOrdering_orders', JSON.stringify(existingOrders));
        console.log('Sample order created');
    }
}

// Menu Management with Images
function loadMenuItems() {
  menuItems = [
    // Main Course
    {
        _id: '1',
        name: 'Chicken Biryani',
        description: 'Aromatic basmati rice cooked with tender chicken pieces, traditional spices, saffron, and served with raita. A perfect blend of flavors that will tantalize your taste buds.',
        price: 850,
        category: 'main-course',
        image: 'images/chicken-biryani.webp',
        isVegetarian: false,
        isSpicy: true,
        recommended: true,
        rating: 4.8,
        reviews: [
            { user: 'Ali Khan', rating: 5, comment: 'Best biryani in town! Perfectly cooked and full of flavor.' },
            { user: 'Sara Ahmed', rating: 4, comment: 'Loved the aroma and taste. Will order again!' }
        ]
    },
    {
        _id: '2',
        name: 'Mutton Biryani',
        description: 'Premium mutton pieces slow-cooked with fragrant basmati rice, caramelized onions, and exotic spices. A royal treat for biryani lovers.',
        price: 1200,
        category: 'main-course',
        image: 'images/mutton-biryani.jpg',
        isVegetarian: false,
        isSpicy: true,
        recommended: true,
        rating: 4.7,
        reviews: [
            { user: 'Ahmed Raza', rating: 5, comment: 'The mutton was so tender and flavorful. Excellent!' }
        ]
    },
    {
        _id: '3',
        name: 'Beef White Biryani',
        description: 'A unique preparation of biryani with tender beef chunks, white rice, and mild spices. Perfect for those who prefer less spicy food.',
        price: 950,
        category: 'main-course',
        image: 'images/beef-white-biryani.jpg',
        isVegetarian: false,
        isSpicy: false,
        rating: 4.5,
        reviews: []
    },
    {
        _id: '4',
        name: 'Chana Biryani',
        description: 'Vegetarian delight with chickpeas cooked in aromatic rice and traditional spices. A healthy and flavorful option for vegetarians.',
        price: 550,
        category: 'main-course',
        image: 'images/chana-biryani.webp',
        isVegetarian: true,
        isSpicy: true,
        rating: 4.3,
        reviews: []
    },
    {
        _id: '5',
        name: 'Beef Karahi',
        description: 'Traditional beef karahi cooked in wok with fresh tomatoes, ginger, garlic, and green chilies. Served with naan or roti.',
        price: 1100,
        category: 'main-course',
        image: 'images/beef-karahi.jpg',
        isVegetarian: false,
        isSpicy: true,
        recommended: true,
        rating: 4.6,
        reviews: []
    },
    {
        _id: '6',
        name: 'Chicken Karahi',
        description: 'Classic chicken karahi prepared with fresh ingredients, cooked to perfection in traditional wok. A must-try Pakistani delicacy.',
        price: 900,
        category: 'main-course',
        image: 'images/chicken-karahi.webp',
        isVegetarian: false,
        isSpicy: true,
        rating: 4.7,
        reviews: []
    },
    {
        _id: '7',
        name: 'Nihari',
        description: 'Slow-cooked beef shank in rich and aromatic gravy with traditional spices. Served with naan and garnished with ginger, coriander, and green chilies.',
        price: 800,
        category: 'main-course',
        image: 'images/nihari.jpg',
        isVegetarian: false,
        isSpicy: true,
        recommended: true,
        rating: 4.9,
        reviews: []
    },

    // BBQ & Grill
    {
        _id: '8',
        name: 'Chicken Tikka',
        description: 'Boneless chicken pieces marinated in yogurt and spices, grilled to perfection in tandoor. Served with mint chutney and salad.',
        price: 750,
        category: 'bbq-grill',
        image: 'images/chicken-tikka.jpg',
        isVegetarian: false,
        isSpicy: true,
        rating: 4.6,
        reviews: []
    },

    // Fast Food
    {
        _id: '9',
        name: 'Zinger Burger',
        description: 'Crispy fried chicken fillet with special sauce, fresh lettuce, and cheese in a soft bun. The ultimate fast food experience.',
        price: 450,
        category: 'fast-food',
        image: 'images/zinger-burger.jpg',
        isVegetarian: false,
        isSpicy: true,
        recommended: true,
        rating: 4.5,
        reviews: []
    },
    {
        _id: '10',
        name: 'Zinger Paratha Roll',
        description: 'Crispy zinger strips wrapped in soft paratha with vegetables and special sauces. A perfect fusion of flavors.',
        price: 350,
        category: 'fast-food',
        image: 'images/zinger-paratha-roll.jpg',
        isVegetarian: false,
        isSpicy: true,
        rating: 4.4,
        reviews: []
    },
    {
        _id: '11',
        name: 'Chicken Roll',
        description: 'Soft paratha filled with grilled chicken, fresh vegetables, and signature sauces. A quick and satisfying meal.',
        price: 300,
        category: 'fast-food',
        image: 'images/chicken-roll.jpg',
        isVegetarian: false,
        isSpicy: true,
        rating: 4.3,
        reviews: []
    },
    {
        _id: '12',
        name: 'Chicken Shawarma',
        description: 'Middle-eastern delight with marinated chicken, garlic sauce, pickles, and fries wrapped in pita bread.',
        price: 320,
        category: 'fast-food',
        image: 'images/chicken-shawarma.avif',
        isVegetarian: false,
        isSpicy: true,
        rating: 4.6,
        reviews: []
    },
    {
        _id: '13',
        name: 'Chicken Sandwich',
        description: 'Grilled chicken breast with fresh lettuce, tomato, mayo, and cheese between toasted bread slices.',
        price: 280,
        category: 'fast-food',
        image: 'images/chicken-sandwich.webp',
        isVegetarian: false,
        isSpicy: false,
        rating: 4.2,
        reviews: []
    },
    {
        _id: '14',
        name: 'Cheese Pizza',
        description: 'Classic pizza with mozzarella cheese, tomato sauce, and oregano on thin crust. Simple yet delicious.',
        price: 900,
        category: 'fast-food',
        image: 'images/cheese-pizza.jpg',
        isVegetarian: true,
        isSpicy: false,
        rating: 4.4,
        reviews: []
    },
    {
        _id: '15',
        name: 'Italian Pizza',
        description: 'Authentic Italian pizza with premium toppings, fresh basil, and olive oil on hand-tossed crust.',
        price: 1200,
        category: 'fast-food',
        image: 'images/italian-pizza.avif',
        isVegetarian: false,
        isSpicy: true,
        recommended: true,
        rating: 4.7,
        reviews: []
    },
    {
        _id: '16',
        name: 'French Fries',
        description: 'Crispy golden fries seasoned with special spices. Perfect side dish with any meal.',
        price: 200,
        category: 'fast-food',
        image: 'images/french-fries.webp',
        isVegetarian: true,
        isSpicy: false,
        rating: 4.1,
        reviews: []
    },
    {
        _id: '17',
        name: 'Pizza Fries',
        description: 'Crispy fries topped with pizza sauce, cheese, and herbs. The perfect fusion snack.',
        price: 350,
        category: 'fast-food',
        image: 'images/pizza-fries.jpg',
        isVegetarian: true,
        isSpicy: false,
        rating: 4.3,
        reviews: []
    },

    // Sweets
    {
        _id: '18',
        name: 'Rabri Falooda',
        description: 'Traditional dessert with rabri, falooda sev, basil seeds, nuts, and rose syrup. A refreshing summer treat.',
        price: 350,
        category: 'sweets',
        image: 'images/rabri-falooda.webp',
        isVegetarian: true,
        isSpicy: false,
        recommended: true,
        rating: 4.8,
        reviews: []
    },
    {
        _id: '19',
        name: 'Malai Rabri Kulfi',
        description: 'Creamy kulfi made with reduced milk, saffron, cardamom, and nuts. Served with rabri for extra richness.',
        price: 300,
        category: 'sweets',
        image: 'images/malai-rabri-kulfi.avif',
        isVegetarian: true,
        isSpicy: false,
        rating: 4.7,
        reviews: []
    },
    {
        _id: '20',
        name: 'Oreo Ice Cream',
        description: 'Creamy ice cream loaded with Oreo cookie chunks. A perfect treat for chocolate and cookie lovers.',
        price: 250,
        category: 'sweets',
        image: 'images/oreo-ice-cream.jpg',
        isVegetarian: true,
        isSpicy: false,
        rating: 4.5,
        reviews: []
    },
    {
        _id: '21',
        name: 'Classic Ice Cream',
        description: 'Rich and creamy vanilla ice cream made with real vanilla beans. Simple, classic, and delicious.',
        price: 200,
        category: 'sweets',
        image: 'images/ice-cream.jpg',
        isVegetarian: true,
        isSpicy: false,
        rating: 4.3,
        reviews: []
    },

    // Drinks
    {
        _id: '22',
        name: 'Mango Lassi',
        description: 'Refreshing yogurt-based drink with sweet mango pulp, cardamom, and rose water. Perfect summer cooler.',
        price: 220,
        category: 'drinks',
        image: 'images/mango-lassi.jpg',
        isVegetarian: true,
        isSpicy: false,
        recommended: true,
        rating: 4.6,
        reviews: []
    },
    {
        _id: '23',
        name: 'Traditional Chai',
        description: 'Authentic Pakistani tea brewed with milk, cardamom, and special tea leaves. The perfect comfort drink.',
        price: 100,
        category: 'drinks',
        image: 'images/chai.jpg',
        isVegetarian: true,
        isSpicy: false,
        rating: 4.4,
        reviews: []
    },
    {
        _id: '24',
        name: 'Fresh Lemonade',
        description: 'Freshly squeezed lemons with mint, sugar, and a hint of salt. Refreshing and revitalizing.',
        price: 150,
        category: 'drinks',
        image: 'images/lemonade.webp',
        isVegetarian: true,
        isSpicy: false,
        rating: 4.2,
        reviews: []
    }
];


    applyFilters();
}

function renderMenu(filteredItems = menuItems) {
    if (filteredItems.length === 0) {
        elements.menuGrid.innerHTML = `
            <div class="empty-state" style="grid-column: 1 / -1;">
                <i class="fas fa-utensils"></i>
                <h3>No dishes found</h3>
                <p>Try a different category, clear the search, or turn off filters.</p>
                <button class="btn-primary" onclick="resetFilters()">Reset Filters</button>
            </div>`;
        return;
    }

    elements.menuGrid.innerHTML = filteredItems.map((item, index) => {
        const inCart = cart.find(c => c._id === item._id);
        const isFav = favorites.includes(item._id);
        const ratingNum = Number(item.rating).toFixed(1);
        const reviewCount = item.reviewCount != null ? item.reviewCount : (item.reviews ? item.reviews.length : 0);
        const preview = item.topReview || (item.reviews && item.reviews[0]) || null;
        return `
        <div class="menu-item reveal" data-id="${item._id}" style="transition-delay:${Math.min(index * 50, 400)}ms">
            <div class="menu-item-image">
                <img src="${item.image}" alt="${item.name}" loading="lazy"
                     onerror="this.src='images/placeholder-food.svg'">
                ${item.recommended ? '<div class="menu-item-badge"><i class="fas fa-crown"></i> Chef\'s Choice</div>' : ''}
                <button class="fav-btn ${isFav ? 'active' : ''}" title="Save to favorites"
                        onclick="toggleFavorite('${item._id}')">
                    <i class="fas fa-heart"></i>
                </button>
            </div>
            <div class="menu-item-content">
                <div class="menu-item-header">
                    <div>
                        <h3 class="menu-item-name">${item.name}</h3>
                        <div class="menu-item-tags">
                            ${item.isVegetarian ? '<span class="tag veg">VEG</span>' : ''}
                            ${item.isSpicy ? '<span class="tag spicy">SPICY</span>' : ''}
                        </div>
                    </div>
                    <div class="menu-item-price">Rs. ${item.price}</div>
                </div>
                <p class="menu-item-description">${item.description}</p>

                <div class="product-rating" onclick="openProductDetail('${item._id}')" title="See all reviews">
                    <div class="rating-stars">
                        ${generateStarRating(item.rating)}
                    </div>
                    <span class="rating-value">${ratingNum}</span>
                    <span class="review-count">(${reviewCount})</span>
                    <span class="see-reviews">Reviews <i class="fas fa-chevron-right"></i></span>
                </div>

                ${preview && preview.comment ? `
                    <div class="product-reviews">
                        <div class="review-item">
                            <div class="review-header">
                                <strong>${preview.user} ${preview.verified ? '<span class="verified-badge"><i class="fas fa-circle-check"></i> Verified</span>' : ''}</strong>
                                <span class="review-rating">${generateStarRating(preview.rating)}</span>
                            </div>
                            <p class="review-comment">"${preview.comment}"</p>
                        </div>
                    </div>
                ` : ''}

                <div class="menu-item-footer">
                    <span class="category">${item.category.replace('-', ' ').toUpperCase()}</span>
                    <button class="add-to-cart" onclick="addToCart('${item._id}')">
                        <i class="fas fa-plus"></i> Add
                        ${inCart ? `<span class="in-cart-qty">${inCart.quantity}</span>` : ''}
                    </button>
                </div>
            </div>
        </div>
        `;
    }).join('');

    setupScrollReveal();
}

// Central filtering + sorting pipeline
function applyFilters() {
    let list = menuItems.slice();

    if (showFavoritesOnly) {
        list = list.filter(item => favorites.includes(item._id));
    }
    if (currentCategory !== 'all') {
        list = list.filter(item => item.category === currentCategory);
    }
    if (vegOnly) {
        list = list.filter(item => item.isVegetarian);
    }
    if (currentSearch) {
        const q = currentSearch.toLowerCase();
        list = list.filter(item =>
            item.name.toLowerCase().includes(q) ||
            item.description.toLowerCase().includes(q) ||
            item.category.toLowerCase().includes(q)
        );
    }

    switch (currentSort) {
        case 'price-asc': list.sort((a, b) => a.price - b.price); break;
        case 'price-desc': list.sort((a, b) => b.price - a.price); break;
        case 'rating': list.sort((a, b) => b.rating - a.rating); break;
        case 'name': list.sort((a, b) => a.name.localeCompare(b.name)); break;
        case 'recommended':
        default:
            list.sort((a, b) => (b.recommended === true) - (a.recommended === true) || b.rating - a.rating);
    }

    renderMenu(list);
    updateResultCount(list.length);
}

function updateResultCount(count) {
    if (!elements.resultCount) return;
    const parts = [];
    parts.push(`${count} dish${count === 1 ? '' : 'es'}`);
    if (showFavoritesOnly) parts.push('in your favorites');
    else if (currentCategory !== 'all') parts.push(`in ${currentCategory.replace('-', ' ')}`);
    if (vegOnly) parts.push('• vegetarian');
    elements.resultCount.innerHTML = `<i class="fas fa-bowl-food"></i> Showing ${parts.join(' ')}`
        + (showFavoritesOnly ? ` — <a href="#" onclick="resetFilters();return false;" style="color:var(--primary);font-weight:600;">view all</a>` : '');
}

function resetFilters() {
    currentCategory = 'all';
    currentSearch = '';
    vegOnly = false;
    showFavoritesOnly = false;
    currentSort = 'recommended';
    if (elements.searchInput) elements.searchInput.value = '';
    if (elements.vegToggle) elements.vegToggle.checked = false;
    if (elements.sortSelect) elements.sortSelect.value = 'recommended';
    elements.categoryBtns.forEach(b => b.classList.remove('active'));
    document.querySelector('[data-category="all"]').classList.add('active');
    applyFilters();
}

// Favorites
async function toggleFavorite(itemId) {
    const item = menuItems.find(i => i._id === itemId);
    const wasFav = favorites.includes(itemId);

    // Save to the database when logged in + online
    if (backendAvailable && getToken()) {
        try {
            const data = await api('/favorites/toggle', { method: 'POST', auth: true, body: { productId: itemId } });
            favorites = data.favorites;
            saveFavorites();
            updateFavCount();
            applyFilters();
            showNotification(
                data.favorited ? `Added ${item ? item.name : 'item'} to favorites`
                               : `Removed ${item ? item.name : 'item'} from favorites`,
                data.favorited ? 'success' : 'warning'
            );
            return;
        } catch (e) {
            console.log('Favorite sync failed, saving locally:', e.message);
        }
    }

    // Fallback: local toggle
    if (!wasFav) {
        favorites.push(itemId);
        showNotification(`Added ${item ? item.name : 'item'} to favorites`, 'success');
    } else {
        favorites.splice(favorites.indexOf(itemId), 1);
        showNotification(`Removed ${item ? item.name : 'item'} from favorites`, 'warning');
    }
    saveFavorites();
    updateFavCount();
    applyFilters();
}

function loadFavorites() {
    const data = localStorage.getItem('smartOrdering_favorites');
    if (data) {
        try { favorites = JSON.parse(data); } catch (e) { favorites = []; }
    }
}

function saveFavorites() {
    localStorage.setItem('smartOrdering_favorites', JSON.stringify(favorites));
}

function updateFavCount() {
    if (elements.favCount) elements.favCount.textContent = favorites.length;
}

// Theme
function loadTheme() {
    const saved = localStorage.getItem('smartOrdering_theme') || 'light';
    setTheme(saved);
}

function setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('smartOrdering_theme', theme);
    const icon = elements.themeToggle ? elements.themeToggle.querySelector('i') : null;
    if (icon) icon.className = theme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
}

function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme') || 'light';
    setTheme(current === 'dark' ? 'light' : 'dark');
}

// Scroll reveal animations
let revealObserver = null;
function setupScrollReveal() {
    if (!('IntersectionObserver' in window)) {
        document.querySelectorAll('.reveal').forEach(el => el.classList.add('visible'));
        return;
    }
    if (!revealObserver) {
        revealObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('visible');
                    revealObserver.unobserve(entry.target);
                }
            });
        }, { threshold: 0.08 });
    }
    document.querySelectorAll('.reveal:not(.visible)').forEach(el => revealObserver.observe(el));
}

function generateStarRating(rating) {
    const fullStars = Math.floor(rating);
    const halfStar = rating % 1 >= 0.5;
    const emptyStars = 5 - fullStars - (halfStar ? 1 : 0);
    
    let stars = '';
    for (let i = 0; i < fullStars; i++) {
        stars += '<i class="fas fa-star"></i>';
    }
    if (halfStar) {
        stars += '<i class="fas fa-star-half-alt"></i>';
    }
    for (let i = 0; i < emptyStars; i++) {
        stars += '<i class="far fa-star"></i>';
    }
    return stars;
}

function filterMenu(category) {
    currentCategory = category;
    showFavoritesOnly = false;
    elements.categoryBtns.forEach(btn => btn.classList.remove('active'));
    document.querySelector(`[data-category="${category}"]`).classList.add('active');
    applyFilters();
}

function searchMenu() {
    currentSearch = elements.searchInput.value.trim();
    applyFilters();
}

// Cart Management
function addToCart(itemId) {
    if (!currentUser) {
        showNotification('Please login to add items to cart', 'error');
        showAuthModal();
        return;
    }

    const item = menuItems.find(i => i._id === itemId);
    if (!item) return;

    const existingItem = cart.find(cartItem => cartItem._id === itemId);
    
    if (existingItem) {
        existingItem.quantity += 1;
    } else {
        cart.push({
            ...item,
            quantity: 1
        });
    }

    saveCart();
    updateCartDisplay();
    updateMenuCardBadge(itemId);
    showNotification(`Added ${item.name} to cart!`, 'success');
}

// Update the in-cart quantity badge on a menu card without re-rendering the grid
function updateMenuCardBadge(itemId) {
    const card = document.querySelector(`.menu-item[data-id="${itemId}"]`);
    if (!card) return;
    const btn = card.querySelector('.add-to-cart');
    if (!btn) return;
    const inCart = cart.find(c => c._id === itemId);
    let badge = btn.querySelector('.in-cart-qty');
    if (inCart) {
        if (!badge) {
            badge = document.createElement('span');
            badge.className = 'in-cart-qty';
            btn.appendChild(badge);
        }
        badge.textContent = inCart.quantity;
    } else if (badge) {
        badge.remove();
    }
}

function updateCartDisplay() {
    const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
    elements.cartCount.textContent = totalItems;

    if (cart.length === 0) {
        elements.cartItems.innerHTML = `
            <div class="empty-cart">
                <i class="fas fa-shopping-cart"></i>
                <h3>Your cart is empty</h3>
                <p>Add some delicious items from our menu</p>
                <button class="btn-primary" onclick="showSection('menu')">Browse Menu</button>
            </div>
        `;
        elements.checkoutBtn.disabled = true;
        elements.cartTotal.textContent = 'Rs. 0';
        return;
    }

    elements.checkoutBtn.disabled = false;

    elements.cartItems.innerHTML = cart.map((item, index) => {
        const itemTotal = item.price * item.quantity;
        return `
            <div class="cart-item">
                <div class="cart-item-info">
                    <div class="cart-item-image">
                        <img src="${item.image}" alt="${item.name}" onerror="this.src='images/placeholder-food.svg'">
                    </div>
                    <div class="cart-item-details">
                        <h4>${item.name}</h4>
                        <div class="cart-item-price">Rs. ${item.price} × ${item.quantity}</div>
                        <div class="cart-item-category">${item.category.replace('-', ' ').toUpperCase()}</div>
                    </div>
                </div>
                <div class="cart-item-controls">
                    <div class="quantity-controls">
                        <button class="quantity-btn" onclick="updateQuantity(${index}, -1)">-</button>
                        <span>${item.quantity}</span>
                        <button class="quantity-btn" onclick="updateQuantity(${index}, 1)">+</button>
                    </div>
                    <button class="remove-btn" onclick="removeFromCart(${index})">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `;
    }).join('');

    updateCartTotals();
}

function updateQuantity(index, change) {
    cart[index].quantity += change;
    
    if (cart[index].quantity <= 0) {
        cart.splice(index, 1);
    }
    
    saveCart();
    updateCartDisplay();
}

function removeFromCart(index) {
    const itemName = cart[index].name;
    cart.splice(index, 1);
    saveCart();
    updateCartDisplay();
    showNotification(`Removed ${itemName} from cart`, 'warning');
}

function updateCartTotals() {
    const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const tax = subtotal * CONFIG.TAX_RATE;
    const total = subtotal + tax + CONFIG.DELIVERY_FEE;

    elements.subtotal.textContent = `Rs. ${subtotal}`;
    elements.taxAmount.textContent = `Rs. ${tax.toFixed(0)}`;
    elements.finalTotal.textContent = `Rs. ${total.toFixed(0)}`;
    elements.cartTotal.textContent = `Rs. ${total.toFixed(0)}`;
}

// Checkout
function renderCheckoutItems() {
    const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const tax = subtotal * CONFIG.TAX_RATE;
    const total = subtotal + tax + CONFIG.DELIVERY_FEE;

    elements.reviewItems.innerHTML = cart.map(item => `
        <div class="review-item">
            <span>${item.name} x ${item.quantity}</span>
            <span>Rs. ${item.price * item.quantity}</span>
        </div>
    `).join('');

    elements.reviewTotal.textContent = `Rs. ${total.toFixed(0)}`;
}

async function placeOrder() {
    if (cart.length === 0) {
        showNotification('Your cart is empty', 'error');
        return;
    }

    const customerName = document.getElementById('customerName').value;
    const customerPhone = document.getElementById('customerPhone').value;
    const deliveryAddress = document.getElementById('deliveryAddress').value;

    if (!customerName || !customerPhone || !deliveryAddress) {
        showNotification('Please fill in all required fields', 'error');
        return;
    }

    const specialInstructions = (document.getElementById('specialInstructions') || {}).value || '';

    try {
        const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        const tax = subtotal * CONFIG.TAX_RATE;
        const total = subtotal + tax + CONFIG.DELIVERY_FEE;

        let order;

        // Save to the database when the server is reachable and the user is logged in
        if (backendAvailable && getToken()) {
            try {
                const data = await api('/orders', {
                    method: 'POST',
                    auth: true,
                    body: { items: cart, total, customerName, customerPhone, deliveryAddress, specialInstructions }
                });
                order = normalizeOrder(data.order);
            } catch (e) {
                console.log('Order save to server failed, storing locally:', e.message);
            }
        }

        // Fallback: store the order locally
        if (!order) {
            order = {
                _id: 'SO' + Date.now().toString().slice(-6),
                items: [...cart],
                total,
                status: 'pending',
                createdAt: new Date().toISOString(),
                customerName,
                customerPhone,
                deliveryAddress,
                specialInstructions
            };
        }

        orders.push(order);
        saveOrders();

        // Clear cart
        cart = [];
        saveCart();
        updateCartDisplay();

        showNotification(`Order #${order._id} placed successfully!`, 'success');

        // Reset the checkout form
        ['customerName', 'customerPhone', 'deliveryAddress', 'specialInstructions'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });

        // Show orders section
        showSection('orders');
        updateActiveNav(document.querySelector('.nav-link[href="#orders"]'));
        loadUserOrders();

    } catch (error) {
        console.error(error);
        showNotification('Error placing order', 'error');
    }
}

// Orders Management with Product Reviews
function loadUserOrders() {
    if (orders.length === 0) {
        elements.ordersContainer.innerHTML = `
            <div class="empty-orders">
                <i class="fas fa-clipboard-list"></i>
                <h3>No orders yet</h3>
                <p>Place your first order and track it here</p>
                <button class="btn-primary" onclick="showSection('menu')">Start Ordering</button>
            </div>
        `;
        return;
    }

    // Newest first
    const sorted = orders.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    elements.ordersContainer.innerHTML = sorted.map(order => `
        <div class="order-card">
            <div class="order-header">
                <div class="order-id"><i class="fas fa-receipt"></i> Order #${order._id}</div>
                <div class="order-status status-${order.status}">${order.status.toUpperCase()}</div>
            </div>
            ${renderOrderTracker(order.status)}
            <div class="order-items">
                ${order.items.map(item => `
                    <div class="order-item">
                        <div class="order-item-detail">
                            <img src="${item.image}" alt="${item.name}" class="order-item-img" onerror="this.src='images/placeholder-food.svg'">
                            <div>
                                <strong>${item.name}</strong>
                                <div>Rs. ${item.price} × ${item.quantity}</div>
                            </div>
                        </div>
                        <span>Rs. ${item.price * item.quantity}</span>
                    </div>
                `).join('')}
            </div>
            <div class="order-footer">
                <div>
                    <div style="font-weight: 600;">${order.customerName}</div>
                    <div style="font-size: 0.9rem; color: var(--text-soft);">
                        ${new Date(order.createdAt).toLocaleDateString()} • ${order.deliveryAddress}
                    </div>
                </div>
                <div>
                    <div style="font-weight: bold; font-size: 1.25rem; color: var(--primary);">
                        Rs. ${order.total}
                    </div>
                    <div class="review-actions">
                        <button class="reorder-btn" onclick="reorder('${order._id}')">
                            <i class="fas fa-rotate-right"></i> Reorder
                        </button>
                        ${order.status === 'pending' ? `
                            <button class="cancel-order-btn" onclick="cancelMyOrder('${order._id}')">
                                <i class="fas fa-xmark"></i> Cancel order
                            </button>` : ''}
                        ${order.status === 'delivered' ? order.items.map(item => `
                            <button class="review-btn" onclick="showProductReviewModal('${item._id}')">
                                <i class="fas fa-star"></i> Review ${item.name}
                            </button>
                        `).join('') : ''}
                    </div>
                </div>
            </div>
        </div>
    `).join('');
}

// Visual progress tracker for an order
function renderOrderTracker(status) {
    const steps = [
        { key: 'pending',   label: 'Placed',    icon: 'fa-check' },
        { key: 'preparing', label: 'Preparing', icon: 'fa-utensils' },
        { key: 'ready',     label: 'On the way',icon: 'fa-motorcycle' },
        { key: 'delivered', label: 'Delivered', icon: 'fa-house-circle-check' }
    ];
    if (status === 'cancelled') return '';
    const order = ['pending', 'preparing', 'ready', 'delivered'];
    const currentIdx = order.indexOf(status);
    return `
        <div class="order-tracker">
            ${steps.map((s, i) => `
                <div class="track-step ${i <= currentIdx ? 'done' : ''}">
                    <div class="dot"><i class="fas ${s.icon}"></i></div>
                    ${s.label}
                </div>
            `).join('')}
        </div>`;
}

// Re-add all items from a past order back into the cart
function reorder(orderId) {
    if (!currentUser) {
        showNotification('Please login to reorder', 'error');
        showAuthModal();
        return;
    }
    const order = orders.find(o => o._id === orderId);
    if (!order) return;

    order.items.forEach(orderItem => {
        const menuItem = menuItems.find(m => m._id === orderItem._id) || orderItem;
        const existing = cart.find(c => c._id === orderItem._id);
        if (existing) {
            existing.quantity += orderItem.quantity;
        } else {
            cart.push({ ...menuItem, quantity: orderItem.quantity });
        }
    });

    saveCart();
    updateCartDisplay();
    showNotification('Items added to your cart!', 'success');
    showSection('cart');
    updateActiveNav(document.querySelector('.nav-link[href="#cart"]'));
}

// Cancel your own order — only allowed while it's still pending (kitchen hasn't started).
async function cancelMyOrder(orderId) {
    if (!currentUser) { showAuthModal(); return; }
    if (!confirm('Cancel this order? This cannot be undone.')) return;
    try {
        await api(`/orders/${orderId}/cancel`, { method: 'PUT', auth: true });
        showNotification('Your order has been cancelled.', 'success');
        await syncUserData();
        loadUserOrders();
    } catch (err) {
        showNotification(err.message || 'Could not cancel this order', 'error');
        await syncUserData();
        loadUserOrders();
    }
}

// Product Review System
let currentProductRating = 0;

function showProductReviewModal(productId) {
    const product = menuItems.find(p => p._id === productId);
    if (!product) return;

    currentProductForReview = product;
    currentProductRating = 0;
    
    // Reset stars
    elements.starRating.forEach(star => star.classList.remove('active'));
    elements.ratingText.textContent = 'Select your rating';
    elements.productReviewComment.value = '';
    
    // Set product info
    elements.reviewProductImage.src = product.image;
    elements.reviewProductImage.alt = product.name;
    elements.reviewProductName.textContent = product.name;
    elements.reviewProductCategory.textContent = product.category.replace('-', ' ').toUpperCase();
    
    elements.productReviewModal.classList.add('active');
}

function setProductRating(e) {
    const rating = parseInt(e.target.dataset.rating);
    currentProductRating = rating;
    updateRatingDisplay(rating);
}

function hoverProductRating(e) {
    const rating = parseInt(e.target.dataset.rating);
    updateRatingDisplay(rating);
}

function resetProductRating() {
    updateRatingDisplay(currentProductRating);
}

function updateRatingDisplay(rating) {
    elements.starRating.forEach((star, index) => {
        if (index < rating) {
            star.classList.add('active');
        } else {
            star.classList.remove('active');
        }
    });
    
    const ratingTexts = [
        'Select your rating',
        'Poor - Not good at all',
        'Fair - Could be better', 
        'Good - Satisfactory',
        'Very Good - Great taste',
        'Excellent - Perfect! Would order again'
    ];
    
    elements.ratingText.textContent = ratingTexts[rating] || 'Select your rating';
}

async function submitProductReview() {
    if (currentProductRating === 0) {
        showNotification('Please select a rating', 'error');
        return;
    }

    const comment = elements.productReviewComment.value.trim();
    if (!comment) {
        showNotification('Please write a review comment', 'error');
        return;
    }

    const productId = currentProductForReview._id;
    const rating = currentProductRating;

    // Add review to the product (instant, optimistic local update)
    const review = {
        user: currentUser ? currentUser.username : 'Anonymous',
        rating: rating,
        comment: comment,
        date: new Date().toLocaleDateString()
    };

    const product = menuItems.find(p => p._id === productId);
    if (product) {
        // Menu loaded from the API has no `reviews` array — guard against that.
        if (!Array.isArray(product.reviews)) product.reviews = [];
        const prevCount = product.reviewCount != null ? product.reviewCount : product.reviews.length;
        const prevAvg = Number(product.rating) || 0;
        const newCount = prevCount + 1;
        product.rating = Math.round(((prevAvg * prevCount + rating) / newCount) * 10) / 10;
        product.reviewCount = newCount;
        product.reviews.push(review);
        if (!product.topReview && comment) product.topReview = { user: review.user, rating, comment, verified: false };
    }

    // Persist to the database
    let savedToServer = false;
    if (backendAvailable && getToken()) {
        try {
            await api('/reviews', { method: 'POST', auth: true, body: { productId, rating, comment } });
            savedToServer = true;
        } catch (e) {
            console.log('Review save to server failed (kept locally):', e.message);
            showNotification('Could not save review to server — saved locally.', 'warning');
        }
    } else if (!currentUser) {
        showNotification('Please log in so your review can be saved.', 'warning');
    }

    showNotification('Thank you for your detailed review!', 'success');
    hideAllModals();

    // Pull fresh, authoritative ratings/counts from the database
    if (savedToServer) await fetchMenuFromServer();
    else applyFilters();

    // Reset
    currentProductRating = 0;
    currentProductForReview = null;

    // If the premium detail modal is open, refresh its review list
    if (currentDetailProduct && document.getElementById('productDetailModal').classList.contains('active')) {
        openProductDetail(currentDetailProduct._id, true);
    }
}

// ============================================================
//  Reservations
// ============================================================
async function handleReservation(e) {
    e.preventDefault();
    const body = {
        name: document.getElementById('resName').value.trim(),
        phone: document.getElementById('resPhone').value.trim(),
        email: document.getElementById('resEmail').value.trim(),
        date: document.getElementById('resDate').value,
        time: document.getElementById('resTime').value,
        partySize: document.getElementById('resParty').value,
        notes: document.getElementById('resNotes').value.trim(),
    };
    if (!body.name || !body.phone || !body.date || !body.time || !body.partySize) {
        showNotification('Please fill in all required fields', 'error');
        return;
    }
    if (!backendAvailable) {
        showNotification('Reservations need the server running. Please start it and try again.', 'error');
        return;
    }
    try {
        await api('/reservations', { method: 'POST', auth: true, body });
        showNotification('Reservation requested! We will confirm shortly.', 'success');
        e.target.reset();
        document.getElementById('resTime').value = '20:00';
        document.getElementById('resParty').value = '2';
    } catch (err) {
        showNotification(err.message || 'Could not submit reservation', 'error');
    }
}

// ============================================================
//  Premium product detail + reviews modal
// ============================================================
let currentDetailProduct = null;
let currentDetailReviews = [];

async function openProductDetail(productId, keepOpen = false) {
    const product = menuItems.find(p => p._id === productId);
    if (!product) return;
    currentDetailProduct = product;

    // Fill header
    document.getElementById('detailImage').src = product.image;
    document.getElementById('detailName').textContent = product.name;
    document.getElementById('detailDescription').textContent = product.description;
    document.getElementById('detailPrice').textContent = `Rs. ${product.price}`;
    document.getElementById('detailTags').innerHTML =
        (product.isVegetarian ? '<span class="tag veg">VEG</span>' : '') +
        (product.isSpicy ? '<span class="tag spicy">SPICY</span>' : '') +
        (product.recommended ? '<span class="tag recommended">CHEF\'S CHOICE</span>' : '');
    const addBtn = document.getElementById('detailAddBtn');
    addBtn.onclick = () => { addToCart(product._id); };

    if (!keepOpen) {
        // reset filter to All
        const rf = document.getElementById('reviewFilters');
        rf.querySelectorAll('.rf-pill').forEach(x => x.classList.remove('active'));
        rf.querySelector('[data-filter="all"]').classList.add('active');
        document.getElementById('productDetailModal').classList.add('active');
        document.getElementById('reviewsList').innerHTML = '<div class="reviews-empty"><i class="fas fa-spinner fa-spin"></i> Loading reviews...</div>';
    }

    // Fetch reviews from the database (fallback to embedded preview offline)
    let stats = { rating: product.rating, count: product.reviewCount || 0, breakdown: product.ratingBreakdown || {1:0,2:0,3:0,4:0,5:0} };
    currentDetailReviews = [];
    if (backendAvailable) {
        try {
            const data = await api(`/reviews/${productId}`, { auth: false });
            stats = data.stats;
            currentDetailReviews = data.reviews;
        } catch (e) { /* keep fallback */ }
    } else if (product.reviews) {
        currentDetailReviews = product.reviews;
    }

    renderDetailSummary(stats);
    renderDetailReviews('all');
}

function renderDetailSummary(stats) {
    document.getElementById('rsNumber').textContent = Number(stats.rating || 0).toFixed(1);
    document.getElementById('rsStars').innerHTML = generateStarRating(stats.rating || 0);
    document.getElementById('rsCount').textContent = `${stats.count || 0} review${stats.count === 1 ? '' : 's'}`;
    const total = stats.count || 0;
    const bd = stats.breakdown || {};
    document.getElementById('rsBreakdown').innerHTML = [5, 4, 3, 2, 1].map(star => {
        const n = bd[star] || 0;
        const pct = total ? (n / total * 100) : 0;
        return `<div class="rs-bar-row">
            <span class="rs-label">${star}★</span>
            <span class="rs-bar"><span style="width:${pct}%"></span></span>
            <span class="rs-num">${n}</span>
        </div>`;
    }).join('');
}

const AVATAR_COLORS = ['#FF6B35', '#2EC4B6', '#7C5CFF', '#ff5b7f', '#3a86ff', '#22a45d', '#e8794b'];
function avatarColor(name) {
    let h = 0; for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
    return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

function renderDetailReviews(filter = 'all') {
    let list = currentDetailReviews.slice();
    if (filter === 'photos') list = list.filter(r => r.photo);
    else if (filter === 'verified') list = list.filter(r => r.verified);
    else if (['5', '4', '3'].includes(filter)) list = list.filter(r => r.rating === Number(filter));

    const el = document.getElementById('reviewsList');
    if (!list.length) {
        el.innerHTML = '<div class="reviews-empty"><i class="fas fa-comment-slash"></i><p>No reviews match this filter yet.</p></div>';
        return;
    }
    el.innerHTML = list.map((r, i) => `
        <div class="review-card" style="animation-delay:${Math.min(i * 40, 300)}ms">
            <div class="review-card-head">
                <div class="review-avatar" style="background:${avatarColor(r.user)}">${r.user.charAt(0).toUpperCase()}</div>
                <div class="review-meta">
                    <div class="rm-name">${r.user} ${r.verified ? '<span class="verified-badge"><i class="fas fa-circle-check"></i> Verified Diner</span>' : ''}</div>
                    <div class="rm-date">${formatReviewDate(r.date)}</div>
                </div>
                <div class="rc-stars">${generateStarRating(r.rating)}</div>
            </div>
            ${r.comment ? `<div class="rc-text">${r.comment}</div>` : ''}
            ${r.photo ? `<img class="review-photo" src="${r.photo}" onerror="this.remove()" onclick="window.open('${r.photo}','_blank')">` : ''}
            <div class="review-card-foot">
                <button class="helpful-btn" onclick="markHelpful(${r.id != null ? r.id : 'null'}, this)">
                    <i class="fas fa-thumbs-up"></i> Helpful${r.helpful ? ` (${r.helpful})` : ''}
                </button>
            </div>
        </div>`).join('');
}

function formatReviewDate(s) {
    if (!s) return '';
    const d = new Date(String(s).replace(' ', 'T'));
    if (isNaN(d)) return s;
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

async function markHelpful(reviewId, btn) {
    if (reviewId == null) { showNotification('Thanks for your feedback!', 'success'); return; }
    if (!backendAvailable) { showNotification('Thanks for your feedback!', 'success'); btn.disabled = true; return; }
    try {
        await api(`/reviews/${reviewId}/helpful`, { method: 'POST', auth: true });
        btn.disabled = true;
        const r = currentDetailReviews.find(x => x.id === reviewId);
        if (r) { r.helpful = (r.helpful || 0) + 1; btn.innerHTML = `<i class="fas fa-thumbs-up"></i> Helpful (${r.helpful})`; }
        showNotification('Thanks for your feedback!', 'success');
    } catch (e) {
        showNotification('Please log in to vote', 'error');
    }
}

// Utility Functions
function loadUserSession() {
    const userData = localStorage.getItem('smartOrdering_user');
    if (userData) {
        const data = JSON.parse(userData);
        currentUser = data.user;
    }
}

function loadCart() {
    const cartData = localStorage.getItem('smartOrdering_cart');
    if (cartData) {
        cart = JSON.parse(cartData);
    }
}

function saveCart() {
    localStorage.setItem('smartOrdering_cart', JSON.stringify(cart));
}

function saveOrders() {
    localStorage.setItem('smartOrdering_orders', JSON.stringify(orders));
}

function loadOrders() {
    const ordersData = localStorage.getItem('smartOrdering_orders');
    if (ordersData) {
        orders = JSON.parse(ordersData);
    }
}

function updateUI() {
    // Update cart count
    const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
    elements.cartCount.textContent = totalItems;
    updateFavCount();

    // Admin link + notification bell visibility
    const adminLink = document.getElementById('adminLink');
    // Always visible so visitors/reviewers can discover the admin panel (portfolio demo).
    if (adminLink) adminLink.style.display = 'flex';
    const bellIcon = document.getElementById('bellIcon');
    if (bellIcon) bellIcon.style.display = currentUser ? 'flex' : 'none';
    if (currentUser) { connectRealtime(); } else if (eventSource) { eventSource.close(); }

    // Update user section
    if (currentUser) {
        elements.userSection.innerHTML = `
            <div class="user-info">
                <span>Hello, ${currentUser.username}</span>
                <button class="btn-logout" onclick="logout()">Logout</button>
            </div>
        `;
        // Reattach login button event listener
        document.getElementById('loginBtn')?.addEventListener('click', () => showAuthModal());
    } else {
        elements.userSection.innerHTML = '<button class="btn-login" id="loginBtn">Login</button>';
        // Reattach login button event listener
        document.getElementById('loginBtn').addEventListener('click', () => showAuthModal());
    }
}

function showNotification(message, type = 'success') {
    // Remove any existing notifications
    const existingNotifications = document.querySelectorAll('.notification');
    existingNotifications.forEach(notification => notification.remove());

    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.innerHTML = `
        <div style="display: flex; align-items: center; gap: 10px;">
            <i class="fas fa-${type === 'success' ? 'check' : type === 'warning' ? 'exclamation-triangle' : 'exclamation-circle'}"></i>
            ${message}
        </div>
    `;

    document.body.appendChild(notification);
    
    setTimeout(() => notification.classList.add('show'), 100);
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => {
            if (notification.parentNode) {
                notification.remove();
            }
        }, 300);
    }, 4000);
}
// Add sample order for demonstration
function addSampleOrder() {
    const sampleOrder = {
        _id: 'SO123456',
        items: [
            { 
                _id: '1',
                name: 'Chicken Biryani',
                price: 850, 
                quantity: 1,
                image: 'images/chicken-biryani.webp'
            },
            { 
                _id: '22',
                name: 'Mango Lassi',
                price: 220, 
                quantity: 2,
                image: 'images/mango-lassi.jpg'
            }
        ],
        total: 1290,
        status: 'delivered',
        createdAt: new Date('2024-01-15'),
        customerName: 'Ali Ahmed',
        customerPhone: '0300-1234567',
        deliveryAddress: '123 Main Street, Karachi'
    };
    
    orders.push(sampleOrder);
    saveOrders();
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', init);


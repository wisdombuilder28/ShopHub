/* ==========================================
   ShopHub — Application JavaScript
   ========================================== */

/* ---------- Constants ---------- */
const CATEGORIES = ["All", "Electronics", "Accessories", "Fashion", "Home"];
const CART_STORAGE_KEY = "shophub-cart";
const WISHLIST_STORAGE_KEY = "shophub-wishlist";
const THEME_STORAGE_KEY = "shophub-theme";
const PRODUCTS_CACHE_KEY = "shophub-products-cache";

/* ---------- Global State ---------- */
// We use a simple object to hold runtime state.
// Cart and wishlist are persisted in localStorage.
const State = {
    products: [], // Fetched product data
    loading: true,
    error: null,
    cart: [], // { id, quantity }[]
    wishlist: [], // product IDs
    // UI state for home page
    query: "",
    category: "All",
    sort: "featured",
};

/* ---------- Utility Helpers ---------- */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/** Escape HTML special characters to prevent XSS */
function escapeHtml(str) {
    return str.replace(/[&<>"']/g, c => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    } [c]));
}

/** Get the current page type from the body data attribute */
function getPageType() {
    return document.body.dataset.page || "home";
}

/* ---------- Toast Notification ---------- */
function showToast(message) {
    const toast = $("#toast");
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(toast._timeoutId);
    toast._timeoutId = setTimeout(() => toast.classList.remove("show"), 2200);
}

/* ---------- Theme Management ---------- */
function applyTheme(dark) {
    document.documentElement.classList.toggle("dark", dark);
    const sunIcon = $("#iconSun");
    const moonIcon = $("#iconMoon");
    if (sunIcon) sunIcon.style.display = dark ? "block" : "none";
    if (moonIcon) moonIcon.style.display = dark ? "none" : "block";
}

function initTheme() {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const dark = stored ? stored === "dark" : prefersDark;
    applyTheme(dark);

    const toggleBtn = $("#themeToggle");
    if (toggleBtn) {
        toggleBtn.addEventListener("click", () => {
            const isDark = document.documentElement.classList.contains("dark");
            const next = !isDark;
            applyTheme(next);
            localStorage.setItem(THEME_STORAGE_KEY, next ? "dark" : "light");
        });
    }
}

/* ---------- LocalStorage Persistence ---------- */
function loadCart() {
    try {
        const raw = localStorage.getItem(CART_STORAGE_KEY);
        State.cart = raw ? JSON.parse(raw) : [];
    } catch {
        State.cart = [];
    }
}

function saveCart() {
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(State.cart));
}

function loadWishlist() {
    try {
        const raw = localStorage.getItem(WISHLIST_STORAGE_KEY);
        State.wishlist = raw ? JSON.parse(raw) : [];
    } catch {
        State.wishlist = [];
    }
}

function saveWishlist() {
    localStorage.setItem(WISHLIST_STORAGE_KEY, JSON.stringify(State.wishlist));
}

/* ---------- Data Fetching ---------- */
async function fetchProducts() {
    // Check sessionStorage cache first (valid for the browsing session)
    const cached = sessionStorage.getItem(PRODUCTS_CACHE_KEY);
    if (cached) {
        try {
            State.products = JSON.parse(cached);
            State.loading = false;
            return State.products;
        } catch {
            // Corrupt cache — fetch fresh
        }
    }

    State.loading = true;
    State.error = null;

    try {
        const response = await fetch("data/products.json");
        if (!response.ok) {
            throw new Error(`Failed to load products (HTTP ${response.status})`);
        }
        const data = await response.json();
        if (!Array.isArray(data)) {
            throw new Error("Invalid product data format");
        }
        State.products = data;
        State.loading = false;
        // Cache in sessionStorage
        sessionStorage.setItem(PRODUCTS_CACHE_KEY, JSON.stringify(data));
        return data;
    } catch (err) {
        State.loading = false;
        State.error = err.message || "Unknown error loading products";
        console.error("fetchProducts error:", err);
        return [];
    }
}

/* ---------- Filtering & Sorting ---------- */
function getFilteredProducts() {
    const q = State.query.trim().toLowerCase();
    let results = State.products.filter(p => {
        const matchesQuery = !q ||
            p.name.toLowerCase().includes(q) ||
            p.description.toLowerCase().includes(q) ||
            p.category.toLowerCase().includes(q);
        const matchesCategory = State.category === "All" || p.category === State.category;
        return matchesQuery && matchesCategory;
    });

    switch (State.sort) {
        case "price-asc":
            results.sort((a, b) => a.price - b.price);
            break;
        case "price-desc":
            results.sort((a, b) => b.price - a.price);
            break;
        case "newest":
            results.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
            break;
        case "rating":
            results.sort((a, b) => b.rating - a.rating);
            break;
        default: // featured
            results.sort((a, b) => (!!b.featured) - (!!a.featured) || b.rating - a.rating);
    }
    return results;
}

/* ---------- Product Lookup ---------- */
function getProductById(id) {
    return State.products.find(p => p.id === id) || null;
}

/* ---------- Cart Operations ---------- */
function addToCart(productId, qty = 1) {
    const product = getProductById(productId);
    if (!product) return;
    if (product.stock === 0) {
        showToast("Sorry, this item is out of stock.");
        return;
    }
    const existing = State.cart.find(item => item.id === productId);
    if (existing) {
        const newQty = existing.quantity + qty;
        // Clamp to available stock
        existing.quantity = Math.min(newQty, product.stock);
        showToast(newQty > product.stock ? "Stock limit reached" : "Updated cart quantity");
    } else {
        State.cart.push({ id: productId, quantity: Math.min(qty, product.stock) });
        showToast("Added to cart");
    }
    saveCart();
    updateHeaderBadges();
    renderCartDrawer();
}

function removeFromCart(productId) {
    State.cart = State.cart.filter(item => item.id !== productId);
    saveCart();
    updateHeaderBadges();
    renderCartDrawer();
}

function changeCartQty(productId, delta) {
    const item = State.cart.find(i => i.id === productId);
    if (!item) return;
    const product = getProductById(productId);
    const maxStock = product ? product.stock : 999;
    item.quantity = Math.max(1, Math.min(item.quantity + delta, maxStock));
    saveCart();
    updateHeaderBadges();
    renderCartDrawer();
}

function getCartTotal() {
    return State.cart.reduce((sum, item) => {
        const product = getProductById(item.id);
        return sum + (product ? product.price * item.quantity : 0);
    }, 0);
}

function getCartItemCount() {
    return State.cart.reduce((sum, item) => sum + item.quantity, 0);
}

function clearCart() {
    State.cart = [];
    saveCart();
    updateHeaderBadges();
}

/* ---------- Wishlist Operations ---------- */
function toggleWishlist(productId) {
    const index = State.wishlist.indexOf(productId);
    if (index >= 0) {
        State.wishlist.splice(index, 1);
        showToast("Removed from wishlist");
    } else {
        State.wishlist.push(productId);
        showToast("Added to wishlist");
    }
    saveWishlist();
    updateHeaderBadges();
    // Re-render based on current page
    const page = getPageType();
    if (page === "home") renderProductGrid();
    if (page === "product") renderProductDetail();
}

function isInWishlist(productId) {
    return State.wishlist.includes(productId);
}

/* ---------- Header Badges ---------- */
function updateHeaderBadges() {
    const cartCount = $("#cartCount");
    const cartItemCount = $("#cartItemCount");
    const wishCount = $("#wishCount");

    if (cartCount) {
        const total = getCartItemCount();
        cartCount.textContent = total;
        cartCount.style.display = total > 0 ? "inline-flex" : "none";
    }
    if (cartItemCount) {
        cartItemCount.textContent = State.cart.length;
    }
    if (wishCount) {
        wishCount.textContent = State.wishlist.length;
        wishCount.style.display = State.wishlist.length > 0 ? "inline-flex" : "none";
    }
}

/* ---------- Card HTML Generator ---------- */
function buildCardHTML(product) {
    const liked = isInWishlist(product.id);
    const outOfStock = product.stock === 0;
    const lowStock = product.stock > 0 && product.stock <= 5;

    return `
    <div class="card" data-id="${product.id}">
      <div class="card-img-wrap" onclick="navigateToProduct(${product.id})" onkeydown="if(event.key==='Enter')navigateToProduct(${product.id})" role="link" tabindex="0" aria-label="View ${escapeHtml(product.name)}">
        <img src="${product.image}" alt="${escapeHtml(product.name)}" loading="lazy" />
        ${product.badge ? `<span class="card-badge">${escapeHtml(product.badge)}</span>` : ""}
        <button class="heart-btn ${liked ? 'liked' : ''}" onclick="event.stopPropagation();toggleWishlist(${product.id})" aria-label="${liked ? 'Remove from wishlist' : 'Add to wishlist'}">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
        </button>
        ${outOfStock ? `<div class="out-overlay">Out of stock</div>` : ""}
      </div>
      <div class="card-body" onclick="navigateToProduct(${product.id})" onkeydown="if(event.key==='Enter')navigateToProduct(${product.id})" role="link" tabindex="0">
        <div class="card-meta">
          <svg class="star" width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
          <span style="font-weight:600;color:var(--fg);">${product.rating.toFixed(1)}</span>
          <span>(${product.reviews})</span>
          <span class="cat">${escapeHtml(product.category)}</span>
        </div>
        <div class="card-title">${escapeHtml(product.name)}</div>
        <div class="card-desc">${escapeHtml(product.description)}</div>
        <div class="card-prices">
          <span class="price">$${product.price.toFixed(2)}</span>
          ${product.originalPrice ? `<span class="price-old">$${product.originalPrice.toFixed(2)}</span>` : ""}
          ${lowStock ? `<span class="low-stock">Only ${product.stock} left</span>` : ""}
        </div>
      </div>
      <div class="card-foot">
        <button class="btn btn-primary" ${outOfStock ? 'disabled' : ''} onclick="event.stopPropagation();addToCart(${product.id})">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
          ${outOfStock ? "Out of Stock" : "Add to Cart"}
        </button>
      </div>
    </div>`;
}

/* ---------- Navigation ---------- */
function navigateToProduct(productId) {
    window.location.href = `product.html?id=${productId}`;
}

/** Scroll a carousel by a given direction (-1 = left, 1 = right) */
function scrollCarousel(carouselId, direction) {
    const el = document.getElementById(carouselId);
    if (!el) return;
    el.scrollBy({ left: direction * el.clientWidth * 0.8, behavior: "smooth" });
}

/* ---------- Render: Home Page ---------- */
function renderCategoryChips() {
    const container = $("#categoryChips");
    if (!container) return;
    container.innerHTML =
        CATEGORIES.map(c =>
            `<button class="chip ${State.category === c ? 'active' : ''}" data-category="${c}">${c}</button>`
        ).join("") +
        `<span class="result-count" id="resultCount"></span>`;

    // Bind events
    $$("#categoryChips .chip").forEach(btn => {
        btn.addEventListener("click", () => {
            State.category = btn.dataset.category;
            renderCategoryChips();
            renderProductGrid();
        });
    });
}

function renderProductGrid() {
    const grid = $("#productsGrid");
    const emptyState = $("#productsEmpty");
    if (!grid) return;

    const items = getFilteredProducts();
    if (items.length === 0) {
        grid.innerHTML = "";
        grid.style.display = "none";
        if (emptyState) emptyState.style.display = "block";
    } else {
        grid.style.display = "grid";
        if (emptyState) emptyState.style.display = "none";
        grid.innerHTML = items.map(buildCardHTML).join("");
    }

    const resultCount = $("#resultCount");
    if (resultCount) {
        resultCount.textContent = `${items.length} ${items.length === 1 ? 'product' : 'products'}`;
    }
}

function renderNewArrivalsCarousel() {
    const carousel = $("#newCarousel");
    if (!carousel) return;
    const sorted = [...State.products]
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .slice(0, 8);
    carousel.innerHTML = sorted.map(buildCardHTML).join("");
}

/* ---------- Render: Product Detail Page ---------- */
function renderProductDetail() {
    const skeleton = $("#productSkeleton");
    const content = $("#productDetailContent");
    const notFound = $("#productNotFound");
    const relatedSection = $("#relatedSection");
    const relatedCarousel = $("#relatedCarousel");

    if (!content) return;

    // Parse product ID from URL
    const params = new URLSearchParams(window.location.search);
    const productId = parseInt(params.get("id"), 10);

    if (isNaN(productId) || !getProductById(productId)) {
        if (skeleton) skeleton.style.display = "none";
        if (content) content.style.display = "none";
        if (notFound) notFound.style.display = "block";
        if (relatedSection) relatedSection.style.display = "none";
        return;
    }

    const product = getProductById(productId);
    const liked = isInWishlist(product.id);
    const outOfStock = product.stock === 0;
    const lowStock = product.stock > 0 && product.stock <= 5;

    if (skeleton) skeleton.style.display = "none";
    if (notFound) notFound.style.display = "none";
    content.style.display = "block";

    // Fix: Update page title to product name
    document.title = `${product.name} — ShopHub`;

    content.innerHTML = `
      <div class="product-detail-layout">
        <div class="product-detail-img">
          <img src="${product.image}" alt="${escapeHtml(product.name)}" />
        </div>
        <div class="product-detail-info">
          ${product.badge ? `<span class="badge-tag">${escapeHtml(product.badge)}</span>` : ""}
          <h1>${escapeHtml(product.name)}</h1>
          <div class="detail-meta">
            <span><svg class="star" width="14" height="14" viewBox="0 0 24 24" fill="var(--secondary)" style="vertical-align:middle;margin-right:4px;"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg><strong>${product.rating.toFixed(1)}</strong> (${product.reviews} reviews)</span>
            <span>Category: <strong>${escapeHtml(product.category)}</strong></span>
            <span>Stock: <strong>${outOfStock ? 'Out of stock' : `${product.stock} available`}</strong></span>
          </div>
          <p class="desc">${escapeHtml(product.description)}</p>
          <div class="detail-price">
            $${product.price.toFixed(2)}
            ${product.originalPrice ? `<span class="old">$${product.originalPrice.toFixed(2)}</span>` : ""}
          </div>
          ${lowStock && !outOfStock ? `<p style="color:var(--secondary);font-weight:600;font-size:.875rem;">⚠ Only ${product.stock} left in stock — order soon!</p>` : ""}
          <div class="product-detail-actions">
            ${outOfStock
              ? `<span class="out-stock-label">Out of Stock</span>`
              : `<div class="qty-selector" id="detailQtySelector">
                   <button onclick="detailQtyChange(-1)" aria-label="Decrease">−</button>
                   <span id="detailQty">1</span>
                   <button onclick="detailQtyChange(1)" aria-label="Increase">+</button>
                 </div>
                 <button class="btn btn-primary btn-lg" onclick="addToCartFromDetail(${product.id})">
                   <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
                   Add to Cart
                 </button>`
            }
            <button class="btn btn-outline btn-lg ${liked ? 'liked' : ''}" onclick="toggleWishlist(${product.id})" style="${liked ? 'color:var(--destructive);border-color:var(--destructive);' : ''}">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="${liked ? 'var(--destructive)' : 'none'}" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
              ${liked ? 'Saved to Wishlist' : 'Add to Wishlist'}
            </button>
          </div>
        </div>
      </div>`;

    // Render related products (same category, excluding current)
    if (relatedSection && relatedCarousel) {
        const related = State.products
            .filter(p => p.category === product.category && p.id !== product.id)
            .slice(0, 6);
        if (related.length > 0) {
            relatedSection.style.display = "block";
            relatedCarousel.innerHTML = related.map(buildCardHTML).join("");
        } else {
            relatedSection.style.display = "none";
        }
    }
}

// Detail page quantity selector (uses a global detailQty variable)
let detailQty = 1;

function detailQtyChange(delta) {
    const productId = parseInt(new URLSearchParams(window.location.search).get("id"), 10);
    const product = getProductById(productId);
    const maxStock = product ? product.stock : 999;
    detailQty = Math.max(1, Math.min(detailQty + delta, maxStock));
    const display = $("#detailQty");
    if (display) display.textContent = detailQty;
}

function addToCartFromDetail(productId) {
    addToCart(productId, detailQty);
    detailQty = 1;
    const display = $("#detailQty");
    if (display) display.textContent = "1";
}

/* ---------- Render: Cart Drawer ---------- */
function renderCartDrawer() {
    const body = $("#cartBody");
    const foot = $("#cartFoot");
    const totalEl = $("#cartTotal");
    const itemCountEl = $("#cartItemCount");

    if (!body) return; // Not on a page with a cart drawer

    if (itemCountEl) itemCountEl.textContent = State.cart.length;

    if (State.cart.length === 0) {
        body.innerHTML = `
          <div class="empty">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>
            <div class="t">Your cart is empty</div>
            <div>Add some products to get started</div>
          </div>`;
        if (foot) foot.style.display = "none";
        return;
    }

    body.innerHTML = State.cart.map(item => {
        const product = getProductById(item.id);
        if (!product) return ""; // Product may have been removed
        return `
        <div class="cart-item">
          <img src="${product.image}" alt="${escapeHtml(product.name)}" />
          <div class="cart-item-body">
            <div class="cart-item-top">
              <div class="cart-item-name">${escapeHtml(product.name)}</div>
              <button class="x-btn" onclick="removeFromCart(${item.id})" aria-label="Remove">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
              </button>
            </div>
            <div class="cart-item-price">$${product.price.toFixed(2)}</div>
            <div class="qty">
              <button onclick="changeCartQty(${item.id}, -1)" aria-label="Decrease">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14"/></svg>
              </button>
              <span>${item.quantity}</span>
              <button onclick="changeCartQty(${item.id}, 1)" aria-label="Increase">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>
              </button>
            </div>
          </div>
        </div>`;
    }).join("");

    if (totalEl) totalEl.textContent = "$" + getCartTotal().toFixed(2);
    if (foot) foot.style.display = "block";
}

/* ---------- Render: Checkout Page ---------- */
function renderCheckoutPage() {
    const emptyState = $("#checkoutEmpty");
    const content = $("#checkoutContent");
    const summary = $("#checkoutSummary");

    if (!content || !emptyState || !summary) return;

    if (State.cart.length === 0) {
        emptyState.style.display = "block";
        content.style.display = "none";
        return;
    }

    emptyState.style.display = "none";
    content.style.display = "block";

    // Build summary
    summary.innerHTML = `
      <h3>Order Summary</h3>
      ${State.cart.map(item => {
        const product = getProductById(item.id);
        if (!product) return "";
        return `
        <div class="checkout-item">
          <img src="${product.image}" alt="${escapeHtml(product.name)}" />
          <div class="checkout-item-info">
            <div class="checkout-item-name">${escapeHtml(product.name)}</div>
            <div class="checkout-item-qty">Qty: ${item.quantity}</div>
          </div>
          <div class="checkout-item-price">$${(product.price * item.quantity).toFixed(2)}</div>
        </div>`;
      }).join("")}
      <div class="checkout-total-row">
        <span>Total</span>
        <span style="color:var(--primary);">$${getCartTotal().toFixed(2)}</span>
      </div>`;
}

/* ---------- Cart Drawer Open/Close ---------- */
function openCartDrawer() {
    const drawer = $("#drawer");
    const overlay = $("#overlay");
    if (drawer) drawer.classList.add("open");
    if (overlay) overlay.classList.add("open");
    renderCartDrawer();
}

function closeCartDrawer() {
    const drawer = $("#drawer");
    const overlay = $("#overlay");
    if (drawer) drawer.classList.remove("open");
    if (overlay) overlay.classList.remove("open");
}

/* ---------- Mobile Menu ---------- */
function initMobileMenu() {
    const menu = $("#mobileMenu");
    const overlay = $("#mobileMenuOverlay");
    const btn = $("#hamburgerBtn");

    if (!menu || !overlay || !btn) return;

    function openMenu() {
        menu.classList.add("open");
        overlay.classList.add("open");
        document.body.style.overflow = "hidden";
    }

    function closeMenu() {
        menu.classList.remove("open");
        overlay.classList.remove("open");
        document.body.style.overflow = "";
    }

    btn.addEventListener("click", openMenu);
    overlay.addEventListener("click", closeMenu);
    // Close on link click inside mobile menu
    $$("#mobileMenu a").forEach(link => {
        link.addEventListener("click", () => {
            setTimeout(closeMenu, 150);
        });
    });
}

/* ---------- Page Initializers ---------- */
async function initHomePage() {
    await fetchProducts();
    loadCart();
    loadWishlist();
    updateHeaderBadges();
    renderCartDrawer();

    if (State.error) {
        $("#productsGrid").innerHTML = `
          <div class="empty-state" style="grid-column:1/-1;">
            <div class="t">Failed to load products</div>
            <div class="s">${escapeHtml(State.error)}</div>
            <button class="btn btn-primary" onclick="location.reload()">Retry</button>
          </div>`;
        return;
    }

    renderCategoryChips();
    renderProductGrid();
    renderNewArrivalsCarousel();

    // Bind search input
    const searchInput = $("#searchInput");
    if (searchInput) {
        searchInput.addEventListener("input", () => {
            State.query = searchInput.value;
            renderProductGrid();
        });
    }

    // Bind sort select
    const sortSelect = $("#sortSelect");
    if (sortSelect) {
        sortSelect.addEventListener("change", () => {
            State.sort = sortSelect.value;
            renderProductGrid();
        });
    }

    // Cart drawer triggers
    const cartBtn = $("#cartBtn");
    const closeCart = $("#closeCart");
    const overlay = $("#overlay");
    if (cartBtn) cartBtn.addEventListener("click", openCartDrawer);
    if (closeCart) closeCart.addEventListener("click", closeCartDrawer);
    if (overlay) overlay.addEventListener("click", closeCartDrawer);

    // Wishlist button on home page — scroll to wishlist section if it existed, otherwise just show toast
    const wishlistBtn = $("#wishlistBtn");
    if (wishlistBtn) {
        wishlistBtn.addEventListener("click", () => {
            const count = State.wishlist.length;
            showToast(count > 0 ? `Wishlist: ${count} item(s) — use ♥ icons to manage` : "Your wishlist is empty");
        });
    }

    // Fix: mobile wishlist link should do the same as the button
    const mobileWishlistLink = $("#mobileWishlistLink");
    if (mobileWishlistLink) {
        mobileWishlistLink.href = "javascript:void(0)";
        mobileWishlistLink.addEventListener("click", (e) => {
            e.preventDefault();
            const count = State.wishlist.length;
            showToast(count > 0 ? `Wishlist: ${count} item(s) — use ♥ icons to manage` : "Your wishlist is empty");
        });
    }

    initMobileMenu();
}

async function initProductPage() {
    await fetchProducts();
    loadCart();
    loadWishlist();
    updateHeaderBadges();
    renderCartDrawer();

    if (State.error) {
        const skeleton = $("#productSkeleton");
        if (skeleton) skeleton.style.display = "none";
        $("#productDetailContent").innerHTML = `
          <div class="empty-state">
            <div class="t">Failed to load product</div>
            <div class="s">${escapeHtml(State.error)}</div>
            <button class="btn btn-primary" onclick="location.reload()">Retry</button>
          </div>`;
        return;
    }

    detailQty = 1;
    renderProductDetail();

    // Cart drawer triggers
    const cartBtn = $("#cartBtn");
    const closeCart = $("#closeCart");
    const overlay = $("#overlay");
    if (cartBtn) cartBtn.addEventListener("click", openCartDrawer);
    if (closeCart) closeCart.addEventListener("click", closeCartDrawer);
    if (overlay) overlay.addEventListener("click", closeCartDrawer);

    const wishlistBtn = $("#wishlistBtn");
    if (wishlistBtn) {
        wishlistBtn.addEventListener("click", () => {
            showToast(`Wishlist has ${State.wishlist.length} item(s).`);
        });
    }

    initMobileMenu();
}

async function initCheckoutPage() {
    await fetchProducts();
    loadCart();
    loadWishlist();
    updateHeaderBadges();

    renderCheckoutPage();

    // Handle form submission (single handler — avoids double-submit bug)
    const form = $("#checkoutForm");
    if (form) {
        form.addEventListener("submit", (e) => {
            e.preventDefault();
            if (validateCheckoutForm()) {
                placeOrder();
            }
        });
    }

    initMobileMenu();
}

/* ---------- Checkout Form Validation ---------- */
function validateCheckoutForm() {
    let isValid = true;

    const fullName = $("#fullName");
    const email = $("#email");
    const address = $("#address");
    const city = $("#city");

    const nameError = $("#nameError");
    const emailError = $("#emailError");
    const addressError = $("#addressError");
    const cityError = $("#cityError");

    // Clear errors
    [nameError, emailError, addressError, cityError].forEach(el => { if (el) el.textContent = ""; });

    if (!fullName || !fullName.value.trim()) {
        if (nameError) nameError.textContent = "Full name is required.";
        isValid = false;
    }
    if (!email || !email.value.trim()) {
        if (emailError) emailError.textContent = "Email address is required.";
        isValid = false;
    } else if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim())) {
        if (emailError) emailError.textContent = "Please enter a valid email address.";
        isValid = false;
    }
    if (!address || !address.value.trim()) {
        if (addressError) addressError.textContent = "Street address is required.";
        isValid = false;
    }
    if (!city || !city.value.trim()) {
        if (cityError) cityError.textContent = "City is required.";
        isValid = false;
    }

    return isValid;
}

/* ---------- Place Order ---------- */
function placeOrder() {
    const btn = $("#placeOrderBtn");
    if (btn) {
        btn.disabled = true;
        btn.textContent = "Processing...";
    }

    // Simulate processing delay
    setTimeout(() => {
        clearCart();
        const content = $("#checkoutContent");
        const success = $("#checkoutSuccess");
        const emptyState = $("#checkoutEmpty");
        if (content) content.style.display = "none";
        if (emptyState) emptyState.style.display = "none";
        if (success) success.style.display = "block";
        // Re-enable btn in case user navigates back
        if (btn) { btn.disabled = false; btn.textContent = "Place Order"; }
        updateHeaderBadges();
        window.scrollTo({ top: 0, behavior: "smooth" });
    }, 1200);
}

/* ---------- Main Entry Point ---------- */
document.addEventListener("DOMContentLoaded", () => {
    initTheme();

    const page = getPageType();
    switch (page) {
        case "home":
            initHomePage();
            break;
        case "product":
            initProductPage();
            break;
        case "checkout":
            initCheckoutPage();
            break;
        default:
            initHomePage();
    }
});

/* ---------- Expose API for ShopBot chatbot ---------- */
window.ShopHub = {
    getProducts: () => State.products,
    getCart: () => State.cart.map(item => ({
        ...item,
        product: getProductById(item.id)
    }))
};

/* ---------- PWA: Register Service Worker ---------- */
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
            .then(reg => console.log('[SW] Registered, scope:', reg.scope))
            .catch(err => console.warn('[SW] Registration failed:', err));
    });
}
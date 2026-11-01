/* ==========================================================================
    DATA & LOCALSTORAGE INITIALIZATION
========================================================================== */
//
/* ==========================================================================
   🧪 DEMO DATA — معلّقة، غير مستخدمة في أي مسار تنفيذ حالي
   ==========================================================================
   دي مصفوفة بيانات تجريبية (Arduino, Sensor, إلخ) كانت بتُستخدم كـ fallback
   للعرض قبل ما تتربط بـ Firestore فعليًا. دلوقتي المتجر شغال بـ 5 منتجات
   حقيقية في Firestore، وgetProducts() بقت مش بترجع للبيانات دي خالص —
   انظر تعليق FIX الأحدث فوق getProducts().

   سيبناها هنا (بدل حذفها) لأنها هتلزم للاختبار/الديمو لاحقًا. لو حابب
   تستخدمها كـ seed data لبيئة اختبار منفصلة (مش بيئة الإنتاج)، انسخها من
   هنا يدويًا وقت الحاجة — دي مش متاحة تلقائيًا كمتغيّر في الملف عشان محدش
   يستخدمها بالغلط بدل بيانات Firestore الحقيقية.

   const DEMO_PRODUCTS_REFERENCE_ONLY = [
       { id: 1, name: "Arduino Uno R3", category: "arduino", emoji: "🤖", price: 450, desc: "المتحكم الدقيق الأشهر عالمياً للمبتدئين والمحترفين، مثالي لبناء المشاريع التفاعلية وأنظمة التحكم الذكية.", specs: { "المعالج": "ATmega328P", "جهد التشغيل": "5V", "المنافذ الرقمية": "14" }, stock: 10 },
       { id: 2, name: "Ultrasonic Sensor HC-SR04", category: "sensors", emoji: "📡", price: 85, desc: "مستشعر قياس المسافات بالموجات فوق الصوتية بدقة عالية، مناسب لمشاريع الروبوتات وتجنب العقبات.", specs: { "طيف القياس": "2cm - 400cm", "زاوية الحث": "< 15 درجة", "الجهد": "5V" }, stock: 15 },
       { id: 3, name: "Relay Module 4-Channels", category: "modules", emoji: "🔌", price: 160, desc: "موديول ريلي 4 قنوات للتحكم في الأجهزة ذات الجهد العالي مثل مصابيح ومحركات المنازل الذكية عبر الآردوينو.", specs: { "أقصى حمل": "10A AC250V", "جهد الإشارة": "5V", "عدد القنوات": "4" }, stock: 8 },
       { id: 4, name: "Soldering Iron 60W Kit", category: "tools", emoji: "🔥", price: 320, desc: "كاوية لحام احترافية مع ميزة التحكم في درجة الحرارة، تأتي مع مجموعة كاملة من الملحقات المساعدة.", specs: { "الطاقة": "60W", "درجة الحرارة": "200°C - 450°C", "الجهد": "220V" }, stock: 5 },
       { id: 5, name: "NodeMCU ESP8266 IoT", category: "arduino", emoji: "🌐", price: 240, desc: "لوحة تطوير متكاملة تحتوي على شريحة Wi-Fi مدمجة، الخيار الأفضل لمشاريع إنترنت الأشياء والتحكم عن بعد.", specs: { "الذاكرة": "4MB Flash", "الواي فاي": "802.11 b/g/n", "المعالج": "Tensilica 32-bit" }, stock: 12 }
   ];
   ========================================================================== */

// FIX: defaultProducts كانت مُستخدمة في 3 أماكن تحت (هنا، وجوه getProducts()
// مرتين) من غير ما تكون متعرّفة كمتغير خالص — كانت موجودة بس كتعليق معطّل
// فوق. ده كان بيرمي "ReferenceError: defaultProducts is not defined" في أول
// سطر تنفيذ فعلي في الملف (سطر التخزين تحت مباشرة)، وبما إن الخطأ ده بيحصل
// برا أي try/catch، الـ JS engine كان بيوقف تنفيذ باقي script.js بالكامل من
// هنا — يعني DOMContentLoaded listener في آخر الملف ما كنش بيتسجل خالص، فمفيش
// splash animation، مفيش نافبار تفاعلي، مفيش منتجات، مفيش أي زرار شغال.
//
// الحل: array فاضي، مش الداتا التجريبية. المتجر ده بياناته الحقيقية كلها في
// Firestore (5 منتجات فعلية زي ما موضح في التعليق فوق)، فالغرض الوحيد من
// defaultProducts هو fallback أخير جوه getProducts() لو الكاش المحلي فاضي
// والاتصال بـ Firestore فشل في نفس اللحظة — مش المفروض يظهر منتجات وهمية
// للعميل في السيناريو ده، أفضل حاجة إنه يشوف "لم يتم العثور على أي منتجات"
// (renderProducts() أصلاً بيعرض الرسالة دي لو الـ array وصله فاضي).
const defaultProducts = [];

// دمج البيانات مع التخزين الدائم LocalStorage لضمان عدم ضياعها
if (!localStorage.getItem("volt_products")) {
    localStorage.setItem("volt_products", JSON.stringify(defaultProducts));
}
if (!localStorage.getItem("volt_users")) {
    localStorage.setItem("volt_users", JSON.stringify([]));
}
if (!localStorage.getItem("volt_orders")) {
    localStorage.setItem("volt_orders", JSON.stringify([]));
}

// دالات جلب وحفظ البيانات من الـ LocalStorage
async function getProducts() {
    if (window.voltFirebase && typeof window.voltFirebase.getProducts === "function") {
        try {
            const products = await window.voltFirebase.getProducts();
            if (products && products.length > 0) {
                saveProducts(products);
                return products;
            }
        } catch (err) {
            console.warn("getProducts: فشل القراءة من Firestore — بنستخدم الكاش المحلي", err);
        }
    }
    // احتياطي: لو Firebase لسه مش جاهز أو حصل خطأ، استخدم localStorage
    try {
        const cached = localStorage.getItem("volt_products");
        return cached ? JSON.parse(cached) : defaultProducts;
    } catch (e) {
        return defaultProducts;
    }
}

// FIX (pagination): كانت بتستبدل الكاش بالكامل بكل استدعاء — ده كان
// هيكسر المفضلة (script1.js بيقرأ من نفس المفتاح ده) وأي مكان تاني بيعتمد
// على إن منتج شافه العميل قبل كده لسه موجود في الكاش بعد ما يعمل scroll
// لصفحة تانية. دلوقتي union بالـ id: أي منتج جديد يتضاف/يتحدّث، أي منتج
// قديم في الكاش يفضل موجود من غير ما يتلمس.
// PERF (O(n×m) -> O(n+m)): كانت existing.filter(p => !newProds.some(...))
// بتعمل .some() كامل جوه .filter() — يعني لكل عنصر في existing (n)، بتلف
// على newProds (m) بالكامل. مع نمو volt_products cache في localStorage
// (بيتنادى مع كل addToCart/removeFromCart/infinite-scroll page)، ده بيبقى
// nested loop حقيقي بيتنفذ sync على الـ main thread. الحل: نبني Map واحدة
// من newProds (O(m))، وبعدين .filter() على existing بتعمل .has() على الـ
// Map (O(1) لكل lookup بدل O(m)) — يبقى الإجمالي O(n+m) مش O(n×m).
// منطق الـ union نفسه (أي منتج قديم في الكاش يفضل موجود، أي جديد يستبدل
// القديم بنفس الـ id) متغيّرش خالص — نفس الـ behavior بالظبط.
// PERF FIX (load-test audit): the union merge above (any old product in
// cache stays, any new product replaces one with the same id) had no cap.
// Every call was purely additive, so over a long infinite-scroll session
// this array — and the cost of JSON.stringify-ing it on every single
// addToCart/removeFromCart/deleteProduct call — grew without bound: an
// unbounded client-side memory leak plus a per-call serialization cost
// that got worse the longer the session ran. VOLT_PRODUCTS_CACHE_MAX caps
// the cache at 500 entries (far above what a single page or normal
// browsing session accumulates), evicting the oldest entries first once
// over the cap. newProds (whatever this specific call is saving right
// now) are always concatenated last and therefore never evicted by this
// slice, so nothing this call is actively trying to save can be dropped
// by its own write.
const VOLT_PRODUCTS_CACHE_MAX = 500;
function saveProducts(newProds) {
    let existing = [];
    try {
        existing = JSON.parse(localStorage.getItem("volt_products")) || [];
    } catch (e) { existing = []; }

    const newIds = new Map(newProds.map(p => [String(p.id), p]));
    let merged = existing
        .filter(p => !newIds.has(String(p.id)))
        .concat(newProds);

    if (merged.length > VOLT_PRODUCTS_CACHE_MAX) {
        merged = merged.slice(merged.length - VOLT_PRODUCTS_CACHE_MAX);
    }

    localStorage.setItem("volt_products", JSON.stringify(merged));
}
const getUsers = () => {
    try {
        const parsed = JSON.parse(localStorage.getItem("volt_users"));
        return Array.isArray(parsed) ? parsed : [];
    } catch (e) { return []; }
};
const saveUsers = (users) => {
    try { localStorage.setItem("volt_users", JSON.stringify(users)); } catch (e) { }
};

const getOrders = () => {
    try {
        const parsed = JSON.parse(localStorage.getItem("volt_orders"));
        return Array.isArray(parsed) ? parsed : [];
    } catch (e) { return []; }
};
const saveOrders = (orders) => {
    try { localStorage.setItem("volt_orders", JSON.stringify(orders)); } catch (e) { }
};

// المتغيرات العامة للجلسة الحالية
function loadCart() {
    try {
        const raw = localStorage.getItem("volt_cart");
        return raw ? JSON.parse(raw) : [];
    } catch (e) {
        return [];
    }
}
function saveCart() {
    try {
        localStorage.setItem("volt_cart", JSON.stringify(cart));
    } catch (e) { }
}
let cart = loadCart();
// SECURITY: holds the idempotency key for the CURRENT checkout attempt.
// Generated lazily on first use inside processFinalOrder() and
// deliberately NOT regenerated on a failed/retried attempt within the
// same checkout — if it were regenerated every call, a network-level
// retry (timeout, connection drop) would send a DIFFERENT key each time,
// which defeats the entire point: the server-side idempotency check in
// functions/index.js can only recognize "this is the same attempt as
// before" if the same key is reused across retries. Cleared only once an
// order is confirmed successfully (see the end of processFinalOrder()),
// so the NEXT separate checkout (new cart, later time) correctly gets a
// fresh key instead of accidentally colliding with a completed one.
let _voltCurrentOrderIdempotencyKey = null;
const IDEMPOTENCY_KEY_STORAGE = "volt_pending_order_idempotency_key";
function getOrderIdempotencyKey() { try { return sessionStorage.getItem(IDEMPOTENCY_KEY_STORAGE) || null; } catch (e) { return null; } }
function setOrderIdempotencyKey(key) { try { sessionStorage.setItem(IDEMPOTENCY_KEY_STORAGE, key); } catch (e) {} }
function clearOrderIdempotencyKey() { try { sessionStorage.removeItem(IDEMPOTENCY_KEY_STORAGE); } catch (e) {} }
const ORDER_LOCK_TIMEOUT_MS = 20000; let _voltOrderLockTimeoutId = null;
let currentUser = null; // يحمل بيانات اليوزر الحالية أو الأدمن
let activeCategory = "all"; // التصنيف النشط في شريط الفلاتر
let activePriceMax = null; // الحد الأقصى للسعر من السلايدر — null يعني بدون فلترة سعر
const WA_NUMBER = "201108199917";

// ── حالة الـ Pagination — بديل عن جلب كل المنتجات دفعة واحدة ──
let currentPageCursor = null;   // آخر document شفناه (null = أول صفحة)
let currentPageHasMore = true;  // هل فيه صفحة بعد كده
let isLoadingNextPage = false;  // قفل يمنع تحميل مزدوج أثناء الـ scroll
// FIX (race condition): يمنع تكرار الاستماع لـ voltFirebaseReady لو applyProductFilters()
// اتنادت أكتر من مرة قبل ما Firebase يجهز (مثلاً العميل بدّل فلتر مرتين بسرعة على نت بطيء)
let voltProductFiltersRetryBound = false;

// PERF: كاش نتائج بحث/فلترة محدود بمدة الجلسة (تاب واحد، مش shared بين
// المستخدمين) — بيمنع applyProductFilters() من ضرب Firestore تاني لو
// العميل رجع لنفس تركيبة (تصنيف + سعر + بحث) خلال 60 ثانية (مثلاً ضغط
// زرار "الكل" بعد "آردوينو" ورجع تاني، أو بدّل فلتر السعر بسرعة ورجع
// لنفس القيمة). المفتاح = تركيبة الفلاتر الثلاثة نفسها؛ صفحات الـ
// scroll التالية (loadNextProductsPage) مش متأثرة — دي بس أول صفحة.
const _searchQueryCache = new Map();
const SEARCH_CACHE_TTL_MS = 60000;
function _voltGetSearchCacheKey(category, maxPrice, searchPrefix) {
    return `${category}|${maxPrice}|${searchPrefix}`;
}
const SEARCH_CACHE_MAX_ENTRIES = 40;
function _voltCacheSearchResult(cacheKey, entry) {
    if (_searchQueryCache.size >= SEARCH_CACHE_MAX_ENTRIES && !_searchQueryCache.has(cacheKey)) {
        const oldestKey = _searchQueryCache.keys().next().value;
        _searchQueryCache.delete(oldestKey);
    }
    _searchQueryCache.set(cacheKey, entry);
}

// تنظيف أي نص قبل حقنه في innerHTML لمنع DOM-based XSS (نفس الطريقة
// المستخدمة بالفعل في كود الفولدرز وإدارة المهام أسفل الملف)
function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str == null ? "" : String(str);
    return div.innerHTML;
}
function safeId(id) {
    return String(id == null ? "" : id).replace(/[^a-zA-Z0-9_-]/g, "");
}

// ==========================================================================
// 🔐 PASSWORD HASHING (SHA-256) — تشفير كلمات المرور قبل التخزين
// ==========================================================================
async function hashPassword(password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/* ==========================================================================
   INIT
========================================================================== */
document.addEventListener("DOMContentLoaded", async () => {
    initSplashAnimation();
    renderProductSkeletons();
    setupFilters();
    setupSearch();
    await setupPriceFilter();
    await applyProductFilters();
    setupInfiniteScroll(); // FIX (pagination): مرة واحدة بس — sentinel ثابت بعد #products
    setupCartSystem();
    updateCartBadge();
    typeWriter();
    initLightning();
    initGlowCardPerformance();
    setupModals();

    // Firebase Auth and the user profile document are the session authority.
    sessionStorage.removeItem("volt_logged_user");
    if (window.voltFirebase && typeof window.voltFirebase.getCurrentUserProfile === "function") {
        currentUser = await window.voltFirebase.getCurrentUserProfile();
        updateNavForUser();
    }

    // فتح مودال المنتج مباشرة لو المستخدم دخل برابط منتج (#/product/{id})
    handleProductRouteFromHash();
});

window.addEventListener("voltAuthStateChanged", async (event) => {
    const previousRole = currentUser && currentUser.role;
    currentUser = event.detail || null;
    sessionStorage.removeItem("volt_logged_user");
    updateNavForUser();
    if (previousRole !== (currentUser && currentUser.role)) await applyProductFilters();
});

/* ==========================================================================
   SPLASH ANIMATION
========================================================================== */
function initSplashAnimation() {
    const wordmark = document.querySelector(".splash-wordmark");
    if (!wordmark) return;
    wordmark.innerHTML = "VOLT".split("").map(ch => `<span class="letter">${ch}</span>`).join("");
    wordmark.querySelectorAll(".letter").forEach((l, i) => setTimeout(() => l.classList.add("go"), 400 + i * 450));
}
function renderProductSkeletons(count = 8) {
    const c = document.getElementById("products");
    if (!c) return;
    c.innerHTML = Array.from({ length: count }).map(() => `
        <div class="skeleton-card" aria-hidden="true">
            <div class="skeleton-img"></div>
            <div class="skeleton-body">
                <div class="skeleton-line" style="width:35%;height:8px;"></div>
                <div class="skeleton-line skeleton-title"></div>
                <div class="skeleton-line skeleton-price"></div>
            </div>
        </div>`).join('');
}
/* ==========================================================================
   PRODUCTS RENDER & MANAGEMENT
========================================================================== */
// === #20: "جديد" window computation, additive only. Products with no
// createdAt field (every product that existed before this change) are
// safely treated as NOT new — isVoltNew() returns false for undefined/
// invalid dates rather than throwing or defaulting to true.
const VOLT_NEW_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;
function isVoltNew(p) {
    if (!p.createdAt) return false;
    const created = new Date(p.createdAt).getTime();
    if (Number.isNaN(created)) return false;
    return (Date.now() - created) < VOLT_NEW_WINDOW_MS;
}

// FIX (pagination): استُخرجت من جوه renderProducts() عشان appendProductCards()
// الجديدة (تحت) تستخدم بالظبط نفس الـ HTML، من غير ما نكرر نفس الـ template
// مرتين في مكانين مختلفين (ده كان هيخلي أي تعديل مستقبلي على شكل الكارت
// يحتاج تتعمل في مكانين، وده مصدر أخطاء مضمون بمرور الوقت).
function buildProductCardHTML(p) {
    const isAdmin = currentUser && currentUser.role === "admin";
    const pid = safeId(p.id);
    if (!pid) return "";
    return `
        <div class="card glow-card" data-id="${pid}" style="position:relative;">
            ${isAdmin ? `<button class="product-delete-btn" data-testid="product-delete-btn-${pid}" onclick="deleteProduct(event, '${pid}')" title="حذف المنتج من المتجر">×</button>` : ''}
            <div class="card-img${isVoltNew(p) ? ' volt-new-scan-active' : ''}" style="position:relative;" onclick="openProductModal('${pid}')">${isVoltNew(p) ? '<span class="volt-new-tag">جديد</span>' : ''}${p.emoji && String(p.emoji).startsWith('https://') ? `<img src="${escapeHtml(p.emoji)}" loading="lazy" style="width:100%;height:100%;object-fit:cover;border-radius:8px;">` : escapeHtml(p.emoji || '📦')}                ${p.stock <= 0 ?
            `<button class="fab-add fab-add--disabled" data-testid="product-add-btn-${pid}" disabled>×</button>` :
            `<button class="fab-add fab-add--active" id="btn-add-${pid}" data-testid="product-add-btn-${pid}" onclick="event.stopPropagation(); openProductModal('${pid}');" title="عرض المنتج والإضافة للسلة">+</button>`}
            </div>
            <div class="card-body">
                <span class="card-category">${escapeHtml(p.category)}</span>
                <h3 class="card-name" onclick="openProductModal('${pid}')">${escapeHtml(p.name)}</h3>
                <button class="details-toggle-btn" onclick="event.stopPropagation(); toggleDetailsView('${pid}');" style="background:none;border:none;color:var(--green);font-size:12px;cursor:pointer;margin-top:5px;text-align:right;font-family:'Cairo',sans-serif;font-weight:bold;">
                    تفاصيل المنتج <span class="volt-details-arrow">▼</span>
                </button>
                <div id="pd${pid}" class="details-panel" style="display:none;font-size:12px;color:var(--text);margin-top:8px;padding:8px;background:var(--dark);border-radius:6px;border-right:2px solid var(--green);">
                    ${escapeHtml(p.desc)}
                </div>
                <div class="card-footer">
                    <span class="card-price">${p.price} <span>EGP</span></span>
                </div>        
            </div>

        </div>`;
}

function renderProducts(products) {
    const c = document.getElementById("products");
    if (!c) return;
    if (!products.length) {
        c.innerHTML = `<p style="grid-column:1/-1;text-align:center;color:var(--muted);padding:40px;">لم يتم العثور على أي منتجات.</p>`;
        return;
    }

    c.innerHTML = products.map(p => buildProductCardHTML(p)).join('');
    // PERF: يحدّث كاش initGlowCardPerformance() بعد أي رندر كامل للشبكة —
    // إضافي، مش بديل عن أي سطر موجود تحت.
    if (typeof window.__voltRefreshGlowCards === "function") {
        window.__voltRefreshGlowCards();
    }
         if (window.__volt && window.__volt.microAnimations && typeof window.__volt.microAnimations.onProductsRendered === "function") {
        window.__volt.microAnimations.onProductsRendered();
    }
}

// FIX (pagination): بتضيف كروت جديدة تحت الموجودين في #products، من غير
// ما تمسح أو تعيد رندر اللي اتحمّل قبل كده. بتستخدم بالظبط نفس
// buildProductCardHTML اللي renderProducts() فوق بتستخدمها، فمفيش فرق
// بصري ممكن يحصل بين الصفحة الأولى والصفحات اللي بعدها.
function appendProductCards(products) {
    const c = document.getElementById("products");
    if (!c || !products.length) return;
    c.insertAdjacentHTML('beforeend', products.map(p => buildProductCardHTML(p)).join(''));
    // PERF: يحدّث كاش initGlowCardPerformance() بعد إضافة كروت جديدة عبر
    // infinite scroll — إضافي، مش بديل عن أي سطر موجود تحت.
    if (typeof window.__voltRefreshGlowCards === "function") {
        window.__voltRefreshGlowCards();
    }
    if (window.__volt && window.__volt.microAnimations && typeof window.__volt.microAnimations.onProductsRendered === "function") {
        window.__volt.microAnimations.onProductsRendered();
    }
}

// FIX (pagination): sentinel عنصر غير مرئي بعد #products مباشرة — أول ما
// يدخل نطاق الرؤية (rootMargin بيخليه يتفعّل قبل ما العميل يوصله فعلياً
// بـ 300px، عشان التحميل يحصل بسلاسة من غير ما العميل يحس بوقفة)،
// loadNextProductsPage() بتتنادى. بتتنادى مرة واحدة بس عند التحميل
// الأول — #products نفسه (والـ sentinel بعده) مش بيتمسحوا من الـ DOM
// أبداً، فمفيش داعي تعيد إنشاء الـ observer مع كل تغيير فلتر.
function setupInfiniteScroll() {
    const c = document.getElementById("products");
    if (!c || !("IntersectionObserver" in window)) return;
    if (document.getElementById("products-scroll-sentinel")) return; // منع تكرار الإعداد

    const sentinel = document.createElement("div");
    sentinel.id = "products-scroll-sentinel";
    sentinel.style.cssText = "height:1px;";
    c.insertAdjacentElement('afterend', sentinel);

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) loadNextProductsPage();
        });
    }, { rootMargin: "300px 0px" });

    observer.observe(sentinel);
}

// FIX (pagination): مؤشر بصري بسيط ("جاري تحميل المزيد...") بيظهر أثناء
// جلب الصفحة الجاية، ويختفي بمجرد ما تخلص — عشان العميل ميحسش إن
// السكرول "وقف" فجأة وهو مستني.
function showInfiniteScrollLoader(show) {
    const c = document.getElementById("products");
    if (!c) return;
    let loader = document.getElementById("products-loading-more");
    if (show) {
        if (!loader) {
            loader = document.createElement("div");
            loader.id = "products-loading-more";
            loader.style.cssText = "grid-column:1/-1;text-align:center;padding:20px;color:var(--muted);";
            loader.textContent = "⏳ جاري تحميل المزيد...";
            c.insertAdjacentElement('afterend', loader);
        }
    } else if (loader) {
        loader.remove();
    }
}

function toggleDetailsView(id) {
    const el = document.getElementById(`pd${id}`);
    if (el) el.style.display = el.style.display === "block" ? "none" : "block";

    // === #25: arrow rotation + panel fade, purely additive on top of the
    // display:none/block logic above, which remains the sole source of
    // truth for layout. volt-details-fade is only added on the block path
    // (the panel entering the layout); no animation on the hide path,
    // matching how #21/#22/#26 elsewhere in this batch only animate entry
    // where a matching exit animation risked fighting display:none timing.
    const btn = document.querySelector(`[onclick*="toggleDetailsView('${id}')"]`);
    if (btn) {
        const isNowOpen = el && el.style.display === "block";
        btn.classList.toggle("volt-details-open", !!isNowOpen);
    }
    if (el && el.style.display === "block") {
        el.classList.remove("volt-details-fade");
        void el.offsetWidth;
        el.classList.add("volt-details-fade");
    }
}

function productMatchesSearch(p, q) {
    if (!q) return true;
    const name = (p.name || "").toLowerCase();
    const desc = (p.desc || "").toLowerCase();
    const cat = (p.category || "").toLowerCase();
    const emoji = (p.emoji || "").toLowerCase();
    const specs = p.specs ? Object.entries(p.specs).map(([k, v]) => `${k} ${v}`).join(" ").toLowerCase() : "";
    return name.includes(q) || desc.includes(q) || cat.includes(q) || emoji.includes(q) || specs.includes(q);
}

// نقطة القرار الوحيدة لكل الفلاتر مجتمعة (تصنيف + بحث + سعر).
// FIX (pagination): كانت بتجيب كل المنتجات وتفلتر محلياً (.filter()) —
// دلوقتي بتصفّر حالة الـ pagination وتبدأ query جديد في Firestore نفسه
// (تصنيف + سعر + بداية اسم)، وترندر أول صفحة (24 منتج) بس. الصفحات
// اللي بعدها بتتحمّل عن طريق loadNextProductsPage() تحت مع الـ scroll.
async function applyProductFilters() {
    currentPageCursor = null;
    currentPageHasMore = true;

    const inp = document.getElementById("searchInput");
    const q = inp ? inp.value.toLowerCase().trim() : "";

    if (!window.voltFirebase || typeof window.voltFirebase.getProductsPage !== "function") {
        // FIX (race condition): config.js بيتحمّل كـ type="module" وممكن
        // يستنى شوية قبل ما window.voltFirebase يبقى جاهز، بينما
        // DOMContentLoaded (اللي بينادي applyProductFilters() أول مرة) ممكن
        // يفلق قبل كده على نت بطيء. قبل الفكس ده، الحالة دي كانت بترسم
        // شبكة منتجات فاضية للأبد من غير أي إعادة محاولة — عكس نظام
        // الفولدرز اللي أصلاً بيستمع لـ voltFirebaseReady (شوف index.html).
        // بنطبّق نفس النمط هنا: نعرض حالة فاضية مؤقتاً، ونسجّل استماع لمرة
        // واحدة بس (بحماية voltProductFiltersRetryBound عشان لو العميل
        // بدّل فلتر أكتر من مرة قبل ما Firebase يجهز، مينفعش يتسجّل أكتر من
        // مستمع واحد ويتسببوا في نداءات متزامنة متضاربة على نفس حالة
        // الـ pagination) — فور ما Firebase يجهز فعلياً، applyProductFilters()
        // بتتنادى تاني وترجع تجيب المنتجات الحقيقية بالفلتر الحالي.
        renderProducts([]);
        if (!voltProductFiltersRetryBound) {
            voltProductFiltersRetryBound = true;
            window.addEventListener("voltFirebaseReady", () => {
                voltProductFiltersRetryBound = false;
                applyProductFilters();
            }, { once: true });
        }
        return;
    }

    const maxPriceForQuery = typeof activePriceMax === "number" ? activePriceMax : null;

    // PERF: لو نفس تركيبة الفلاتر (تصنيف + سعر + بحث) اتسألت قبل كده في
    // آخر 60 ثانية في نفس التاب، بنرجّع النتيجة المخزّنة من غير ما نضرب
    // Firestore تاني. currentPageCursor بيتظبط من result.lastDoc المخزّن
    // بالظبط زي مسار الشبكة العادي تحت، عشان loadNextProductsPage()
    // (اللي بتستخدم currentPageCursor ده) تفضل شغالة صح سواء جت النتيجة
    // من الكاش أو من الشبكة.
    const cacheKey = _voltGetSearchCacheKey(activeCategory, maxPriceForQuery, q);
    const cachedEntry = _searchQueryCache.get(cacheKey);
    if (cachedEntry && (Date.now() - cachedEntry.timestamp) < SEARCH_CACHE_TTL_MS) {
        currentPageCursor = cachedEntry.lastDoc;
        currentPageHasMore = cachedEntry.hasMore;
        renderProducts(cachedEntry.products);
        saveProducts(cachedEntry.products);
        return;
    }

    // PERF FIX (load-test audit): getProductsPageFromFirestore (config.js)
    // no longer falls back to a silent full-collection scan on failure —
    // it now throws instead (missing/broken composite index, most
    // commonly). That's a deliberate fail-fast change on the config.js
    // side, but it means this call must be guarded here: without this
    // try/catch, an uncaught rejection at this line would break product
    // rendering for every visitor the moment the index is unavailable,
    // instead of the old (slow but non-breaking) full-scan degradation.
    // This does not change the success path at all — only what happens
    // if the call rejects.
    let result;
    try {
        result = await window.voltFirebase.getProductsPage({
            category: activeCategory,
            maxPrice: maxPriceForQuery,
            searchPrefix: q,
            cursorDoc: null,
            pageSize: 24
        });
    } catch (err) {
        console.error("applyProductFilters: فشل جلب صفحة المنتجات", err);
        const c = document.getElementById("products");
        if (c) {
            c.innerHTML = `<p style="grid-column:1/-1;text-align:center;color:var(--muted);padding:40px;">⚠️ تعذر تحميل المنتجات حالياً. حاول تحديث الصفحة.</p>`;
        }
        return;
    }

    currentPageCursor = result.lastDoc;
    currentPageHasMore = result.hasMore;

    _voltCacheSearchResult(cacheKey, { products: result.products, lastDoc: result.lastDoc, hasMore: result.hasMore, timestamp: Date.now() });

    renderProducts(result.products);
    saveProducts(result.products);
}

// FIX (pagination): تحميل الصفحة الجاية أثناء الـ scroll — بتضيف كروت
// جديدة تحت الموجودين (appendProductCards)، متمسحش ولا تعيد رندر اللي
// اتحمّل قبل كده. isLoadingNextPage بيمنع تحميل مزدوج لو العميل عمل
// scroll سريع قبل ما الصفحة السابقة تخلص تحميل.
async function loadNextProductsPage() {
    if (isLoadingNextPage || !currentPageHasMore) return;
    isLoadingNextPage = true;
    showInfiniteScrollLoader(true);

    const inp = document.getElementById("searchInput");
    const q = inp ? inp.value.toLowerCase().trim() : "";

    if (!window.voltFirebase || typeof window.voltFirebase.getProductsPage !== "function") {
        showInfiniteScrollLoader(false);
        isLoadingNextPage = false;
        return;
    }

    // PERF FIX (load-test audit): same reasoning as the try/catch added to
    // applyProductFilters() above — getProductsPageFromFirestore now
    // throws on failure instead of silently falling back to a full scan.
    // Guarded here so a failed infinite-scroll page load surfaces a toast
    // and simply stops loading further pages, rather than throwing an
    // uncaught rejection out of the IntersectionObserver callback.
    let result;
    try {
        result = await window.voltFirebase.getProductsPage({
            category: activeCategory,
            maxPrice: typeof activePriceMax === "number" ? activePriceMax : null,
            searchPrefix: q,
            cursorDoc: currentPageCursor,
            pageSize: 24
        });
    } catch (err) {
        console.error("loadNextProductsPage: فشل جلب الصفحة التالية", err);
        if (typeof showToast === "function") {
            showToast("⚠️ تعذر تحميل المزيد من المنتجات، حاول مرة أخرى", "warn");
        }
        showInfiniteScrollLoader(false);
        isLoadingNextPage = false;
        return;
    }

    currentPageCursor = result.lastDoc;
    currentPageHasMore = result.hasMore;

    appendProductCards(result.products);
    saveProducts(result.products);

    showInfiniteScrollLoader(false);
    isLoadingNextPage = false;
}

function setupFilters() {
    const btns = document.querySelectorAll(".filter-btn");
    btns.forEach(btn => btn.addEventListener("click", () => {
        btns.forEach(b => b.classList.remove("active")); btn.classList.add("active");
        activeCategory = btn.getAttribute("data-category");
        const inp = document.getElementById("searchInput");
        if (inp) inp.value = "";
        applyProductFilters();
    }));
}

// FIX (pagination): debounce 300ms على الكتابة — من غير كده كل حرف كان
// هيبعت طلب شبكة منفصل لـ Firestore (كانت رخيصة قبل كده لأنها .filter()
// محلي، دلوقتي بقت طلب شبكة حقيقي). ضغط زرار البحث أو Enter لسه فوري
// (بيلغي أي تأخير معلّق وينفّذ على طول).
function setupSearch() {
    const inp = document.getElementById("searchInput"), btn = document.getElementById("searchBtn");
    let debounceTimer = null;
    const go = () => applyProductFilters();
    const debouncedGo = () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(go, 300);
    };
    btn?.addEventListener("click", () => { clearTimeout(debounceTimer); go(); });
    inp?.addEventListener("keyup", e => { if (e.key === "Enter") { clearTimeout(debounceTimer); go(); } });
    inp?.addEventListener("input", debouncedGo);
}

// سلايدر السعر — اختياري تماماً زي في filter.js.
// FIX (pagination): كانت بتحسب الحد الأقصى ديناميكياً من getProducts()
// (جلب كل المنتجات) — ده بالظبط عكس هدف الـ pagination. دلوقتي بتستخدم
// max الثابت المعرّف فعلاً في index.html (max="1000") بدون أي جلب. ⚠️
// تنازل واعي: لو أضفت منتج بسعر أعلى من 1000 مستقبلاً، لازم تعدّل
// max="1000" في index.html يدوياً (سطر priceFilterSlider) — مش هيتحسب
// تلقائياً بعد كده.
async function setupPriceFilter() {
    const slider = document.getElementById("priceFilterSlider");
    const output = document.getElementById("priceFilterValue");
    if (!slider) return;

    activePriceMax = Number(slider.value);
    if (output) output.textContent = slider.value;

    slider.addEventListener("input", () => {
        activePriceMax = Number(slider.value);
        if (output) output.textContent = slider.value;
        applyProductFilters();
        // === #27: micro-bounce on the output value, purely visual —
        // does not affect activePriceMax or the filtering call above.
        if (output && window.__volt && window.__volt.microAnimations && typeof window.__volt.microAnimations.pulseOnce === "function") {
            window.__volt.microAnimations.pulseOnce(output, "volt-price-bump", 160);
        }
    });
}

async function openProductModal(id) {
    // FIX (pagination): كانت بتجيب كل المنتجات وتدوّر بينهم بـ .find() —
    // ده كان هيفشل بصمت (p يبقى undefined) لأي منتج مش موجود في الصفحة
    // المحمّلة حالياً (24 منتج بس). getProductById بتجيب المنتج المطلوب
    // مباشرة من Firestore بغض النظر عن أي صفحة هو فيها.
    if (!window.voltFirebase || typeof window.voltFirebase.getProductById !== "function") return;
    const p = await window.voltFirebase.getProductById(id);
    if (!p) return;
    const rows = p.specs ? Object.entries(p.specs).map(([k, v], idx) => `<div class="spec-row volt-spec-stagger" style="animation-delay:${idx * 60}ms"><span>${escapeHtml(k)}</span><span>${escapeHtml(v)}</span></div>`).join('') : '';
    const maxQty = (p.stock !== undefined && p.stock > 0) ? p.stock : 1;
    document.getElementById("productPageInnerContent").innerHTML = `
        <div class="modal-img">${p.emoji && String(p.emoji).startsWith('https://') ? `<img src="${escapeHtml(p.emoji)}" loading="lazy" decoding="async" style="max-width:120px;border-radius:8px;">` : escapeHtml(p.emoji || '📦')}</div>
        <div class="modal-info">
            <span class="modal-cat">${escapeHtml(p.category)}</span>
            <h3 class="modal-name">${escapeHtml(p.name)}</h3>
            <div class="modal-price">${p.price} <small>EGP</small></div>
            <p class="modal-desc">${escapeHtml(p.desc)}</p>
            <div class="modal-specs"><h4>المواصفات الفنية</h4>${rows}</div>
            <div class="modal-qty" style="display:flex;align-items:center;gap:14px;margin:16px 0;">
                <span style="font-weight:700;font-size:14px;">الكمية:</span>
                <div style="display:flex;align-items:center;gap:10px;">
                    <button type="button" class="btn-qty" data-testid="modal-qty-decrement-${p.id}" onclick="changeModalQty('${p.id}',-1,${maxQty})">−</button>
                    <span id="modalQtyVal-${p.id}" style="min-width:24px;text-align:center;font-weight:700;">1</span>
                    <button type="button" class="btn-qty" data-testid="modal-qty-increment-${p.id}" onclick="changeModalQty('${p.id}',1,${maxQty})">+</button>
                </div>
            </div>
            <div class="modal-actions">
                <button class="btn-primary" id="modalAddBtn-${p.id}" data-testid="modal-add-to-cart-btn-${p.id}" onclick="addModalQtyToCart('${p.id}')">Add item</button>
                <button class="btn-secondary" data-testid="modal-share-link-${p.id}" onclick="copyProductLink('${p.id}')" title="نسخ رابط المنتج">🔗 نسخ رابط المنتج</button>
                <a href="#" class="btn-secondary" onclick="closeProductPage();return false;">العودة للمتجر</a>
            </div>
        </div>
        <div class="product-sticky-bar" data-testid="product-sticky-bar-${p.id}">
            <span class="product-sticky-bar__price">${p.price} <small>EGP</small></span>
            <button class="btn-primary" data-testid="sticky-add-to-cart-btn-${p.id}" onclick="addModalQtyToCart('${p.id}')">Add item</button>
        </div>`;
    document.getElementById("product-page").classList.add("open");
    // FIX: كانت window.scrollTo(0,0) — بتسكرل صفحة المتجر الأساسية
    // لفوق، رغم إن #product-page عندها position:fixed وأصلاً مش
    // متأثرة بموضع سكرول الصفحة اللي وراها. النتيجة: لو كنت نازل في
    // قائمة المنتجات ودست على منتج تحت، الصفحة كلها كانت بترجع لفوق
    // فجأة. بدلناها بسكرول جوه #product-page نفسها (اللي هي فعلاً
    // الحاوية القابلة للسكرول، overflow-y:auto) — كده كل منتج بيفتح من
    // أول صفحته هو (مش فاضل في موضع سكرول منتج سابق)، من غير ما نلمس
    // موضع سكرول صفحة المتجر خالص.
    document.getElementById("product-page").scrollTo(0, 0);

    // نحدّث الـ URL بدون إعادة تحميل الصفحة، عشان يبقى للمنتج رابط
    // مباشر قابل للمشاركة، ونحدّث عنوان الصفحة عشان يبان في تبويب
    // المتصفح ونتايج البحث لو اتشارك الرابط.
    if (history.replaceState) {
        history.replaceState(null, "", `#/product/${encodeURIComponent(p.id)}`);
    }
    document.title = `${p.name} | VOLT`;
}

// نسخ رابط مباشر للمنتج الحالي إلى الحافظة، لمشاركته خارج الموقع.
// الرابط نفسه بيفتح صفحة المنتج الكاملة (نفس مسار #/product/{id})،
// مش المودال القديم — نفس صيغة الرابط، اختلف بس اللي بيتفتح بيه.
function copyProductLink(id) {
    const url = `${location.origin}${location.pathname}#/product/${encodeURIComponent(id)}`;
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url)
            .then(() => {
                showToast("✅ تم نسخ رابط المنتج", "green");
                // === #66: temporary text/style swap on the button itself,
                // purely additive on top of the existing toast above — the
                // toast still fires exactly as before, this is a second,
                // separate confirmation on the button. Reverts automatically
                // after 1.5s; does not touch the button's onclick or its
                // underlying copy logic.
                const shareBtn = document.querySelector(`[data-testid="modal-share-link-${id}"]`);
                if (shareBtn) {
                    const originalText = shareBtn.textContent;
                    shareBtn.textContent = "✓ تم النسخ";
                    shareBtn.classList.add("volt-copy-success");
                    setTimeout(() => {
                        shareBtn.textContent = originalText;
                        shareBtn.classList.remove("volt-copy-success");
                    }, 1500);
                }
            })
            .catch(() => showToast("⚠️ تعذر نسخ الرابط", "warn"));
    } else {
        showToast("⚠️ النسخ التلقائي غير مدعوم في هذا المتصفح", "warn");
    }
}

// عند فتح الموقع مباشرة برابط منتج (#/product/{id})، أو عند تغيير الـ
// hash يدويًا، نفتح صفحة المنتج الكاملة المطابقة تلقائيًا. الـ hash
// contract نفسه ما اتغيّرش — بس openProductModal() بقى بيرندر جوه
// #product-page (صفحة كاملة) بدل #modal-overlay (أوفرلي).
async function handleProductRouteFromHash() {
    const match = location.hash.match(/^#\/product\/(.+)$/);
    if (!match) return;
    const id = decodeURIComponent(match[1]);
    await openProductModal(id);
}

window.addEventListener("hashchange", handleProductRouteFromHash);

// متحكم الكمية جوه صفحة المنتج — بيغيّر القيمة المعروضة فقط، ضمن حدود المخزون المتاح
function changeModalQty(id, delta, maxQty) {
    const el = document.getElementById(`modalQtyVal-${id}`);
    if (!el) return;
    let val = parseInt(el.textContent, 10) || 1;
    val += delta;
    if (val < 1) val = 1;
    if (val > maxQty) val = maxQty;
    el.textContent = val;
    // === #47: micro-bounce, purely visual, reuses the same pulseOnce
    // helper already used elsewhere in this file for #27 above.
    if (window.__volt && window.__volt.microAnimations && typeof window.__volt.microAnimations.pulseOnce === "function") {
        window.__volt.microAnimations.pulseOnce(el, "volt-qty-bump", 160);
    }
}

// الفعل النهائي لزرار "Add item" جوه صفحة المنتج: يضيف المنتج للسلة بالكمية المختارة فعليًا، ثم يرجع للمتجر
async function addModalQtyToCart(id) {
    const el = document.getElementById(`modalQtyVal-${id}`);
    const qty = el ? (parseInt(el.textContent, 10) || 1) : 1;
    for (let i = 0; i < qty; i++) {
        await addToCart(null, id);
    }
    closeProductPage();
}

function closeProductPage() {
    document.getElementById("product-page").classList.remove("open");
    // نرجّع الـ URL وعنوان الصفحة لحالتهم الأصليين لما نرجع للمتجر،
    // عشان الـ hash متفضلش عالقة على منتج بعد الرجوع.
    if (location.hash.startsWith("#/product/") && history.replaceState) {
        history.replaceState(null, "", location.pathname + location.search);
    }
    document.title = "VOLT | متجر الإلكترونيات والقطع الذكية";
}
document.getElementById("closeProductPageBtn")?.addEventListener("click", closeProductPage);

// دالة حذف منتج للأدمن فقط
async function deleteProduct(event, id) {
    event.stopPropagation();
    if (!currentUser || currentUser.role !== "admin") return;
    if (confirm("هل أنت متأكد من حذف هذا المنتج نهائياً من المتجر؟")) {
        const sid = String(id);
        if (window.voltFirebase && typeof window.voltFirebase.deleteProduct === "function") {
            try { await window.voltFirebase.deleteProduct(sid); } catch (err) { console.warn("deleteProduct: فشل الحذف من Firestore", err); }
        }
        // FIX (pagination): استبدلت جلب كل المنتجات + applyProductFilters()
        // الكاملة (اللي كانت هتصفّر حالة الـ pagination وترجّع أي عميل
        // نازل في الـ scroll لأول صفحة) بإزالة مستهدفة: نحذف الـ id من
        // الكاش المحلي التراكمي، ونشيل الكارت من الشاشة مباشرة لو ظاهر.
        try {
            const cached = JSON.parse(localStorage.getItem("volt_products")) || [];
            localStorage.setItem("volt_products", JSON.stringify(cached.filter(p => String(p.id) !== sid)));
        } catch (e) { console.warn("deleteProduct: فشل تحديث الكاش المحلي", e); }
        document.querySelector(`[data-id="${sid}"]`)?.remove();
        if (typeof window.renderPublicFolders === "function") window.renderPublicFolders();
        showToast("تم حذف المنتج بنجاح ✓", "warn");
    }
}

// دالة إضافة منتج جديد من قبل الأدمن
async function submitNewProduct() {
    if (!currentUser || currentUser.role !== "admin") {
        showToast("صلاحية غير مسموحة!", "error");
        return;
    }
    const name = document.getElementById("newProdName").value.trim();
    const emoji = document.getElementById("newProdEmoji").value.trim();
    const category = document.getElementById("newProdCategory").value;
    const price = parseFloat(document.getElementById("newProdPrice").value);
    const stock = parseInt(document.getElementById("newProdStock").value);
    const desc = document.getElementById("newProdDesc").value.trim();

    if (!name || !emoji || isNaN(price) || isNaN(stock) || !desc) {
        showToast("يرجى ملء جميع الحقول بشكل صحيح", "warn");
        return;
    }

    // FIX: category was previously hardcoded to "all" here regardless of
    // what the admin picked in the #newProdCategory dropdown. "all" is the
    // special "show everything" filter value, not a real category — so
    // every product added through this form was invisible whenever a
    // visitor clicked any SPECIFIC category button (آردوينو، مستشعرات، etc.),
    // since p.category === "arduino" (etc.) was never true for these
    // products. This is why the filter buttons looked broken: they were
    // filtering correctly, there was just nothing with a real category
    // value to show.
    if (!category || category === "all") {
        showToast("يرجى اختيار تصنيف المنتج", "warn");
        return;
    }

    const newProd = {
        name,
        category,
        emoji,
        price,
        stock,
        desc,
        specs: { "الحالة": "جديد" },
        // === #20: new field, additive only — does not affect any existing
        // key above. Used purely by renderProducts() to compute whether a
        // product is within its first 3 days for the "جديد" badge/scan.
        createdAt: new Date().toISOString()
    };

    if (window.voltFirebase && typeof window.voltFirebase.addProduct === "function") {
        const savedId = await window.voltFirebase.addProduct(newProd);
        if (!savedId) {
            showToast("فشل حفظ المنتج في قاعدة البيانات. تحقق من الصلاحيات.", "error");
            return;
        }
        newProd.id = savedId;
    } else {
        newProd.id = String(Date.now());
    }

    // FIX (pagination): مبقيناش محتاجين نجيب كل المنتجات بس عشان نضيف
    // واحد جديد — saveProducts([newProd]) تراكمية (union بالـ id، شوف
    // تعريفها فوق)، فبتضيف المنتج الجديد للكاش من غير ما تلمس الباقي.
    // renderProducts(prods) القديمة كانت بترندر كل المنتجات بغض النظر عن
    // الفلتر النشط حالياً — استبدلناها بـ applyProductFilters() اللي
    // بترجع الصفحة الأولى محترمة الفلتر الفعلي (المنتج الجديد هيظهر لو
    // مطابق للفلتر، أو مش هيظهر لو الفلتر الحالي بيستبعده — وده صحيح).
    saveProducts([newProd]);
    await applyProductFilters();

    // إغلاق المودال وتنظيف المدخلات
    document.getElementById('add-product-modal').classList.remove('open');
    document.getElementById("newProdName").value = "";
    document.getElementById("newProdEmoji").value = "";
    document.getElementById("newProdPrice").value = "";
    document.getElementById("newProdStock").value = "";
    document.getElementById("newProdDesc").value = "";

    showToast("تم إضافة المنتج الجديد للمتجر بنجاح ✓", "green");
}

/* ==========================================================================
   CART SYSTEM
========================================================================== */
async function setupCartSystem() {
    const cartBtn = document.getElementById("cartBtn");
    const closeCartBtn = document.getElementById("closeCartBtn");
    const cartOverlay = document.getElementById("cart-overlay");
    const checkoutBtn = document.getElementById("checkoutBtn");

    cartBtn?.addEventListener("click", () => { updateCartUI(); cartOverlay.classList.add("open"); });
    closeCartBtn?.addEventListener("click", () => cartOverlay.classList.remove("open"));
    cartOverlay?.addEventListener("click", e => { if (e.target === cartOverlay) cartOverlay.classList.remove("open"); });
    checkoutBtn?.addEventListener("click", handleCheckout);
}

async function addToCart(event, id) {
    if (event && typeof event.stopPropagation === "function") event.stopPropagation();
    if (currentUser && currentUser.role === "admin") {
        showToast("حساب الإدارة لا يمكنه الشراء", "warn");
        return;
    }
    // FIX (pagination): كانت بتجيب كل المنتجات وتدوّر فيهم بـ findIndex —
    // بديل مباشر ورخيص: نجيب المنتج المطلوب بس من Firestore.
    if (!window.voltFirebase || typeof window.voltFirebase.getProductById !== "function") return;
    const p = await window.voltFirebase.getProductById(id);
    if (!p) return;

    if (p.stock !== undefined && p.stock <= 0) {
        showToast("عذراً، نفدت كمية هذا المنتج!", "warn"); return;
    }

    if (p.stock !== undefined) {
        p.stock--;
        // FIX (pagination): كانت بتنادي applyProductFilters() الكاملة هنا
        // بعد كل عملية إضافة — ده كان هيصفّر حالة الـ pagination بالكامل
        // مع كل ضغطة "+" (العميل نازل في scroll يترجّع لأول صفحة فجأة).
        // بدل كده، تحديث الكاش تراكمياً بس (saveProducts([p]) — union، مش
        // استبدال، شوف تعريفها فوق)، وتحديث بصري خفيف للكارت ده لو ظاهر
        // على الشاشة دلوقتي، من غير أي إعادة رندر لباقي الصفحة.
        saveProducts([p]);
        if (p.stock <= 0) {
            const fabBtn = document.querySelector(`[data-id="${p.id}"] .fab-add`);
            if (fabBtn) {
                fabBtn.outerHTML = `<button class="fab-add fab-add--disabled" disabled>×</button>`;
            }
        }
    }

    cart.push(JSON.parse(JSON.stringify(p)));
    updateCartBadge();
    saveCart();


    const btn = document.getElementById(`btn-add-${id}`);
    if (btn) {
        btn.innerHTML = "add✅";
        btn.style.backgroundColor = "rgba(29, 185, 84, 0.2)";
        btn.style.color = "#fff";
        setTimeout(() => {
            btn.innerHTML = "+";
            btn.style.backgroundColor = "#FFFFFF";
            btn.style.color = "#FF7A00";
        }, 1500);
    }
    const product = cart.find(cp => String(cp.id) === String(id));
    if (product) {
        trackAddToCart(product);
        trackMetaAddToCart(product);
        logFirebaseAnalytics('add_to_cart', {
            product_id: product.id,
            product_name: product.name,
            price: product.price,
            quantity: product.qty || 1
        });
    }
}


let _voltRemoveQueue = Promise.resolve();
async function removeFromCart(i) {
    _voltRemoveQueue = _voltRemoveQueue.then(() => _removeFromCartInner(i));
    return _voltRemoveQueue;
}
async function _removeFromCartInner(i) {
    const targetItem = cart[i];
    if (!targetItem) return;

    const reduceMotionCheck = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const removeBtn = document.querySelector(`[data-testid="cart-item-remove-${i}"]`);
    const itemEl = removeBtn ? removeBtn.closest(".cart-item") : null;
    if (itemEl && !reduceMotionCheck) {
        itemEl.classList.add("volt-cart-item-leaving");
        await new Promise(resolve => setTimeout(resolve, 280));
    }

    const currentIndex = cart.indexOf(targetItem);
    if (currentIndex === -1) return;

    const p = targetItem;
    const freshProduct = (window.voltFirebase && typeof window.voltFirebase.getProductById === "function")
        ? await window.voltFirebase.getProductById(p.id) : null;

    if (freshProduct) {
        const newStock = (freshProduct.stock || 0) + 1;
        const updatedProduct = { ...freshProduct, stock: newStock };
        saveProducts([updatedProduct]);
        if (newStock > 0) {
            const disabledBtn = document.querySelector(`[data-id="${freshProduct.id}"] .fab-add--disabled`);
            if (disabledBtn) {
                disabledBtn.outerHTML = `<button class="fab-add fab-add--active" id="btn-add-${freshProduct.id}" data-testid="product-add-btn-${freshProduct.id}" onclick="event.stopPropagation(); openProductModal('${freshProduct.id}');" title="عرض المنتج والإضافة للسلة">+</button>`;
            }
        }
    }

    const finalIndex = cart.indexOf(targetItem);
    if (finalIndex === -1) return;
    cart.splice(finalIndex, 1);
    updateCartBadge();
    updateCartUI();
    saveCart();
}

function updateCartBadge() {
    const b = document.getElementById("cartCount");
    if (!b) return;
    const prev = parseInt(b.textContent, 10) || 0;
    b.textContent = cart.length;
    if (cart.length > prev && window.__volt && window.__volt.microAnimations && typeof window.__volt.microAnimations.onCartUpdate === "function") {
        window.__volt.microAnimations.onCartUpdate(cart.length);
    }
}

async function updateCartUI() {
    const c = document.getElementById("cartItemsContainer"), t = document.getElementById("cartTotal");
    if (!c || !t) return;

    if (!cart.length) {
    c.innerHTML = `
        <div style="text-align:center;padding:20px 0;">
            <svg class="volt-cart-idle" width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="color:var(--muted);margin-bottom:10px;" aria-hidden="true">
                <path d="M3 4h2l2.4 12.2a2 2 0 0 0 2 1.6h7.2a2 2 0 0 0 2-1.6L21 8H6.2"/>
                <circle cx="10" cy="20" r="1.4" fill="var(--green)" stroke="none"/>
                <circle cx="17" cy="20" r="1.4" fill="var(--green)" stroke="none"/>
            </svg>
            <p style="margin:0;color:var(--muted);">السلة فارغة حالياً</p>
        </div>`;
    t.innerHTML = `0 <span>EGP</span>`;
    return;
}
    let total = 0;
    c.innerHTML = cart.map((item, i) => {
        total += item.price;
        return `
        <div class="cart-item">
            <div class="cart-item-info">
                <span class="cart-item-emoji">${item.emoji && String(item.emoji).startsWith('https://') ? '📦' : escapeHtml(item.emoji || '📦')}</span>
                <div>
                    <div class="cart-item-name">${escapeHtml(item.name)}</div>
                    <div class="cart-item-price">${item.price} EGP</div>
                </div>
            </div>
            <!-- data-testid keyed on cart index (i), matching removeFromCart(i)'s
                 own parameter — note this is NOT a stable product id: cart
                 entries have no persistent id in this data model, and removing
                 one item shifts every index after it. A test removing multiple
                 items should re-query the DOM between removals rather than
                 caching testids up front. -->
            <button class="btn-remove" data-testid="cart-item-remove-${i}" onclick="removeFromCart(${i})">&times;</button>
        </div>`;
    }).join('');

    // --- جزء حساب الخصم ---
    // FIX: this used to call window.PromoEngine.validatePromoCode(...)
    // directly — running promo validation and discount computation entirely
    // client-side, against a PROMO_CODES table also readable client-side by
    // anyone. That call, and window.PromoEngine, are no longer referenced
    // anywhere in this function.
    //
    // Render the un-discounted total immediately so the total line is never
    // blank while the network call below is in flight, then patch in the
    // discount once the server responds.
    t.innerHTML = `${total} <span>EGP</span>`;

    const appliedCode = typeof window.getCurrentPromoCode === "function"
        ? window.getCurrentPromoCode()
        : "";
    if (!appliedCode || typeof window.getPromoDiscountForTotal !== "function") return;

    // Re-validates against your Supabase Edge Function
    // (/functions/v1/validate-promo, same one cart-promo.js's
    // applyCustomerPromo calls) every time the cart total changes — cached
    // in cart-promo.js per cart total so repeated renders at the same total
    // (e.g. re-opening the cart without adding/removing anything) don't
    // re-hit the network. Also acts as re-validation: if the code has
    // expired or the cart no longer meets a min_order rule since it was
    // applied, this will come back with discountAmount 0 and
    // cart-promo.js clears the applied code.
    const discountAmount = await window.getPromoDiscountForTotal(total);

    // Bail if the cart changed again while this call was in flight — a
    // newer updateCartUI() call will have already re-rendered with the
    // current total, and patching in a stale discount here would show the
    // wrong number for whatever's in the cart now.
    if (document.getElementById("cartTotal") !== t) return;
    let currentTotalNow = 0;
    for (const item of cart) currentTotalNow += item.price;
    if (currentTotalNow !== total) return;

    if (discountAmount > 0) {
        const finalTotal = Math.max(0, total - discountAmount);
        // === #35: the numbers/calculation above (finalTotal, total,
        // discountAmount) are completely unchanged. Only the strike mark's
        // arrival is now a width sweep instead of appearing instantly —
        // volt-strike-price suppresses the inline line-through and draws
        // it via the ::after rule in volt-micro-animations.css instead,
        // which starts at width:0 and only reaches width:100% once
        // volt-strike-active is added a frame later below.
        t.innerHTML = `<span class="volt-strike-price" style="font-size:14px; color:#ff4444; margin-left:10px;">${total}</span> ${finalTotal} <span>EGP</span>`;
        const strikeEl = t.querySelector(".volt-strike-price");
        if (strikeEl) {
            requestAnimationFrame(() => {
                strikeEl.classList.add("volt-strike-active");
            });
        }
    }
}



/* ==========================================================================
   CHECKOUT FLOW
========================================================================== */
function handleCheckout() {
    document.getElementById("cart-overlay").classList.remove("open");
    if (!cart.length) { showToast("السلة فارغة!", "warn"); return; }
        // ✅ TRACKING
    if (cart.length) {
        const total = cart.reduce((sum, p) => sum + (p.price * (p.qty || 1)), 0);
        trackBeginCheckout(cart, total);
        logFirebaseAnalytics('begin_checkout', {
            items_count: cart.length,
            total_value: total
        });
    }
    // alert-modal بترجع تظهر زي ما كانت بالظبط — العميل لازم يختار: يسجل
    // دخول، ينشئ حساب، أو يضغط "طلب شراء كزائر" (زرار جديد بيودّي لنفس
    // شاشة الدفع اللي اتعملت، عن طريق setupModals()). مفيش مسار تلقائي
    // للزائر من غير ما يختار ده صراحة.
    if (!currentUser) {
        document.getElementById("alert-modal").style.display = "flex";
    } else {
        openPaymentModal();
    }
    
}

/* ==========================================================================
   MODALS & AUTH CONNECTORS
========================================================================== */
function setupModals() {
    document.getElementById("alertLoginBtn")?.addEventListener("click", () => { document.getElementById("alert-modal").style.display = "none"; openLoginModal(); });
    document.getElementById("alertRegisterBtn")?.addEventListener("click", () => { document.getElementById("alert-modal").style.display = "none"; openRegisterWizard(); });
    // زرار "طلب شراء كزائر" — بيقفل alert-modal ويفتح شاشة الدفع مباشرة
    // (openPaymentModal() هي اللي بتعرض حقول الزائر لأن currentUser لسه null هنا).
    document.getElementById("alertGuestCheckoutBtn")?.addEventListener("click", () => { document.getElementById("alert-modal").style.display = "none"; openPaymentModal(); });
    document.getElementById("alertCloseBtn")?.addEventListener("click", () => { document.getElementById("alert-modal").style.display = "none"; });

    document.getElementById("closeLoginBtn")?.addEventListener("click", closeLoginModal);
    document.getElementById("login-modal")?.addEventListener("click", e => { if (e.target === document.getElementById("login-modal")) closeLoginModal(); });
    document.getElementById("doLoginBtn")?.addEventListener("click", doLogin);
    document.getElementById("switchToRegister")?.addEventListener("click", () => { closeLoginModal(); openRegisterWizard(); });

    document.getElementById("closeRegisterBtn")?.addEventListener("click", closeRegisterModal);
    document.getElementById("register-modal")?.addEventListener("click", e => { if (e.target === document.getElementById("register-modal")) closeRegisterModal(); });

    document.getElementById("loginBtn")?.addEventListener("click", openLoginModal);
    document.getElementById("registerBtn")?.addEventListener("click", openRegisterWizard);

    document.getElementById("closePaymentBtn")?.addEventListener("click", () => document.getElementById("payment-modal").style.display = "none");
    document.getElementById("payment-modal")?.addEventListener("click", e => { if (e.target === document.getElementById("payment-modal")) document.getElementById("payment-modal").style.display = "none"; });
}

/* ==========================================================================
   LOGIN & ADMIN HANDLER
========================================================================== */
function openLoginModal() { closeRegisterModal(); document.getElementById("login-modal").style.display = "flex"; }
function closeLoginModal() { document.getElementById("login-modal").style.display = "none"; }

async function doLogin() {
    const loginInput = document.getElementById("loginEmail").value.trim();
    const pass = document.getElementById("loginPass").value.trim();

    if (!loginInput || !pass) {
        showToast("أدخل بيانات الدخول وكلمة المرور", "warn");
        return;
    }

    if (!window.voltFirebase || typeof window.voltFirebase.signInClient !== "function") {
        showToast("⏳ جاري تحميل النظام، حاول مرة أخرى بعد لحظة...", "warn");
        return;
    }

    const emailToTry = loginInput.includes("@") ? loginInput : null;
    if (!emailToTry) {
        showToast("⚠️ سجّل الدخول بالبريد الإلكتروني وكلمة المرور", "error");
        return;
    }

    try {
        const firebaseUser = await window.voltFirebase.signInClient(emailToTry, pass);
        if (!firebaseUser) {
            showToast("⚠️ بيانات الدخول غير صحيحة!", "error");
            return;
        }

        currentUser = { ...firebaseUser, role: firebaseUser.role || "client" };
        sessionStorage.removeItem("volt_logged_user");
        closeLoginModal();
        updateNavForUser();

        if (currentUser.role === "admin") {
            // FIX (pagination): كانت بتجيب كل المنتجات وترندرهم دفعة واحدة
            // عشان زرار الحذف يظهر — applyProductFilters() بترجع الصفحة
            // الأولى بس بالفلتر الحالي، وزرار الحذف بيظهر تلقائياً لأن
            // buildProductCardHTML() بتقرأ currentUser.role وقت الرندر
            // (اللي بقى "admin" دلوقتي فعلاً بعد السطر فوق مباشرة).
            await applyProductFilters();
            showToast("🛡️ مرحباً بك يا أدمن! تم الدخول للوحة التحكم الكاملة", "green");
        } else {
            showToast(`أهلاً بعودتك يا ${currentUser.name || "عميلنا"}! 🎉`, "green");
        }
    } catch (err) {
        console.error("doLogin: فشل تسجيل الدخول عبر Firebase", err);
        showToast("⚠️ بيانات الدخول غير صحيحة أو حدث خطأ في الاتصال!", "error");
    }
}

/*========================================================================== */
let wizStep = 1;
let wizData = { type: null, name: "", idNum: "", phone: "", pass: "", address: "" };

function openRegisterWizard() {
    closeLoginModal();
    wizStep = 1; wizData = { type: null, name: "", idNum: "", phone: "", pass: "", address: "" };
    document.querySelectorAll(".wizard-step").forEach(s => s.classList.remove("active"));
    document.getElementById("wstep-1").classList.add("active");
    updateWizardProgress();
    document.getElementById("register-modal").style.display = "flex";
}
function closeRegisterModal() { document.getElementById("register-modal").style.display = "none"; }

function selectType(type, el) {
    wizData.type = type;
    document.querySelectorAll(".type-card").forEach(c => c.classList.remove("selected"));
    el.classList.add("selected");
    document.getElementById("step1-err").classList.remove("show");
    if (type === "company") {
        document.getElementById("nameLabel").textContent = "اسم المؤسسة / الشركة";
        document.getElementById("idLabel").textContent = "رقم للتواصل";
        document.getElementById("wiz-name").placeholder = "مثال: شركة فولت للإلكترونيات";
        document.getElementById("wiz-id").placeholder = "01XXXXXXXXXX";
    } else {
        document.getElementById("nameLabel").textContent = "الاسم الكامل";
        document.getElementById("idLabel").textContent = "رقم الهاتف";
        document.getElementById("wiz-name").placeholder = "مثال: أحمد محمد علي";
        document.getElementById("wiz-id").placeholder = "01XXXXXXXXXX";
    }
}

// ==========================================
// 🚀 دالة الانتقال بين الخطوات (النسخة العسكرية المحسنة)
// ==========================================
async function wizNext() {
    const errs = { 1: "step1-err", 2: "step2-err", 3: "step3-err", 4: "step4-err", 5: "step5-err", 6: "step6-err" };
    const hideErr = n => document.getElementById(errs[n])?.classList.remove("show");
    const showErr = n => document.getElementById(errs[n])?.classList.add("show");

    hideErr(wizStep);

    if (wizStep === 1) {
        if (!wizData.type) { showErr(1); return; }

    } else if (wizStep === 2) {
        let v = document.getElementById("wiz-name").value.trim();
        const nameRegex = /^[\u0600-\u06FF\u0750-\u077Fa-zA-Z\s]{3,}$/;
        if (!nameRegex.test(v)) {
            let errEl = document.getElementById("step2-err");
            if (errEl) {
                errEl.textContent = "⚠️ الاسم يجب أن يحتوي على حروف فقط وبدون أرقام (3 أحرف على الأقل)";
                errEl.classList.add("show");
            }
            return;
        }
        // 💡 ميزة جديدة: تنظيف المسافات الزائدة بين الكلمات
        v = v.replace(/\s+/g, ' ');
        wizData.name = v;

    } else if (wizStep === 3) {
        const v = document.getElementById("wiz-id").value.trim();
        if (v.length < 5) { showErr(3); return; }
        // Firestore هي المصدر الوحيد للتحقق من تكرار رقم الهاتف — مفيش
        // نسخة محلية للمستخدمين نقارن بيها بعد إزالة localStorage fallback
        // من نظام التسجيل بالكامل.
        let isPhoneUsed = false;
        if (window.voltFirebase && typeof window.voltFirebase.findUserByIdNum === "function") {
            try {
                isPhoneUsed = !!(await window.voltFirebase.findUserByIdNum(v));
            } catch (err) {
                console.error("wizNext: فشل التحقق من رقم الهاتف في Firestore", err);
                let errEl = document.getElementById("step3-err");
                if (errEl) {
                    errEl.textContent = "⚠️ تعذر التحقق من الرقم حالياً، تحقق من الاتصال وحاول مرة أخرى";
                    errEl.classList.add("show");
                }
                document.getElementById("wiz-id").style.border = "2px solid red";
                return;
            }
        }
        // التأكد إن الرقم 11 رقم وبيبدأ بـ 01
        if (v.length !== 11 || !v.startsWith("01")) {
            let errEl = document.getElementById("step3-err");
            if (errEl) {
                errEl.textContent = "⚠️ يرجى إدخال رقم هاتف صحيح يتكون من 11 رقم ويبدأ بـ 01";
                errEl.classList.add("show");
            }
            document.getElementById("wiz-id").style.border = "2px solid red";
            return; // الفرامل اللي بتمنعه يكمل
        }
        if (isPhoneUsed) {
            let errEl = document.getElementById("step3-err");
            if (errEl) {
                errEl.textContent = "🛑 الرقم ده مسجل بيه حساب قبل كده! يرجى استخدام رقم آخر أو تسجيل الدخول.";
                errEl.classList.add("show");
            }
            document.getElementById("wiz-id").style.border = "2px solid red";
            return; // الفرامل اللي بتمنعه يكمل
        }
        wizData.idNum = v;
    
    } else if (wizStep === 4) {
        let v = document.getElementById("wiz-phone").value.trim();

        if (v === "") {
            // الإيميل اختياري تماماً — سيتم إنشاء إيميل وهمي من رقم الهاتف عند التسجيل
            wizData.email = "";
        } else {
            v = v.replace(/\s+/g, ""); // إزالة المسافات

            // لو ما فيهاش @ يبقى مش إيميل صحيح — نطلب منه يصحح أو يسيبها فاضية
            if (!v.includes("@")) {
                let errEl = document.getElementById("step4-err");
                if (errEl) {
                    errEl.textContent = "⚠️ الإيميل غير صحيح — اكتب إيميل كامل مثال: name@gmail.com أو اتركه فارغاً";
                    errEl.classList.add("show");
                }
                document.getElementById("wiz-phone").style.border = "2px solid red";
                return;
            }

            // تصحيح أخطاء الكتابة الشائعة
            v = v.replace("@gimal.com", "@gmail.com")
                .replace("@gmil.com", "@gmail.com")
                .replace("@gmai.com", "@gmail.com")
                .replace("@gamil.com", "@gmail.com")
                .replace("@yaho.com", "@yahoo.com")
                .replace("@hotmil.com", "@hotmail.com");

            // توحيد شكل الإيميل لحروف صغيرة
            wizData.email = v.toLowerCase();

            // التحقق من تكرار الإيميل حصرياً في Firestore
            let existingEmail = false;
            if (window.voltFirebase && typeof window.voltFirebase.findUserByEmail === "function") {
                try {
                    existingEmail = !!(await window.voltFirebase.findUserByEmail(wizData.email));
                } catch (e) {
                    console.error("wizNext: فشل التحقق من الإيميل في Firestore", e);
                }
            }
            if (existingEmail) {
                let errEl = document.getElementById("step4-err");
                if (errEl) {
                    errEl.textContent = "🛑 الإيميل ده مسجل عليه حساب قبل كده! حاول تسجيل الدخول.";
                    errEl.classList.add("show");
                }
                document.getElementById("wiz-phone").style.border = "2px solid red";
                return;
            }
        }

    } else if (wizStep === 5) {
        const v = document.getElementById("wiz-pass").value;
        if (v.length < 8) {
            let errEl = document.getElementById("step5-err");
            if (errEl) {
                errEl.textContent = "⚠️ كلمة السر يجب أن تكون 8 أحرف أو أكثر لحماية حسابك!";
                errEl.classList.add("show");
            }
            document.getElementById("wiz-pass").style.border = "2px solid red";
            return;
        }
        wizData.pass = v;
    }

    // 🚀 الانتقال للخطوة التالية بسلاسة
    if (wizStep < 6) {
        const currentStepEl = document.getElementById("wstep-" + wizStep);
        if (currentStepEl) currentStepEl.classList.remove("active");

        wizStep++;

        const nextStepEl = document.getElementById("wstep-" + wizStep);
        if (nextStepEl) nextStepEl.classList.add("active");

        if (typeof updateWizardProgress === 'function') {
            updateWizardProgress();
        }

        // 💡 ميزة جديدة: التركيز التلقائي (Auto-Focus) على الخانة القادمة
        setTimeout(() => {
            const nextInput = nextStepEl?.querySelector("input");
            if (nextInput) nextInput.focus();
        }, 100);
    }
}

// ==========================================
// 👁️ دالة العين السحرية (مفصولة ومحمية)
// ==========================================
function toggleWizPassword() {
    const passInput = document.getElementById("wiz-pass");
    const eyeIcon = document.getElementById("eye-icon");

    if (passInput && eyeIcon) {
        if (passInput.type === "password") {
            passInput.type = "text";
            eyeIcon.textContent = "👁️‍🗨️"; // شكل العين وهي مفتوح
        } else {
            passInput.type = "password";
            eyeIcon.textContent = "👁️"; // شكل العين وهي مغلقة
        }
    }
}

function wizBack() {
    if (wizStep <= 1) return;
    document.getElementById("wstep-" + wizStep).classList.remove("active");
    wizStep--;
    document.getElementById("wstep-" + wizStep).classList.add("active");
    updateWizardProgress();
}

async function wizSubmit() {
    const v = document.getElementById("wiz-address").value.trim();
    const hasLetters = /[a-zA-Z\u0600-\u06FF]/.test(v);
    if (v.length < 15 || !hasLetters) {
        document.getElementById("step6-err").textContent = "⚠️ العنوان غير مكتمل أو قصير جداً (15 حرف على الأقل)";
        document.getElementById("step6-err").classList.add("show");
        return;
    }
    wizData.address = v;

    // 🔐 تشفير كلمة المرور للنسخة المحلية (احتياطي)
    const hashedPass = await hashPassword(wizData.pass);

    const userCode = "VOLT-" + Math.floor(Math.random() * 90000 + 10000);
    let newUser = {
        type: wizData.type,
        name: wizData.name,
        idNum: wizData.idNum,
        phone: wizData.phone,
        pass: hashedPass,
        address: wizData.address,
        code: userCode,
        history: []
    };

    // التسجيل حصري عبر Firebase Auth + Firestore — مفيش localStorage fallback
    if (!window.voltFirebase || typeof window.voltFirebase.registerClient !== "function") {
        showToast("⚠️ النظام غير جاهز للتسجيل حالياً، حاول مرة أخرى لاحقاً", "error");
        return;
    }

    try {
        // 1. تجهيز الإيميل:
        //    - لو الشخص كتب إيميل حقيقي → نستخدمه
        //    - لو تركه فاضياً → نعمله إيميل وهمي من رقم الهاتف (idNum)
        const cleanPhone = (wizData.idNum || "").replace(/\D/g, "");
        const email = (wizData.email && wizData.email.trim() && wizData.email !== "بدون إيميل")
            ? wizData.email.trim()
            : `client_${cleanPhone}@volt.com`;

        // 2. الفحص المسبق
        try {
            const existingByIdNum = await window.voltFirebase.findUserByIdNum(wizData.idNum);
            if (existingByIdNum) {
                showToast("🛑 رقم الهاتف مسجل من قبل", "warn");
                return;
            }
            // نتحقق من الإيميل بس لو الشخص كتب إيميل حقيقي (مش الوهمي)
            if (wizData.email && wizData.email.trim() && wizData.email !== "بدون إيميل") {
                const existingByEmail = await window.voltFirebase.findUserByEmail(email);
                if (existingByEmail) {
                    showToast("🛑 البريد الإلكتروني مسجل من قبل", "warn");
                    return;
                }
            }
        } catch (checkErr) {
            console.warn("تعذر الفحص المسبق، سيتم الاعتماد على فحص Firebase المباشر", checkErr);
        }

        const profile = {
            type: wizData.type,
            name: wizData.name,
            phone: wizData.phone,
            idNum: wizData.idNum,
            address: wizData.address,
            code: userCode,
            history: []
        };

        // 3. طلب التسجيل مع معالجة الأخطاء
        const result = await window.voltFirebase.registerClient(email, wizData.pass, profile);

        if (!result || result.error || !result.uid) {
            const errCode = result?.error;
            let errorMsg = "⚠️ فشل إنشاء الحساب — حاول مرة أخرى";

            if (errCode === "auth/email-already-in-use") {
                errorMsg = "🛑 رقم الهاتف أو البريد مسجل بالفعل";
            } else if (errCode === "auth/invalid-email") {
                errorMsg = "⚠️ صيغة البريد الإلكتروني غير صحيحة";
            } else if (errCode === "auth/weak-password") {
                errorMsg = "⚠️ كلمة المرور ضعيفة جداً (6 أرقام/أحرف على الأقل)";
            }

            showToast(errorMsg, "error");
            return;
        }

        const firebaseUser = result;
        newUser.uid = firebaseUser.uid;
        newUser.email = firebaseUser.email;
        delete newUser.pass; // الباسورد مش محتاج يتخزن محلياً خالص
    } catch (err) {
        console.error("wizSubmit: فشل إنشاء الحساب في Firebase", err);
        showToast("⚠️ حدث خطأ أثناء إنشاء الحساب — تحقق من اتصالك وحاول مرة أخرى", "error");
        return;
    }

    // localUserCopy لم يعد يُستخدم — الباسورد مش بيتخزن في localStorage خالص

    currentUser = newUser;
    currentUser.role = "client";
    sessionStorage.removeItem("volt_logged_user");

    closeRegisterModal();
    updateNavForUser();
    showToast("🎉 تم إنشاء حسابك بنجاح وحفظ بياناتك!", "green");

    const isCompany = wizData.type === "company";
    document.getElementById("successContent").innerHTML = `
        <div class="success-icon">🎉</div>
        <h3>تم إنشاء حسابك!</h3>
        <p style="margin-bottom:8px;">أهلاً <strong style="color:var(--green)">${escapeHtml(wizData.name)}</strong></p>
        <p>تم تسجيل وحفظ بياناتك بنجاح.<br>${isCompany ? "يمكنك الآن الشراء بالأسعار المؤسسية." : "يمكنك الآن تصفح المنتجات وإتمام طلباتك بحرية."}</p>
        <button class="btn-primary" style="margin-top:8px;" onclick="document.getElementById('success-modal').classList.remove('open');">ابدأ التسوق 🛒</button>`;
    document.getElementById("success-modal").classList.add("open");
}

function updateWizardProgress() {
    document.querySelectorAll(".wp-step").forEach((el, i) => {
        const s = i + 1; el.classList.remove("active", "done");
        if (s < wizStep) el.classList.add("done"); else if (s === wizStep) el.classList.add("active");
    });
    document.querySelectorAll(".wp-line").forEach((el, i) => {
        const wasAlreadyDone = el.classList.contains("done");
        const shouldBeDone = i + 1 < wizStep;
        el.classList.toggle("done", shouldBeDone);
        // === #24: fire the sweep only on the transition INTO done, not on
        // every call (this function runs on every wizNext()/wizBack()) and
        // not on lines that were already done before this call.
        if (shouldBeDone && !wasAlreadyDone) {
            el.classList.remove("volt-line-sweep");
            void el.offsetWidth;
            el.classList.add("volt-line-sweep");
        }
    });
}
/* ==========================================================================
   NAV CONFIGURATIONS & ADMIN PANEL TRIGGER
========================================================================== */
function updateNavForUser() {
    const area = document.getElementById("nav-auth-area");
    if (!area) return;

    if (!currentUser) {
        area.innerHTML = `
            <button id="loginBtn" class="nav-cart" style="background:transparent;color:var(--green);border:1.5px solid var(--green);">تسجيل الدخول</button>
            <button id="registerBtn" class="nav-cart" style="background:transparent;color:var(--muted);border:1.5px solid var(--border);">إنشاء حساب</button>
            <button class="nav-cart" id="cartBtn">السلة <span class="cart-badge" id="cartCount">${cart.length}</span></button>`;
        document.getElementById("loginBtn").addEventListener("click", openLoginModal);
        document.getElementById("registerBtn").addEventListener("click", openRegisterWizard);
        document.getElementById("cartBtn").addEventListener("click", () => { updateCartUI(); document.getElementById("cart-overlay").classList.add("open"); });
        document.getElementById("adminDashboardBtn")?.addEventListener("click", openAdminDashboard);
    } else if (currentUser.role === "admin") {
        area.innerHTML = `
            <button id="adminDashboardBtn" class="nav-cart" style="background:var(--amber); color:#000; border:none; font-weight:bold;">لوحة التحكم ⚙️</button>
            <button class="nav-logout" onclick="logout()" style="background:transparent;color:var(--muted);border:1px solid var(--border);padding:6px 12px;border-radius:6px;cursor:pointer;">خروج</button>`;
        document.getElementById("adminDashboardBtn").addEventListener("click", openAdminDashboard);
    } else {
        // لوحة المستخدم والعميل العادي (اليوزر ليس لديه صلاحية إضافة وحذف المنتجات)
        area.innerHTML = `
            <span class="nav-user">👤 ${escapeHtml(currentUser.name)} <small style="color:var(--muted); margin-right:6px; font-family:'Rajdhani',sans-serif; font-size:14px;">#${currentUser.code}</small></span>
            <button class="nav-logout" onclick="logout()" style="background:transparent;color:var(--muted);border:1px solid var(--border);padding:6px 12px;border-radius:6px;cursor:pointer;">خروج</button>
            <button class="nav-cart" id="cartBtn">السلة <span class="cart-badge" id="cartCount">${cart.length}</span></button>`;
        document.getElementById("cartBtn").addEventListener("click", () => { updateCartUI(); document.getElementById("cart-overlay").classList.add("open"); });
    }
}

async function logout() {
    if (window.voltFirebase && typeof window.voltFirebase.signOutUser === "function") {
        try { await window.voltFirebase.signOutUser(); } catch (e) { }
    }
    currentUser = null;
    sessionStorage.removeItem("volt_logged_user");
    // FIX: يمسح أي كود خصم مطبّق قبل الخروج — لو حد سجّل خروج وطلب تاني
    // كزائر في نفس التبويب من غير ريفريش، مينفعش يفضل الخصم القديم عالق.
    // الزائر مالوش خصم أصلاً، شوف processGuestOrder().
    if (typeof window.__voltClearPromoOnLogout === "function") {
        window.__voltClearPromoOnLogout();
    }
    updateNavForUser();
    // FIX (pagination): نفس مبدأ doLogin أعلاه — applyProductFilters()
    // بترجع الصفحة الأولى بالفلتر الحالي، وأدوات الأدمن (زرار الحذف)
    // بتختفي تلقائياً لأن currentUser بقى null دلوقتي.
    await applyProductFilters(); // إعادة الرندر لإخفاء أدوات الأدمن
    showToast("تم تسجيل الخروج بنجاح", "warn");
}

/* ==========================================================================
   PAYMENT FLOW & SAVING PERMANENT ORDERS
========================================================================== */
function openPaymentModal() {
    let total = cart.reduce((s, item) => s + item.price, 0);
    const summary = document.getElementById("paySummary");
    const isGuest = !currentUser;

    // FIX: لو زائر (مفيش currentUser)، سطر "التوصيل إلى" بيقرا
    // currentUser.address مباشرة كان هيرمي خطأ (Cannot read properties
    // of null). دلوقتي بيتشرط: لو فيه currentUser يعرض عنوانه المحفوظ
    // زي ما هو بالظبط، لو زائر يعرض placeholder لحد ما يملأ حقل العنوان
    // تحت (الحقل نفسه، مش عنصر تاني، عشان معندناش مصدرين للعنوان الواحد).
    const deliveryRow = isGuest
        ? `<div class="pay-summary-row" style="color:var(--muted); font-size: 11px; margin-top:5px; margin-bottom: 5px; border-bottom: none;">
            التوصيل إلى: <strong style="color:var(--text);">يرجى إدخال العنوان أدناه</strong>
        </div>`
        : `<div class="pay-summary-row" style="color:var(--muted); font-size: 11px; margin-top:5px; margin-bottom: 5px; border-bottom: none;">
            التوصيل إلى: <strong style="color:var(--text);">${escapeHtml(currentUser.address)}</strong>
        </div>`;

    // FIX: حقول بيانات الزائر (رقم الهاتف + اسم المهندس + العنوان) —
    // بتظهر بس لما مفيش currentUser. العميل المسجل بياناته موجودة
    // بالفعل في currentUser فمفيش داعي يكتبها تاني. الحقول دي فوق فورم
    // الدفع مباشرة (جوه نفس شاشة الدفع)، مش مودال منفصل، زي ما اتفقنا.
    //
    // كلاس guest-input (مش wiz-input) عن قصد: wiz-input بـ padding:13px 16px
    // مصمم لفورم التسجيل الكبير اللي بياخد الشاشة كلها. جوه payment-modal
    // (max-width:440px، مساحة أضيق بكتير) نفس الـ padding كان بيخلي 3 حقول
    // متتالية تاخد مساحة ضخمة على التاب والموبايل. guest-input مُعرّفة في
    // style.css بحجم أصغر من الأساس، مع تصغيرة إضافية على الموبايل — من غير
    // ما تأثر على wiz-input نفسها في أي فورم تاني بالموقع.
    const guestFieldsHtml = isGuest
        ? `<div style="margin: 15px 0; background: #0e140e; padding: 15px; border-radius: 8px; border: 1px solid var(--border); text-align:right;">
            <p style="color:var(--green); font-size:13px; font-weight:700; margin-bottom:10px;">بيانات التواصل والتوصيل</p>
            <input type="text" id="guestEngineerName" data-testid="guest-engineer-name" class="guest-input"
                placeholder="Engineer Name (الاسم الكامل)" style="direction:rtl; text-align:right;">
            <input type="text" id="guestPhone" data-testid="guest-phone" class="guest-input"
                placeholder="رقم الهاتف (01XXXXXXXXXX)" style="direction:ltr; text-align:right;">
            <input type="text" id="guestAddress" data-testid="guest-address" class="guest-input"
                placeholder="العنوان بالتفصيل (المدينة، الحي، الشارع)">
            <p id="guestFieldsErr" class="wiz-error" data-testid="guest-fields-error" style="margin-top:6px;">⚠️ يرجى ملء الاسم ورقم الهاتف والعنوان بشكل صحيح</p>
        </div>`
        : "";

    // قسم كود الخصم — بيظهر بس للعميل المسجل. الزائر مش له كود خصم لأنه
    // مش عميل مسجل ومفيش تتبع لطلباته/تاريخه في القاعدة، فمفيش معنى
    // لعرض حقل كود خصم له أصلاً.
    const promoSectionHtml = isGuest
        ? ""
        : `<!-- قسم كود الخصم للعميل في شاشة الدفع -->
<div style="margin: 15px 0; background: #1a1a1a; padding: 15px; border-radius: 8px; border: 1px dashed #1db954;">
    <p style="color: #ccc; font-size: 14px; margin-bottom: 10px; text-align: right;">عندك كود خصم؟ 🎟️</p>
    <div style="display: flex; gap: 10px; direction: rtl;">
        <input type="text" id="customerPromoInput" class="promo-input" placeholder="أدخل الكود هنا...">
        <button class="promo-apply-btn" onclick="applyCustomerPromo()">
            تطبيق
        </button>
    </div>
    <p id="promoMessage" style="margin-top: 10px; font-size: 14px; font-weight: bold; text-align: center;"></p>
</div>`;

    summary.innerHTML = `
        <div class="pay-summary-title">تأكيد ملخص الطلب</div>
        <div class="pay-summary-row"><span>عدد المنتجات:</span><span>${cart.length}</span></div>
        ${deliveryRow}
        <div class="pay-summary-row" style="border-top: 1px solid var(--border); margin-top: 5px; padding-top: 5px;">
            <span>الإجمالي المطلوب:</span><span>${total} EGP</span>
        </div>
        ${guestFieldsHtml}
        ${promoSectionHtml}
    `;
    document.getElementById("payment-modal").style.display = "flex";
}

// FIX: بتتحقق من حقول الزائر (الاسم/الرقم/العنوان) وترجعهم كـ object لو
// سليمين، أو null لو حاجة ناقصة/غلط — وفي الحالة دي بتظهر guestFieldsErr
// وتوقف الفلو. دي بديل مبسّط لتحقق wizNext() الأكمل (نفس شرط رقم الهاتف:
// 11 رقم ويبدأ بـ 01)، لأن الزائر مش بيعدي على نفس الويزارد خالص.
function validateGuestFields() {
    const nameEl = document.getElementById("guestEngineerName");
    const phoneEl = document.getElementById("guestPhone");
    const addressEl = document.getElementById("guestAddress");
    const errEl = document.getElementById("guestFieldsErr");
    if (!nameEl || !phoneEl || !addressEl) return null; // مش زائر أصلاً (currentUser موجود)

    const name = nameEl.value.trim();
    const phone = phoneEl.value.trim();
    const address = addressEl.value.trim();

    const nameOk = name.length >= 3;
    const phoneOk = phone.length === 11 && phone.startsWith("01");
    const addressOk = address.length >= 10;

    if (!nameOk || !phoneOk || !addressOk) {
        if (errEl) {
            errEl.textContent = !nameOk
                ? "⚠️ يرجى إدخال الاسم  (3 أحرف على الأقل)"
                : !phoneOk
                ? "⚠️ يرجى إدخال رقم هاتف صحيح (11 رقم ويبدأ بـ 01)"
                : "⚠️ يرجى إدخال العنوان بالتفصيل (10 أحرف على الأقل)";
            errEl.classList.add("show");
        }
        [nameEl, phoneEl, addressEl].forEach(el => el.style.borderColor = "var(--red)");
        return null;
    }

    if (errEl) errEl.classList.remove("show");
    return { name, phone, address };
}

function choosePayment(method) {
    let total = cart.reduce((sum, item) => sum + item.price, 0);
    const isGuest = !currentUser;

    if (isGuest) {
        showToast("يجب تسجيل الدخول لإتمام الطلب", "warn");
        openLoginModal();
        return;
    }

    // FIX: الزائر لازم يملأ بياناته الأساسية قبل ما نكمل لأي مسار دفع —
    // بدون رقم/اسم/عنوان مفيش طريقة نبعت رسالة الواتساب أو نعرض "التوصيل
    // إلى" صح. التحقق بيحصل هنا (قبل أي فرع تاني) عشان يوقف الزائر بدري
    // بدل ما يوصل لشاشة "دفع العربون" وبعدين يتضح إن بياناته ناقصة.
    if (isGuest) {
        const guestData = validateGuestFields();
        if (!guestData) return;
        window.__voltGuestOrderData = guestData; // تخزين مؤقت لحد ما processGuestOrder تستخدمه
    }

    // قاعدة الديبوزت للطلبات فوق الـ 1000 جنيه — نفس القاعدة للزائر والعميل
    // المسجل، لكن زرار "إرسال الطلب للمراجعة" بيروح processGuestOrder()
    // للزائر (مفيش حفظ Firestore) و processFinalOrder() للعميل المسجل
    // (زي ما كانت بالظبط قبل التعديل ده).
    if (method === 'cash' && total > 1000) {
        let deposit = Math.ceil(total * 0.3);
        const payBox = document.querySelector(".payment-box");
        if (!payBox.dataset.originalHtml) payBox.dataset.originalHtml = payBox.innerHTML;

        const confirmHandler = isGuest
            ? "processGuestOrder('pending-deposit')"
            : "processFinalOrder('pending-deposit')";

        payBox.innerHTML = `
            <button class="modal-close" onclick="closePaymentModal()" style="right:auto; left:16px;">&times;</button>
            <h3 style="color:var(--amber); font-family:'Rajdhani',sans-serif; font-size:24px; margin-bottom:10px;">⚠️ تأكيد الطلب معلق</h3>
            <p style="color:var(--muted); font-size:13px; margin-bottom:20px; line-height:1.6;">
                قيمة طلبك تتخطى 1000 ج.م. لتأكيد الطلب، يجب دفع عربون <b>30%</b> بقيمة <strong style="color:var(--green); font-size:16px;">${deposit} ج.م</strong> عبر InstaPay أولاً.
            </p>
            <div class="volt-deposit-shake" style="background:#0e140e; border:1px dashed var(--amber); padding:15px; border-radius:10px; margin-bottom:20px;">
                <span style="display:block; color:var(--muted); font-size:12px; margin-bottom:5px;">رقم التحويل (InstaPay):</span>
                <strong style="color:#fff; font-size:20px; letter-spacing:2px;">01108199917</strong>
            </div>
            <button class="btn-primary" style="width:100%; margin-bottom:10px; background:var(--amber); color:#000;" onclick="${confirmHandler}">⏳ إرسال الطلب للمراجعة</button>
            <button class="btn-secondary" style="width:100%; border-color:var(--border); color:var(--muted);" onclick="resetPaymentModal()">رجوع لاختيار طريقة أخرى</button>
        `;
        return;
    }

    if (isGuest) {
        processGuestOrder(method);
    } else {
        processFinalOrder(method);
    }
}

// FIX: مسار مستقل تمامًا للزائر — واتساب بس، من غير Firestore saveOrder،
// من غير تحديث مخزون، من غير history، ومن غير أي لمسة لـ currentUser
// (لأنه أصلاً null هنا). ده متعمّد ومطابق لتعليمات صاحب المشروع: طلب
// الزائر شكله في نافذة الواتساب بس. processFinalOrder() الأصلية فضلت
// زي ما هي تمامًا لمسار العميل المسجل، من غير أي تعديل عليها.
async function processGuestOrder(method) {
    showToast("يجب تسجيل الدخول لإتمام الطلب", "warn");
    openLoginModal();
    return;

    document.getElementById("payment-modal").style.display = "none";
    const guestData = window.__voltGuestOrderData;
    if (!guestData) {
        // دفاع إضافي: لو حصل استدعاء للدالة دي من غير بيانات محفوظة
        // (مثلاً لو حد نادى عليها يدوي من الكونسول)، منكملش بأي بيانات فاضية.
        showToast("⚠️ حدث خطأ، يرجى إعادة إدخال بياناتك", "error");
        openPaymentModal();
        return;
    }

    let methodText = method === 'cash' ? "كاش عند الاستلام" : (method === 'pending-deposit' ? "كاش (بانتظار تحويل الديبوزت)" : "إنستاباي كامل");

    // ملحوظة: مفيش أي منطق كود خصم هنا خالص، ومتعمّد — الزائر مالوش كود
    // خصم أصلاً (مفيش حقل customerPromoInput في فورمه، شوف openPaymentModal).
    // مبنقراش window.getCurrentPromoCode() هنا حتى كدفاع إضافي، لأنها بترجع
    // متغير module-scoped في cart-promo.js ممكن يفضل عالق بقيمة من جلسة
    // تسجيل دخول سابقة في نفس الـ tab، ومفيش داعي نجازف بقراءتها هنا أصلاً.
    let originalTotal = cart.reduce((sum, item) => sum + item.price, 0);
    let total = originalTotal;

    const comment = document.getElementById("orderComment") ? document.getElementById("orderComment").value.trim() : "لا توجد ملاحظات";
    const finalComment = comment;

    const guestOrderId = "VOLT-GUEST-" + Math.floor(Math.random() * 900000 + 100000);
    let isPending = method === 'pending-deposit';
    let deposit = Math.ceil(total * 0.3);
    let successMessage = isPending
        ? `<div class="success-icon" style="color:var(--amber); font-size:60px; margin-bottom:15px;">⏳</div>
           <h3 style="font-family:'Rajdhani',sans-serif; color:var(--amber); font-size:24px; margin-bottom:10px;">طلبك قيد المراجعة!</h3>
           <p style="color:var(--muted); font-size:14px; margin-bottom:15px; line-height: 1.6;">
              يرجى تحويل مبلغ العربون (${deposit} ج.م) والتواصل معنا عبر الواتساب لتأكيد طلبك ومراجعته يدوياً.
           </p>`
        : `<div class="success-icon" style="color:var(--green); font-size:60px; margin-bottom:15px;">✅</div>
           <h3 style="font-family:'Rajdhani',sans-serif; color:var(--green); font-size:26px; margin-bottom:10px;">جاهز لإرسال طلبك!</h3>
           <p style="color:var(--muted); font-size:14px; margin-bottom:15px; line-height:1.6;">اضغط على زرار الواتساب تحت لإرسال تفاصيل طلبك وتأكيده مباشرة.</p>`;

    const itemsSummary = cart.map(i => `${i.name} (${i.price} ج.م)`).join("، ");
    const waMessage = `مرحباً فولت، أنا ${guestData.name} — رقم هاتفي ${guestData.phone}\nطلبي: ${itemsSummary}\nالإجمالي: ${total} ج.م\nطريقة الدفع: ${methodText}\nالعنوان: ${guestData.address}${comment && comment !== "لا توجد ملاحظات" ? "\nملاحظات: " + comment : ""}`;

    document.getElementById("successContent").innerHTML = `
        ${successMessage}
        <div style="background:#0e140e; border:1px solid var(--border); padding:10px; border-radius:8px; margin-bottom:15px; text-align:right;">
            <p style="color:var(--muted); margin-bottom:8px; font-size:13px;">ُEng:: <strong style="color:var(--green)">${escapeHtml(guestData.name)}</strong></p>
            <p style="color:var(--muted); margin-bottom:8px; font-size:13px;">رقم الهاتف: <strong style="color:#fff">${escapeHtml(guestData.phone)}</strong></p>
            <p style="color:var(--muted); margin-bottom:8px; font-size:13px;">طريقة الدفع: <strong style="color:#fff">${methodText}</strong></p>
            <p style="color:var(--muted); font-size:13px;">العنوان: ${escapeHtml(guestData.address)}</p>
        </div>
        <a class="wa-btn" href="https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(waMessage)}" target="_blank" style="display:flex; align-items:center; justify-content:center; gap:8px; background:#1db954; color:black; padding:12px; border-radius:8px; text-decoration:none; font-weight:bold; margin-bottom:10px;">💬 إرسال الطلب عبر الواتساب</a>
        <button class="btn-primary" style="width:100%;" onclick="closeSuccessAndClear()">العودة للمتجر</button>
    `;
    document.getElementById("success-modal").classList.add("open");

    // FIX: same gap as processFinalOrder() above — trackPurchase()/
    // trackMetaPurchase() were never called for guest orders either.
    // guestOrderId (generated above) was previously unused outside its own
    // display string; now also passed through here as the transaction id.
    trackPurchase(guestOrderId, cart, total);
    trackMetaPurchase(guestOrderId, cart, total);

    window.__voltGuestOrderData = null; // تنظيف بعد الاستخدام
}

// SECURITY (functions/index.js pairing): generates a client-side
// idempotency key so a duplicate/retried createSecureOrder call (double
// network retry, accidental resubmit, etc.) resolves to the SAME order
// server-side instead of creating two. This is the client half of a
// two-sided contract — functions/index.js's createSecureOrder is what
// actually enforces it (checks this key inside the same Firestore
// transaction that creates the order, using transaction.create() on an
// idempotencyKeys/{key} doc, which fails atomically if the key was
// already used — see that file for the enforcement side).
//
// Logic matches generateIdempotencyKey() in api-response.js (Api_response
// in the project) exactly, but is defined directly here rather than
// imported from that file: api-response.js uses `export function ...`
// (ES module syntax), while script.js is loaded as a plain classic
// script in index.html (`<script src="script.js" defer>`, no
// type="module") — an ES `import` statement there would throw a
// SyntaxError and break this entire file from loading at all. This
// function has zero Firebase/module dependency (just crypto/Date), so
// duplicating these three lines directly here avoids that hazard
// entirely rather than restructuring script.js's load type project-wide
// for one small helper.
function voltGenerateIdempotencyKey() {
    const rand = (typeof crypto !== "undefined" && crypto.getRandomValues)
        ? Array.from(crypto.getRandomValues(new Uint8Array(8))).map(b => b.toString(16).padStart(2, "0")).join("")
        : Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
    return `idem_${Date.now()}_${rand}`;
}

async function processFinalOrder(method) {
    if (!currentUser || !currentUser.uid) {
        showToast("يجب تسجيل الدخول لإتمام الشراء", "error");
        return;
    }
    if (!window.voltFirebase || typeof window.voltFirebase.createSecureOrder !== "function") {
        showToast("النظام غير جاهز لإتمام الطلب", "error");
        return;
    }
    if (window.__voltOrderLock) return;
    window.__voltOrderLock = true;
    _voltOrderLockTimeoutId = setTimeout(() => { window.__voltOrderLock = false; showToast("⚠️ استغرق الطلب وقتاً طويلاً — حاول مرة أخرى", "warn"); }, ORDER_LOCK_TIMEOUT_MS);

    document.getElementById("payment-modal").style.display = "none";
    const safeMethod = method === "cash" || method === "pending-deposit" || method === "instapay" ? method : "instapay";
    const methodText = safeMethod === "cash" ? "كاش عند الاستلام" : (safeMethod === "pending-deposit" ? "كاش (بانتظار تحويل الديبوزت)" : "إنستاباي كامل");
    const comment = document.getElementById("orderComment") ? document.getElementById("orderComment").value.trim().slice(0, 1000) : "";
       const appliedCode = typeof window.getCurrentPromoCode === "function" ? window.getCurrentPromoCode() : "";

    const qtyMap = new Map();
    for (const item of cart) {
        const pid = String(item.id || "");
        if (!pid) continue;
        qtyMap.set(pid, (qtyMap.get(pid) || 0) + 1);
    }
    const items = Array.from(qtyMap.entries()).map(([productId, quantity]) => ({ productId, quantity }));

    // SECURITY: reuse the SAME key if one is already pending from an
    // earlier failed/retried attempt in this checkout (see the variable's
    // own comment above) — only generate a new one if none exists yet.
    if (!_voltCurrentOrderIdempotencyKey) {
        _voltCurrentOrderIdempotencyKey = getOrderIdempotencyKey() || voltGenerateIdempotencyKey();
        setOrderIdempotencyKey(_voltCurrentOrderIdempotencyKey);
    }

    let result;
    try {
        result = await window.voltFirebase.createSecureOrder({
            items,
            promoCode: appliedCode || null,
            customer: {
                name: currentUser.name,
                phone: currentUser.phone,
                address: currentUser.address,
                code: currentUser.code
            },
            comment,
            method: safeMethod,
            idempotencyKey: _voltCurrentOrderIdempotencyKey
        });
    } catch (err) {
        window.__voltOrderLock = false;
        if (_voltOrderLockTimeoutId) { clearTimeout(_voltOrderLockTimeoutId); _voltOrderLockTimeoutId = null; }
        document.getElementById("payment-modal").style.display = "flex";
        const msg = (err && err.message) ? String(err.message) : "فشل إتمام الطلب";
        showToast(msg, "error");
        return;
    }

    if (!result || !result.orderId) {
        window.__voltOrderLock = false;
        if (_voltOrderLockTimeoutId) { clearTimeout(_voltOrderLockTimeoutId); _voltOrderLockTimeoutId = null; }
        document.getElementById("payment-modal").style.display = "flex";
        showToast("فشل إتمام الطلب", "error");
        return;
    }

    const total = Number(result.total) || 0;
    const newOrder = {
        orderId: result.orderId,
        id: result.firestoreId,
        total,
        method: methodText,
        status: safeMethod === "pending-deposit" ? "معلق بانتظار العربون" : "قيد المراجعة"
    };

    const orders = getOrders();
    orders.push(newOrder);
    saveOrders(orders);
    sessionStorage.removeItem("volt_logged_user");

    const isPending = safeMethod === "pending-deposit";
    const deposit = Math.ceil(total * 0.3);
    const successMessage = isPending
        ? `<div class="success-icon" style="color:var(--amber); font-size:60px; margin-bottom:15px;">⏳</div>
           <h3 style="font-family:'Rajdhani',sans-serif; color:var(--amber); font-size:24px; margin-bottom:10px;">طلبك قيد المراجعة!</h3>
           <p style="color:var(--muted); font-size:14px; margin-bottom:15px; line-height: 1.6;">
              تم تسجيل طلبك بنجاح وحفظه، ولكنه <b style="color:var(--amber)">لن يتم تأكيده وشحنه</b> حتى يتم تحويل مبلغ العربون (${deposit} ج.م) ومراجعته يدوياً من الأدمن.
           </p>`
        : `<div class="success-icon" style="color:var(--green); font-size:60px; margin-bottom:15px;">✅</div>
           <h3 style="font-family:'Rajdhani',sans-serif; color:var(--green); font-size:26px; margin-bottom:10px;">تم تأكيد طلبك بنجاح!</h3>`;

    document.getElementById("successContent").innerHTML = `
        ${successMessage}
        <div style="background:#0e140e; border:1px solid var(--border); padding:10px; border-radius:8px; margin-bottom:15px; text-align:right;">
            <p style="color:var(--muted); margin-bottom:8px; font-size:13px;">رقم الطلب: <strong style="color:var(--green)">${escapeHtml(result.orderId)}</strong></p>
            <p style="color:var(--muted); margin-bottom:8px; font-size:13px;">طريقة الدفع: <strong style="color:#fff">${methodText}</strong></p>
            <p style="color:var(--muted); font-size:13px;">سيتم التوصيل إلى العنوان المثبت للعميل يدوياً.</p>
        </div>
        <a class="wa-btn" href="https://wa.me/${WA_NUMBER}?text=${encodeURIComponent('مرحباً فولت، قمت بإرسال أوردر جديد رقم: ' + result.orderId + ' بمبلغ ' + total + ' ج.م للاستلام في: ' + (currentUser.address || ''))}" target="_blank" rel="noopener" style="display:flex; align-items:center; justify-content:center; gap:8px; background:#1db954; color:black; padding:12px; border-radius:8px; text-decoration:none; font-weight:bold; margin-bottom:10px;">💬 تواصل عبر الواتساب للمتابعة الفورية</a>
        <button class="btn-primary" style="width:100%;" onclick="closeSuccessAndClear()">العودة للمتجر</button>
    `;
    document.getElementById("success-modal").classList.add("open");
    window.__voltOrderLock = false;
    if (_voltOrderLockTimeoutId) { clearTimeout(_voltOrderLockTimeoutId); _voltOrderLockTimeoutId = null; }
    // SECURITY: order confirmed — clear the key so the NEXT checkout
    // (a genuinely separate order later) generates its own fresh key
    // rather than reusing this completed order's key.
    _voltCurrentOrderIdempotencyKey = null;
    clearOrderIdempotencyKey();
    trackPurchase(result.orderId, cart, total);
    trackMetaPurchase(result.orderId, cart, total);
}

function resetPaymentModal() { const payBox = document.querySelector(".payment-box"); if (payBox && payBox.dataset.originalHtml) payBox.innerHTML = payBox.dataset.originalHtml; }
function closePaymentModal() { document.getElementById("payment-modal").style.display = "none"; resetPaymentModal(); }
function closeSuccessAndClear() { document.getElementById("success-modal").classList.remove('open'); cart = []; saveCart(); updateCartBadge(); updateCartUI(); resetPaymentModal(); if (document.getElementById("orderComment")) document.getElementById("orderComment").value = ""; }

/* ==========================================================================
   🛡️ ADMIN DASHBOARD LOGIC (التحكم المطلق الكامل للموقع)
========================================================================== */

// سحب بيانات العملاء والأوردرات من Firestore للأدمن وتخزينها في localStorage كاش
async function loadAdminCache() {
    if (!currentUser || currentUser.role !== "admin" || !window.voltFirebase) return;
    try {
        const [users, orders] = await Promise.all([
            window.voltFirebase.getAllUsers(),
            window.voltFirebase.getAllOrders()
        ]);
        if (Array.isArray(users)) saveUsers(users);
        if (Array.isArray(orders)) saveOrders(orders);
    } catch (err) {
        console.warn("loadAdminCache: فشل تحديث الكاش الإداري", err);
    }
}

async function openAdminDashboard() {
    if (!currentUser || currentUser.role !== "admin") return;
    document.getElementById("admin-modal").classList.add("open");
    await renderAdminDashboardKPIs();
}

async function renderAdminDashboardKPIs() {
    await loadAdminCache();
    const content = document.getElementById("admin-content");
    const orders = getOrders() || [];
    const users = getUsers() || [];
    const products = await getProducts() || [];

    // ── حسابات ──
    const totalRevenue = orders.reduce((s, o) => s + (Number(o.total) || 0), 0);
    const totalOrders = orders.length;
    const totalCustomers = users.length;

    const today = new Date().toLocaleDateString("ar-EG");
    const todayOrders = orders.filter(o => o.date && o.date.includes(new Date().toLocaleDateString("ar-EG")));
    const todayRevenue = todayOrders.reduce((s, o) => s + (Number(o.total) || 0), 0);

    const thisMonth = new Date().getMonth();
    const thisYear = new Date().getFullYear();
    const monthOrders = orders.filter(o => {
        if (!o.date) return false;
        const d = new Date(o.date);
        return d.getMonth() === thisMonth && d.getFullYear() === thisYear;
    });
    const monthRevenue = monthOrders.reduce((s, o) => s + (Number(o.total) || 0), 0);

    // ── أكثر المنتجات مبيعاً ──
    const salesMap = {};
    orders.forEach(o => {
        (o.items || []).forEach(item => {
            salesMap[item.name] = (salesMap[item.name] || 0) + 1;
        });
    });
    const topProducts = Object.entries(salesMap)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);

    // ── المنتجات قليلة المخزون ──
    const lowStock = products.filter(p => (p.stock || 0) <= 3);

    // ── المنتجات المطلوبة (اللي بتتطلب من الأوردرات بس مش موجودة بكمية كافية) ──
    const neededMap = {};
    orders.filter(o => o.status !== "تم التسليم").forEach(o => {
        (o.items || []).forEach(item => {
            neededMap[item.name] = (neededMap[item.name] || 0) + 1;
        });
    });
    const neededProducts = Object.entries(neededMap)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);

    // ── الطلبات حسب الحالة ──
    const statusMap = {};
    orders.forEach(o => {
        const s = o.status || "غير محدد";
        statusMap[s] = (statusMap[s] || 0) + 1;
    });

    content.innerHTML = `
    <div style="direction:rtl;">
 
        <!-- KPIs -->
        <h4 style="color:var(--amber); margin-bottom:16px; font-family:'Rajdhani',sans-serif; font-size:18px; letter-spacing:0.5px;">⚡ المؤشرات السريعة</h4>
        <div style="display:grid; grid-template-columns:repeat(auto-fill,minmax(150px,1fr)); gap:12px; margin-bottom:28px;">
            <div style="background:var(--card-bg); border:1px solid var(--green); border-radius:10px; padding:16px 14px; text-align:center;">
                <div id="volt-kpi-revenue" style="font-size:24px; font-weight:700; color:var(--green); font-family:'Rajdhani',sans-serif; line-height:1.1;">0</div>
                <div style="font-size:11px; color:var(--muted); margin-top:6px; letter-spacing:0.3px;">💰 إجمالي المبيعات (EGP)</div>
            </div>
            <div style="background:var(--card-bg); border:1px solid var(--amber); border-radius:10px; padding:16px 14px; text-align:center;">
                <div id="volt-kpi-orders" style="font-size:24px; font-weight:700; color:var(--amber); font-family:'Rajdhani',sans-serif; line-height:1.1;">0</div>
                <div style="font-size:11px; color:var(--muted); margin-top:6px; letter-spacing:0.3px;">📦 عدد الطلبات</div>
            </div>
            <div style="background:var(--card-bg); border:1px solid #4a90e2; border-radius:10px; padding:16px 14px; text-align:center;">
                <div id="volt-kpi-customers" style="font-size:24px; font-weight:700; color:#4a90e2; font-family:'Rajdhani',sans-serif; line-height:1.1;">0</div>
                <div style="font-size:11px; color:var(--muted); margin-top:6px; letter-spacing:0.3px;">👥 عدد العملاء</div>
            </div>
            <div style="background:var(--card-bg); border:1px solid var(--green); border-radius:10px; padding:16px 14px; text-align:center;">
                <div id="volt-kpi-today" style="font-size:24px; font-weight:700; color:var(--green); font-family:'Rajdhani',sans-serif; line-height:1.1;">0</div>
                <div style="font-size:11px; color:var(--muted); margin-top:6px; letter-spacing:0.3px;">☀️ أرباح اليوم (EGP)</div>
            </div>
            <div style="background:var(--card-bg); border:1px solid var(--amber); border-radius:10px; padding:16px 14px; text-align:center;">
                <div id="volt-kpi-month" style="font-size:24px; font-weight:700; color:var(--amber); font-family:'Rajdhani',sans-serif; line-height:1.1;">0</div>
                <div style="font-size:11px; color:var(--muted); margin-top:6px; letter-spacing:0.3px;">📅 أرباح الشهر (EGP)</div>
            </div>
            <div style="background:var(--card-bg); border:1px solid var(--red); border-radius:10px; padding:16px 14px; text-align:center;">
                <div id="volt-kpi-lowstock" style="font-size:24px; font-weight:700; color:var(--red); font-family:'Rajdhani',sans-serif; line-height:1.1;">0</div>
                <div style="font-size:11px; color:var(--muted); margin-top:6px; letter-spacing:0.3px;">⚠️ منتجات قليلة المخزون</div>
            </div>
        </div>

        <div style="border-top:1px solid var(--border); padding-top:22px; margin-bottom:22px;">
        <h4 style="color:var(--green); margin-bottom:12px; font-family:'Rajdhani',sans-serif; font-size:15px; letter-spacing:0.3px;">⭐ أكثر المنتجات مبيعاً</h4>
        <div style="background:var(--card-bg); border:1px solid var(--border); border-radius:8px; padding:6px 14px;">
            ${topProducts.length ? topProducts.map((p, i) => `
                <div style="display:flex; justify-content:space-between; align-items:center; padding:10px 0; ${i < topProducts.length - 1 ? 'border-bottom:1px solid var(--border);' : ''}">
                    <span style="color:var(--text); font-size:13px;"><span style="color:var(--muted);">${i + 1}.</span> ${escapeHtml(p[0])}</span>
                    <span style="color:var(--green); font-weight:700; font-size:13px;">${p[1]} طلب</span>
                </div>`).join("")
            : `<p style="color:var(--muted); text-align:center; padding:14px;">لا توجد مبيعات بعد</p>`}
        </div>
        </div>

        <div style="border-top:1px solid var(--border); padding-top:22px; margin-bottom:22px;">
        <h4 style="color:var(--amber); margin-bottom:12px; font-family:'Rajdhani',sans-serif; font-size:15px; letter-spacing:0.3px;">🛒 منتجات محتاج تشتريها (من الطلبات المعلقة)</h4>
        <div style="background:var(--card-bg); border:1px solid var(--border); border-radius:8px; padding:6px 14px;">
            ${neededProducts.length ? neededProducts.map((p, i) => `
                <div style="display:flex; justify-content:space-between; align-items:center; padding:10px 0; ${i < neededProducts.length - 1 ? 'border-bottom:1px solid var(--border);' : ''}">
                    <span style="color:var(--text); font-size:13px;"><span style="color:var(--muted);">${i + 1}.</span> ${escapeHtml(p[0])}</span>
                    <span style="color:var(--amber); font-weight:700; font-size:13px;">${p[1]} قطعة مطلوبة</span>
                </div>`).join("")
            : `<p style="color:var(--muted); text-align:center; padding:14px;">لا توجد طلبات معلقة</p>`}
        </div>
        </div>

        <div style="border-top:1px solid var(--border); padding-top:22px; margin-bottom:22px;">
        <h4 style="color:var(--red); margin-bottom:12px; font-family:'Rajdhani',sans-serif; font-size:15px; letter-spacing:0.3px;">⚠️ تنبيهات المخزون</h4>
        <div style="background:var(--card-bg); border:1px solid var(--border); border-radius:8px; padding:6px 14px;">
            ${lowStock.length ? lowStock.map((p, i) => `
                <div style="display:flex; justify-content:space-between; align-items:center; padding:10px 0; ${i < lowStock.length - 1 ? 'border-bottom:1px solid var(--border);' : ''}">
                    <span style="color:var(--text); font-size:13px;">${escapeHtml(p.emoji || "📦")} ${escapeHtml(p.name)}</span>
                    <span style="color:var(--red); font-weight:700; font-size:13px;">${p.stock} قطعة متبقية</span>
                </div>`).join("")
            : `<p style="color:var(--green); text-align:center; padding:14px;">✅ كل المنتجات مخزونها كافي</p>`}
        </div>
        </div>

        <div style="border-top:1px solid var(--border); padding-top:22px; margin-bottom:22px;">
        <h4 style="color:var(--green); margin-bottom:12px; font-family:'Rajdhani',sans-serif; font-size:15px; letter-spacing:0.3px;">📊 الطلبات حسب الحالة</h4>
        <div style="background:var(--card-bg); border:1px solid var(--border); border-radius:8px; padding:6px 14px;">
            ${Object.keys(statusMap).length ? Object.entries(statusMap).map(([status, count], i, arr) => `
                <div style="display:flex; justify-content:space-between; align-items:center; padding:10px 0; ${i < arr.length - 1 ? 'border-bottom:1px solid var(--border);' : ''}">
                    <span style="color:var(--text); font-size:13px;">${escapeHtml(status)}</span>
                    <span style="color:var(--amber); font-weight:700; font-size:13px;">${count} طلب</span>
                </div>`).join("")
            : `<p style="color:var(--muted); text-align:center; padding:14px;">لا توجد طلبات</p>`}
        </div>
        </div>

        <div style="border-top:1px solid var(--border); padding-top:22px;">
        <h4 style="color:var(--green); margin-bottom:12px; font-family:'Rajdhani',sans-serif; font-size:15px; letter-spacing:0.3px;">💵 الإيرادات التفصيلية</h4>
        <div style="background:var(--card-bg); border:1px solid var(--border); border-radius:8px; padding:6px 14px;">
            <div style="display:flex; justify-content:space-between; align-items:center; padding:10px 0; border-bottom:1px solid var(--border);">
                <span style="color:var(--muted); font-size:13px;">إجمالي الإيرادات</span>
                <span style="color:var(--green); font-weight:700; font-size:13px;">${totalRevenue.toLocaleString()} EGP</span>
            </div>
            <div style="display:flex; justify-content:space-between; align-items:center; padding:10px 0; border-bottom:1px solid var(--border);">
                <span style="color:var(--muted); font-size:13px;">إيرادات اليوم</span>
                <span style="color:var(--green); font-weight:700; font-size:13px;">${todayRevenue.toLocaleString()} EGP</span>
            </div>
            <div style="display:flex; justify-content:space-between; align-items:center; padding:10px 0; border-bottom:1px solid var(--border);">
                <span style="color:var(--muted); font-size:13px;">إيرادات الشهر</span>
                <span style="color:var(--green); font-weight:700; font-size:13px;">${monthRevenue.toLocaleString()} EGP</span>
            </div>
            <div style="display:flex; justify-content:space-between; align-items:center; padding:10px 0;">
                <span style="color:var(--muted); font-size:13px;">متوسط قيمة الطلب</span>
                <span style="color:var(--green); font-weight:700; font-size:13px;">${totalOrders ? Math.round(totalRevenue / totalOrders).toLocaleString() : 0} EGP</span>
            </div>
        </div>
        </div>
 
    </div>`;

    // === #37: count-up animation for the six KPI numbers above. Every
    // target value here (totalRevenue, totalOrders, totalCustomers,
    // todayRevenue, monthRevenue, lowStock.length) is the exact SAME
    // already-computed variable used in the innerHTML above — this only
    // animates how each number arrives, never changes what the final
    // displayed number is.
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        const voltKpiTargets = [
            ["volt-kpi-revenue", totalRevenue, true],
            ["volt-kpi-orders", totalOrders, false],
            ["volt-kpi-customers", totalCustomers, false],
            ["volt-kpi-today", todayRevenue, true],
            ["volt-kpi-month", monthRevenue, true],
            ["volt-kpi-lowstock", lowStock.length, false]
        ];
        voltKpiTargets.forEach(([elId, target, useLocale]) => {
            const el = document.getElementById(elId);
            if (!el) return;
            const duration = 500;
            const startTime = performance.now();
            function step(now) {
                const progress = Math.min(1, (now - startTime) / duration);
                const current = Math.floor(target * progress);
                el.textContent = useLocale ? current.toLocaleString() : String(current);
                if (progress < 1) {
                    requestAnimationFrame(step);
                } else {
                    el.textContent = useLocale ? target.toLocaleString() : String(target);
                }
            }
            requestAnimationFrame(step);
        });
    } else {
        // Reduced-motion: write final values directly, no animation frame loop.
        const voltKpiFinal = [
            ["volt-kpi-revenue", totalRevenue.toLocaleString()],
            ["volt-kpi-orders", String(totalOrders)],
            ["volt-kpi-customers", String(totalCustomers)],
            ["volt-kpi-today", todayRevenue.toLocaleString()],
            ["volt-kpi-month", monthRevenue.toLocaleString()],
            ["volt-kpi-lowstock", String(lowStock.length)]
        ];
        voltKpiFinal.forEach(([elId, text]) => {
            const el = document.getElementById(elId);
            if (el) el.textContent = text;
        });
    }
}
// 1. عرض وإدارة كافة الأوردرات في الموقع للأدمن
async function renderAdminOrders() {
    await loadAdminCache();
    const content = document.getElementById("admin-content");
    const orders = getOrders() || [];

    if (!orders.length) {
        content.innerHTML = `<p style="text-align:center; color:var(--muted); padding:30px;">📦 لا توجد أي أوردرات مشتراة في الموقع حالياً.</p>`;
        return;
    }

    content.innerHTML = `
        <h4 style="color:var(--green); margin-bottom:16px; font-family:'Rajdhani',sans-serif; font-size:18px; letter-spacing:0.5px;">📦 كشف الأوردرات المشتراة عبر الموقع (${orders.length})</h4>
        ${orders.map((o, idx) => `
            <div style="background:var(--card-bg); border:1px solid var(--border); padding:16px; border-radius:10px; margin-bottom:14px; direction:rtl;">
                <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--border); padding-bottom:10px; margin-bottom:12px; flex-wrap:wrap; gap:10px;">
                    <span style="color:var(--amber); font-weight:700; font-family:'Rajdhani',sans-serif; font-size:16px; letter-spacing:0.5px;">🆔 ${o.orderId}</span>
                    <span style="background:var(--dark); color:var(--green); border:1px solid var(--green); padding:4px 10px; border-radius:99px; font-size:11px; font-weight:700;">${o.status}</span>
                </div>
                <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:10px 20px; margin-bottom:12px;">
                    <div>
                        <span style="display:block; font-size:10px; color:var(--muted); letter-spacing:1px; text-transform:uppercase; margin-bottom:2px;">👤 العميل</span>
                        <span style="font-size:14px; font-weight:600; color:var(--text);">${escapeHtml(o.customer.name)} <span style="color:var(--muted); font-weight:400;">(${escapeHtml(o.customer.code)})</span></span>
                    </div>
                    <div>
                        <span style="display:block; font-size:10px; color:var(--muted); letter-spacing:1px; text-transform:uppercase; margin-bottom:2px;">📞 الهاتف</span>
                        <span style="font-size:14px; color:var(--text); direction:ltr; display:inline-block;">${escapeHtml(o.customer.phone)}</span>
                    </div>
                    <div>
                        <span style="display:block; font-size:10px; color:var(--muted); letter-spacing:1px; text-transform:uppercase; margin-bottom:2px;">📅 التاريخ</span>
                        <span style="font-size:13px; color:var(--muted);">${escapeHtml(o.date)}</span>
                    </div>
                    <div style="grid-column:1/-1;">
                        <span style="display:block; font-size:10px; color:var(--muted); letter-spacing:1px; text-transform:uppercase; margin-bottom:2px;">📍 العنوان</span>
                        <span style="font-size:13px; color:var(--text); line-height:1.5;">${escapeHtml(o.customer.address)}</span>
                    </div>
                    <div style="grid-column:1/-1;">
                        <span style="display:block; font-size:10px; color:var(--amber); letter-spacing:1px; text-transform:uppercase; margin-bottom:2px;">📝 ملاحظة العميل</span>
                        <span style="font-size:13px; color:var(--amber); line-height:1.5;">${escapeHtml(o.comment)}</span>
                    </div>
                </div>

                <div style="background:var(--dark); padding:10px 12px; border-radius:8px; margin-bottom:14px;">
                    <span style="font-size:11px; color:var(--muted); letter-spacing:1px; text-transform:uppercase; display:block; margin-bottom:8px;">🛒 المشتريات</span>
                    <div style="display:flex; flex-wrap:wrap; gap:6px;">
                        ${o.items.map(i => `<span style="display:inline-block; font-size:12px; background:var(--card-bg); border:1px solid var(--border); padding:5px 10px; border-radius:6px;">${escapeHtml(i.emoji)} ${escapeHtml(i.name)} <span style="color:var(--green); font-weight:600;">(${i.price} ج.م)</span></span>`).join('')}
                    </div>
                </div>

                <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; padding-top:4px; border-top:1px solid var(--border);">
                    <span style="font-size:17px; font-weight:700; color:var(--green); font-family:'Rajdhani',sans-serif; padding-top:10px;">💰 ${o.total} ج.م</span>
                    <div style="display:flex; gap:8px; padding-top:10px;">
                        <button data-testid="order-accept-btn-${idx}" onclick="changeOrderStatus(${idx}, 'تم قبول الطلب وجاري الشحن')" style="background:var(--green); color:#000; border:none; padding:6px 12px; border-radius:6px; cursor:pointer; font-size:12px; font-weight:700;">✅ قبول</button>
                        <button data-testid="order-reject-btn-${idx}" onclick="changeOrderStatus(${idx}, 'تم رفض الطلب من الإدارة')" style="background:transparent; color:var(--red); border:1px solid var(--red); padding:6px 12px; border-radius:6px; cursor:pointer; font-size:12px; font-weight:700;">❌ رفض</button>
                        <button data-testid="order-deliver-btn-${idx}" onclick="deliverAndRemoveOrder(${idx})" style="background:var(--amber); color:#000; border:none; padding:6px 12px; border-radius:6px; cursor:pointer; font-size:12px; font-weight:700;">📦 تم التسليم (Manual)</button>
                    </div>
                </div>
            </div>
        `).join('')}
    `;
}

async function changeOrderStatus(idx, newStatus) {
    const orders = getOrders() || [];
    const orderId = orders[idx] && orders[idx].id;
    if (!orderId || !window.voltFirebase || typeof window.voltFirebase.updateOrder !== "function") {
        showToast("تعذر تحديد الطلب", "error");
        return;
    }
    try {
        const ok = await window.voltFirebase.updateOrder(orderId, { status: newStatus });
        if (!ok) throw new Error("Order update failed");
    } catch (err) {
        console.warn("changeOrderStatus: failed to update order", err);
        showToast("فشل تحديث حالة الطلب", "error");
        return;
    }

    const currentOrders = getOrders() || [];
    const order = currentOrders.find(item => item.id === orderId);
    if (!order) return;
    order.status = newStatus;

    saveOrders(currentOrders);
    await renderAdminOrders();
    showToast("تم تحديث حالة الطلب بنجاح", "green");
}

// حذف الأوردر عند التوصيل والاستلام يدوياً مع إظهار الرسالة المطلوبة
async function deliverAndRemoveOrder(idx) {
    await changeOrderStatus(idx, "تم التسليم");
}
// 2. عرض كشوفات حسابات وبيانات العملاء بالكامل (بما فيها الباسوردات والعناوين والكل)
async function renderAdminUsers() {
    await loadAdminCache();
    const content = document.getElementById("admin-content");
    const users = (getUsers() || []).filter(u => u.role !== "admin");

    if (!users.length) {
        content.innerHTML = `<p style="text-align:center; color:var(--muted); padding:30px;">👥 لا يوجد أي عملاء مسجلين في الموقع حتى الآن.</p>`;
        return;
    }

    content.innerHTML = `
        <h4 style="color:var(--amber); margin-bottom:16px; font-family:'Rajdhani',sans-serif; font-size:18px; letter-spacing:0.5px;">👥 كشوفات حسابات العملاء (${users.length})</h4>
        <div style="overflow-x:auto; border:1px solid var(--border); border-radius:10px;">
            <table style="width:100%; border-collapse:collapse; font-size:13px; text-align:right; color:var(--text);">
                <thead>
                    <tr style="background:var(--card-bg); color:var(--green); border-bottom:2px solid var(--green);">
                        <th style="padding:12px 14px; font-size:11px; letter-spacing:1px; text-transform:uppercase; font-weight:700;">كود العميل</th>
                        <th style="padding:12px 14px; font-size:11px; letter-spacing:1px; text-transform:uppercase; font-weight:700;">الاسم الكامل</th>
                        <th style="padding:12px 14px; font-size:11px; letter-spacing:1px; text-transform:uppercase; font-weight:700;">رقم الهاتف</th>
                        <th style="padding:12px 14px; font-size:11px; letter-spacing:1px; text-transform:uppercase; font-weight:700;">📍 العنوان</th>
                        <th style="padding:12px 14px; font-size:11px; letter-spacing:1px; text-transform:uppercase; font-weight:700; text-align:center;">إجراءات</th>
                    </tr>
                </thead>
                <tbody>
                    ${users.map((u, i) => `
                        <tr style="border-bottom:1px solid var(--border); background:${i % 2 === 0 ? 'transparent' : 'rgba(29,185,84,0.03)'};">
                            <td style="padding:13px 14px; color:var(--amber); font-weight:700; font-family:'Rajdhani',sans-serif; font-size:14px;">${escapeHtml(u.code || '—')}</td>
                            <td style="padding:13px 14px; font-weight:600;">${escapeHtml(u.name || '—')}</td>
                            <td style="padding:13px 14px; font-family:sans-serif; color:var(--muted); direction:ltr; text-align:right;">${escapeHtml(u.idNum || '—')}</td>
                            <td style="padding:13px 14px; color:var(--muted); max-width:200px; white-space:normal; word-wrap:break-word; line-height:1.5;">${escapeHtml(u.address || '—')}</td>
                            <td style="padding:13px 14px; text-align:center;">
                                <button data-testid="delete-user-${escapeHtml(u.uid || u.id || '')}" data-uid="${escapeHtml(u.uid || u.id || '')}" data-name="${escapeHtml(u.name || 'العميل')}" onmousedown="this.classList.add('volt-confirm-armed')" onmouseup="this.classList.remove('volt-confirm-armed')" onmouseleave="this.classList.remove('volt-confirm-armed')" onclick="deleteUserAccount(this.dataset.uid, this.dataset.name)"
                                    style="background:#441111; color:var(--red); border:1px solid var(--red); padding:5px 10px; border-radius:4px; cursor:pointer; font-size:12px;">🗑️ حذف الحساب</button>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;
}

async function deleteUserAccount(uid, userName) {
    if (!currentUser || currentUser.role !== "admin") return;
    if (!uid) { showToast("تعذر تحديد حساب العميل", "error"); return; }
    if (!confirm(`هل أنت متأكد من حذف حساب "${userName}" نهائياً؟\n\nسيتم حذف بيانات العميل من قاعدة البيانات.`)) return;

    if (!window.voltFirebase || typeof window.voltFirebase.deleteUser !== "function") {
        showToast("النظام غير جاهز لحذف الحساب", "error");
        return;
    }
    try {
        const ok = await window.voltFirebase.deleteUser(uid);
        if (!ok) { showToast("فشل حذف الحساب", "error"); return; }
    } catch (err) {
        console.warn("deleteUserAccount: secure deletion failed", err);
        showToast("فشل حذف الحساب — تحقق من الاتصال", "error");
        return;
    }

    const users = (getUsers() || []).filter(u => (u.uid || u.id) !== uid);
    saveUsers(users);
    await renderAdminUsers();
    showToast("تم حذف حساب العميل بنجاح", "green");
}

/* ==========================================================================
   PERFORMANCE & AUXILIARY EFFECTS
========================================================================== */
function typeWriter() {
    const el = document.getElementById("typewriter"); if (!el) return;
    const txts = ["VOLT FUTURE", "Smart spare parts", "Professional sensors", "Arduino and microcontrollers "];
    let i = 0, textIdx = 0, isDeleting = false;
    const run = () => {
        const current = txts[textIdx];
        el.textContent = isDeleting ? current.substring(0, i--) : current.substring(0, i++);
        let speed = isDeleting ? 40 : 90;
        if (!isDeleting && i === current.length + 1) { speed = 1500; isDeleting = true; }
        else if (isDeleting && i < 0) { isDeleting = false; textIdx = (textIdx + 1) % txts.length; speed = 400; i = 0; }
        setTimeout(run, speed);
    }; run();
}

function initLightning() {
    const canvas = document.getElementById("hero-lightning"); if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const resize = () => { canvas.width = canvas.parentElement.offsetWidth; canvas.height = canvas.parentElement.offsetHeight; };
    resize();
    window.addEventListener('resize', resize);
    let timer = 0;
    let rafId = 0;
    let active = true;
    const loop = () => {
        rafId = 0;
        if (!active) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        if (Math.random() < 0.02 && timer <= 0) timer = 8;
        if (timer > 0) {
            ctx.strokeStyle = "rgba(29,185,84," + (timer / 8) + ")"; ctx.lineWidth = Math.random() * 2 + 1; ctx.beginPath();
            let x = Math.random() * canvas.width, y = 0; ctx.moveTo(x, y);
            while (y < canvas.height) { x += Math.random() * 40 - 20; y += Math.random() * 30; ctx.lineTo(x, y); }
            ctx.stroke(); timer--;
        }
        rafId = requestAnimationFrame(loop);
    };
    const start = () => {
        active = true;
        if (!rafId) rafId = requestAnimationFrame(loop);
    };
    const stop = () => {
        active = false;
        if (rafId) {
            cancelAnimationFrame(rafId);
            rafId = 0;
        }
    };
    start();
    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden") stop();
        else start();
    });
}
// PERF: كانت querySelectorAll(".glow-card") بتتنفذ جوه mousemove handler
// نفسه — mousemove بيطلق عشرات المرات في الثانية، وكل مرة كانت بتعمل full
// DOM query (traversal) من غير أي داعي، لأن قائمة الكروت نفسها بتتغيّر بس
// وقت الرندر (renderProducts/appendProductCards)، مش مع كل حركة ماوس.
// الحل: كاش للـ NodeList بيتحدّث بس وقت الرندر الفعلي (عن طريق
// __voltRefreshGlowCards المُصدّرة تحت — بتتنادى من renderProducts() و
// appendProductCards() إضافياً)، وrequestAnimationFrame بيمنع تنفيذ الكتابة
// على DOM (getBoundingClientRect + setProperty، اللي بيسببوا layout
// thrashing لو اتنفذوا مرات كتير في نفس الفريم) أكتر من مرة لكل فريم رسم.
// الـ custom properties (--mx/--my) والقيم اللي بتتحسب زي ما هي بالظبط —
// بس وقت وتكرار التنفيذ هما اللي اتغيّروا.
// PERF FIX (load-test audit): the previous version called
// card.getBoundingClientRect() for every visible card on every animation
// frame while the mouse moved anywhere on the page. getBoundingClientRect()
// forces a synchronous layout read — correctly batched to once per rAF
// frame rather than once per mousemove event, but still N layout reads per
// frame (N = number of visible glow-cards), for the entire duration of any
// mouse movement. This version adds a second cache layer (cachedRects) on
// top of the existing cachedCards NodeList cache: rects are computed once
// and reused across frames, and only recomputed when something that could
// actually change a card's position happens — a scroll, a resize, or a
// fresh render (refreshGlowCardsCache(), already called by renderProducts()/
// appendProductCards() elsewhere in this file). The custom properties
// (--mx/--my) and the values written to them are computed exactly as
// before — only when getBoundingClientRect() itself is called has changed.
function initGlowCardPerformance() {
    let cachedCards = null;
    let cachedRects = null;
    let rafPending = false;
    let lastEvent = null;

    function refreshGlowCardsCache() {
        cachedCards = document.querySelectorAll(".glow-card");
        cachedRects = null;
    }
    refreshGlowCardsCache();

    function ensureRects() {
        if (cachedRects) return;
        cachedRects = Array.from(cachedCards).map(card => ({ card, rect: card.getBoundingClientRect() }));
    }

    window.__voltRefreshGlowCards = refreshGlowCardsCache;
    window.addEventListener("scroll", () => { cachedRects = null; }, { passive: true });
    window.addEventListener("resize", () => { cachedRects = null; }, { passive: true });

    document.addEventListener("mousemove", e => {
        lastEvent = e;
        if (rafPending) return;
        rafPending = true;
        requestAnimationFrame(() => {
            rafPending = false;
            if (!cachedCards || !lastEvent) return;
            ensureRects();
            cachedRects.forEach(({ card, rect }) => {
                const x = lastEvent.clientX - rect.left, y = lastEvent.clientY - rect.top;
                card.style.setProperty("--mx", `${x}px`);
                card.style.setProperty("--my", `${y}px`);
            });
        });
    });
} function showToast(msg, type = "info") {
    const t = document.getElementById("toast"); if (!t) return;

    // كتير من نداءات showToast() الموجودة فعلياً بتحط إيموجي في أول الرسالة
    // نفسها (زي "✅ تم..." أو "🗑️ تم حذف..."). لو ضفنا أيقونة تلقائية فوق
    // ده هيبان إيموجي مكرر. الحل: نتحقق هل الرسالة بادئة بإيموجي بالفعل،
    // ولو كده منعرضش الأيقونة التلقائية خالص — نعرض بس رسالة الكولر زي
    // ما هي، بالظبط زي دلوقتي. الأيقونة التلقائية بتظهر فقط لما الرسالة
    // نص عادي من غير إيموجي في البداية.
    const EMOJI_LEADING = /^\s*\p{Extended_Pictographic}/u;
    const hasOwnIcon = EMOJI_LEADING.test(msg);

    // نفس منطق الألوان الموجود بالظبط — الأيقونة بتتبع نفس التصنيف اللي
    // بيحدد لون الحد الجانبي، مفيش تصنيف رابع مستحدث هنا.
    const color = type === "green" ? "var(--green)" : (type === "error" ? "var(--red)" : "var(--amber)");
    const icon  = type === "green" ? "✅" : (type === "error" ? "❌" : "⚠️");
    t.style.borderRight = `4px solid ${color}`;

    // بناء العناصر الداخلية مرة واحدة بس (lazy) — أول نداء لـ showToast()
    // بيجهزهم، أي نداء بعد كده بيعيد استخدامهم بدل إعادة بناء الـ DOM.
    // textContent على العنصر كله اتشالت عشان كانت بتمسح أي عنصر ابن كل مرة.
    let iconEl = t.querySelector(".toast-icon");
    let msgEl  = t.querySelector(".toast-msg");
    let barEl  = t.querySelector(".toast-progress");
    if (!iconEl || !msgEl || !barEl) {
        t.textContent = ""; // تنضيف احتياطي لو العنصر كان فيه نص قديم من قبل الترقية
        iconEl = document.createElement("span");
        iconEl.className = "toast-icon";
        msgEl = document.createElement("span");
        msgEl.className = "toast-msg";
        const barWrap = document.createElement("div");
        barWrap.className = "toast-progress-track";
        barEl = document.createElement("div");
        barEl.className = "toast-progress";
        barWrap.appendChild(barEl);
        t.appendChild(iconEl);
        t.appendChild(msgEl);
        t.appendChild(barWrap);
    }

    iconEl.textContent = icon;
    iconEl.style.display = hasOwnIcon ? "none" : "";
    msgEl.textContent = msg; // نفس الحماية اللي كانت موجودة — textContent مش innerHTML
    barEl.style.background = color;

    // إلغاء أي مؤقّت سابق لسه شغال — لو showToast() اتنادت مرة تانية قبل
    // ما التوست القديم يختفي، مفيش داعي مؤقّتين يتصارعوا على .show، ونفس
    // الفكرة بتتطبق على البروجرس بار عشان ميفضلش عالق في منتصف أنيميشن قديمة.
    if (t.__voltToastTimeout) clearTimeout(t.__voltToastTimeout);

    // إعادة تشغيل أنيميشن البروجرس بار من الصفر: نلغي الترانزيشن مؤقتاً،
    // نرجّع العرض 100%، نجبر reflow، وبعدين نفعّل الترانزيشن ونخلي العرض 0%
    // — الطريقة القياسية لإعادة تشغيل CSS transition بدل ما الأنيميشن
    // القديمة تكمل من نفس المكان.
    barEl.style.transition = "none";
    barEl.style.width = "100%";
    void barEl.offsetWidth; // فرض reflow
    barEl.style.transition = "width 3000ms linear";
    barEl.style.width = "0%";

    t.classList.add("show");
    t.__voltToastTimeout = setTimeout(() => {
        t.classList.remove("show");
        t.__voltToastTimeout = null;
    }, 3000);
}
// دالة حذف منتج بالكامل (بالانديكس) — لوحة تزويد الكميات في renderAdminProducts
// ملحوظة: كانت هذه الدالة معرّفة سابقاً باسم deleteProduct(index)، وهو نفس اسم
// الدالة الأصلية deleteProduct(event, id) بالأعلى التي تتحقق من صلاحية الأدمن.
// إعادة التعريف بنفس الاسم كانت تُسقط الدالة الأولى بالكامل (يفوز آخر تعريف في
// JS)، فتُفقد أي رقابة على الحذف عبر هذا المسار. تم تغيير الاسم هنا لمنع
// التصادم، وإضافة نفس فحص الصلاحية.
// NOTE: as of this pass, deleteProductByIndex() is not called from
// anywhere in this file — no onclick, no addEventListener, nothing
// references its name except this definition. It is currently dead code.
// Fixed it below anyway since it will crash the moment something IS wired
// to it (renderAdminProducts() also isn't defined anywhere in this file —
// confirm that exists in script2.js or another loaded file before wiring
// this up, or that call will throw too).
async function deleteProductByIndex(index) {
    if (!currentUser || currentUser.role !== "admin") return;
    if (confirm("هل أنت متأكد من حذف هذا المنتج نهائياً من المتجر؟")) {
        let currentProducts = window.products || await getProducts() || [];
        currentProducts.splice(index, 1);

        // FIX: was writing straight to localStorage instead of going
        // through the file's own saveProducts() helper (line 26).
        saveProducts(currentProducts);
        if (window.products) window.products = currentProducts;

        renderAdminProducts();
        // FIX: was calling renderProducts() with zero arguments.
        // renderProducts(products) has no default parameter, so
        // products.length at line 84 throws when products is undefined.
        // Pass getProducts() explicitly, matching every other call site
        // in this file (e.g. lines 52, 126, 202, 253).
        renderProducts(await getProducts());

        showToast("تم حذف المنتج بنجاح", "green");
    }
}

/* ==========================================================================
   🎫 PROMO CODES ADMIN TABLE
========================================================================== */
function togglePromoStatus(codeName) {
    if (!currentUser || currentUser.role !== "admin") return;
    if (!window.PromoEngine || !window.PromoEngine.PROMO_CODES) return;
    const code = window.PromoEngine.PROMO_CODES.find(c => c.code === codeName);
    if (code) {
        code.status = code.status === "active" ? "inactive" : "active";
        renderPromoTable();
    }
}

/* ==========================================================================
   ⚡ TASK MANAGEMENT SYSTEM (إدارة المهام) — fully standalone.
 
   Deliberately independent from currentUser / admin auth: it has its own
   password check and its own localStorage key ("volt_tasks"), so it does
   not touch, read, or depend on any of the admin/customer logic above.
   Wrapped in an IIFE (same pattern as the folders system already in
   index.html) so nothing here can collide with existing global names.
 
   ⚠️ SECURITY NOTE FOR WHOEVER EDITS THIS:
   TASK_PASSWORD lives in this file, which any visitor can view via
   "View Source" or browser DevTools. This is a UI gate, not real
   security — identical in strength to the existing admin login check.
   Do not store anything genuinely sensitive behind it.
========================================================================== */
(function () {
    const TASKS_STORAGE_KEY = "volt_tasks";

    async function getTasks() {
        if (window.voltFirebase && typeof window.voltFirebase.getTasks === "function") {
            try {
                const tasks = await window.voltFirebase.getTasks();
                if (Array.isArray(tasks)) {
                    localStorage.setItem(TASKS_STORAGE_KEY, JSON.stringify(tasks));
                    return tasks;
                }
            } catch (err) {
                console.warn("getTasks: فشل Firestore — بنستخدم الكاش المحلي", err);
            }
        }
        try { return JSON.parse(localStorage.getItem(TASKS_STORAGE_KEY)) || []; }
        catch (e) { return []; }
    }

    async function saveTasksLocal(tasks) {
        localStorage.setItem(TASKS_STORAGE_KEY, JSON.stringify(tasks));
    }

    function escapeHtml(str) {
        const div = document.createElement("div");
        div.textContent = str == null ? "" : String(str);
        return div.innerHTML;
    }

    window.openTaskPasswordGate = function () {
        if (currentUser && currentUser.role === "admin") {
            openTaskInterface();
        } else {
            if (typeof showToast === "function") showToast("⚠️ لوحة المهام متاحة للإدارة فقط", "warn");
        }
    };

    function closeTaskPasswordGate() {
        document.getElementById("task-password-modal")?.classList.remove("open");
    }

    function checkTaskPassword() {
        closeTaskPasswordGate();
        window.openTaskPasswordGate();
    }

    function openTaskInterface() {
        document.getElementById("task-mgmt-modal")?.classList.add("open");
        renderTaskList();
    }

    function closeTaskInterface() {
        document.getElementById("task-mgmt-modal")?.classList.remove("open");
    }

    async function handleTaskFormSubmit(e) {
        e.preventDefault();
        const jobTitle = document.getElementById("taskJobTitle").value.trim();
        const employeeName = document.getElementById("taskEmployeeName").value.trim();
        const description = document.getElementById("taskDescription").value.trim();

        if (!jobTitle || !employeeName || !description) {
            if (typeof showToast === "function") showToast("⚠️ يرجى ملء جميع الحقول", "warn");
            return;
        }

        const taskData = {
            jobTitle,
            employeeName,
            description,
            date: new Date().toLocaleString("ar-EG")
        };

        if (window.voltFirebase && typeof window.voltFirebase.addTask === "function") {
            try {
                const id = await window.voltFirebase.addTask(taskData);
                if (id) {
                    const tasks = await getTasks();
                    tasks.push({ id, ...taskData });
                    await saveTasksLocal(tasks);
                }
            } catch (err) {
                console.warn("handleTaskFormSubmit: فشل Firestore", err);
            }
        } else {
            const tasks = await getTasks();
            tasks.push({ id: "t_" + Date.now(), ...taskData });
            await saveTasksLocal(tasks);
        }

        renderTaskList();
        document.getElementById("taskForm").reset();
        if (typeof showToast === "function") showToast("✅ تم إضافة المهمة بنجاح", "green");
    }

    async function renderTaskList() {
        const tasks = await getTasks();
        const container = document.getElementById("taskListContainer");
        const countLabel = document.getElementById("taskCountLabel");
        if (!container) return;

        if (countLabel) countLabel.textContent = tasks.length;

        if (!tasks.length) {
            container.innerHTML = `<p id="taskListEmpty" style="color:var(--muted); text-align:center; padding:20px;">لا توجد مهام مضافة اليوم بعد.</p>`;
            return;
        }

        container.innerHTML = tasks.slice().reverse().map(t => `
            <div class="task-row">
                <div class="task-row-info">
                    <div class="task-row-top">
                        <span class="task-row-job">${escapeHtml(t.jobTitle)}</span>
                        <span class="task-row-employee">👤 ${escapeHtml(t.employeeName)}</span>
                    </div>
                    <div class="task-row-desc">${escapeHtml(t.description)}</div>
                    <div class="task-row-date">🕒 ${escapeHtml(t.date)}</div>
                </div>
                <button class="task-row-delete" onclick="window.__deleteTask('${t.id}')" title="حذف المهمة">×</button>
            </div>
        `).join("");
    }

    window.__deleteTask = async function (taskId) {
        if (window.voltFirebase && typeof window.voltFirebase.deleteTask === "function") {
            try { await window.voltFirebase.deleteTask(taskId); } catch (err) {
                console.warn("__deleteTask: فشل Firestore", err);
            }
        }
        let tasks = await getTasks();
        tasks = tasks.filter(t => t.id !== taskId);
        await saveTasksLocal(tasks);
        renderTaskList();
        if (typeof showToast === "function") showToast("🗑️ تم حذف المهمة", "warn");
    };

    async function clearAllTasks() {
        if (!confirm("هل أنت متأكد من مسح كل المهام؟ لا يمكن التراجع عن هذا الإجراء.")) return;
        if (window.voltFirebase && typeof window.voltFirebase.deleteAllTasks === "function") {
            try { await window.voltFirebase.deleteAllTasks(); } catch (err) {
                console.warn("clearAllTasks: فشل Firestore", err);
            }
        }
        await saveTasksLocal([]);
        renderTaskList();
        if (typeof showToast === "function") showToast("🗑️ تم مسح كل المهام", "warn");
    }

    /* ======================= WIRING ======================= */

    function init() {
        // Password gate controls
        document.getElementById("taskPassSubmitBtn")?.addEventListener("click", checkTaskPassword);
        document.getElementById("taskPasswordInput")?.addEventListener("keyup", e => {
            if (e.key === "Enter") checkTaskPassword();
        });
        document.getElementById("closeTaskPassBtn")?.addEventListener("click", closeTaskPasswordGate);
        document.getElementById("task-password-modal")?.addEventListener("click", e => {
            if (e.target === document.getElementById("task-password-modal")) closeTaskPasswordGate();
        });

        // Task interface controls
        document.getElementById("closeTaskMgmtBtn")?.addEventListener("click", closeTaskInterface);
        document.getElementById("task-mgmt-modal")?.addEventListener("click", e => {
            if (e.target === document.getElementById("task-mgmt-modal")) closeTaskInterface();
        });
        document.getElementById("taskForm")?.addEventListener("submit", handleTaskFormSubmit);
        document.getElementById("clearAllTasksBtn")?.addEventListener("click", clearAllTasks);

        // #taskMgmtBtn is no longer in the public header — it's a static
        // button inside #admin-modal (index.html), wired via its own
        // inline onclick="window.openTaskPasswordGate && ...". No listener
        // needed here; openTaskPasswordGate() itself still checks
        // currentUser.role === "admin" before opening the interface.
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
// FIX: removed the #adminPanelBtn click handler that used to be here.
// It had NO auth check and ran unconditionally for any visitor — opening
// the promo modal and calling renderPromoTable() for admins and non-admins
// alike. Combined with script.js previously being loaded twice in
// index.html, this button could fire this exact unguarded logic multiple
// times per click. The gated version (checks currentUser.role === "admin"
// via sessionStorage before doing anything) now lives in script2.js, which
// is the only file that binds a click listener to #adminPanelBtn.
// renderPromoTable itself is left defined below as a function — script2.js
// calls it after its auth check passes.

// 1. دالة رسم الجدول (فصلناها عشان نقدر ننادي عليها كل ما نغير حالة كود)
window.renderPromoTable = function () {
    if (!window.PromoEngine) return;

    const container = document.getElementById("promo-list-container");
    const codes = window.PromoEngine.PROMO_CODES;

    // ── فورم إضافة كود جديد ──
    let html = `
    <div style="background:#111; border:1px solid #333; border-radius:10px; padding:16px; margin-bottom:20px;">
        <h4 style="color:#ffbf00; margin-bottom:14px; font-family:'Cairo',sans-serif;">➕ إضافة كود خصم جديد</h4>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:10px;">
            <input id="newPromoCode" placeholder="الكود (مثال: VOLT20)" 
                style="padding:9px; background:#1a1a1a; border:1px solid #444; color:#fff; border-radius:6px; font-family:'Cairo',sans-serif; text-transform:uppercase;">
            <select id="newPromoType" 
                style="padding:9px; background:#1a1a1a; border:1px solid #444; color:#fff; border-radius:6px; font-family:'Cairo',sans-serif;">
                <option value="percentage">نسبة مئوية %</option>
                <option value="fixed">خصم ثابت EGP</option>
                <option value="free_shipping">شحن مجاني</option>
            </select>
            <input id="newPromoValue" placeholder="القيمة (مثال: 10 أو 50)" type="number" min="0"
                style="padding:9px; background:#1a1a1a; border:1px solid #444; color:#fff; border-radius:6px; font-family:'Cairo',sans-serif;">
            <input id="newPromoMin" placeholder="الحد الأدنى للطلب (EGP)" type="number" min="0"
                style="padding:9px; background:#1a1a1a; border:1px solid #444; color:#fff; border-radius:6px; font-family:'Cairo',sans-serif;">
            <input id="newPromoMaxUses" placeholder="الحد الأقصى للاستخدام (اختياري)" type="number" min="1" step="1"
                style="padding:9px; background:#1a1a1a; border:1px solid #444; color:#fff; border-radius:6px; font-family:'Cairo',sans-serif;">
        </div>
        <button onclick="addNewPromoCode()" 
            style="width:100%; background:#1db954; color:#000; border:none; padding:10px; border-radius:6px; font-family:'Cairo',sans-serif; font-weight:bold; font-size:14px; cursor:pointer;">
            ✅ إضافة الكود
        </button>
        <p id="promoAddMsg" style="text-align:center; margin-top:8px; font-size:13px; font-family:'Cairo',sans-serif;"></p>
    </div>`;

    // ── الجدول ──
    if (!codes || codes.length === 0) {
        html += "<p style='color:#888; text-align:center; padding:20px;'>لا توجد أكواد خصم مسجلة حالياً.</p>";
        container.innerHTML = html;
        return;
    }

    html += `
    <table style="width:100%; border-collapse:collapse; color:white; text-align:right;">
        <tr style="background:#2a2a2a;">
            <th style="padding:12px; border-bottom:1px solid #444;">الكود</th>
            <th style="padding:12px; border-bottom:1px solid #444;">النوع</th>
            <th style="padding:12px; border-bottom:1px solid #444;">القيمة</th>
            <th style="padding:12px; border-bottom:1px solid #444;">الحد الأدنى</th>
            <th style="padding:12px; border-bottom:1px solid #444;">الحالة</th>
            <th style="padding:12px; border-bottom:1px solid #444; text-align:center;">إجراءات</th>
        </tr>`;

    codes.forEach(c => {
        const isActive = c.status === "active";
        const statusColor = isActive ? "#1db954" : "#ff4444";
        const statusText = isActive ? "مفعل ✔️" : "موقف ❌";
        const codeValue = c.type === "free_shipping" ? "شحن مجاني" :
            c.type === "percentage" ? (c.percentOff || c.value || 0) + "%" :
                (c.fixedAmount || c.value || 0) + " EGP";
        const minOrder = c.minOrder ? c.minOrder + " EGP" : "—";
        const toggleColor = isActive ? "#ff4444" : "#1db954";
        const toggleText = isActive ? "إيقاف ⏸️" : "تفعيل ▶️";

        html += `
        <tr style="border-bottom:1px solid #333; background:#1a1a1a;">
            <td style="padding:12px; font-weight:bold; color:#ffbf00; letter-spacing:1px;">${escapeHtml(c.code)}</td>
            <td style="padding:12px; color:#aaa;">${escapeHtml(c.type)}</td>
            <td style="padding:12px; color:#1db954; font-weight:bold;">${escapeHtml(codeValue)}</td>
            <td style="padding:12px; color:#aaa;">${minOrder}</td>
            <td style="padding:12px; color:${statusColor}; font-weight:bold;"><span class="volt-status-dot ${isActive ? 'volt-status-active' : 'volt-status-inactive'}"></span>${statusText}</td>
            <td style="padding:12px; text-align:center; display:flex; gap:6px; justify-content:center;">
                <button onclick="togglePromoStatus('${escapeHtml(c.code)}')" 
                    style="background:${toggleColor}; color:white; border:none; padding:5px 10px; border-radius:5px; cursor:pointer; font-weight:bold; font-family:'Cairo',sans-serif;">
                    ${toggleText}
                </button>
                <button onclick="deletePromoCode('${escapeHtml(c.code)}')" 
                    style="background:#330000; color:#ff4444; border:1px solid #ff4444; padding:5px 10px; border-radius:5px; cursor:pointer; font-family:'Cairo',sans-serif;">
                    حذف 🗑️
                </button>
            </td>
        </tr>`; 
    });

    html += `</table>`;
    container.innerHTML = html;
};
/* =========================================================================
   VOLT ANALYTICS & TRACKING MODULE
   ========================================================================= */

const ANALYTICS_CONFIG = {
    ga4Enabled: true,
    ga4Id: 'G-ZXR42X8RG2',
    
    metaPixelEnabled: true,
    metaPixelId: '1597643028618197',
    
    tiktokPixelEnabled: false,
    tiktokPixelId: '',
    
    firebaseAnalyticsEnabled: true,
    whatsappNotificationsEnabled: false,
    emailNotificationsEnabled: false
};

// ─────────────────────────────────────────────────────────────────────────
// GOOGLE ANALYTICS 4
// ─────────────────────────────────────────────────────────────────────────

function trackGA4Event(eventName, eventData = {}) {
    if (!ANALYTICS_CONFIG.ga4Enabled || !window.gtag) return;
    
    try {
        gtag('event', eventName, eventData);
    } catch (err) {
        console.error('GA4 error:', err);
    }
}

function trackProductView(product) {
    trackGA4Event('view_item', {
        currency: 'EGP',
        value: product.price,
        items: [{
            item_id: product.id,
            item_name: product.name,
            item_category: product.category,
            price: product.price
        }]
    });
}

function trackAddToCart(product, quantity = 1) {
    trackGA4Event('add_to_cart', {
        currency: 'EGP',
        value: product.price * quantity,
        items: [{
            item_id: product.id,
            item_name: product.name,
            price: product.price,
            quantity: quantity
        }]
    });
}

function trackBeginCheckout(cartItems, totalValue) {
    trackGA4Event('begin_checkout', {
        currency: 'EGP',
        value: totalValue,
        items: cartItems.map(p => ({
            item_id: p.id,
            item_name: p.name,
            price: p.price,
            quantity: p.qty || 1
        }))
    });
}

function trackPurchase(orderId, cartItems, totalValue) {
    trackGA4Event('purchase', {
        transaction_id: orderId,
        value: totalValue,
        currency: 'EGP',
        items: cartItems.map(p => ({
            item_id: p.id,
            item_name: p.name,
            price: p.price,
            quantity: p.qty || 1
        }))
    });
}

function trackSearch(searchQuery, resultsCount) {
    trackGA4Event('search', {
        search_term: searchQuery,
        result_count: resultsCount
    });
}

// ─────────────────────────────────────────────────────────────────────────
// META PIXEL
// ─────────────────────────────────────────────────────────────────────────

function trackMetaPixelEvent(eventName, eventData = {}) {
    if (!ANALYTICS_CONFIG.metaPixelEnabled || !window.fbq) return;
    
    try {
        fbq('track', eventName, eventData);
    } catch (err) {
        console.error('Meta Pixel error:', err);
    }
}

function trackMetaAddToCart(product) {
    trackMetaPixelEvent('AddToCart', {
        content_name: product.name,
        content_ids: [product.id],
        content_type: 'product',
        value: product.price,
        currency: 'EGP'
    });
}

function trackMetaPurchase(orderId, cartItems, totalValue) {
    trackMetaPixelEvent('Purchase', {
        content_type: 'product',
        content_ids: cartItems.map(p => p.id),
        value: totalValue,
        currency: 'EGP',
        content_name: cartItems.map(p => p.name).join(', '),
        num_items: cartItems.length
    });
}

// ─────────────────────────────────────────────────────────────────────────
// FIREBASE ANALYTICS
// ─────────────────────────────────────────────────────────────────────────

async function logFirebaseAnalytics(eventName, eventData = {}) {
    if (!ANALYTICS_CONFIG.firebaseAnalyticsEnabled) return;

    try {
        // FIX: previously called window.voltFirebase.db.collection(...).doc()
        // .set(...) directly — that's the Firebase v8 API. This project's
        // Firebase SDK is v9 modular (see config.js), where `db` has no
        // .collection() method at all, so this call threw inside this
        // exact try/catch on every single invocation and no event was ever
        // written — silently, since the catch below only logs to console.
        // Fixed by calling through window.voltFirebase.logAnalyticsEvent(),
        // a v9-correct function in config.js, matching how every other
        // Firestore write in this file already goes through
        // window.voltFirebase rather than touching the SDK directly.
        if (!window.voltFirebase || typeof window.voltFirebase.logAnalyticsEvent !== "function") {
            return;
        }

        await window.voltFirebase.logAnalyticsEvent({
            event: eventName,
            timestamp: new Date().toISOString(),
            userId: currentUser?.uid || 'guest_' + Date.now(),
            sessionId: sessionStorage.getItem('volt_session_id') || 'unknown',
            data: eventData,
            userAgent: navigator.userAgent,
            url: window.location.href,
            referrer: document.referrer
        });
    } catch (err) {
        console.error('Firebase analytics error:', err);
    }
}

// ─────────────────────────────────────────────────────────────────────────
// WHATSAPP NOTIFICATIONS
// ─────────────────────────────────────────────────────────────────────────

async function sendWhatsAppNotification(phone, message) {
    if (!ANALYTICS_CONFIG.whatsappNotificationsEnabled) {
        return;
    }
    
    try {
        const response = await fetch('/api/send-whatsapp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                phone: phone.replace(/\D/g, ''),
                message: message
            })
        });
        
        if (response.ok) {
            return await response.json();
        }
    } catch (err) {
        console.error('WhatsApp error:', err);
    }
}

async function notifyOrderConfirmation(phone, orderId, total) {
    const message = `
📦 تم استقبال طلبك بنجاح!

رقم الطلب: #${orderId}
الإجمالي: ${total} جنيه

شكراً لاستخدامك VOLT ⚡
    `.trim();
    
    await sendWhatsAppNotification(phone, message);
}

// ─────────────────────────────────────────────────────────────────────────
// EMAIL NOTIFICATIONS
// ─────────────────────────────────────────────────────────────────────────

async function sendEmailNotification(email, orderId, cartItems, totalValue) {
    if (!ANALYTICS_CONFIG.emailNotificationsEnabled) {
        return;
    }
    
    try {
        const response = await fetch('/api/send-email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                to: email,
                subject: `تأكيد الطلب #${orderId} - VOLT`,
                orderId: orderId,
                items: cartItems,
                total: totalValue,
                orderDate: new Date().toLocaleString('ar-EG')
            })
        });
        
        if (response.ok) {
            return await response.json();
        }
    } catch (err) {
        console.error('Email error:', err);
    }
}

// ─────────────────────────────────────────────────────────────────────────
// COMPLETE ORDER TRACKING
// ─────────────────────────────────────────────────────────────────────────

async function completeOrderWithTracking(orderId, customerPhone, customerEmail, cartItems, totalAmount) {
    trackPurchase(orderId, cartItems, totalAmount);
    trackMetaPurchase(orderId, cartItems, totalAmount);
    
    await logFirebaseAnalytics('purchase', {
        order_id: orderId,
        total: totalAmount,
        items_count: cartItems.length,
        customer_type: currentUser ? 'registered' : 'guest'
    });
    
    await notifyOrderConfirmation(customerPhone, orderId, totalAmount);
    await sendEmailNotification(customerEmail, orderId, cartItems, totalAmount);
}

// ─────────────────────────────────────────────────────────────────────────
// EXPORT FUNCTIONS
// ─────────────────────────────────────────────────────────────────────────

window.VoltAnalytics = {
    trackGA4Event,
    trackProductView,
    trackAddToCart,
    trackBeginCheckout,
    trackPurchase,
    trackSearch,
    trackMetaAddToCart,
    trackMetaPurchase,
    logFirebaseAnalytics,
    completeOrderWithTracking,
    sendWhatsAppNotification,
    sendEmailNotification
};

window.addNewPromoCode = function () {
    const code = document.getElementById("newPromoCode").value.trim().toUpperCase();
    const type = document.getElementById("newPromoType").value;
    const value = parseFloat(document.getElementById("newPromoValue").value) || 0;
    const minOrder = parseFloat(document.getElementById("newPromoMin").value) || 0;
    const maxUsesInput = document.getElementById("newPromoMaxUses").value.trim();
    const maxUses = maxUsesInput === "" ? null : Number(maxUsesInput);
    const msg = document.getElementById("promoAddMsg");

    if (!code) { msg.style.color = "#ff4444"; msg.textContent = "⚠️ أدخل الكود أولاً"; return; }
    if (!/^[A-Z0-9_-]{1,32}$/.test(code)) { msg.style.color = "#ff4444"; msg.textContent = "⚠️ الكود يحتوي على رموز غير مقبولة"; return; }
    if (maxUses !== null && (!Number.isInteger(maxUses) || maxUses < 1)) { msg.style.color = "#ff4444"; msg.textContent = "⚠️ الحد الأقصى للاستخدام غير صالح"; return; }

    const exists = window.PromoEngine.PROMO_CODES.find(c => c.code === code);
    if (exists) { msg.style.color = "#ff4444"; msg.textContent = "⚠️ الكود موجود بالفعل"; return; }

    const newCode = {
        code,
        type,
        value: type === "percentage" ? value + "%" : type === "fixed" ? value + " EGP" : "",
        percentOff: type === "percentage" ? value : 0,
        fixedAmount: type === "fixed" ? value : 0,
        shippingDiscount: type === "free_shipping",
        minOrder,
        maxUses,
        maxDiscount: type === "percentage" ? 500 : 0,
        status: "active"
    };

    window.PromoEngine.PROMO_CODES.push(newCode);
    window.PromoEngine.persist();
    msg.style.color = "#1db954";
    msg.textContent = "✅ تم إضافة الكود بنجاح!";
    setTimeout(() => { msg.textContent = ""; }, 2000);
    renderPromoTable();
};

// ── حذف كود ──
window.deletePromoCode = async function (code) {
    if (!confirm("هل أنت متأكد من حذف كود " + code + "؟")) return;
    if (window.voltFirebase && typeof window.voltFirebase.deletePromoCode === "function") {
        try {
            const ok = await window.voltFirebase.deletePromoCode(code);
            if (!ok) throw new Error("Promo deletion failed");
        } catch (e) {
            showToast("فشل حذف كود الخصم", "error");
            return;
        }
    } else {
        showToast("النظام غير جاهز لحذف كود الخصم", "error");
        return;
    }
    window.PromoEngine.PROMO_CODES = window.PromoEngine.PROMO_CODES.filter(c => c.code !== code);
    await window.PromoEngine.persist();
    renderPromoTable();
};// FIX: removed the window.applyCustomerPromo defined here. index.html loads
// script.js (line ~963) before cart-promo.js (line ~1409), so cart-promo.js's
// window.applyCustomerPromo silently overwrote this one — meaning this
// version was already dead in practice. Removing it outright rather than
// leaving two definitions of the same global around, since the load-order
// dependency that made this "safe" to ignore is exactly the kind of thing
// that breaks silently if the <script> tags are ever reordered.
//
// cart-promo.js's version is the one actually wired to the "Apply" button
// via onclick="applyCustomerPromo()" (line ~727 below) — it posts to
// /functions/v1/validate-promo instead of validating client-side. That
// Edge Function still needs to exist in your Supabase project; see the
// TODO on the cart total calculation below for the matching gap on the
// pricing side.

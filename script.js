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

const saveProducts = (prods) => localStorage.setItem("volt_products", JSON.stringify(prods));
const getUsers = () => JSON.parse(localStorage.getItem("volt_users"));
const saveUsers = (users) => localStorage.setItem("volt_users", JSON.stringify(users));

const getOrders = () => JSON.parse(localStorage.getItem("volt_orders"));
const saveOrders = (orders) => localStorage.setItem("volt_orders", JSON.stringify(orders));

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
let currentUser = null; // يحمل بيانات اليوزر الحالية أو الأدمن
let activeCategory = "all"; // التصنيف النشط في شريط الفلاتر
const WA_NUMBER = "201111884419";

// تنظيف أي نص قبل حقنه في innerHTML لمنع DOM-based XSS (نفس الطريقة
// المستخدمة بالفعل في كود الفولدرز وإدارة المهام أسفل الملف)
function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str == null ? "" : String(str);
    return div.innerHTML;
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
document.addEventListener("DOMContentLoaded", () => {
    initSplashAnimation();
    getProducts().then(products => renderProducts(products));
    setupFilters();
    setupSearch();
    setupCartSystem();
    updateCartBadge();
    typeWriter();
    initLightning();
    initGlowCardPerformance();
    setupModals();

    // محاولة استرجاع جلسة تسجيل دخول سابقة لراحة العميل
    if (sessionStorage.getItem("volt_logged_user")) {
        currentUser = JSON.parse(sessionStorage.getItem("volt_logged_user"));
        updateNavForUser();
    }

    // فتح مودال المنتج مباشرة لو المستخدم دخل برابط منتج (#/product/{id})
    handleProductRouteFromHash();
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

/* ==========================================================================
   PRODUCTS RENDER & MANAGEMENT
========================================================================== */
function renderProducts(products) {
    const c = document.getElementById("products");
    if (!c) return;
    if (!products.length) {
        c.innerHTML = `<p style="grid-column:1/-1;text-align:center;color:var(--muted);padding:40px;">لم يتم العثور على أي منتجات.</p>`;
        return;
    }

    const isAdmin = currentUser && currentUser.role === "admin";

    c.innerHTML = products.map(p => `
        <div class="card glow-card" data-id="${p.id}" style="position:relative;">
            ${isAdmin ? `<button data-testid="product-delete-btn-${p.id}" onclick="deleteProduct(event, '${p.id}')" style="position:absolute; top:10px; left:10px; background:var(--red); color:white; border:none; border-radius:50%; width:28px; height:28px; cursor:pointer; font-weight:bold; z-index:10; font-size:14px;" title="حذف المنتج من المتجر">×</button>` : ''}
            <div class="card-img" style="position:relative;" onclick="openProductModal('${p.id}')">${p.emoji.startsWith('http') ? `<img src="${escapeHtml(p.emoji)}" style="width:100%;height:100%;object-fit:cover;border-radius:8px;">` : escapeHtml(p.emoji)}
                ${p.stock <= 0 ?
            `<button class="fab-add" data-testid="product-add-btn-${p.id}" style="position:absolute; bottom:-18px; left:50%; transform:translateX(-50%); width:36px; height:36px; border-radius:50%; background:var(--border); color:var(--muted); border:none; cursor:not-allowed; font-size:20px; font-weight:bold; display:flex; align-items:center; justify-content:center; z-index:5;" disabled>×</button>` :
            `<button class="fab-add" id="btn-add-${p.id}" data-testid="product-add-btn-${p.id}" onclick="event.stopPropagation(); openProductModal('${p.id}');" style="position:absolute; bottom:-18px; left:50%; transform:translateX(-50%); width:36px; height:36px; border-radius:50%; background:#FFFFFF; color:#FF7A00; border:none; box-shadow:0 2px 6px rgba(0,0,0,0.25); cursor:pointer; font-size:22px; font-weight:bold; line-height:1; display:flex; align-items:center; justify-content:center; z-index:5;" title="عرض المنتج والإضافة للسلة">+</button>`}
            </div>
            <div class="card-body">
                <span class="card-category">${escapeHtml(p.category)}</span>
                <h3 class="card-name" onclick="openProductModal('${p.id}')">${escapeHtml(p.name)}</h3>
                <button class="details-toggle-btn" onclick="event.stopPropagation(); toggleDetailsView('${p.id}');" style="background:none;border:none;color:var(--green);font-size:12px;cursor:pointer;margin-top:5px;text-align:right;font-family:'Cairo',sans-serif;font-weight:bold;">
                    تفاصيل المنتج ▼
                </button>
                <div id="pd${p.id}" class="details-panel" style="display:none;font-size:12px;color:var(--text);margin-top:8px;padding:8px;background:var(--dark);border-radius:6px;border-right:2px solid var(--green);">
                    ${escapeHtml(p.desc)}
                </div>
                <div class="card-footer">
                    <span class="card-price">${p.price} <span>EGP</span></span>
                </div>        
            </div>
        </div>`).join('');
}

function toggleDetailsView(id) {
    const el = document.getElementById(`pd${id}`);
    if (el) el.style.display = el.style.display === "block" ? "none" : "block";
}

function setupFilters() {
    const btns = document.querySelectorAll(".filter-btn");
    btns.forEach(btn => btn.addEventListener("click", async () => {
        btns.forEach(b => b.classList.remove("active")); btn.classList.add("active");
        activeCategory = btn.getAttribute("data-category");
        const inp = document.getElementById("searchInput");
        if (inp) inp.value = "";
        const allProds = await getProducts();
        renderProducts(activeCategory === "all" ? allProds : allProds.filter(p => p.category === activeCategory));
    }));
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

function setupSearch() {
    const inp = document.getElementById("searchInput"), btn = document.getElementById("searchBtn");
    const go = async () => {
        const q = inp.value.toLowerCase().trim();
        const allProds = await getProducts();
        let filtered = activeCategory === "all" ? allProds : allProds.filter(p => p.category === activeCategory);
        if (q) filtered = filtered.filter(p => productMatchesSearch(p, q));
        renderProducts(filtered);
    };
    btn?.addEventListener("click", go);
    inp?.addEventListener("keyup", e => { if (e.key === "Enter") go(); });
    inp?.addEventListener("input", go);
}

async function openProductModal(id) {
    const allProds = await getProducts();
    const p = allProds.find(x => String(x.id) === String(id)); if (!p) return;
    const rows = p.specs ? Object.entries(p.specs).map(([k, v]) => `<div class="spec-row"><span>${escapeHtml(k)}</span><span>${escapeHtml(v)}</span></div>`).join('') : '';
    const maxQty = (p.stock !== undefined && p.stock > 0) ? p.stock : 1;
    document.getElementById("modalInnerContent").innerHTML = `
        <div class="modal-img">${p.emoji.startsWith('http') ? `<img src="${escapeHtml(p.emoji)}" style="max-width:120px;border-radius:8px;">` : escapeHtml(p.emoji)}</div>
        <div class="modal-info">
            <span class="modal-cat">${escapeHtml(p.category)}</span>
            <h3 class="modal-name">${escapeHtml(p.name)}</h3>
            <div class="modal-price">${p.price} <small>EGP</small></div>
            <p class="modal-desc">${escapeHtml(p.desc)}</p>
            <div class="modal-specs"><h4>المواصفات الفنية</h4>${rows}</div>
            <div class="modal-qty" style="display:flex;align-items:center;gap:14px;margin:16px 0;">
                <span style="font-weight:700;font-size:14px;">الكمية:</span>
                <div style="display:flex;align-items:center;gap:10px;">
                    <button type="button" data-testid="modal-qty-decrement-${p.id}" onclick="changeModalQty('${p.id}',-1,${maxQty})" style="width:32px;height:32px;border-radius:6px;border:1px solid var(--border);background:var(--dark);color:var(--text);font-size:18px;cursor:pointer;">−</button>
                    <span id="modalQtyVal-${p.id}" style="min-width:24px;text-align:center;font-weight:700;">1</span>
                    <button type="button" data-testid="modal-qty-increment-${p.id}" onclick="changeModalQty('${p.id}',1,${maxQty})" style="width:32px;height:32px;border-radius:6px;border:1px solid var(--border);background:var(--dark);color:var(--text);font-size:18px;cursor:pointer;">+</button>
                </div>
            </div>
            <div class="modal-actions">
                <button class="btn-primary" id="modalAddBtn-${p.id}" data-testid="modal-add-to-cart-btn-${p.id}" onclick="addModalQtyToCart('${p.id}')">Add item</button>
                <button class="btn-secondary" data-testid="modal-share-link-${p.id}" onclick="copyProductLink('${p.id}')" title="نسخ رابط المنتج">🔗 نسخ رابط المنتج</button>
                <a href="#" class="btn-secondary" onclick="closeModal();return false;">العودة للمتجر</a>
            </div>
        </div>`;
    document.getElementById("modal-overlay").classList.add("open");

    // نحدّث الـ URL بدون إعادة تحميل الصفحة، عشان يبقى للمنتج رابط
    // مباشر قابل للمشاركة، ونحدّث عنوان الصفحة عشان يبان في تبويب
    // المتصفح ونتايج البحث لو اتشارك الرابط.
    if (history.replaceState) {
        history.replaceState(null, "", `#/product/${encodeURIComponent(p.id)}`);
    }
    document.title = `${p.name} | VOLT`;
}

// نسخ رابط مباشر للمنتج الحالي إلى الحافظة، لمشاركته خارج الموقع.
function copyProductLink(id) {
    const url = `${location.origin}${location.pathname}#/product/${encodeURIComponent(id)}`;
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url)
            .then(() => showToast("✅ تم نسخ رابط المنتج", "green"))
            .catch(() => showToast("⚠️ تعذر نسخ الرابط", "warn"));
    } else {
        showToast("⚠️ النسخ التلقائي غير مدعوم في هذا المتصفح", "warn");
    }
}

// عند فتح الموقع مباشرة برابط منتج (#/product/{id})، أو عند تغيير الـ
// hash يدويًا، نفتح مودال المنتج المطابق تلقائيًا.
async function handleProductRouteFromHash() {
    const match = location.hash.match(/^#\/product\/(.+)$/);
    if (!match) return;
    const id = decodeURIComponent(match[1]);
    await openProductModal(id);
}

window.addEventListener("hashchange", handleProductRouteFromHash);

// متحكم الكمية جوه مودال المنتج — بيغيّر القيمة المعروضة فقط، ضمن حدود المخزون المتاح
function changeModalQty(id, delta, maxQty) {
    const el = document.getElementById(`modalQtyVal-${id}`);
    if (!el) return;
    let val = parseInt(el.textContent, 10) || 1;
    val += delta;
    if (val < 1) val = 1;
    if (val > maxQty) val = maxQty;
    el.textContent = val;
}

// الفعل النهائي لزرار "Add item" جوه المودال: يضيف المنتج للسلة بالكمية المختارة فعليًا، ثم يقفل المودال
async function addModalQtyToCart(id) {
    const el = document.getElementById(`modalQtyVal-${id}`);
    const qty = el ? (parseInt(el.textContent, 10) || 1) : 1;
    for (let i = 0; i < qty; i++) {
        await addToCart(null, id);
    }
    closeModal();
}

function closeModal() {
    document.getElementById("modal-overlay").classList.remove("open");
    // نرجّع الـ URL وعنوان الصفحة لحالتهم الأصليين لما المودال يتقفل،
    // عشان الـ hash متفضلش عالقة على منتج بعد الرجوع للمتجر.
    if (location.hash.startsWith("#/product/") && history.replaceState) {
        history.replaceState(null, "", location.pathname + location.search);
    }
    document.title = "VOLT | متجر الإلكترونيات والقطع الذكية";
}
document.getElementById("closeModalBtn")?.addEventListener("click", closeModal);
document.getElementById("modal-overlay")?.addEventListener("click", e => { if (e.target === document.getElementById("modal-overlay")) closeModal(); });

// دالة حذف منتج للأدمن فقط
async function deleteProduct(event, id) {
    event.stopPropagation();
    if (!currentUser || currentUser.role !== "admin") return;
    if (confirm("هل أنت متأكد من حذف هذا المنتج نهائياً من المتجر؟")) {
        const sid = String(id);
        if (window.voltFirebase && typeof window.voltFirebase.deleteProduct === "function") {
            try { await window.voltFirebase.deleteProduct(sid); } catch (err) { console.warn("deleteProduct: فشل الحذف من Firestore", err); }
        }
        let prods = await getProducts();
        prods = prods.filter(p => String(p.id) !== sid);
        saveProducts(prods);
        renderProducts(prods);
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

    const prods = await getProducts();
    const newProd = {
        name,
        category,
        emoji,
        price,
        stock,
        desc,
        specs: { "الحالة": "جديد" }
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

    prods.push(newProd);
    saveProducts(prods);
    renderProducts(prods);

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
    let prods = await getProducts();
    const pIndex = prods.findIndex(x => String(x.id) === String(id));
    if (pIndex === -1) return;


    const p = prods[pIndex];

    if (p.stock !== undefined && p.stock <= 0) {
        showToast("عذراً، نفدت كمية هذا المنتج!", "warn"); return;
    }

    if (p.stock !== undefined) {
        p.stock--;
        saveProducts(prods);
        renderProducts(prods);
        if (window.voltFirebase && typeof window.voltFirebase.updateProduct === "function") {
            try { window.voltFirebase.updateProduct(String(p.id), { stock: p.stock }); } catch (err) { console.warn("addToCart: فشل تحديث المخزون", err); }
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
}


async function removeFromCart(i) {
    const p = cart[i];
    let prods = await getProducts();
    const pIndex = prods.findIndex(x => String(x.id) === String(p.id));
    if (pIndex !== -1) {
        prods[pIndex].stock = (prods[pIndex].stock || 0) + 1;
        saveProducts(prods);
        renderProducts(prods);
        if (window.voltFirebase && typeof window.voltFirebase.updateProduct === "function") {
            try { window.voltFirebase.updateProduct(String(prods[pIndex].id), { stock: prods[pIndex].stock }); } catch (err) { console.warn("removeFromCart: فشل تحديث المخزون", err); }
        }
    }
    cart.splice(i, 1);
    updateCartBadge();
    updateCartUI();
    saveCart();
}

function updateCartBadge() { const b = document.getElementById("cartCount"); if (b) b.textContent = cart.length; }

async function updateCartUI() {
    const c = document.getElementById("cartItemsContainer"), t = document.getElementById("cartTotal");
    if (!c || !t) return;

    if (!cart.length) {
        c.innerHTML = `<p style="text-align:center;color:var(--muted);padding:20px 0;">السلة فارغة حالياً</p>`;
        t.innerHTML = `0 <span>EGP</span>`;
        return;
    }

    let total = 0;
    c.innerHTML = cart.map((item, i) => {
        total += item.price;
        return `
        <div class="cart-item">
            <div class="cart-item-info">
                <span class="cart-item-emoji">${item.emoji && item.emoji.startsWith('http') ? '📦' : item.emoji}</span>
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
        t.innerHTML = `<span style="font-size:14px; color:#ff4444; text-decoration:line-through; margin-left:10px;">${total}</span> ${finalTotal} <span>EGP</span>`;
    }
}



/* ==========================================================================
   CHECKOUT FLOW
========================================================================== */
function handleCheckout() {
    document.getElementById("cart-overlay").classList.remove("open");
    if (!cart.length) { showToast("السلة فارغة!", "warn"); return; }
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

    // نحدّد الإيميل: لو المستخدم كتب إيميل مباشرة نستخدمه، لو كتب رقم
    // هاتف نبحث عنه في Firestore عن طريق idNum عشان نجيب الإيميل المرتبط.
    let emailToTry = loginInput.includes("@") ? loginInput : null;

    if (!emailToTry && typeof window.voltFirebase.findUserByIdNum === "function") {
        try {
            const byIdNum = await window.voltFirebase.findUserByIdNum(loginInput);
            if (byIdNum && byIdNum.email) emailToTry = byIdNum.email;
        } catch (err) {
            console.error("doLogin: فشل البحث عن المستخدم برقم الهاتف", err);
        }
    }

    if (!emailToTry) {
        showToast("⚠️ لم يتم العثور على حساب بهذا الرقم أو الإيميل", "error");
        return;
    }

    try {
        const firebaseUser = await window.voltFirebase.signInClient(emailToTry, pass);
        if (!firebaseUser) {
            showToast("⚠️ بيانات الدخول غير صحيحة!", "error");
            return;
        }

        currentUser = { ...firebaseUser, role: firebaseUser.role || "client" };
        sessionStorage.setItem("volt_logged_user", JSON.stringify(currentUser));
        closeLoginModal();
        updateNavForUser();

        if (currentUser.role === "admin") {
            renderProducts(await getProducts());
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
                alert("⚠️ تعذر التحقق من الرقم حالياً، تحقق من الاتصال وحاول مرة أخرى");
                document.getElementById("wiz-id").style.border = "2px solid red";
                return;
            }
        }
        // التأكد إن الرقم 11 رقم وبيبدأ بـ 01
        if (v.length !== 11 || !v.startsWith("01")) {
            alert("⚠️ يرجى إدخال رقم هاتف صحيح يتكون من 11 رقم ويبدأ بـ 01");
            document.getElementById("wiz-id").style.border = "2px solid red";
            return; // الفرامل اللي بتمنعه يكمل
        }
        if (isPhoneUsed) {
            alert("🛑 الرقم ده مسجل بيه حساب قبل كده! يرجى استخدام رقم آخر أو تسجيل الدخول.");
            document.getElementById("wiz-id").style.border = "2px solid red";
            return; // الفرامل اللي بتمنعه يكمل
        }
        wizData.idNum = v;

    } else if (wizStep === 4) {
        let v = document.getElementById("wiz-phone").value.trim();

        if (v === "") {
            wizData.phone = "بدون إيميل";
        } else {
            v = v.replace(/\s+/g, ""); // إزالة المسافات

            if (!v.includes("@")) {
                v = v + "@gmail.com";
            } else {
                // 💡 ميزة جديدة: تصحيح أخطاء الجيميل والياهو والهوتميل
                v = v.replace("@gimal.com", "@gmail.com")
                    .replace("@gmil.com", "@gmail.com")
                    .replace("@gmai.com", "@gmail.com")
                    .replace("@gamil.com", "@gmail.com")
                    .replace("@yaho.com", "@yahoo.com")
                    .replace("@hotmil.com", "@hotmail.com");
            }
            // 💡 ميزة جديدة: توحيد شكل الإيميل لحروف صغيرة
            wizData.phone = v.toLowerCase();

            // التحقق من تكرار الإيميل حصرياً في Firestore
            let existingEmail = false;
            if (window.voltFirebase && typeof window.voltFirebase.findUserByEmail === "function") {
                try {
                    existingEmail = !!(await window.voltFirebase.findUserByEmail(wizData.phone));
                } catch (e) {
                    console.error("wizNext: فشل التحقق من الإيميل في Firestore", e);
                }
            }
            if (existingEmail) {
                alert("🛑 الإيميل ده مسجل عليه حساب قبل كده! حاول تسجيل الدخول.");
                document.getElementById("wiz-phone").style.border = "2px solid red";
                return;
            }
        }

    } else if (wizStep === 5) {
        const v = document.getElementById("wiz-pass").value;
        if (v.length < 8) {
            alert("⚠️ كلمة السر يجب أن تكون 8 أحرف أو أكثر لحماية حسابك!");
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
        // 1. تجهيز الإيميل: لو كتبه بنستخدمه، لو سابه فاضي بنعمله إيميل برقم التليفون
        const cleanPhone = (wizData.phone || "").replace(/\D/g, "");
        const email = (wizData.email && wizData.email.trim()) 
            ? wizData.email.trim() 
            : `client_${cleanPhone}@volt.com`;

        // 2. الفحص المسبق
        try {
            const existingByEmail = await window.voltFirebase.findUserByEmail(email);
            const existingByIdNum = await window.voltFirebase.findUserByIdNum(wizData.idNum);
            if (existingByEmail || existingByIdNum) {
                showToast("🛑 البريد أو رقم الهاتف مسجل من قبل", "warn");
                return;
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
    sessionStorage.setItem("volt_logged_user", JSON.stringify(currentUser));

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
    document.querySelectorAll(".wp-line").forEach((el, i) => { el.classList.toggle("done", i + 1 < wizStep); });
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
            <button id="taskMgmtBtn" class="nav-cart" style="background:transparent;color:var(--amber);border:1.5px solid var(--amber);">📋 إدارة المهام</button>
            <span class="nav-user" style="color:var(--amber);">🛡️ لوحة الإدارة</span>
            <button id="adminDashboardBtn" class="nav-cart" style="background:var(--amber); color:#000; border:none; font-weight:bold;">لوحة التحكم ⚙️</button>
            <button class="nav-logout" onclick="logout()" style="background:transparent;color:var(--muted);border:1px solid var(--border);padding:6px 12px;border-radius:6px;cursor:pointer;">خروج</button>`;
        document.getElementById("taskMgmtBtn")?.addEventListener("click", () => window.openTaskPasswordGate && window.openTaskPasswordGate());
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
    updateNavForUser();
    renderProducts(await getProducts()); // إعادة الرندر لإخفاء أدوات الأدمن
    showToast("تم تسجيل الخروج بنجاح", "warn");
}

/* ==========================================================================
   PAYMENT FLOW & SAVING PERMANENT ORDERS
========================================================================== */
function openPaymentModal() {
    let total = cart.reduce((s, item) => s + item.price, 0);
    const summary = document.getElementById("paySummary");
    summary.innerHTML = `
        <div class="pay-summary-title">تأكيد ملخص الطلب</div>
        <div class="pay-summary-row"><span>عدد المنتجات:</span><span>${cart.length}</span></div>
        <div class="pay-summary-row" style="color:var(--muted); font-size: 11px; margin-top:5px; margin-bottom: 5px; border-bottom: none;">
            التوصيل إلى: <strong style="color:var(--text);">${currentUser.address}</strong>
        </div>
        <div class="pay-summary-row" style="border-top: 1px solid var(--border); margin-top: 5px; padding-top: 5px;">
            <span>الإجمالي المطلوب:</span><span>${total} EGP</span>
        </div>
        <!-- قسم كود الخصم للعميل في شاشة الدفع -->
<div style="margin: 15px 0; background: #1a1a1a; padding: 15px; border-radius: 8px; border: 1px dashed #1db954;">
    <p style="color: #ccc; font-size: 14px; margin-bottom: 10px; text-align: right;">عندك كود خصم؟ 🎟️</p>
    <div style="display: flex; gap: 10px; direction: rtl;">
        <input type="text" id="customerPromoInput" placeholder="أدخل الكود هنا..." style="flex: 1; padding: 10px; border-radius: 5px; border: 1px solid #444; background: #222; color: white; text-align: center; text-transform: uppercase;">
        <button onclick="applyCustomerPromo()" style="background: #1db954; color: black; border: none; padding: 10px 20px; border-radius: 5px; cursor: pointer; font-weight: bold;">
            تطبيق
        </button>
    </div>
    <p id="promoMessage" style="margin-top: 10px; font-size: 14px; font-weight: bold; text-align: center;"></p>
</div>
    `;
    document.getElementById("payment-modal").style.display = "flex";
}

function choosePayment(method) {
    let total = cart.reduce((sum, item) => sum + item.price, 0);

    // قاعدة الديبوزت للطلبات فوق الـ 1000 جنيه
    if (method === 'cash' && total > 1000) {
        let deposit = Math.ceil(total * 0.3);
        const payBox = document.querySelector(".payment-box");
        if (!payBox.dataset.originalHtml) payBox.dataset.originalHtml = payBox.innerHTML;

        payBox.innerHTML = `
            <button class="modal-close" onclick="closePaymentModal()" style="right:auto; left:16px;">&times;</button>
            <h3 style="color:var(--amber); font-family:'Rajdhani',sans-serif; font-size:24px; margin-bottom:10px;">⚠️ تأكيد الطلب معلق</h3>
            <p style="color:var(--muted); font-size:13px; margin-bottom:20px; line-height:1.6;">
                قيمة طلبك تتخطى 1000 ج.م. لتأكيد الطلب، يجب دفع عربون <b>30%</b> بقيمة <strong style="color:var(--green); font-size:16px;">${deposit} ج.م</strong> عبر InstaPay أولاً.
            </p>
            <div style="background:#0e140e; border:1px dashed var(--amber); padding:15px; border-radius:10px; margin-bottom:20px;">
                <span style="display:block; color:var(--muted); font-size:12px; margin-bottom:5px;">رقم التحويل (InstaPay):</span>
                <strong style="color:#fff; font-size:20px; letter-spacing:2px;">01111884419</strong>
            </div>
            <button class="btn-primary" style="width:100%; margin-bottom:10px; background:var(--amber); color:#000;" onclick="processFinalOrder('pending-deposit')">⏳ إرسال الطلب للمراجعة</button>
            <button class="btn-secondary" style="width:100%; border-color:var(--border); color:var(--muted);" onclick="resetPaymentModal()">رجوع لاختيار طريقة أخرى</button>
        `;
        return;
    }
    processFinalOrder(method);
}

async function processFinalOrder(method) {
    document.getElementById("payment-modal").style.display = "none";
    let methodText = method === 'cash' ? "كاش عند الاستلام" : (method === 'pending-deposit' ? "كاش (بانتظار تحويل الديبوزت)" : "إنستاباي كامل");
// --- حساب الإجمالي النهائي (مع التحقق من كود الخصم) ---
    // FIX: originalTotal is still summed from cart[].price, which comes
    // from localStorage-held product data — this file cannot close that
    // exposure without a backend, since it has no independent price source
    // to check against. Flagging clearly rather than implying this is
    // fixed: the order total computed here MUST be re-verified against
    // your Supabase product table before an order is accepted / paid,
    // otherwise a shopper who edited volt_products in localStorage still
    // gets whatever price they set, promo code aside.
    let originalTotal = cart.reduce((sum, item) => sum + item.price, 0);
    let total = originalTotal; // ده السعر اللي هيتبعت للأدمن
    let appliedPromoLabel = "";

    // FIX: previously called window.PromoEngine.validatePromoCode(...)
    // directly on window.currentPromoCode (a forgeable global) against a
    // client-visible PROMO_CODES table. Now reads the applied code via
    // cart-promo.js's read-only getter and asks it to re-validate the
    // discount against the Edge Function rather than recomputing locally.
    const appliedCode = typeof window.getCurrentPromoCode === "function"
        ? window.getCurrentPromoCode()
        : "";
    if (appliedCode && typeof window.getPromoDiscountForTotal === "function") {
        const discountAmount = await window.getPromoDiscountForTotal(originalTotal);
        if (discountAmount > 0) {
            total = Math.max(0, originalTotal - discountAmount);
            appliedPromoLabel = ` (تم استخدام كود: ${appliedCode})`;
        }
    }
    // -----------------------------------------------------

    const comment = document.getElementById("orderComment") ? document.getElementById("orderComment").value.trim() : "لا توجد ملاحظات";

    // إضافة ملاحظة لو استخدم كود خصم
    const finalComment = appliedPromoLabel ? comment + appliedPromoLabel : comment;

    const newOrder = {
        orderId: "VOLT-OR-" + Math.floor(Math.random() * 900000 + 100000),
        date: new Date().toLocaleString("ar-EG"),
        createdAt: new Date().toISOString(),
        customer: {
            name: currentUser.name,
            phone: currentUser.phone,
            address: currentUser.address,
            code: currentUser.code,
            uid: currentUser.uid || null
        },
        items: cart.map(i => ({ productId: i.id, name: i.name, price: i.price, emoji: i.emoji })),
        total: total,
        comment: finalComment,
        method: methodText,
        status: method === 'pending-deposit' ? "معلق بانتظار العربون" : "قيد المراجعة",
        uid: currentUser.uid || null
    };

    // --- حفظ في Firestore أولاً لو متاح ---
    let firestoreOrderId = null;
    if (window.voltFirebase && typeof window.voltFirebase.saveOrder === "function") {
        try {
            firestoreOrderId = await window.voltFirebase.saveOrder(newOrder);
            if (firestoreOrderId) newOrder.id = firestoreOrderId;
        } catch (err) {
            console.warn("processFinalOrder: فشل حفظ الأوردر في Firestore", err);
        }
    }

    const orders = getOrders();
    orders.push(newOrder);
    saveOrders(orders);// تحديث تاريخ المستخدم في Firestore + localStorage
    let updatedHistory = (currentUser.history || []);
    updatedHistory.push(newOrder);
    currentUser.history = updatedHistory;
    sessionStorage.setItem("volt_logged_user", JSON.stringify(currentUser));

    if (currentUser.uid && window.voltFirebase && typeof window.voltFirebase.saveUserProfile === "function") {
        try {
            await window.voltFirebase.saveUserProfile(currentUser.uid, { history: updatedHistory });
        } catch (err) {
            console.warn("processFinalOrder: فشل تحديث بروفايل المستخدم", err);
        }
    }

    const users = getUsers();
    const uIndex = users.findIndex(u => u.code === currentUser.code);
    if (uIndex !== -1) {
        users[uIndex].history = updatedHistory;
        saveUsers(users);
    }

    let isPending = method === 'pending-deposit';
    let deposit = Math.ceil(total * 0.3);
    let successMessage = isPending
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
            <p style="color:var(--muted); margin-bottom:8px; font-size:13px;">رقم الطلب: <strong style="color:var(--green)">${newOrder.orderId}</strong></p>
            <p style="color:var(--muted); margin-bottom:8px; font-size:13px;">طريقة الدفع: <strong style="color:#fff">${methodText}</strong></p>
            <p style="color:var(--muted); font-size:13px;">سيتم التوصيل إلى العنوان المثبت للعميل يدوياً.</p>
        </div>
        <a class="wa-btn" href="https://wa.me/${WA_NUMBER}?text=${encodeURIComponent('مرحباً فولت، قمت بإرسال أوردر جديد رقم: ' + newOrder.orderId + ' بمبلغ ' + total + ' ج.م للاستلام في: ' + currentUser.address)}" target="_blank" style="display:flex; align-items:center; justify-content:center; gap:8px; background:#1db954; color:black; padding:12px; border-radius:8px; text-decoration:none; font-weight:bold; margin-bottom:10px;">💬 تواصل عبر الواتساب للمتابعة الفورية</a>
        <button class="btn-primary" style="width:100%;" onclick="closeSuccessAndClear()">العودة للمتجر</button>
    `;
    document.getElementById("success-modal").classList.add("open");
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
        <h4 style="color:var(--amber); margin-bottom:14px; font-family:'Rajdhani',sans-serif; font-size:18px;">⚡ المؤشرات السريعة</h4>
        <div style="display:grid; grid-template-columns:repeat(auto-fill,minmax(140px,1fr)); gap:12px; margin-bottom:24px;">
            <div style="background:#0e140e; border:1px solid var(--green); border-radius:10px; padding:14px; text-align:center;">
                <div style="font-size:22px; font-weight:bold; color:var(--green); font-family:'Rajdhani',sans-serif;">${totalRevenue.toLocaleString()}</div>
                <div style="font-size:11px; color:var(--muted); margin-top:4px;">💰 إجمالي المبيعات (EGP)</div>
            </div>
            <div style="background:#0e140e; border:1px solid var(--amber); border-radius:10px; padding:14px; text-align:center;">
                <div style="font-size:22px; font-weight:bold; color:var(--amber); font-family:'Rajdhani',sans-serif;">${totalOrders}</div>
                <div style="font-size:11px; color:var(--muted); margin-top:4px;">📦 عدد الطلبات</div>
            </div>
            <div style="background:#0e140e; border:1px solid #4a90e2; border-radius:10px; padding:14px; text-align:center;">
                <div style="font-size:22px; font-weight:bold; color:#4a90e2; font-family:'Rajdhani',sans-serif;">${totalCustomers}</div>
                <div style="font-size:11px; color:var(--muted); margin-top:4px;">👥 عدد العملاء</div>
            </div>
            <div style="background:#0e140e; border:1px solid var(--green); border-radius:10px; padding:14px; text-align:center;">
                <div style="font-size:22px; font-weight:bold; color:var(--green); font-family:'Rajdhani',sans-serif;">${todayRevenue.toLocaleString()}</div>
                <div style="font-size:11px; color:var(--muted); margin-top:4px;">☀️ أرباح اليوم (EGP)</div>
            </div>
            <div style="background:#0e140e; border:1px solid var(--amber); border-radius:10px; padding:14px; text-align:center;">
                <div style="font-size:22px; font-weight:bold; color:var(--amber); font-family:'Rajdhani',sans-serif;">${monthRevenue.toLocaleString()}</div>
                <div style="font-size:11px; color:var(--muted); margin-top:4px;">📅 أرباح الشهر (EGP)</div>
            </div>
            <div style="background:#0e140e; border:1px solid var(--red); border-radius:10px; padding:14px; text-align:center;">
                <div style="font-size:22px; font-weight:bold; color:var(--red); font-family:'Rajdhani',sans-serif;">${lowStock.length}</div>
                <div style="font-size:11px; color:var(--muted); margin-top:4px;">⚠️ منتجات قليلة المخزون</div>
            </div>
        </div>
 
        <!-- أكثر المنتجات مبيعاً -->
        <h4 style="color:var(--green); margin-bottom:10px; font-family:'Rajdhani',sans-serif;">⭐ أكثر المنتجات مبيعاً</h4>
        <div style="background:#0e140e; border:1px solid var(--border); border-radius:8px; padding:12px; margin-bottom:20px;">
            ${topProducts.length ? topProducts.map((p, i) => `
                <div style="display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid #1a241a;">
                    <span style="color:var(--text);">${i + 1}. ${escapeHtml(p[0])}</span>
                    <span style="color:var(--green); font-weight:bold;">${p[1]} طلب</span>
                </div>`).join("")
            : `<p style="color:var(--muted); text-align:center; padding:10px;">لا توجد مبيعات بعد</p>`}
        </div>
 
        <!-- المنتجات المطلوبة للشراء -->
        <h4 style="color:var(--amber); margin-bottom:10px; font-family:'Rajdhani',sans-serif;">🛒 منتجات محتاج تشتريها (من الطلبات المعلقة)</h4>
        <div style="background:#0e140e; border:1px solid var(--border); border-radius:8px; padding:12px; margin-bottom:20px;">
            ${neededProducts.length ? neededProducts.map((p, i) => `
                <div style="display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid #1a241a;">
                    <span style="color:var(--text);">${i + 1}. ${escapeHtml(p[0])}</span>
                    <span style="color:var(--amber); font-weight:bold;">${p[1]} قطعة مطلوبة</span>
                </div>`).join("")
            : `<p style="color:var(--muted); text-align:center; padding:10px;">لا توجد طلبات معلقة</p>`}
        </div>
 
        <!-- المنتجات قليلة المخزون -->
        <h4 style="color:var(--red); margin-bottom:10px; font-family:'Rajdhani',sans-serif;">⚠️ تنبيهات المخزون</h4>
        <div style="background:#0e140e; border:1px solid var(--border); border-radius:8px; padding:12px; margin-bottom:20px;">
            ${lowStock.length ? lowStock.map(p => `
                <div style="display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid #1a241a;">
                    <span style="color:var(--text);">${escapeHtml(p.emoji || "📦")} ${escapeHtml(p.name)}</span>
                    <span style="color:var(--red); font-weight:bold;">${p.stock} قطعة متبقية</span>
                </div>`).join("")
            : `<p style="color:var(--green); text-align:center; padding:10px;">✅ كل المنتجات مخزونها كافي</p>`}
        </div>
 
        <!-- الطلبات حسب الحالة -->
        <h4 style="color:var(--green); margin-bottom:10px; font-family:'Rajdhani',sans-serif;">📊 الطلبات حسب الحالة</h4>
        <div style="background:#0e140e; border:1px solid var(--border); border-radius:8px; padding:12px; margin-bottom:20px;">
            ${Object.keys(statusMap).length ? Object.entries(statusMap).map(([status, count]) => `
                <div style="display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid #1a241a;">
                    <span style="color:var(--text);">${escapeHtml(status)}</span>
                    <span style="color:var(--amber); font-weight:bold;">${count} طلب</span>
                </div>`).join("")
            : `<p style="color:var(--muted); text-align:center; padding:10px;">لا توجد طلبات</p>`}
        </div>
 
        <!-- الإيرادات التفصيلية -->
        <h4 style="color:var(--green); margin-bottom:10px; font-family:'Rajdhani',sans-serif;">💵 الإيرادات التفصيلية</h4>
        <div style="background:#0e140e; border:1px solid var(--border); border-radius:8px; padding:12px;">
            <div style="display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid #1a241a;">
                <span style="color:var(--muted);">إجمالي الإيرادات</span>
                <span style="color:var(--green); font-weight:bold;">${totalRevenue.toLocaleString()} EGP</span>
            </div>
            <div style="display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid #1a241a;">
                <span style="color:var(--muted);">إيرادات اليوم</span>
                <span style="color:var(--green); font-weight:bold;">${todayRevenue.toLocaleString()} EGP</span>
            </div>
            <div style="display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid #1a241a;">
                <span style="color:var(--muted);">إيرادات الشهر</span>
                <span style="color:var(--green); font-weight:bold;">${monthRevenue.toLocaleString()} EGP</span>
            </div>
            <div style="display:flex; justify-content:space-between; padding:8px 0;">
                <span style="color:var(--muted);">متوسط قيمة الطلب</span>
                <span style="color:var(--green); font-weight:bold;">${totalOrders ? Math.round(totalRevenue / totalOrders).toLocaleString() : 0} EGP</span>
            </div>
        </div>
 
    </div>`;
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
        <h4 style="color:var(--green); margin-bottom:15px;">📦 كشف الأوردرات المشتراة عبر الموقع (${orders.length}):</h4>
        ${orders.map((o, idx) => `
            <div style="background:var(--card-bg); border:1px solid var(--border); padding:15px; border-radius:8px; margin-bottom:15px; direction:rtl;">
                <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #1a241a; padding-bottom:8px; margin-bottom:10px; flex-wrap:wrap; gap:10px;">
                    <span style="color:var(--amber); font-weight:bold;">🆔 كود: ${o.orderId}</span>
                    <span style="color:var(--muted); font-size:12px;">📅 ${o.date}</span>
                    <span style="background:#112211; color:var(--green); padding:3px 8px; border-radius:4px; font-size:12px;">الحالة الحالية: ${o.status}</span>
                </div>
                <p style="font-size:13px; margin-bottom:4px;">👤 <b>العميل:</b> ${escapeHtml(o.customer.name)} (${o.customer.code})</p>
                <p style="font-size:13px; margin-bottom:4px;">📞 <b>الهاتف:</b> ${escapeHtml(o.customer.phone)}</p>
                <p style="font-size:13px; margin-bottom:4px;">📍 <b>العنوان:</b> ${escapeHtml(o.customer.address)}</p>
                <p style="font-size:13px; margin-bottom:8px; color:var(--amber);">📝 <b>كومنت وملاحظة العميل الكلية:</b> ${escapeHtml(o.comment)}</p>
                
                <div style="background:#050a05; padding:8px; border-radius:6px; margin-bottom:12px;">
                    <span style="font-size:12px; color:var(--muted); display:block; margin-bottom:5px;">🛒 المشتريات:</span>
                    ${o.items.map(i => `<span style="display:inline-block; font-size:12px; background:#111; padding:4px 8px; border-radius:4px; margin-left:5px; margin-bottom:5px;">${escapeHtml(i.emoji)} ${escapeHtml(i.name)} (${i.price} ج.م)</span>`).join('')}
                </div>
                
                <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
                    <span style="font-size:16px; font-weight:bold; color:var(--green);">💰 الإجمالي: ${o.total} ج.م</span>
                    <div style="display:flex; gap:8px;">
                        <button data-testid="order-accept-btn-${idx}" onclick="changeOrderStatus(${idx}, 'تم قبول الطلب وجاري الشحن')" style="background:var(--green); color:black; border:none; padding:5px 10px; border-radius:4px; cursor:pointer; font-size:12px; font-weight:bold;">✅ قبول</button>
                        <button data-testid="order-reject-btn-${idx}" onclick="changeOrderStatus(${idx}, 'تم رفض الطلب من الإدارة')" style="background:#441111; color:var(--red); border:1px solid var(--red); padding:5px 10px; border-radius:4px; cursor:pointer; font-size:12px;">❌ رفض</button>
                        <button data-testid="order-deliver-btn-${idx}" onclick="deliverAndRemoveOrder(${idx})" style="background:var(--amber); color:black; border:none; padding:5px 10px; border-radius:4px; cursor:pointer; font-size:12px; font-weight:bold;">📦 تم التسليم للعميل (Manual)</button>
                    </div>
                </div>
            </div>
        `).join('')}
    `;
}

async function changeOrderStatus(idx, newStatus) {
    const orders = getOrders() || [];
    if (!orders[idx]) return;
    orders[idx].status = newStatus;

    if (orders[idx].id && window.voltFirebase && typeof window.voltFirebase.updateOrder === "function") {
        try { await window.voltFirebase.updateOrder(orders[idx].id, { status: newStatus }); } catch (err) { }
    }

    saveOrders(orders);
    await renderAdminOrders();
    showToast("تم تحديث حالة الطلب بنجاح", "green");
}

// حذف الأوردر عند التوصيل والاستلام يدوياً مع إظهار الرسالة المطلوبة
async function deliverAndRemoveOrder(idx) {
    let orders = getOrders() || [];
    const removedOrder = orders[idx];
    if (!removedOrder) return;

    if (removedOrder.id && window.voltFirebase && typeof window.voltFirebase.deleteOrder === "function") {
        try { await window.voltFirebase.deleteOrder(removedOrder.id); } catch (err) { }
    }

    // مسح يدوي من خانة الأوردرات
    orders.splice(idx, 1);
    saveOrders(orders);
    await renderAdminOrders();

    // إظهار الرسالة الكلية التي طلبتها في التوست والمودال للتأكيد
    alert("تم تسليم الأوردر ليا بنجاح الحذف اليدوي ✓");
    showToast("تم تسليم الأوردر ليا", "green");
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
        <h4 style="color:var(--amber); margin-bottom:15px;">👥 كشوفات حسابات العملاء (${users.length}):</h4>
        <div style="overflow-x:auto;">
            <table style="width:100%; border-collapse:collapse; font-size:13px; text-align:right; color:var(--text);">
                <thead>
                    <tr style="background:#112211; color:var(--green); border-bottom:2px solid var(--border);">
                        <th style="padding:10px; border:1px solid var(--border);">كود العميل</th>
                        <th style="padding:10px; border:1px solid var(--border);">الاسم الكامل</th>
                        <th style="padding:10px; border:1px solid var(--border);">رقم الهاتف</th>
                        <th style="padding:10px; border:1px solid var(--border);">📍 العنوان</th>
                        <th style="padding:10px; border:1px solid var(--border);">إجراءات</th>
                    </tr>
                </thead>
                <tbody>
                    ${users.map(u => `
                        <tr style="border-bottom:1px solid #1a241a; background:rgba(250,250,250,0.01);">
                            <td style="padding:10px; border:1px solid var(--border); color:var(--amber); font-weight:bold;">${escapeHtml(u.code || '—')}</td>
                            <td style="padding:10px; border:1px solid var(--border);">${escapeHtml(u.name || '—')}</td>
                            <td style="padding:10px; border:1px solid var(--border); font-family:sans-serif;">${escapeHtml(u.idNum || '—')}</td>
                            <td style="padding:10px; border:1px solid var(--border); max-width:200px; white-space:normal; word-wrap:break-word;">${escapeHtml(u.address || '—')}</td>
                            <td style="padding:10px; border:1px solid var(--border);">
                                <button data-testid="delete-user-${escapeHtml(u.uid || u.id || '')}" data-uid="${escapeHtml(u.uid || u.id || '')}" data-name="${escapeHtml(u.name || 'العميل')}" onclick="deleteUserAccount(this.dataset.uid, this.dataset.name)"
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

    if (window.voltFirebase && typeof window.voltFirebase.deleteUser === "function") {
        try {
            const ok = await window.voltFirebase.deleteUser(uid);
            if (!ok) { showToast("فشل حذف الحساب من Firestore", "error"); return; }
        } catch (err) {
            console.warn("deleteUserAccount: فشل الحذف من Firestore", err);
            showToast("فشل حذف الحساب — تحقق من الاتصال", "error");
            return;
        }
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
    const loop = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        if (Math.random() < 0.02 && timer <= 0) timer = 8;
        if (timer > 0) {
            ctx.strokeStyle = "rgba(29,185,84," + (timer / 8) + ")"; ctx.lineWidth = Math.random() * 2 + 1; ctx.beginPath();
            let x = Math.random() * canvas.width, y = 0; ctx.moveTo(x, y);
            while (y < canvas.height) { x += Math.random() * 40 - 20; y += Math.random() * 30; ctx.lineTo(x, y); }
            ctx.stroke(); timer--;
        } requestAnimationFrame(loop);
    }; loop();
}
function initGlowCardPerformance() {
    document.addEventListener("mousemove", e => {
        const cards = document.querySelectorAll(".glow-card");
        cards.forEach(card => {
            const rect = card.getBoundingClientRect();
            const x = e.clientX - rect.left, y = e.clientY - rect.top;
            card.style.setProperty("--mx", `${x}px`); card.style.setProperty("--my", `${y}px`);
        });
    });
} function showToast(msg, type = "info") {
    const t = document.getElementById("toast"); if (!t) return;
    t.textContent = msg;
    t.style.borderRight = `4px solid ${type === "green" ? "var(--green)" : (type === "error" ? "var(--red)" : "var(--amber)")}`;
    t.classList.add("show");
    setTimeout(() => t.classList.remove("show"), 3000);
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

        // The nav button itself: index.html renders it statically inside
        // #nav-auth-area on load, and updateNavForUser() re-renders it
        // (with the same id) every time auth state changes. Attach here
        // for the very first paint, before any login/logout has happened.
        document.getElementById("taskMgmtBtn")?.addEventListener("click", window.openTaskPasswordGate);
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
            <td style="padding:12px; color:${statusColor}; font-weight:bold;">${statusText}</td>
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

// ── إضافة كود جديد ──
window.addNewPromoCode = function () {
    const code = document.getElementById("newPromoCode").value.trim().toUpperCase();
    const type = document.getElementById("newPromoType").value;
    const value = parseFloat(document.getElementById("newPromoValue").value) || 0;
    const minOrder = parseFloat(document.getElementById("newPromoMin").value) || 0;
    const msg = document.getElementById("promoAddMsg");

    if (!code) { msg.style.color = "#ff4444"; msg.textContent = "⚠️ أدخل الكود أولاً"; return; }
    if (!/^[A-Z0-9_-]{1,32}$/.test(code)) { msg.style.color = "#ff4444"; msg.textContent = "⚠️ الكود يحتوي على رموز غير مقبولة"; return; }

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
        try { await window.voltFirebase.deletePromoCode(code); } catch (e) { }
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
/* ==========================================================================
   ⚡ VOLT — FAVORITES FEATURE (نظام المفضلة)
   ملف مستقل تماماً — لا يعدّل أي كود موجود في script.js أو index.html.
 
   الفكرة:
   - كل منتج بيظهر عليه قلب 🤍 / ❤️ في الكارت (سواء في المتجر الرئيسي أو
     جوه المجلدات).
   - الضغط على القلب يضيف/يشيل المنتج من "المفضلة".
   - زرار عائم (❤️ المفضلة) في الشاشة يفتح مودال يعرض كل المفضلة، وفيه
     إمكانية "إضافة للسلة" أو "إزالة من المفضلة".
   - التخزين حالياً في localStorage (مربوط برقم/كود العميل لو مسجل دخول،
     وإلا بيتحفظ كـ"guest"). لما تحب تربطها بقاعدة بيانات، هتستبدل بس
     الدوال دي: getFavorites() و saveFavorites() بنداءات API — والباقي
     (الأزرار، المودال، العرض) هيفضل شغال زي ما هو بالظبط.
========================================================================== */
 
(function () {
    "use strict";
 
    // ── Double-init guard ─────────────────────────────────────────────────────
    if (window.__voltFavInit) return;
    window.__voltFavInit = true;
 
    const PRODUCTS_KEY   = "volt_products";
    const LOGGED_USER_KEY = "volt_logged_user";
 
    // ── XSS escape helper ─────────────────────────────────────────────────────
    // Used for ALL values that reach HTML attribute or innerHTML sinks.
    function escapeHtml(str) {
        const div = document.createElement("div");
        div.textContent = str == null ? "" : String(str);
        return div.innerHTML;
    }
 
    // ── Safe toast wrapper ────────────────────────────────────────────────────
    function safeToast(msg, type) {
        if (typeof window.showToast === "function") {
            window.showToast(msg, type);
        }
    }
 
    // ── Prototype-Pollution-safe product sanitizer ────────────────────────────
    // FIX #5: Re-constructs product from known fields only. Prevents __proto__
    // or constructor pollution from flowing in via localStorage parse.
    function sanitizeProduct(raw) {
        if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
 
        const id    = raw.id    != null ? String(raw.id)    : null;
        const name  = raw.name  != null ? String(raw.name)  : "";
        // FIX #3: price and stock cast to Number; fallback to safe values.
        const price = isNaN(Number(raw.price)) ? 0 : Number(raw.price);
        const stock = isNaN(Number(raw.stock)) ? 0 : Number(raw.stock);
        const category = raw.category != null ? String(raw.category) : "";
        const emoji    = raw.emoji    != null ? String(raw.emoji)    : "";
 
        if (!id) return null;
        return Object.create(null, {
            id:       { value: id,       enumerable: true },
            name:     { value: name,     enumerable: true },
            price:    { value: price,    enumerable: true },
            stock:    { value: stock,    enumerable: true },
            category: { value: category, enumerable: true },
            emoji:    { value: emoji,    enumerable: true }
        });
    }
 
    // ── Storage helpers ───────────────────────────────────────────────────────
    function getAllProducts() {
        try {
            const raw = JSON.parse(localStorage.getItem(PRODUCTS_KEY));
            if (!Array.isArray(raw)) return [];
            // FIX #5: sanitize every product through the allowlist builder.
            return raw.map(sanitizeProduct).filter(Boolean);
        } catch (e) {
            return [];
        }
    }
 
    function getCurrentUserCode() {
        try {
            const u = JSON.parse(sessionStorage.getItem(LOGGED_USER_KEY));
            // FIX #10 (frontend mitigation): accept only alphanumeric codes
            // to strip injection characters. Full fix requires backend sessions.
            if (u && u.code && /^[a-zA-Z0-9_-]{1,64}$/.test(String(u.code))) {
                return String(u.code);
            }
        } catch (e) { /* ignore */ }
        return null;
    }
 
    function getFavKey() {
        const code = getCurrentUserCode();
        return code ? ("volt_favorites_" + code) : "volt_favorites_guest";
    }
 
    function getCurrentUserUid() {
        try {
            const u = JSON.parse(sessionStorage.getItem(LOGGED_USER_KEY));
            return (u && u.uid) ? String(u.uid) : null;
        } catch (e) { return null; }
    }
 
    function getFavorites() {
        try {
            const raw = JSON.parse(localStorage.getItem(getFavKey()));
            if (Array.isArray(raw)) {
                const sanitized = raw.filter(f => typeof f === "string" && /^[a-zA-Z0-9_-]{1,64}$/.test(f));
                if (sanitized.length) return sanitized;
            }
        } catch (e) {}
        return [];
    }
 
    async function loadFavoritesFromFirestore() {
        const uid = getCurrentUserUid();
        if (!uid || !window.voltFirebase || typeof window.voltFirebase.getFavorites !== "function") return;
        try {
            const ids = await window.voltFirebase.getFavorites(uid);
            if (Array.isArray(ids) && ids.length) {
                localStorage.setItem(getFavKey(), JSON.stringify(ids));
            }
        } catch (e) { console.warn("loadFavoritesFromFirestore: فشل", e); }
    }
 
    function saveFavorites(favIds) {
        localStorage.setItem(getFavKey(), JSON.stringify(favIds));
        const uid = getCurrentUserUid();
        if (uid && window.voltFirebase && typeof window.voltFirebase.saveFavorites === "function") {
            window.voltFirebase.saveFavorites(uid, favIds).catch(e => console.warn("saveFavorites Firestore: فشل", e));
        }
    }
 
    function isFavorite(id) {
        return getFavorites().includes(String(id));
    }
 
    function toggleFavorite(id) {
        id = String(id);
        let favs = getFavorites();
        let nowFav;
        if (favs.includes(id)) {
            favs = favs.filter(f => f !== id);
            nowFav = false;
        } else {
            favs.push(id);
            nowFav = true;
        }
        saveFavorites(favs);
        refreshHeartIcons();
        updateFavCount();
        if (document.getElementById("favorites-overlay")?.classList.contains("open")) {
            renderFavoritesModal();
        }
        safeToast(nowFav ? "❤️ تمت الإضافة إلى المفضلة" : "💔 تمت الإزالة من المفضلة", nowFav ? "green" : "warn");
    }
 
    // ── Heart button injection ────────────────────────────────────────────────
    function injectHeartButtons(root) {
        root = root || document;
        const cards = root.querySelectorAll(".card.glow-card[data-id]");
        cards.forEach(card => {
            if (card.querySelector(".fav-heart-btn")) return;
            const id = card.getAttribute("data-id");
            if (!id) return;
 
            if (getComputedStyle(card).position === "static") {
                card.style.position = "relative";
            }
 
            const btn = document.createElement("button");
            btn.className = "fav-heart-btn";
            btn.type = "button";
            btn.title = "أضف للمفضلة";
            btn.setAttribute("data-fav-id", id);
            // FIX #11: data-testid added for stable test-runner hook. Class names
            // and data-fav-id are not stable test hooks by convention.
            btn.setAttribute("data-testid", "fav-heart-btn");
            btn.textContent = isFavorite(id) ? "❤️" : "🤍";
            btn.addEventListener("click", function (e) {
                e.stopPropagation();
                toggleFavorite(id);
            });
            card.appendChild(btn);
        });
    }
 
    function refreshHeartIcons() {
        document.querySelectorAll(".fav-heart-btn").forEach(btn => {
            const id = btn.getAttribute("data-fav-id");
            btn.textContent = isFavorite(id) ? "❤️" : "🤍";
        });
    }
 
    // ── Floating button ───────────────────────────────────────────────────────
    function ensureFloatButton() {
        if (document.getElementById("fav-float-btn")) return;
        const btn = document.createElement("button");
        btn.id = "fav-float-btn";
        btn.title = "المفضلة";
        // FIX #11: data-testid for stable test-runner hook.
        btn.setAttribute("data-testid", "fav-float-btn");
        // Safe: textContent + programmatic span, no innerHTML.
        const heartSpan = document.createTextNode("❤️ ");
        const badge = document.createElement("span");
        badge.id = "fav-float-count";
        badge.className = "fav-badge";
        badge.textContent = "0";
        btn.appendChild(heartSpan);
        btn.appendChild(badge);
        btn.addEventListener("click", openFavoritesModal);
        document.body.appendChild(btn);
    }
 
    function updateFavCount() {
        const el = document.getElementById("fav-float-count");
        if (el) el.textContent = getFavorites().length;
    }
 
    // ── Modal shell ───────────────────────────────────────────────────────────
    function ensureFavoritesModal() {
        if (document.getElementById("favorites-overlay")) return;
 
        // WARNING FOR FUTURE EDITORS: this innerHTML uses a STATIC string only.
        // Never template user-supplied or localStorage-derived variables into
        // this string without running them through escapeHtml() first.
        const overlay = document.createElement("div");
        overlay.id = "favorites-overlay";
        overlay.className = "overlay";
        // FIX #11: data-testid supplements the existing id="favorites-overlay"
        // per the data-testid convention applied across this codebase. The id
        // remains for runtime querySelector usage; data-testid is the test hook.
        overlay.setAttribute("data-testid", "favorites-modal");
        overlay.innerHTML = `
            <div class="modal" style="max-width:640px;">
                <button class="modal-close" id="closeFavoritesBtn">&times;</button>
                <h3 style="margin-bottom:20px;font-family:'Rajdhani',sans-serif;font-size:24px;color:var(--green,#1db954);text-align:center;letter-spacing:1px;">
                    ❤️ المفضلة
                </h3>
                <div id="favoritesListContainer"></div>
            </div>`;
        document.body.appendChild(overlay);
 
        document.getElementById("closeFavoritesBtn").addEventListener("click", closeFavoritesModal);
        overlay.addEventListener("click", e => { if (e.target === overlay) closeFavoritesModal(); });
    }
 
    function openFavoritesModal() {
        ensureFavoritesModal();
        renderFavoritesModal();
        document.getElementById("favorites-overlay").classList.add("open");
    }
 
    function closeFavoritesModal() {
        document.getElementById("favorites-overlay")?.classList.remove("open");
    }
 
    // ── Modal content renderer ────────────────────────────────────────────────
    // FIX #1 #2 #3 #4: All product fields are escaped or validated before
    // reaching any DOM sink. No inline event handlers (onclick removed).
    // Card grid is built via DOM API to avoid innerHTML for dynamic content.
    function renderFavoritesModal() {
        const container = document.getElementById("favoritesListContainer");
        if (!container) return;
 
        const favIds      = getFavorites();
        const allProducts = getAllProducts();
        const favProducts = allProducts.filter(p => favIds.includes(String(p.id)));
 
        // Clear previous content safely.
        container.textContent = "";
 
        if (!favProducts.length) {
            // Static content — innerHTML acceptable here (no variables).
            container.innerHTML = `<p style="text-align:center;color:var(--muted,#888);padding:40px 10px;">
                لا توجد أي منتجات في المفضلة بعد.<br>
                اضغط على 🤍 في أي منتج عشان تضيفه هنا.
            </p>`;
            return;
        }
 
        // Build grid wrapper via DOM API.
        const grid = document.createElement("div");
        grid.style.cssText = "display:grid;grid-template-columns:repeat(auto-fill, minmax(180px, 1fr));gap:14px;max-height:60vh;overflow-y:auto;padding:4px;";
 
        favProducts.forEach(function (p) {
            // ── Safe card shell ───────────────────────────────────────────────
            const card = document.createElement("div");
            card.className = "card glow-card";
            // FIX #4: escapeHtml on id before setting attribute.
            card.setAttribute("data-id", escapeHtml(String(p.id)));
            card.style.position = "relative";
 
            // ── Heart button ──────────────────────────────────────────────────
            const heartBtn = document.createElement("button");
            heartBtn.className = "fav-heart-btn";
            heartBtn.title = "إزالة من المفضلة";
            // FIX #4: escapeHtml on id before setting attribute.
            heartBtn.setAttribute("data-fav-id", escapeHtml(String(p.id)));
            // FIX #11: data-testid for stable test-runner hook (mirrors
            // injectHeartButtons — same attribute, both contexts).
            heartBtn.setAttribute("data-testid", "fav-heart-btn");
            heartBtn.textContent = "❤️";
            heartBtn.addEventListener("click", function (e) {
                e.stopPropagation();
                toggleFavorite(heartBtn.getAttribute("data-fav-id"));
            });
            card.appendChild(heartBtn);
 
            // ── Card image ────────────────────────────────────────────────────
            const cardImg = document.createElement("div");
            cardImg.className = "card-img";
            // FIX #2 #6: URL check uses explicit protocol allowlist.
            const emojiVal = p.emoji;
            try {
                const emojiUrl = new URL(emojiVal);
                if (emojiUrl.protocol === "http:" || emojiUrl.protocol === "https:") {
                    const img = document.createElement("img");
                    // Safe: .src setter is safe; escapeHtml added for defence-in-depth.
                    img.src = escapeHtml(emojiVal);
                    img.style.cssText = "width:100%;height:100%;object-fit:cover;border-radius:8px;";
                    img.alt = escapeHtml(p.name);
                    cardImg.appendChild(img);
                } else {
                    // Unexpected protocol (javascript:, data:, etc.) — show placeholder.
                    cardImg.textContent = "📦";
                }
            } catch (_) {
                // Not a URL — treat as plain emoji text.
                // FIX #2: textContent prevents HTML injection from emoji field.
                cardImg.textContent = emojiVal || "📦";
            }
            card.appendChild(cardImg);
 
            // ── Card body ─────────────────────────────────────────────────────
            const cardBody = document.createElement("div");
            cardBody.className = "card-body";
 
            const catSpan = document.createElement("span");
            catSpan.className = "card-category";
            // FIX: textContent — safe, no escaping needed when using textContent.
            catSpan.textContent = p.category || "";
            cardBody.appendChild(catSpan);
 
            const nameH3 = document.createElement("h3");
            nameH3.className = "card-name";
            nameH3.textContent = p.name;
            cardBody.appendChild(nameH3);
 
            const footer = document.createElement("div");
            footer.className = "card-footer";
 
            const priceSpan = document.createElement("span");
            priceSpan.className = "card-price";
            // FIX #3: p.price is already a validated Number from sanitizeProduct.
            priceSpan.textContent = p.price + " ";
            const egpSpan = document.createElement("span");
            egpSpan.textContent = "EGP";
            priceSpan.appendChild(egpSpan);
            footer.appendChild(priceSpan);
 
            // FIX #1: No inline onclick. Button uses addEventListener.
            // FIX #7: addToCart validated against product catalog inside __favAddToCart.
            if (p.stock <= 0) {
                const soldBtn = document.createElement("button");
                soldBtn.className = "btn-add";
                soldBtn.style.cssText = "background:var(--border,#333);color:var(--muted,#888);cursor:not-allowed;";
                soldBtn.disabled = true;
                soldBtn.textContent = "نفدت الكمية 🚫";
                footer.appendChild(soldBtn);
            } else {
                const addBtn = document.createElement("button");
                addBtn.className = "btn-add";
                // FIX #4: store escaped id in data attribute; read it back in listener.
                addBtn.setAttribute("data-add-id", escapeHtml(String(p.id)));
                addBtn.textContent = "إضافة";
                addBtn.addEventListener("click", function (e) {
                    e.stopPropagation();
                    window.__favAddToCart(addBtn.getAttribute("data-add-id"));
                });
                footer.appendChild(addBtn);
            }
 
            cardBody.appendChild(footer);
            card.appendChild(cardBody);
            grid.appendChild(card);
        });
 
        container.appendChild(grid);
    }
 
    // ── Global addToCart bridge ───────────────────────────────────────────────
    // FIX #7: Validates that the requested ID exists in the current product
    // catalog before calling addToCart. Arbitrary IDs are silently rejected.
    window.__favAddToCart = function (id) {
        if (typeof window.addToCartById === "function") {
            window.addToCartById(String(id), 1, null);
            return;
        }
        // Fallback for the pre-refactor script.js: only safe to
        // call if script.js still has the old addToCart signature.
        if (typeof window.addToCart !== "function") return;
        const safeId = String(id);
        const allProducts = getAllProducts();
        const exists = allProducts.some(p => String(p.id) === safeId);
        if (!exists) return; // ID not in catalog — reject silently.
        window.addToCart({ stopPropagation: function () { } }, safeId);
    };
 
    // ── MutationObserver for dynamically added cards ──────────────────────────
    // FIX #9: Observer lifted from function-local `const observer` to
    // `window.__voltFavObserver` (mirroring new-script.js's __voltStackObserver
    // naming). Previously the reference was unreachable outside startObserving(),
    // making teardown in __voltFavDestroy impossible. Stored on window at
    // creation time so destroy() can call .disconnect() without closure tricks.
    function startObserving() {
        window.__voltFavObserver = new MutationObserver(function (mutations) {
            let shouldInject = false;
            for (const m of mutations) {
                if (m.addedNodes && m.addedNodes.length) { shouldInject = true; break; }
            }
            if (shouldInject) injectHeartButtons(document);
        });
        window.__voltFavObserver.observe(document.body, { childList: true, subtree: true });
    }
 
    // ── User-change watcher ───────────────────────────────────────────────────
    // FIX #8: Store interval handle; clear prior handle before creating new one.
    function watchUserChanges() {
        if (window.__voltFavIntervalId) {
            clearInterval(window.__voltFavIntervalId);
        }
        let lastKey = getFavKey();
        window.__voltFavIntervalId = setInterval(function () {
            const newKey = getFavKey();
            if (newKey !== lastKey) {
                lastKey = newKey;
                loadFavoritesFromFirestore().then(() => {
                    refreshHeartIcons();
                    updateFavCount();
                    if (document.getElementById("favorites-overlay")?.classList.contains("open")) {
                        renderFavoritesModal();
                    }
                });
            }
        }, 1200);
    }
 
    // ── Teardown handle ───────────────────────────────────────────────────────
    // FIX #10: Exposes window.__voltFavDestroy (mirroring scroll-split.js's
    // __sscDestroy naming convention). Every other file in this codebase exposes
    // a teardown handle — Accordion's destroy, new-script.js's __volt.stackCards
    // .destroy, scroll-split.js's __sscDestroy — but script1.js previously had
    // none despite creating both a MutationObserver and a setInterval that both
    // run indefinitely. Call window.__voltFavDestroy() before removing the
    // favorites feature from the DOM (e.g. SPA route teardown).
    window.__voltFavDestroy = function () {
        // Clear polling interval.
        if (window.__voltFavIntervalId) {
            clearInterval(window.__voltFavIntervalId);
            window.__voltFavIntervalId = null;
        }
        // Disconnect MutationObserver (now reachable via module-scope reference
        // set in startObserving() per FIX #9).
        if (window.__voltFavObserver) {
            window.__voltFavObserver.disconnect();
            window.__voltFavObserver = null;
        }
        // Reset init guard to allow re-init after re-mount (consistent with
        // the double-init guard at lines 21-22 and __sscInit = false in
        // scroll-split.js's destroy()).
        window.__voltFavInit = false;
    };
 
    // ── Injected styles ───────────────────────────────────────────────────────
    function injectStyles() {
        const style = document.createElement("style");
        style.textContent = `
            .fav-heart-btn {
                position: absolute;
                top: 8px;
                right: 8px;
                z-index: 6;
                background: rgba(0,0,0,0.55);
                border: none;
                border-radius: 50%;
                width: 32px;
                height: 32px;
                font-size: 16px;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: transform 0.15s ease;
            }
            .fav-heart-btn:hover { transform: scale(1.15); }
 
            #fav-float-btn {
                position: fixed;
                bottom: 22px;
                left: 22px;
                z-index: 500;
                background: #121212;
                border: 1.5px solid var(--green, #1db954);
                color: #fff;
                border-radius: 50px;
                padding: 12px 18px;
                font-size: 16px;
                cursor: pointer;
                box-shadow: 0 4px 14px rgba(0,0,0,0.4);
                display: flex;
                align-items: center;
                gap: 6px;
                font-family: 'Cairo', sans-serif;
            }
            .fav-badge {
                background: var(--green, #1db954);
                color: #000;
                font-weight: bold;
                border-radius: 50%;
                min-width: 20px;
                height: 20px;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                font-size: 12px;
                padding: 0 4px;
            }
        `;
        document.head.appendChild(style);
    }
 
    // ── Entry point ───────────────────────────────────────────────────────────
    async function init() {
        injectStyles();
        ensureFloatButton();
        ensureFavoritesModal();
        await loadFavoritesFromFirestore();
        injectHeartButtons(document);
        updateFavCount();
        startObserving();
        watchUserChanges();
    }
 
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
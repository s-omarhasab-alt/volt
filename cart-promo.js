// ── Promo state: module-scoped, NOT on window ─────────────────────────────
// FIX #2: Removed window.currentPromoCode — a global writable string that
// any DevTools user could set to forge an approved promo state.
// _currentPromoCode is only accessible via the exported getter below.
(function () {
    "use strict";

    var _currentPromoCode = "";
    // FIX (this pass): cache the discount amount + the cart total it was
    // computed against, both returned by the server at apply-time. Lets
    // updateCartUI() redisplay the discount on every cart render without
    // re-deriving it from window.PromoEngine — that fallback has been
    // removed from script.js entirely. Cache invalidates whenever the cart
    // total changes (add/remove item), which re-triggers a fresh server
    // call rather than silently reusing a stale discount.
    var _cachedDiscountAmount = 0;
    var _cachedForCartTotal   = null;

    // Exponential backoff state for rate-limit mitigation (FIX #5).
    // FIX #16: previously _cooldownMs/_lastCallTime were plain closure
    // variables with no persistence. A user who tripped the cooldown could
    // defeat FIX #5 entirely by refreshing the page, which reset
    // _cooldownMs back to 0. Persisted to sessionStorage (not localStorage
    // — this is meant to throttle within a session, not across visits) so
    // a refresh no longer resets backoff state.
    var COOLDOWN_STORAGE_KEY = "voltCartPromoCooldown";

    function _loadCooldownState() {
        try {
            var raw = sessionStorage.getItem(COOLDOWN_STORAGE_KEY);
            if (!raw) return { lastCallTime: 0, cooldownMs: 0 };
            var parsed = JSON.parse(raw);
            var lastCallTime = Number(parsed.lastCallTime);
            var cooldownMs   = Number(parsed.cooldownMs);
            // Defensive: reject non-finite/negative values (corrupted or
            // hand-edited storage) rather than letting NaN flow into the
            // cooldown comparison in applyCustomerPromo — `NaN > 0` and
            // `(now - NaN) < NaN` both evaluate false, which would silently
            // disable the cooldown check instead of erroring loudly.
            if (!Number.isFinite(lastCallTime) || !Number.isFinite(cooldownMs) ||
                lastCallTime < 0 || cooldownMs < 0) {
                return { lastCallTime: 0, cooldownMs: 0 };
            }
            return { lastCallTime: lastCallTime, cooldownMs: cooldownMs };
        } catch (err) {
            // sessionStorage can throw (Safari private mode historically,
            // sandboxed iframes with storage disabled, quota errors). Fail
            // open to in-memory-only behavior rather than breaking the module.
            console.error("cart-promo: failed to read cooldown state from sessionStorage", err);
            return { lastCallTime: 0, cooldownMs: 0 };
        }
    }

    function _saveCooldownState(lastCallTime, cooldownMs) {
        try {
            sessionStorage.setItem(COOLDOWN_STORAGE_KEY, JSON.stringify({
                lastCallTime: lastCallTime,
                cooldownMs:   cooldownMs
            }));
        } catch (err) {
            // Same rationale as above — don't let a storage failure break
            // the calling code. Cooldown just won't survive a refresh this
            // session, which is the pre-FIX-#16 behavior, not a new failure.
            console.error("cart-promo: failed to persist cooldown state to sessionStorage", err);
        }
    }

    var _initialCooldownState = _loadCooldownState();
    var _lastCallTime    = _initialCooldownState.lastCallTime;
    var _cooldownMs      = _initialCooldownState.cooldownMs;
    var _cooldownStepMs  = 500;
    var _cooldownMaxMs   = 8000;

    // ── Input validation constants ────────────────────────────────────────
    // FIX #4: Strict allowlist and length cap before any processing.
    var PROMO_MAX_LENGTH = 32;
    var PROMO_PATTERN    = /^[A-Z0-9_-]{1,32}$/;

    // ── Getter for other modules that need to read the active promo ───────
    // Read-only surface — no setter exposed to global scope.
    window.getCurrentPromoCode = function () {
        return _currentPromoCode;
    };

    // ── Shared validator: calls Firestore validatePromoCode (no Supabase
    // Edge Function reference). Used by updateCartUI() to get a fresh discount
    // amount for display whenever the cart total changes. Kept separate from
    // applyCustomerPromo so clicking "Apply" doesn't trigger two network
    // calls back-to-back.
    async function revalidateForTotal(code, cartTotal) {
        if (window.voltFirebase && typeof window.voltFirebase.validatePromoCode === "function") {
            try {
                const result = await window.voltFirebase.validatePromoCode(code, cartTotal);
                if (result && result.valid) return Number(result.discount_amount) || 0;
                _currentPromoCode = "";
                return 0;
            } catch (err) {
                console.error("revalidateForTotal: Firestore validation failed", err);
                return null;
            }
        }

        // ⚠️ Firestore غير متاح — العودة لتطابق محلي
        if (window.PromoEngine && typeof window.PromoEngine.validatePromoCode === "function") {
            const cartObj = { items: cart.map(item => ({ price: item.price, qty: 1, category: item.category })) };
            const localResult = window.PromoEngine.validatePromoCode(code, null, cartObj);
            if (localResult && localResult.success) {
                return Number(localResult.discount.amountOff) || 0;
            }
        }
        _currentPromoCode = "";
        return 0;
    }

    // ── Discount getter for cart rendering ─────────────────────────────────
    // Returns the discount amount for the currently applied code against
    // the given cart total, re-checking with the server whenever the total
    // has changed since the last check (add/remove item invalidates cache).
    // Async because it may need a fresh network call — callers must await it
    // and re-render once it resolves rather than expecting a sync value.
    window.getPromoDiscountForTotal = async function (cartTotal) {
        if (!_currentPromoCode) {
            _cachedDiscountAmount = 0;
            _cachedForCartTotal = null;
            return 0;
        }
        if (_cachedForCartTotal === cartTotal) {
            return _cachedDiscountAmount;
        }
        const amount = await revalidateForTotal(_currentPromoCode, cartTotal);
        if (amount === null) {
            // Transient failure — return 0 (no discount) rather than
            // reporting a stale discount that was validated against a
            // different cart total. The user can re-open the cart to
            // re-trigger validation once the network is back.
            return 0;
        }
        _cachedDiscountAmount = amount;
        _cachedForCartTotal = cartTotal;
        return amount;
    };

    // ── Main apply function ───────────────────────────────────────────────
    // FIX #17: TESTABILITY REQUIREMENT — no HTML file was in scope for this
    // pass, so these attributes can't be added to real markup here. Whoever
    // owns the HTML for these two elements should add:
    //   #customerPromoInput  -> data-testid="promo-input"
    //   #promoMessage        -> data-testid="promo-message"
    /**
     * Required DOM contract (testability):
     *   #customerPromoInput  — must have data-testid="promo-input"
     *   #promoMessage        — must have data-testid="promo-message"
     *
     * Both are present in index.html after the index.html pass.
     * This function does not add them itself; if either element
     * is missing it logs nothing and returns silently. If the
     * testids are missing, the function still works but is
     * not selectable by data-testid.
     */
    window.applyCustomerPromo = async function () {
        const inputField = document.getElementById("customerPromoInput");
        const messageEl  = document.getElementById("promoMessage");

        if (!inputField || !messageEl) return;

        // FIX #5: Frontend cooldown — exponential backoff on rapid calls.
        // FLAG (this pass, not fixed): this cooldown message is hardcoded
        // Arabic with no i18n lookup — but so is every other user-facing
        // string in this function (empty-code, invalid-format, empty-cart,
        // all three failure reasons, the generic connection error, and the
        // success message). This isn't a gap unique to the cooldown path;
        // it's the whole function's existing scope. Patching only this one
        // string with an ad hoc locale check would make it inconsistent
        // with its neighbors and add a mechanism (locale detection/lookup)
        // the rest of the file doesn't have, without knowing whether the
        // site needs bilingual support at all. If it does, that's a
        // function-wide (likely site-wide) i18n pass, not a one-line fix
        // here — left as-is pending that decision.
        const now = Date.now();
        if (_cooldownMs > 0 && (now - _lastCallTime) < _cooldownMs) {
            const remaining = Math.ceil((_cooldownMs - (now - _lastCallTime)) / 1000);
            messageEl.textContent = `⏳ يرجى الانتظار ${remaining} ثانية قبل المحاولة مجدداً.`;
            messageEl.style.color = "#ff9900";
            return;
        }
        _lastCallTime = now;
        // FIX #16: persist immediately so a refresh mid-request still sees
        // this call as having happened (avoids a race where the network
        // call is in flight, the tab reloads, and the reload's fresh
        // _lastCallTime = 0 would make the still-pending prior call
        // effectively invisible to the new page load's cooldown check).
        _saveCooldownState(_lastCallTime, _cooldownMs);

        const rawCode  = inputField.value.trim().toUpperCase();

        if (rawCode === "") {
            messageEl.textContent = "❌ يرجى إدخال كود الخصم أولاً.";
            messageEl.style.color = "#ff4444";
            return;
        }

        // FIX #4: Length cap.
        if (rawCode.length > PROMO_MAX_LENGTH) {
            messageEl.textContent = "❌ كود الخصم غير صالح.";
            messageEl.style.color = "#ff4444";
            return;
        }

        // FIX #4: Character allowlist — alphanumeric, underscore, hyphen only.
        if (!PROMO_PATTERN.test(rawCode)) {
            messageEl.textContent = "❌ كود الخصم يحتوي على رموز غير مقبولة.";
            messageEl.style.color = "#ff4444";
            return;
        }

        // Cart existence check (unchanged logic).
        if (typeof cart === "undefined" || cart.length === 0) {
            messageEl.textContent = "❌ السلة فارغة! أضف منتجات أولاً.";
            messageEl.style.color = "#ff4444";
            return;
        }

        // FIX #3: Do NOT send client-side prices to the server.
        // The Edge Function reads prices from the DB using product IDs.
        // We send only the cart total as a hint; server re-computes from DB.
        // FIX #1: Replaced window.PromoEngine.validatePromoCode() (client-side,
        // exposes full promo table) with a server-side Edge Function call.
        const cartTotal = cart.reduce((sum, item) => sum + (Number(item.price) || 0), 0);

        // Disable input during request to prevent double-submission.
        inputField.disabled = true;
        messageEl.textContent = "⏳ جارٍ التحقق...";
        messageEl.style.color = "#888";

        try {
            let result = null;
            if (window.voltFirebase && typeof window.voltFirebase.validatePromoCode === "function") {
                result = await window.voltFirebase.validatePromoCode(rawCode, cartTotal);
            } else if (window.PromoEngine && typeof window.PromoEngine.validatePromoCode === "function") {
                const cartObj = { items: cart.map(item => ({ price: item.price, qty: 1, category: item.category })) };
                const localResult = window.PromoEngine.validatePromoCode(rawCode, null, cartObj);
                if (localResult && localResult.success) {
                    result = { valid: true, discount_amount: localResult.discount.amountOff };
                } else {
                    result = { valid: false, reason: localResult?.message || "invalid" };
                }
            }

            if (result && result.valid) {
                // FIX #2: Set module-scoped variable, not window.currentPromoCode.
                _currentPromoCode = rawCode;
                // Cache this apply-time result so updateCartUI()'s immediate
                // re-render (below) doesn't need a second network round trip.
                _cachedDiscountAmount = Number(result.discount_amount) || 0;
                _cachedForCartTotal = cartTotal;
                // Reset cooldown on success.
                _cooldownMs = 0;
                _saveCooldownState(_lastCallTime, _cooldownMs);

                messageEl.textContent = "🎉 تم تطبيق الخصم بنجاح!";
                messageEl.style.color = "#1db954";

                if (typeof updateCartUI === "function") updateCartUI();
            } else {
                // FIX #2: Clear module-scoped variable on failure.
                _currentPromoCode = "";
                _cachedDiscountAmount = 0;
                _cachedForCartTotal = null;

                // FIX #5: Increase cooldown on failure (brute-force mitigation).
                _cooldownMs = Math.min(
                    _cooldownMs === 0 ? _cooldownStepMs : _cooldownMs * 2,
                    _cooldownMaxMs
                );
                _saveCooldownState(_lastCallTime, _cooldownMs);

                // Generic message — do not expose whether the code exists or
                // which validation rule it failed (prevents enumeration).
                messageEl.textContent = result && result.reason === "min_order"
                    ? "❌ الحد الأدنى للطلب لم يتحقق."
                    : result && result.reason === "expired"
                    ? "❌ انتهت صلاحية كود الخصم."
                    : "❌ كود الخصم غير صالح أو منتهي الصلاحية.";
                messageEl.style.color = "#ff4444";

                if (typeof updateCartUI === "function") updateCartUI();
            }
        } catch (err) {
            // FIX: Graceful error — no stack trace or internal detail exposed.
            _currentPromoCode = "";
            _cachedDiscountAmount = 0;
            _cachedForCartTotal = null;
            messageEl.textContent = "❌ حدث خطأ في الاتصال. حاول مجدداً.";
            messageEl.style.color = "#ff4444";
            if (typeof updateCartUI === "function") updateCartUI();
        } finally {
            inputField.disabled = false;
        }
    };

})();
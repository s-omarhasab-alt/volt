/* ==========================================================================
   VOLT — Cloud Functions (2nd gen, callable)

   Exports exactly the five callables config.js invokes via httpsCallable():
     createSecureOrder  validatePromoCode  savePromoCode
     deletePromoCode    deleteUserAccount

   Region: us-central1 — config.js calls getFunctions(app) with no region,
   which defaults to us-central1. Change BOTH together or calls will 404.

   CONTRACT NOTES (read before editing)
   ---------------------------------------------------------------------------
   1. Orders are created ONLY here (Admin SDK). firestore.rules denies every
      client create on /orders.
   2. Prices and stock come from /products, never from the client payload.
      Customer PII (name/phone/address/code) comes from /users/{uid}; any
      `customer` object the client sends is ignored.
   3. idempotencyKey is MANDATORY (F-12). Key docs live in /idempotencyKeys,
      are written in the same transaction as the order, and are scoped per uid.
      Same key + same payload  -> returns the original order (safe retry).
      Same key + other payload -> rejected (fingerprint mismatch).
      A failed attempt writes no key doc, so retrying after a failure with a
      changed cart is fine. Optional: add a Firestore TTL policy on the
      `expireAt` field of /idempotencyKeys to auto-purge old keys.
   4. Instapay / pending-deposit orders are stored with paymentStatus
      "unpaid" until an admin flips it (F-11). Cash orders are "cod".
   5. Cash orders above CASH_DEPOSIT_THRESHOLD are stored as "pending-deposit"
      (same 1000 EGP / 30% rule choosePayment() applies in script.js), so a
      stale client total can never slip a large cash order past the deposit.
   6. A product whose `stock` is missing or non-numeric is NOT purchasable
      (fail closed). Products created through the admin form always have it.
   7. Order docs deliberately have NO `id` field: config.js builds admin
      order objects as { id: docSnap.id, ...docSnap.data() }, so a stored
      `id` would overwrite the real Firestore doc id that the admin panel uses
      to update orders (F-18).
   8. `date` is written in the ar-EG format the admin dashboard's "today"
      KPI matches against (o.date.includes(toLocaleDateString("ar-EG"))).
      The dashboard's "month" KPI does new Date(o.date), which cannot parse
      that format — it will read 0 until the dashboard uses `createdAt`
      (ISO string, also stored) instead. Frontend-side fix, not done here.
   ========================================================================== */

"use strict";

const crypto = require("node:crypto");
const { setGlobalOptions } = require("firebase-functions/v2");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { getAuth } = require("firebase-admin/auth");

initializeApp();
const db = getFirestore();
db.settings({ ignoreUndefinedProperties: true });

// maxInstances caps cost/blast radius on a free-tier-friendly project.
// Raise it deliberately if real traffic needs it.
setGlobalOptions({ region: "us-central1", maxInstances: 20 });

/* ----------------------------- constants -------------------------------- */

const CASH_DEPOSIT_THRESHOLD = 1000;      // mirrors choosePayment() in script.js
const DEPOSIT_RATE = 0.3;                 // mirrors Math.ceil(total * 0.3) in script.js
const MAX_ORDER_LINES = 50;
const MAX_LINE_QTY = 100;
const MAX_CART_TOTAL = 10000000;
const ORDER_METHODS = ["cash", "pending-deposit", "instapay"];

// Must stay identical to the strings script.js / the admin panel use.
const STATUS_PENDING_DEPOSIT = "معلق بانتظار العربون";
const STATUS_UNDER_REVIEW = "قيد المراجعة";

const IDEMPOTENCY_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const PROMO_CODE_PATTERN = /^[A-Z0-9_-]{1,32}$/;          // same as cart-promo.js
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9_-]{16,128}$/; // idem_<ts>_<rand>
const DOC_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const PROMO_TYPES = ["percentage", "fixed", "free_shipping"];

const PROMO_FAIL_LIMIT = 10;                    // failed checks ...
const PROMO_FAIL_WINDOW_MS = 10 * 60 * 1000;    // ... per 10 minutes, per user

const ORDER_ID_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I

/* ------------------------------ helpers --------------------------------- */

function round2(n) {
    return Math.round((n + Number.EPSILON) * 100) / 100;
}

function requireAuth(request) {
    if (!request.auth || !request.auth.uid) {
        throw new HttpsError("unauthenticated", "يجب تسجيل الدخول أولاً");
    }
    return request.auth.uid;
}

async function requireAdmin(request) {
    const uid = requireAuth(request);
    const snap = await db.collection("users").doc(uid).get();
    if (!snap.exists || snap.get("role") !== "admin") {
        throw new HttpsError("permission-denied", "ليس لديك صلاحية لتنفيذ هذا الإجراء");
    }
    return uid;
}

// Wraps every handler so an unexpected throw never leaks err.message to the
// client (the storefront shows err.message directly in a toast).
function safe(name, handler) {
    return async (request) => {
        try {
            return await handler(request);
        } catch (err) {
            if (err instanceof HttpsError) throw err;
            logger.error(`${name} failed`, { message: err && err.message, stack: err && err.stack });
            throw new HttpsError("internal", "حدث خطأ غير متوقع، حاول مرة أخرى");
        }
    };
}

function normalizePromoCode(raw) {
    if (typeof raw !== "string") return "";
    const code = raw.trim().toUpperCase();
    return PROMO_CODE_PATTERN.test(code) ? code : "";
}

// Admin-created codes carry numeric percentOff/fixedAmount, but older docs may
// only have a display string like "10%" or "50 EGP" in `value`.
function looseNumber(v) {
    if (typeof v === "number") return Number.isFinite(v) ? v : 0;
    const n = parseFloat(String(v == null ? "" : v).replace(/[^\d.]/g, ""));
    return Number.isFinite(n) ? n : 0;
}
function promoPercent(p) {
    return Number(p.percentOff) > 0 ? Number(p.percentOff) : looseNumber(p.value);
}
function promoFixed(p) {
    return Number(p.fixedAmount) > 0 ? Number(p.fixedAmount) : looseNumber(p.value);
}

function toDate(v) {
    if (v && typeof v.toDate === "function") return v.toDate(); // Firestore Timestamp
    return new Date(v);
}

/**
 * Single source of truth for promo rules — used by the preview endpoint
 * (validatePromoCode) and by the order transaction, so a code can never be
 * "valid" in the cart and priced differently at checkout.
 */
function evaluatePromo(promo, subtotal, now) {
    if (!promo || promo.status !== "active") return { ok: false, reason: "invalid" };

    if (promo.expiresAt) {
        const exp = toDate(promo.expiresAt);
        if (Number.isNaN(exp.getTime())) return { ok: false, reason: "invalid" };
        if (exp.getTime() < now.getTime()) return { ok: false, reason: "expired" };
    }

    const maxUses = promo.maxUses;
    if (maxUses != null && Number.isFinite(Number(maxUses))) {
        if ((Number(promo.usedCount) || 0) >= Number(maxUses)) return { ok: false, reason: "invalid" };
    }

    if (subtotal < (Number(promo.minOrder) || 0)) return { ok: false, reason: "min_order" };

    let discount = 0;
    if (promo.type === "percentage") {
        discount = subtotal * (promoPercent(promo) / 100);
        const cap = Number(promo.maxDiscount) || 0;
        if (cap > 0) discount = Math.min(discount, cap);
    } else if (promo.type === "fixed") {
        discount = promoFixed(promo);
    } else if (promo.type === "free_shipping") {
        discount = 0; // storefront totals carry no shipping line
    } else {
        return { ok: false, reason: "invalid" };
    }

    discount = round2(Math.min(Math.max(discount, 0), subtotal));
    return { ok: true, discount };
}

function generateOrderId() {
    let s = "";
    for (let i = 0; i < 8; i++) s += ORDER_ID_ALPHABET[crypto.randomInt(ORDER_ID_ALPHABET.length)];
    return `VOLT-${s}`;
}

/* --------------------- promo preview rate limiting ---------------------- */
// cart-promo.js only throttles in the browser; this is the server-side half.

async function isPromoLocked(uid) {
    const snap = await db.collection("promoAttempts").doc(uid).get();
    if (!snap.exists) return false;
    const d = snap.data();
    if (Date.now() - (Number(d.windowStart) || 0) > PROMO_FAIL_WINDOW_MS) return false;
    return (Number(d.failures) || 0) >= PROMO_FAIL_LIMIT;
}

async function recordPromoFailure(uid) {
    const ref = db.collection("promoAttempts").doc(uid);
    await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const now = Date.now();
        const d = snap.exists ? snap.data() : null;
        if (!d || now - (Number(d.windowStart) || 0) > PROMO_FAIL_WINDOW_MS) {
            tx.set(ref, { failures: 1, windowStart: now });
        } else {
            tx.set(ref, { failures: (Number(d.failures) || 0) + 1, windowStart: d.windowStart });
        }
    });
}

/* ========================================================================
   createSecureOrder
   in : { items:[{productId, quantity}], promoCode, customer(ignored),
          comment, method, idempotencyKey }
   out: { orderId, firestoreId, total, method }
   ======================================================================== */

function parseOrderInput(data) {
    if (!data || typeof data !== "object") {
        throw new HttpsError("invalid-argument", "بيانات الطلب غير صحيحة");
    }

    const idempotencyKey = typeof data.idempotencyKey === "string" ? data.idempotencyKey : "";
    if (!IDEMPOTENCY_KEY_PATTERN.test(idempotencyKey)) {
        throw new HttpsError("invalid-argument", "مفتاح الطلب مطلوب وغير صالح");
    }

    if (!Array.isArray(data.items) || data.items.length === 0 || data.items.length > MAX_ORDER_LINES) {
        throw new HttpsError("invalid-argument", "محتوى الطلب غير صحيح");
    }
    const seen = new Set();
    const items = [];
    for (const raw of data.items) {
        const idRaw = raw && (typeof raw.productId === "string" || typeof raw.productId === "number")
            ? String(raw.productId) : "";
        const quantity = raw ? Number(raw.quantity) : NaN;
        if (!DOC_ID_PATTERN.test(idRaw) || !Number.isInteger(quantity) || quantity < 1 || quantity > MAX_LINE_QTY) {
            throw new HttpsError("invalid-argument", "محتوى الطلب غير صحيح");
        }
        if (seen.has(idRaw)) {
            throw new HttpsError("invalid-argument", "يوجد منتج مكرر داخل نفس الطلب");
        }
        seen.add(idRaw);
        items.push({ productId: idRaw, quantity });
    }

    let promoCode = null;
    if (data.promoCode != null && data.promoCode !== "") {
        promoCode = normalizePromoCode(data.promoCode);
        if (!promoCode) throw new HttpsError("invalid-argument", "كود الخصم غير صالح");
    }

    if (!ORDER_METHODS.includes(data.method)) {
        throw new HttpsError("invalid-argument", "طريقة الدفع غير صحيحة");
    }

    const comment = typeof data.comment === "string" ? data.comment.trim().slice(0, 1000) : "";

    return { items, promoCode, method: data.method, comment, idempotencyKey };
}

function orderFingerprint(input) {
    const lines = input.items
        .map((i) => [i.productId, i.quantity])
        .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
    const canonical = JSON.stringify({
        items: lines,
        promoCode: input.promoCode,
        method: input.method,
        comment: input.comment
    });
    return crypto.createHash("sha256").update(canonical).digest("hex");
}

function buildCustomer(user) {
    const customer = {
        name: String(user.name || "").trim(),
        phone: String(user.phone || user.idNum || "").trim(),
        address: String(user.address || "").trim(),
        code: String(user.code || "").trim()
    };
    if (!customer.name || !customer.phone || !customer.address) {
        throw new HttpsError("failed-precondition", "يرجى استكمال بيانات حسابك (الاسم والهاتف والعنوان) قبل إتمام الطلب");
    }
    return customer;
}

async function createSecureOrderHandler(request) {
    const uid = requireAuth(request);
    const input = parseOrderInput(request.data);

    const userSnap = await db.collection("users").doc(uid).get();
    if (!userSnap.exists) {
        throw new HttpsError("failed-precondition", "بيانات حسابك غير مكتملة، سجّل الدخول مرة أخرى");
    }
    const user = userSnap.data();
    if (user.role === "admin") {
        throw new HttpsError("permission-denied", "حساب الإدارة لا يمكنه الشراء");
    }
    const customer = buildCustomer(user);

    const fingerprint = orderFingerprint(input);
    const keyRef = db.collection("idempotencyKeys").doc(`${uid}__${input.idempotencyKey}`);

    // Generated once, outside the transaction, so transaction retries reuse them.
    const orderRef = db.collection("orders").doc();
    const orderId = generateOrderId();

    const productRefs = input.items.map((i) => db.collection("products").doc(i.productId));
    const promoRef = input.promoCode ? db.collection("promoCodes").doc(input.promoCode) : null;

    const result = await db.runTransaction(async (tx) => {
        // ---- all reads first ----
        const refs = [keyRef, ...productRefs];
        if (promoRef) refs.push(promoRef);
        const snaps = await tx.getAll(...refs);

        const keySnap = snaps[0];
        const productSnaps = snaps.slice(1, 1 + productRefs.length);
        const promoSnap = promoRef ? snaps[snaps.length - 1] : null;

        // ---- idempotent replay ----
        if (keySnap.exists) {
            const k = keySnap.data();
            if (k.fingerprint !== fingerprint) {
                throw new HttpsError("failed-precondition",
                    "تعذر إتمام الطلب بسبب طلب سابق مكرر — افتح الموقع في تبويب جديد وحاول مرة أخرى");
            }
            return { orderId: k.orderId, firestoreId: k.firestoreId, total: k.total, method: k.method };
        }

        // ---- price + stock from the database only ----
        let subtotal = 0;
        const lines = [];
        const stockWrites = [];

        input.items.forEach((item, idx) => {
            const snap = productSnaps[idx];
            if (!snap.exists) {
                throw new HttpsError("failed-precondition", "أحد المنتجات لم يعد متاحاً في المتجر");
            }
            const p = snap.data();
            const name = String(p.name || "منتج");

            if (typeof p.price !== "number" || !Number.isFinite(p.price) || p.price < 0) {
                throw new HttpsError("failed-precondition", `المنتج "${name}" غير متاح للشراء حالياً`);
            }
            if (typeof p.stock !== "number" || !Number.isFinite(p.stock)) {
                throw new HttpsError("failed-precondition", `المنتج "${name}" غير متاح للشراء حالياً`);
            }
            if (p.stock <= 0) {
                throw new HttpsError("failed-precondition", `نفدت كمية المنتج "${name}"`);
            }
            if (p.stock < item.quantity) {
                throw new HttpsError("failed-precondition", `الكمية المتاحة من "${name}" هي ${p.stock} فقط`);
            }

            subtotal += round2(p.price * item.quantity);
            stockWrites.push({ ref: snap.ref, stock: p.stock - item.quantity });

            const emoji = typeof p.emoji === "string" && p.emoji.startsWith("https://") ? "📦" : String(p.emoji || "📦");
            lines.push({
                productId: item.productId,
                name,
                emoji,
                price: p.price,
                quantity: item.quantity
            });
        });
        subtotal = round2(subtotal);

        // ---- promo (re-validated here, never trusted from the client) ----
        let discount = 0;
        let promoUsedCount = null;
        if (promoRef) {
            const promo = promoSnap && promoSnap.exists ? promoSnap.data() : null;
            const evaluation = evaluatePromo(promo, subtotal, new Date());
            if (!evaluation.ok) {
                throw new HttpsError("failed-precondition",
                    "كود الخصم لم يعد صالحاً — أعد تحميل الصفحة وأعد المحاولة بدونه");
            }
            discount = evaluation.discount;
            promoUsedCount = (Number(promo.usedCount) || 0) + 1;
        }

        const total = round2(Math.max(0, subtotal - discount));

        // ---- payment rules ----
        const method = (input.method === "cash" && total > CASH_DEPOSIT_THRESHOLD)
            ? "pending-deposit" : input.method;
        const isPendingDeposit = method === "pending-deposit";
        const paymentStatus = method === "cash" ? "cod" : "unpaid";

        const now = new Date();
        const orderDoc = {
            orderId,
            uid,
            customer,
            items: lines,
            subtotal,
            discount,
            promoCode: input.promoCode,
            total,
            method,
            paymentStatus,
            depositRequired: isPendingDeposit ? Math.ceil(total * DEPOSIT_RATE) : 0,
            status: isPendingDeposit ? STATUS_PENDING_DEPOSIT : STATUS_UNDER_REVIEW,
            comment: input.comment,
            date: now.toLocaleString("ar-EG", { timeZone: "Africa/Cairo" }),
            createdAt: now.toISOString(),
            archived: false
        };

        // ---- all writes last ----
        tx.create(orderRef, orderDoc);
        tx.create(keyRef, {
            uid,
            fingerprint,
            orderId,
            firestoreId: orderRef.id,
            total,
            method,
            createdAt: now.toISOString(),
            expireAt: new Date(now.getTime() + IDEMPOTENCY_TTL_MS)
        });
        stockWrites.forEach((w) => tx.update(w.ref, { stock: w.stock }));
        if (promoRef) tx.update(promoRef, { usedCount: promoUsedCount });

        return { orderId, firestoreId: orderRef.id, total, method };
    });

    logger.info("order processed", { orderId: result.orderId, uid });
    return result;
}

/* ========================================================================
   validatePromoCode
   in : { code, cartTotal }   (cartTotal is a display hint only; the real
                               price is recomputed inside createSecureOrder)
   out: { valid:true, discount_amount, code } | { valid:false, reason }
        reasons the storefront understands: "min_order", "expired";
        anything else renders the generic invalid-code message.
   ======================================================================== */

async function validatePromoCodeHandler(request) {
    const uid = requireAuth(request);
    const data = request.data || {};

    const cartTotal = Number(data.cartTotal);
    if (!Number.isFinite(cartTotal) || cartTotal < 0 || cartTotal > MAX_CART_TOTAL) {
        throw new HttpsError("invalid-argument", "البيانات المرسلة غير صحيحة");
    }

    const code = normalizePromoCode(data.code);
    if (!code) return { valid: false, reason: "invalid" };

    if (await isPromoLocked(uid)) return { valid: false, reason: "rate_limited" };

    const snap = await db.collection("promoCodes").doc(code).get();
    const evaluation = snap.exists
        ? evaluatePromo(snap.data(), round2(cartTotal), new Date())
        : { ok: false, reason: "invalid" };

    if (!evaluation.ok) {
        await recordPromoFailure(uid);
        return { valid: false, reason: evaluation.reason };
    }
    return { valid: true, discount_amount: evaluation.discount, code };
}

/* ========================================================================
   savePromoCode (admin)  — promoCodeEngine.persist() calls this once per
   code, passing whatever the admin panel holds (including `id` and
   `usedCount` read back from Firestore). Only the whitelist below is
   written, and usedCount is never client-writable.
   ======================================================================== */

function normalizePromoInput(data) {
    const bad = (msg) => new HttpsError("invalid-argument", msg);
    if (!data || typeof data !== "object") throw bad("البيانات المرسلة غير صحيحة");

    const code = normalizePromoCode(data.code);
    if (!code) throw bad("كود الخصم غير صالح");

    if (!PROMO_TYPES.includes(data.type)) throw bad("نوع الخصم غير صحيح");
    if (data.status !== "active" && data.status !== "inactive") throw bad("حالة الكود غير صحيحة");

    const percentOff = promoPercent(data);
    const fixedAmount = promoFixed(data);
    if (data.type === "percentage" && !(percentOff > 0 && percentOff <= 100)) throw bad("نسبة الخصم يجب أن تكون بين 1 و100");
    if (data.type === "fixed" && !(fixedAmount > 0 && fixedAmount <= 1000000)) throw bad("قيمة الخصم غير صحيحة");

    const minOrder = Number(data.minOrder) || 0;
    const maxDiscount = Number(data.maxDiscount) || 0;
    if (minOrder < 0 || minOrder > 10000000 || maxDiscount < 0 || maxDiscount > 10000000) throw bad("البيانات المرسلة خارج النطاق المسموح");

    let maxUses = null;
    if (data.maxUses != null && data.maxUses !== "") {
        maxUses = Number(data.maxUses);
        if (!Number.isInteger(maxUses) || maxUses < 1 || maxUses > 1000000000) throw bad("الحد الأقصى للاستخدام غير صالح");
    }

    let expiresAt = null;
    if (data.expiresAt != null && data.expiresAt !== "") {
        const d = new Date(data.expiresAt);
        if (Number.isNaN(d.getTime())) throw bad("تاريخ الانتهاء غير صالح");
        expiresAt = d.toISOString();
    }

    return {
        code,
        type: data.type,
        status: data.status,
        value: typeof data.value === "string" ? data.value.slice(0, 40) : "",
        percentOff: data.type === "percentage" ? percentOff : 0,
        fixedAmount: data.type === "fixed" ? fixedAmount : 0,
        shippingDiscount: data.type === "free_shipping",
        minOrder,
        maxUses,
        maxDiscount,
        expiresAt
    };
}

async function savePromoCodeHandler(request) {
    const adminUid = await requireAdmin(request);
    const fields = normalizePromoInput(request.data);

    const ref = db.collection("promoCodes").doc(fields.code);
    const existing = await ref.get();
    const now = new Date().toISOString();

    const doc = { ...fields, updatedAt: now, updatedBy: adminUid };
    if (!existing.exists) {
        doc.usedCount = 0;
        doc.createdAt = now;
    }
    await ref.set(doc, { merge: true });
    return { success: true };
}

/* ========================================================================
   deletePromoCode (admin)
   ======================================================================== */

async function deletePromoCodeHandler(request) {
    await requireAdmin(request);
    const code = normalizePromoCode(request.data && request.data.code);
    if (!code) throw new HttpsError("invalid-argument", "كود الخصم غير صالح");
    await db.collection("promoCodes").doc(code).delete();
    return { success: true };
}

/* ========================================================================
   deleteUserAccount (admin)
   Removes the Auth user + users/{uid} + favorites/{uid}. Orders are kept
   on purpose (accounting history); they carry the customer snapshot.
   ======================================================================== */

async function deleteUserAccountHandler(request) {
    const adminUid = await requireAdmin(request);
    const uid = request.data && typeof request.data.uid === "string" ? request.data.uid : "";
    if (!DOC_ID_PATTERN.test(uid)) throw new HttpsError("invalid-argument", "تعذر تحديد حساب العميل");
    if (uid === adminUid) throw new HttpsError("failed-precondition", "لا يمكنك حذف حسابك الخاص");

    const target = await db.collection("users").doc(uid).get();
    if (target.exists && target.get("role") === "admin") {
        throw new HttpsError("permission-denied", "لا يمكن حذف حساب إدارة من هنا");
    }

    try {
        await getAuth().deleteUser(uid);
    } catch (err) {
        // A profile doc can outlive its Auth user — still clean the data up.
        if (!err || err.code !== "auth/user-not-found") throw err;
    }
    await db.collection("users").doc(uid).delete();
    await db.collection("favorites").doc(uid).delete();

    logger.info("user account deleted", { uid, by: adminUid });
    return { success: true };
}

/* ------------------------------- exports -------------------------------- */

exports.createSecureOrder = onCall(safe("createSecureOrder", createSecureOrderHandler));
exports.validatePromoCode = onCall(safe("validatePromoCode", validatePromoCodeHandler));
exports.savePromoCode = onCall(safe("savePromoCode", savePromoCodeHandler));
exports.deletePromoCode = onCall(safe("deletePromoCode", deletePromoCodeHandler));
exports.deleteUserAccount = onCall(safe("deleteUserAccount", deleteUserAccountHandler));
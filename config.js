// استدعاء مكتبات فايربيز وقاعدة البيانات
// إعدادات موقعك
//
// FIX #18: this apiKey is a public Firebase *project identifier*, not a
// secret — Firebase web config values are meant to ship in client bundles
// (see https://firebase.google.com/docs/projects/api-keys). The only thing
// that makes exposing it safe is that access control is enforced entirely
// by Firestore Security Rules on the backend, not by anything in this file.
// This file has no way to check or enforce that from the client side, and
// no rules file/link was in scope for this pass to point to — so this
// comment documents the invariant rather than confirming it holds:
//   Before shipping, verify Firestore Security Rules actually restrict
//   read/write per-collection (default rules if untouched allow open
//   read/write to anyone with this config, which this apiKey alone does
//   NOT prevent). Replace the bracketed note below once the rules file's
//   real location is known:
//   Security enforced via Firestore rules — see [rules file/console link]


// تصدير المتغيرات عشان نقدر نستخدمها في باقي ملفات الموقع بعدين
// استدعاء مكتبات فايربيز وقاعدة البيانات
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js";
import {
    getFirestore,
    collection,
    getDocs,
    addDoc,
    doc,
    setDoc,
    updateDoc,
    deleteDoc,
    getDoc,
    query,
    where,
    limit,
    orderBy,
    startAfter,
    writeBatch,
    increment,
    Timestamp
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";
// 🆕 استدعاء خدمة تسجيل الدخول (Authentication)
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-functions.js";

const firebaseConfig = {
    apiKey: "AIzaSyAHectEVgse8Ms6hwGu7UIn74L49pUAyCA",
    authDomain: "volt-store-67593.firebaseapp.com",
    projectId: "volt-store-67593",
    storageBucket: "volt-store-67593.firebasestorage.app",
    messagingSenderId: "992001931505",
    appId: "1:992001931505:web:ef91740e3c42e3f0ce9150"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const functions = getFunctions(app);

// تصدير المتغيرات عشان نقدر نستخدمها في باقي ملفات الموقع بعدين (للملفات اللي هي modules برضه)
export { app, db, auth, signInWithEmailAndPassword, doc, getDoc };

// 🆕 إضافة جديدة: "البريزة" المشتركة — بنحط هنا كل حاجة script.js
// (اللي هو مش module) محتاج يوصلها. أي ملف عادي في الصفحة يقدر
// يقرا من window.voltFirebase من غير ما يحتاج import خالص.
window.voltFirebase = { auth, db, signInWithEmailAndPassword, doc, getDoc };

async function getCurrentUserProfile() {
    const authUser = auth.currentUser;
    if (!authUser) return null;
    const userDoc = await getDoc(doc(db, "users", authUser.uid));
    return userDoc.exists()
        ? { uid: authUser.uid, ...userDoc.data() }
        : { uid: authUser.uid, role: "client" };
}

onAuthStateChanged(auth, async () => {
    try {
        window.dispatchEvent(new CustomEvent("voltAuthStateChanged", {
            detail: await getCurrentUserProfile()
        }));
    } catch (err) {
        console.warn("Could not refresh the signed-in profile", err);
        window.dispatchEvent(new CustomEvent("voltAuthStateChanged", { detail: null }));
    }
});
// ==========================================================================
// دوال المنتجات — Firestore
// ==========================================================================

// جلب كل المنتجات من Firestore
// ⚠️ فضلت زي ما هي بدون أي تعديل — renderAdminProducts() في index.html
// وverifyOrderPricing() في order-verify.js لسه محتاجين الجلب الكامل ده.
// الدوال الجديدة تحت (getProductsPageFromFirestore إلخ) جنبها، مش بدالها.
async function getProductsFromFirestore() {
    try {
        const snapshot = await getDocs(collection(db, "products"));
        const products = [];
        snapshot.forEach((docSnap) => {
            products.push({ id: docSnap.id, ...docSnap.data() });
        });
        return products;
    } catch (err) {
        console.error("getProductsFromFirestore: فشل جلب المنتجات", err);
        return [];
    }
}

// ==========================================================================
// 🆕 جلب صفحة منتجات (Pagination) — للعرض الرئيسي للعميل فقط.
// ==========================================================================
//
// البحث هنا بيدور في "بداية اسم المنتج" فقط (عن طريق حقل searchName
// المحسوب تلقائياً في addProductToFirestore/updateProductInFirestore فوق).
// قرار متعمّد: Firestore مش بيعمل full-text search حر، وده البديل
// المجاني والبسيط بدل خدمة خارجية زي Algolia.
//
// @param {Object} options
// @param {string} options.category      - "all" أو اسم تصنيف
// @param {number|null} options.maxPrice - الحد الأقصى للسعر، أو null
// @param {string} options.searchPrefix  - بداية الاسم (lowercase)، أو ""
// @param {Object|null} options.cursorDoc - آخر document من الصفحة السابقة
// @param {number} options.pageSize      - افتراضي 24
//
// @returns {{products: Array, lastDoc: Object|null, hasMore: boolean}}
//
// PERF FIX (load-test audit): the catch block below previously fell back
// to a full, unfiltered getProductsFromFirestore() collection scan
// whenever the primary paginated query failed (most commonly: the
// required composite index is missing, rebuilding, or was never
// deployed). At high request volume that fallback meant every single
// paginated product request silently degraded into a full-catalog read
// the instant the index was unavailable — multiplying Firestore reads by
// catalog size × request volume, invisibly, with no error surfaced
// anywhere. That silent full-scan path has been removed. This function
// now throws immediately on failure instead, so a missing/broken index
// is a loud, fail-fast error instead of an invisible full-table-scan
// degradation under load.
//
// ⚠️ CALL-SITE IMPACT: this function's contract has changed from "always
// resolves to {products, lastDoc, hasMore}" to "may throw." Both call
// sites in script.js (applyProductFilters() and loadNextProductsPage())
// have been updated in this same pass to catch this throw and surface a
// visible "couldn't load products, please retry" state instead of
// letting an uncaught rejection break product rendering. If this
// function is called from anywhere else in the future, that caller must
// handle the throw itself — it is no longer guaranteed to fail silently
// into an empty-but-valid result shape.
async function getProductsPageFromFirestore(options = {}) {
    const {
        category = "all",
        maxPrice = null,
        searchPrefix = "",
        cursorDoc = null,
        pageSize = 24
    } = options;

    try {
        const constraints = [];

        if (category && category !== "all") {
            constraints.push(where("category", "==", category));
        }

        // ⚠️ قيد Firestore: range query (>=, <=) على حقلين مختلفين في نفس
        // الـ query مش مسموح. لو فيه بحث نصي، الـ orderBy لازم يكون على
        // searchName نفسه (نفس الحقل اللي عليه الـ range).
        if (searchPrefix) {
            constraints.push(where("searchName", ">=", searchPrefix));
            constraints.push(where("searchName", "<=", searchPrefix + "\uf8ff"));
            constraints.push(orderBy("searchName"));
        } else {
            constraints.push(orderBy("name"));
        }

        // فلتر السعر: لو بحث نصي + سعر مع بعض، مينفعش الاتنين range
        // constraints على حقلين مختلفين في نفس الـ query. في الحالة دي
        // بس، فلترة السعر بتتطبق في الذاكرة بعد الجلب (ممكن ترجع أقل
        // من pageSize نتيجة في الحالة الخاصة دي تحديداً).
        const priceFilterInMemory = !!(searchPrefix && maxPrice !== null);
        if (maxPrice !== null && !priceFilterInMemory) {
            constraints.push(where("price", "<=", maxPrice));
        }

        if (cursorDoc) {
            constraints.push(startAfter(cursorDoc));
        }

        // نجيب pageSize + 1 عشان نعرف هل فيه صفحة بعد كده من غير query إضافي
        constraints.push(limit(pageSize + 1));

        const q = query(collection(db, "products"), ...constraints);
        const snapshot = await getDocs(q);

        let docs = snapshot.docs;
        const hasMore = docs.length > pageSize;
        if (hasMore) docs = docs.slice(0, pageSize);

        let products = docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));

        if (priceFilterInMemory) {
            products = products.filter(p => typeof p.price !== "number" || p.price <= maxPrice);
        }

        const lastDoc = docs.length > 0 ? docs[docs.length - 1] : null;
        return { products, lastDoc, hasMore };

    } catch (err) {
        console.error("getProductsPageFromFirestore: فشل جلب صفحة المنتجات", err);
        throw new Error("Missing Firestore Index. Please deploy indexes via: firebase deploy --only firestore:indexes");
    }
}

// ==========================================================================
// 🆕 جلب منتج واحد بالـ id مباشرة — بديل عن "جيب الكل ودوّر فيهم"
// المستخدم في openProductModal / addToCart / removeFromCart / deleteProduct
// ==========================================================================
async function getProductByIdFromFirestore(productId) {
    try {
        const docSnap = await getDoc(doc(db, "products", String(productId)));
        if (!docSnap.exists()) return null;
        return { id: docSnap.id, ...docSnap.data() };
    } catch (err) {
        console.error("getProductByIdFromFirestore: فشل جلب المنتج", productId, err);
        return null;
    }
}

// ==========================================================================
// 🔍 فحص بنية الداتا مرة واحدة عند الاستدعاء — بيوريك في الـ console أي
// منتج قديم مش متوافق مع البنية الجديدة (بدون searchName، أو price مش
// Number، أو category فاضي)، من غير ما يوقف تشغيل الموقع.
// ==========================================================================
async function validateProductSchemaOnce() {
    try {
        const snapshot = await getDocs(query(collection(db, "products"), limit(500)));
        const issues = { missingSearchName: [], priceNotNumber: [], missingCategory: [] };

        snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const id = docSnap.id;
            const name = data.name || "(بدون اسم)";
            if (!data.searchName) issues.missingSearchName.push({ id, name });
            if (typeof data.price !== "number") issues.priceNotNumber.push({ id, name, actualValue: data.price });
            if (!data.category) issues.missingCategory.push({ id, name });
        });

        return issues;
    } catch (err) {
        console.error("validateProductSchemaOnce: فشل الفحص", err);
        return null;
    }
}

// إضافة منتج جديد (معرف تلقائي من Firestore)
async function addProductToFirestore(productData) {
    try {
        // 🆕 حساب searchName تلقائياً من الاسم - lowercase، بدون مسافات
        // زيادة - يُستخدم في getProductsPageFromFirestore للبحث ببداية الاسم
        const dataWithSearchName = {
            ...productData,
            searchName: (productData.name || "").toLowerCase().trim()
        };
        const docRef = await addDoc(collection(db, "products"), dataWithSearchName);
        return docRef.id;
    } catch (err) {
        console.error("addProductToFirestore: فشل إضافة المنتج", err);
        return null;
    }
}

// تعديل منتج موجود (بمعرفه)
async function updateProductInFirestore(productId, updatedFields) {
    try {
        // 🆕 لو الاسم اتغيّر، searchName لازم يتحدّث معاه وإلا هيفضل
        // بيدل على الاسم القديم في نتائج البحث بينما المعروض هو الجديد
        const fieldsToUpdate = { ...updatedFields };
        if (updatedFields.name !== undefined) {
            fieldsToUpdate.searchName = updatedFields.name.toLowerCase().trim();
        }
        await updateDoc(doc(db, "products", productId), fieldsToUpdate);
        return true;
    } catch (err) {
        console.error("updateProductInFirestore: فشل تعديل المنتج", err);
        return false;
    }
}

// حذف منتج (بمعرفه)
async function deleteProductFromFirestore(productId) {
    try {
        await deleteDoc(doc(db, "products", productId));
        return true;
    } catch (err) {
        console.error("deleteProductFromFirestore: فشل حذف المنتج", err);
        return false;
    }
}

// إتاحة الدوال للملفات التانية (script.js) عن طريق window.voltFirebase
window.voltFirebase.getProducts = getProductsFromFirestore;
window.voltFirebase.addProduct = addProductToFirestore;
window.voltFirebase.updateProduct = updateProductInFirestore;
window.voltFirebase.deleteProduct = deleteProductFromFirestore;
// 🆕 Pagination — جنب getProducts القديمة، مش بدالها
window.voltFirebase.getProductsPage = getProductsPageFromFirestore;
window.voltFirebase.getProductById = getProductByIdFromFirestore;
window.voltFirebase.validateProductSchema = validateProductSchemaOnce;

// ==========================================================================
// دوال المستخدمين والأوردرات — Firestore
// ==========================================================================

async function getAllUsersFromFirestore() {
    try {
        const snapshot = await getDocs(collection(db, "users"));
        const users = [];
        snapshot.forEach((docSnap) => { users.push({ uid: docSnap.id, ...docSnap.data() }); });
        return users;
    } catch (err) {
        console.error("getAllUsersFromFirestore: فشل جلب المستخدمين", err);
        return [];
    }
}

async function findUserByIdNumFromFirestore(idNum) {
    // Do not expose account lookup by phone number to an anonymous browser.
    return null;
}

async function findUserByEmailFromFirestore(email) {
    // Firebase Auth reports duplicate emails during account creation.
    return null;
}

async function identifierTaken(type, value) {
    return false;
}

async function registerClientUser(email, password, profile) {
    try {
        let finalEmail = email ? email.trim() : "";
        if (!finalEmail) {
            const cleanPhone = profile.phone ? profile.phone.replace(/\D/g, "") : String(Date.now());
            finalEmail = `client_${cleanPhone}@volt.com`;
        }

        const userCredential = await createUserWithEmailAndPassword(auth, finalEmail, password);
        const uid = userCredential.user.uid;

        const phone = String(profile.phone || profile.idNum || "").slice(0, 20);
        await setDoc(doc(db, "users", uid), {
            type: String(profile.type || "").slice(0, 40),
            name: String(profile.name || "").slice(0, 120),
            phone,
            idNum: String(profile.idNum || phone).slice(0, 20),
            address: String(profile.address || "").slice(0, 500),
            code: String(profile.code || "").slice(0, 40),
            history: [],
            email: email ? email.trim().slice(0, 320) : "غير محدد",
            uid,
            role: "client",
            createdAt: new Date().toISOString()
        });

        return { uid, email: finalEmail };
    } catch (err) {
        // FIX: previously returned { error: err.code, message: err.message } —
        // err.message is the raw Firebase Auth SDK string (can include the
        // email address, internal API detail, or implementation-specific
        // wording depending on SDK version) and was being sent straight to
        // the client. wizSubmit() in script.js only ever reads result.error
        // (for its own hardcoded errCode switch) and never result.message,
        // so this was leaking unused-but-exposed diagnostic detail from a
        // security-sensitive auth path. Full raw error is still logged to
        // console.error above for developer visibility — only the returned
        // object's "message" field changes here, from raw err.message to a
        // fixed, safe string. Return shape ({ error, message }) and the
        // "error" field's value (still err.code) are both unchanged, so
        // wizSubmit()'s existing errCode === "auth/..." checks keep working
        // exactly as before with zero changes required on the caller side.
        console.error("registerClientUser: فشل التسجيل", err);
        const safeMessage = "حدث خطأ أثناء إنشاء الحساب";
        return { error: err.code || "unknown", message: safeMessage };
    }
}

async function signInClientUser(email, password) {
    try {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        const uid = userCredential.user.uid;
        const userDoc = await getDoc(doc(db, "users", uid));
        if (userDoc.exists()) {
            return { uid, ...userDoc.data() };
        }
        return { uid, role: "client" };
    } catch (err) {
        console.warn("signInClientUser: فشل تسجيل الدخول", err);
        return null;
    }
}

async function signOutUser() {
    try { await signOut(auth); return true; } catch (err) { return false; }
}

async function saveUserProfileToFirestore(uid, profile) {
    try {
        const safe = { ...profile };
        delete safe.role;
        delete safe.uid;
        await setDoc(doc(db, "users", uid), safe, { merge: true });
        return true;
    } catch (err) {
        console.error("saveUserProfileToFirestore: فشل حفظ البروفايل", err);
        return false;
    }
}

// ==========================================================================
// إنشاء الأوردر مباشرة في Firestore (بدون Cloud Functions — خطة Spark).
//
// الأمان هنا مفروض بواسطة firestore.rules (isValidNewOrder): الـ rules
// بتقارن كل سعر واسم وكمية بمستند المنتج الحقيقي، وبتعيد حساب المجموع
// والعربون والحالة، وبتربط بيانات العميل بمستند حسابه. هذه الدالة تبني
// المستند بحيث يطابق تلك الشروط حرفياً — أي تعديل هنا لازم يقابله تعديل
// في الـ rules والعكس.
//
// معرّف المستند = "<uid>__<idempotencyKey>"، فإعادة الإرسال بنفس المفتاح
// لا تنشئ أوردر ثانياً (تتحول لـ update والـ rules تمنعها على العميل).
// ==========================================================================
const VOLT_ORDER_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const VOLT_MAX_ORDER_LINES = 5;        // حد Firestore Rules: 10 قراءات لكل كتابة
const VOLT_CASH_DEPOSIT_THRESHOLD = 1000;
const VOLT_DEPOSIT_RATE = 0.3;

function voltGenerateOrderId() {
    const buf = crypto.getRandomValues(new Uint8Array(8));
    let s = "";
    for (const b of buf) s += VOLT_ORDER_ALPHABET[b % VOLT_ORDER_ALPHABET.length];
    return `VOLT-${s}`;
}

function voltRound2(n) {
    return Math.round((n + Number.EPSILON) * 100) / 100;
}

// ==========================================================================
// أكواد الخصم بدون Cloud Functions (خطة Spark)
//
// voltEvaluatePromo() هي نفس منطق promoDiscountFor() / isPromoDiscountValid()
// في firestore.rules بالظبط. الـ rules هي المرجع الأمني؛ هذه الدالة تعكسها
// عشان العميل يشوف نفس الخصم اللي هتقبله الـ rules. أي تعديل هنا لازم
// يقابله تعديل في الـ rules والعكس.
//
// ملاحظة: تاريخ الانتهاء لازم يكون Timestamp. أي قيمة نصية قديمة بتتعامل
// كمنتهية/غير صالحة (الـ rules مش بتقدر تقرأ نص ISO)، وبتتحول لـ Timestamp
// تلقائياً أول ما الأدمن يحفظ الكود من اللوحة.
// ==========================================================================
function voltNormalizePromoCode(raw) {
    if (typeof raw !== "string") return "";
    const code = raw.trim().toUpperCase();
    return /^[A-Z0-9_-]{1,32}$/.test(code) ? code : "";
}

function voltEvaluatePromo(promo, subtotal, now) {
    const invalid = { ok: false, reason: "invalid" };
    if (!promo || promo.status !== "active") return invalid;

    const type = promo.type;
    if (type !== "percentage" && type !== "fixed" && type !== "free_shipping") return invalid;

    const exp = promo.expiresAt;
    if (exp !== undefined && exp !== null) {
        if (typeof exp.toDate !== "function") return invalid;
        if (exp.toDate().getTime() <= now.getTime()) return { ok: false, reason: "expired" };
    }

    const maxUses = promo.maxUses;
    if (maxUses !== undefined && maxUses !== null) {
        if ((Number(promo.usedCount) || 0) >= Number(maxUses)) return invalid;
    }

    if (subtotal < (Number(promo.minOrder) || 0)) return { ok: false, reason: "min_order" };

    let discount = 0;
    if (type === "percentage") {
        discount = subtotal * ((Number(promo.percentOff) || 0) / 100);
        const cap = Number(promo.maxDiscount) || 0;
        if (cap > 0 && discount > cap) discount = cap;
    } else if (type === "fixed") {
        discount = Number(promo.fixedAmount) || 0;
    }
    if (discount > subtotal) discount = subtotal;
    if (discount < 0) discount = 0;
    return { ok: true, discount: voltRound2(discount) };
}

async function createSecureOrder(payload) {
    const authUser = auth.currentUser;
    if (!authUser) throw new Error("يجب تسجيل الدخول أولاً");

    const items = Array.isArray(payload && payload.items) ? payload.items : [];
    if (items.length < 1) throw new Error("السلة فارغة");
    if (items.length > VOLT_MAX_ORDER_LINES) {
        throw new Error("الحد الأقصى 5 منتجات مختلفة في الطلب الواحد، قسّم طلبك على مرتين");
    }

    const key = String(payload.idempotencyKey || "");
    if (!/^[A-Za-z0-9_-]{16,128}$/.test(key)) throw new Error("مفتاح الطلب غير صالح");

    // بيانات العميل من حسابه هو (مش من الصفحة). القيم بتتخزن كما هي بدون
    // trim() لأن الـ rules بتقارنها بمستند المستخدم بالتساوي الحرفي.
    const userSnap = await getDoc(doc(db, "users", authUser.uid));
    if (!userSnap.exists()) throw new Error("بيانات حسابك غير مكتملة، سجّل الدخول مرة أخرى");
    const u = userSnap.data();
    if (u.role === "admin") throw new Error("حساب الإدارة لا يمكنه الشراء");

    const customer = {
        name: String(u.name || ""),
        phone: String(u.phone || u.idNum || ""),
        address: String(u.address || ""),
        code: String(u.code || "")
    };
    if (!customer.name.trim() || !customer.phone.trim() || !customer.address.trim()) {
        throw new Error("يرجى استكمال بيانات حسابك (الاسم والهاتف والعنوان) قبل إتمام الطلب");
    }

    // الأسعار والمخزون من قاعدة البيانات، مش من الصفحة.
    const seen = new Set();
    for (const it of items) {
        const pid = String((it && it.productId) == null ? "" : it.productId);
        if (!pid || seen.has(pid)) throw new Error("محتوى الطلب غير صحيح");
        seen.add(pid);
    }
    const snaps = await Promise.all(
        items.map((it) => getDoc(doc(db, "products", String(it.productId))))
    );

    let subtotal = 0;
    const lines = [];
    items.forEach((it, i) => {
        const qty = Number(it.quantity);
        const snap = snaps[i];
        if (!snap.exists()) throw new Error("أحد المنتجات لم يعد متاحاً في المتجر");
        const p = snap.data();
        const name = String(p.name || "");
        if (typeof p.name !== "string" || !name ||
            typeof p.price !== "number" || !Number.isFinite(p.price) || p.price < 0 ||
            typeof p.stock !== "number" || !Number.isFinite(p.stock)) {
            throw new Error(`المنتج "${name || "منتج"}" غير متاح للشراء حالياً`);
        }
        if (!Number.isInteger(qty) || qty < 1 || qty > 100) throw new Error("كمية غير صحيحة");
        if (p.stock <= 0) throw new Error(`نفدت كمية المنتج "${name}"`);
        if (p.stock < qty) throw new Error(`الكمية المتاحة من "${name}" هي ${p.stock} فقط`);

        subtotal += p.price * qty;
        lines.push({
            productId: String(it.productId),
            name,
            emoji: (typeof p.emoji === "string" && !p.emoji.startsWith("https://")) ? p.emoji : "📦",
            price: p.price,
            quantity: qty
        });
    });
    subtotal = voltRound2(subtotal);

    // كود الخصم: بيتعاد التحقق منه من قاعدة البيانات على السعر الحقيقي،
    // والـ rules بتعيد نفس الحساب وبترفض أي خصم مختلف.
    let discount = 0;
    let promoCode = null;
    let promoRef = null;
    if (payload.promoCode) {
        promoCode = voltNormalizePromoCode(payload.promoCode);
        if (!promoCode) throw new Error("كود الخصم غير صالح");
        promoRef = doc(db, "promoCodes", promoCode);
        let promoSnap;
        try {
            promoSnap = await getDoc(promoRef);
        } catch (err) {
            console.error("createSecureOrder: فشل قراءة كود الخصم", err);
            throw new Error("تعذر التحقق من كود الخصم، حاول مرة أخرى");
        }
        const evaluation = voltEvaluatePromo(promoSnap.exists() ? promoSnap.data() : null, subtotal, new Date());
        if (!evaluation.ok) {
            throw new Error("كود الخصم لم يعد صالحاً — أعد تحميل الصفحة وأعد المحاولة بدونه");
        }
        discount = evaluation.discount;
    }
    const total = voltRound2(Math.max(0, subtotal - discount));
    const method = (payload.method === "cash" && total > VOLT_CASH_DEPOSIT_THRESHOLD)
        ? "pending-deposit" : payload.method;
    if (!["cash", "pending-deposit", "instapay"].includes(method)) {
        throw new Error("طريقة الدفع غير صحيحة");
    }

    const now = new Date();
    const orderId = voltGenerateOrderId();
    const firestoreId = `${authUser.uid}__${key}`;
    const orderDoc = {
        orderId,
        uid: authUser.uid,
        customer,
        items: lines,
        subtotal,
        discount,
        promoCode,
        total,
        method,
        paymentStatus: method === "cash" ? "cod" : "unpaid",
        depositRequired: method === "pending-deposit" ? Math.ceil(total * VOLT_DEPOSIT_RATE) : 0,
        status: method === "pending-deposit" ? "معلق بانتظار العربون" : "قيد المراجعة",
        comment: String(payload.comment || "").trim().slice(0, 1000),
        date: now.toLocaleString("ar-EG", { timeZone: "Africa/Cairo" }),
        createdAt: now.toISOString(),
        archived: false
    };

    try {
        const orderRef = doc(db, "orders", firestoreId);
        if (promoRef) {
            // الأوردر وعدّاد استخدام الكود في عملية واحدة ذرّية. الـ rules
            // بتشترط الاتنين مع بعض (lastOrderDocId لازم يساوي معرّف الأوردر).
            const batch = writeBatch(db);
            batch.set(orderRef, orderDoc);
            batch.update(promoRef, { usedCount: increment(1), lastOrderDocId: firestoreId });
            await batch.commit();
        } else {
            await setDoc(orderRef, orderDoc);
        }
    } catch (err) {
        console.error("createSecureOrder: فشل حفظ الأوردر", err);
        if (err && err.code === "permission-denied") {
            throw new Error("تعذر تسجيل الطلب، غالباً الأسعار أو الكميات أو كود الخصم اتغيروا. حدّث الصفحة وحاول تاني");
        }
        throw new Error("تعذر إرسال الطلب، تحقق من الإنترنت وحاول مرة أخرى");
    }

    return { orderId, firestoreId, total, method };
}

async function saveOrderToFirestore() {
    return null;
}

async function getAllOrdersFromFirestore() {
    try {
        const snapshot = await getDocs(collection(db, "orders"));
        const orders = [];
        snapshot.forEach((docSnap) => { orders.push({ id: docSnap.id, ...docSnap.data() }); });
        return orders;
    } catch (err) {
        console.error("getAllOrdersFromFirestore: فشل جلب الأوردرات", err);
        return [];
    }
}

// ==========================================================================
// 🆕 جلب صفحة أوردرات (Pagination) — إضافية جنب getAllOrdersFromFirestore،
// مش بديل عنها. نفس نمط getProductsPageFromFirestore فوق: limit(pageSize+1)
// عشان نعرف hasMore من غير query إضافي، cursorDoc = آخر document من
// الصفحة السابقة. مخصصة للوحة الأدمن (renderAdminOrders) عشان متبقاش
// بتجيب كل الأوردرات دفعة واحدة مع كل فتح للوحة.
//
// @param {number} pageSize - افتراضي 50
// @param {Object|null} cursorDoc - آخر document من الصفحة السابقة، أو null لأول صفحة
// @returns {{orders: Array, lastDoc: Object|null, hasMore: boolean}}
async function getOrdersPageFromFirestore(pageSize = 50, cursorDoc = null) {
    try {
        const constraints = [orderBy("createdAt", "desc")];
        if (cursorDoc) constraints.push(startAfter(cursorDoc));
        constraints.push(limit(pageSize + 1));

        const q = query(collection(db, "orders"), ...constraints);
        const snapshot = await getDocs(q);

        let docs = snapshot.docs;
        const hasMore = docs.length > pageSize;
        if (hasMore) docs = docs.slice(0, pageSize);

        const orders = docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
        const lastDoc = docs.length > 0 ? docs[docs.length - 1] : null;

        return { orders, lastDoc, hasMore };
    } catch (err) {
        // أشهر سبب: composite index على orders (createdAt desc) مش موجود
        // لسه — نفس النمط اللي getProductsPageFromFirestore بيتعامل معاه.
        console.error("getOrdersPageFromFirestore: فشل جلب صفحة الأوردرات", err);
        return { orders: [], lastDoc: null, hasMore: false };
    }
}

async function updateOrderInFirestore(orderId, updatedFields) {
    try {
        await updateDoc(doc(db, "orders", orderId), updatedFields);
        return true;
    } catch (err) {
        console.error("updateOrderInFirestore: فشل تعديل الأوردر", err);
        return false;
    }
}

async function deleteOrderFromFirestore(orderId) {
    try {
        await deleteDoc(doc(db, "orders", orderId));
        return true;
    } catch (err) {
        console.error("deleteOrderFromFirestore: فشل حذف الأوردر", err);
        return false;
    }
}

// ==========================================================================
// أكواد الخصم والمفضلة
// ==========================================================================

async function deletePromoCodeFromFirestore(codeName) {
    try {
        const code = voltNormalizePromoCode(codeName);
        if (!code) return false;
        await deleteDoc(doc(db, "promoCodes", code)); // الـ rules: أدمن فقط
        return true;
    } catch (err) {
        console.error("deletePromoCodeFromFirestore: فشل حذف كود الخصم", err);
        return false;
    }
}

async function getAllPromoCodesFromFirestore() {
    try {
        const snapshot = await getDocs(collection(db, "promoCodes"));
        const codes = [];
        snapshot.forEach((docSnap) => { codes.push({ id: docSnap.id, ...docSnap.data() }); });
        return codes;
    } catch (err) {
        console.error("getAllPromoCodesFromFirestore: فشل جلب أكواد الخصم", err);
        return [];
    }
}

async function validatePromoCodeInFirestore(code, cartTotal) {
    try {
        if (!auth.currentUser) return { valid: false, reason: "error" };
        const normalized = voltNormalizePromoCode(code);
        const total = Number(cartTotal);
        if (!normalized || !Number.isFinite(total) || total < 0) return { valid: false, reason: "invalid" };

        const snap = await getDoc(doc(db, "promoCodes", normalized));
        const evaluation = voltEvaluatePromo(snap.exists() ? snap.data() : null, voltRound2(total), new Date());
        if (!evaluation.ok) return { valid: false, reason: evaluation.reason };
        return { valid: true, discount_amount: evaluation.discount, code: normalized };
    } catch (err) {
        console.error("validatePromoCodeInFirestore: فشل التحقق", err);
        return { valid: false, reason: "error" };
    }
}

async function getFavoritesFromFirestore(uid) {
    try {
        const docSnap = await getDoc(doc(db, "favorites", uid));
        return docSnap.exists() ? (docSnap.data().productIds || []) : [];
    } catch (err) {
        console.warn("getFavoritesFromFirestore: فشل");
        return [];
    }
}

async function saveFavoritesToFirestore(uid, productIds) {
    try {
        await setDoc(doc(db, "favorites", uid), { productIds });
        return true;
    } catch (err) {
        console.error("saveFavoritesToFirestore: فشل حفظ المفضلة", err);
        return false;
    }
}

// ==========================================================================
// تصنيفات المتجر (Folders) — Firestore
// ==========================================================================

async function getFoldersFromFirestore() {
    try {
        const snapshot = await getDocs(collection(db, "folders"));
        const folders = [];
        snapshot.forEach((docSnap) => { folders.push({ id: docSnap.id, ...docSnap.data() }); });
        return folders;
    } catch (err) {
        console.error("getFoldersFromFirestore: فشل جلب التصنيفات", err);
        return [];
    }
}

async function saveFolderToFirestore(folderData) {
    try {
        const folderId = folderData.id || ("f_" + Date.now());
        const { id, ...rest } = folderData;
        await setDoc(doc(db, "folders", folderId), { ...rest, productIds: rest.productIds || [] }, { merge: true });
        return folderId;
    } catch (err) {
        console.error("saveFolderToFirestore: فشل حفظ التصنيف", err);
        return null;
    }
}

async function updateFolderInFirestore(folderId, updatedFields) {
    try {
        await updateDoc(doc(db, "folders", folderId), updatedFields);
        return true;
    } catch (err) {
        console.error("updateFolderInFirestore: فشل تعديل التصنيف", err);
        return false;
    }
}

async function deleteFolderFromFirestore(folderId) {
    try {
        await deleteDoc(doc(db, "folders", folderId));
        return true;
    } catch (err) {
        console.error("deleteFolderFromFirestore: فشل حذف التصنيف", err);
        return false;
    }
}

// ==========================================================================
// إدارة المهام — Firestore
// ==========================================================================

async function getTasksFromFirestore() {
    try {
        const snapshot = await getDocs(collection(db, "tasks"));
        const tasks = [];
        snapshot.forEach((docSnap) => { tasks.push({ id: docSnap.id, ...docSnap.data() }); });
        return tasks;
    } catch (err) {
        console.error("getTasksFromFirestore: فشل جلب المهام", err);
        return [];
    }
}

async function addTaskToFirestore(taskData) {
    try {
        const docRef = await addDoc(collection(db, "tasks"), taskData);
        return docRef.id;
    } catch (err) {
        console.error("addTaskToFirestore: فشل إضافة المهمة", err);
        return null;
    }
}

async function deleteTaskFromFirestore(taskId) {
    try {
        await deleteDoc(doc(db, "tasks", taskId));
        return true;
    } catch (err) {
        console.error("deleteTaskFromFirestore: فشل حذف المهمة", err);
        return false;
    }
}

async function deleteAllTasksFromFirestore() {
    try {
        const snapshot = await getDocs(collection(db, "tasks"));
        const deletes = [];
        snapshot.forEach((docSnap) => { deletes.push(deleteDoc(doc(db, "tasks", docSnap.id))); });
        await Promise.all(deletes);
        return true;
    } catch (err) {
        console.error("deleteAllTasksFromFirestore: فشل مسح المهام", err);
        return false;
    }
}

async function deleteUserFromFirestore(uid) {
    try {
        await deleteDoc(doc(db, "users", uid));
        return true;
    } catch (err) {
        console.error("deleteUserFromFirestore: فشل حذف المستخدم", err);
        return false;
    }
}
async function deleteUserAccountSecure(uid) {
    try {
        const callable = httpsCallable(functions, "deleteUserAccount");
        await callable({ uid });
        return true;
    } catch (err) {
        console.error("deleteUserAccountSecure: فشل حذف الحساب", err);
        return false;
    }
}
function voltLooseNumber(v) {
    if (typeof v === "number") return Number.isFinite(v) ? v : 0;
    const n = parseFloat(String(v == null ? "" : v).replace(/[^\d.]/g, ""));
    return Number.isFinite(n) ? n : 0;
}

// يرجع null (بدون انتهاء) أو Timestamp، أو undefined لو القيمة غير صالحة.
function voltToPromoTimestamp(v) {
    if (v === undefined || v === null || v === "") return null;
    if (typeof v.toDate === "function") return v;
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? undefined : Timestamp.fromDate(d);
}

// تطبيع وتحقق مطابق لـ isValidPromo() في firestore.rules. usedCount لا يُرسل
// أبداً من هنا للأكواد الموجودة (merge بيحافظ على قيمته).
async function savePromoCodeToFirestore(codeData) {
    try {
        const authUser = auth.currentUser;
        if (!authUser) return false;

        const data = codeData || {};
        const code = voltNormalizePromoCode(data.code);
        if (!code) throw new Error("كود الخصم غير صالح");
        const type = data.type;
        if (!["percentage", "fixed", "free_shipping"].includes(type)) throw new Error("نوع الخصم غير صحيح");
        if (data.status !== "active" && data.status !== "inactive") throw new Error("حالة الكود غير صحيحة");

        const percentOff = type === "percentage"
            ? (Number(data.percentOff) > 0 ? Number(data.percentOff) : voltLooseNumber(data.value)) : 0;
        const fixedAmount = type === "fixed"
            ? (Number(data.fixedAmount) > 0 ? Number(data.fixedAmount) : voltLooseNumber(data.value)) : 0;
        if (type === "percentage" && !(percentOff > 0 && percentOff <= 100)) throw new Error("نسبة الخصم يجب أن تكون بين 1 و100");
        if (type === "fixed" && !(fixedAmount > 0 && fixedAmount <= 1000000)) throw new Error("قيمة الخصم غير صحيحة");

        const minOrder = Number(data.minOrder) || 0;
        const maxDiscount = Number(data.maxDiscount) || 0;
        if (minOrder < 0 || minOrder > 10000000 || maxDiscount < 0 || maxDiscount > 10000000) {
            throw new Error("البيانات المرسلة خارج النطاق المسموح");
        }

        let maxUses = null;
        if (data.maxUses !== undefined && data.maxUses !== null && data.maxUses !== "") {
            maxUses = Number(data.maxUses);
            if (!Number.isInteger(maxUses) || maxUses < 1 || maxUses > 1000000000) throw new Error("الحد الأقصى للاستخدام غير صالح");
        }

        const expiresAt = voltToPromoTimestamp(data.expiresAt);
        if (expiresAt === undefined) throw new Error("تاريخ الانتهاء غير صالح");

        const ref = doc(db, "promoCodes", code);
        const existing = await getDoc(ref);
        const nowIso = new Date().toISOString();

        const payload = {
            code,
            type,
            status: data.status,
            value: typeof data.value === "string" ? data.value.slice(0, 40) : "",
            percentOff,
            fixedAmount,
            shippingDiscount: type === "free_shipping",
            minOrder,
            maxUses,
            maxDiscount,
            expiresAt,
            updatedAt: nowIso,
            updatedBy: authUser.uid
        };
        if (!existing.exists()) {
            payload.usedCount = 0;
            payload.createdAt = nowIso;
        }

        await setDoc(ref, payload, { merge: true });
        return true;
    } catch (err) {
        console.error("savePromoCodeToFirestore: فشل حفظ كود الخصم", err);
        return false;
    }
}
// إتاحة الدوال للملفات التانية
window.voltFirebase.getAllUsers = getAllUsersFromFirestore;
window.voltFirebase.findUserByIdNum = findUserByIdNumFromFirestore;
window.voltFirebase.findUserByEmail = findUserByEmailFromFirestore;
window.voltFirebase.identifierTaken = identifierTaken;
window.voltFirebase.createSecureOrder = createSecureOrder;
window.voltFirebase.registerClient = registerClientUser;
window.voltFirebase.signInClient = signInClientUser;
window.voltFirebase.signOutUser = signOutUser;
window.voltFirebase.saveUserProfile = saveUserProfileToFirestore;
window.voltFirebase.saveOrder = saveOrderToFirestore;
window.voltFirebase.getAllOrders = getAllOrdersFromFirestore;
window.voltFirebase.getOrdersPage = getOrdersPageFromFirestore;
window.voltFirebase.updateOrder = updateOrderInFirestore;
window.voltFirebase.deleteOrder = deleteOrderFromFirestore;
window.voltFirebase.getAllPromoCodes = getAllPromoCodesFromFirestore;
window.voltFirebase.savePromoCode = savePromoCodeToFirestore;
window.voltFirebase.deletePromoCode = deletePromoCodeFromFirestore;
window.voltFirebase.validatePromoCode = validatePromoCodeInFirestore;
window.voltFirebase.getFavorites = getFavoritesFromFirestore;
window.voltFirebase.saveFavorites = saveFavoritesToFirestore;
window.voltFirebase.getFolders = getFoldersFromFirestore;
window.voltFirebase.saveFolder = saveFolderToFirestore;
window.voltFirebase.updateFolder = updateFolderInFirestore;
window.voltFirebase.deleteFolder = deleteFolderFromFirestore;
window.voltFirebase.getTasks = getTasksFromFirestore;
window.voltFirebase.addTask = addTaskToFirestore;
window.voltFirebase.deleteTask = deleteTaskFromFirestore;
window.voltFirebase.deleteAllTasks = deleteAllTasksFromFirestore;
window.voltFirebase.deleteUser = deleteUserAccountSecure;
window.voltFirebase.getCurrentUserProfile = getCurrentUserProfile;
window.voltFirebase.logAnalyticsEvent = async function logAnalyticsEvent() { return true; };
window.dispatchEvent(new Event('voltFirebaseReady'));
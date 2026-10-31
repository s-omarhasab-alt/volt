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
    startAfter
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
window.dispatchEvent(new Event('voltFirebaseReady'));

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

async function createSecureOrder(payload) {
    const callable = httpsCallable(functions, "createSecureOrder");
    const res = await callable(payload);
    return res && res.data ? res.data : null;
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
        const callable = httpsCallable(functions, "deletePromoCode");
        const res = await callable({ code: String(codeName || "") });
        return !!(res && res.data && res.data.success);
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
        const callable = httpsCallable(functions, "validatePromoCode");
        const res = await callable({ code: String(code || ""), cartTotal: Number(cartTotal) });
        return res && res.data ? res.data : { valid: false, reason: "error" };
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
async function savePromoCodeToFirestore(codeData) {
    try {
        const callable = httpsCallable(functions, "savePromoCode");
        const res = await callable(codeData);
        return !!(res && res.data && res.data.success);
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

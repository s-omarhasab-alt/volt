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
    limit
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";
// 🆕 استدعاء خدمة تسجيل الدخول (Authentication)
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js";
// 🆕 إضافة جديدة: هنحتاجها في الخطوة 4 عشان نجيب الـ role من Firestore

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
// 🆕 إضافة جديدة: تشغيل خدمة تسجيل الدخول
const auth = getAuth(app);

// تصدير المتغيرات عشان نقدر نستخدمها في باقي ملفات الموقع بعدين (للملفات اللي هي modules برضه)
export { app, db, auth, signInWithEmailAndPassword, doc, getDoc };

// 🆕 إضافة جديدة: "البريزة" المشتركة — بنحط هنا كل حاجة script.js
// (اللي هو مش module) محتاج يوصلها. أي ملف عادي في الصفحة يقدر
// يقرا من window.voltFirebase من غير ما يحتاج import خالص.
window.voltFirebase = { auth, db, signInWithEmailAndPassword, doc, getDoc };
window.dispatchEvent(new Event('voltFirebaseReady'));
// ==========================================================================
// دوال المنتجات — Firestore
// ==========================================================================

// جلب كل المنتجات من Firestore
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

// إضافة منتج جديد (معرف تلقائي من Firestore)
async function addProductToFirestore(productData) {
    try {
        const docRef = await addDoc(collection(db, "products"), productData);
        return docRef.id;
    } catch (err) {
        console.error("addProductToFirestore: فشل إضافة المنتج", err);
        return null;
    }
}

// تعديل منتج موجود (بمعرفه)
async function updateProductInFirestore(productId, updatedFields) {
    try {
        await updateDoc(doc(db, "products", productId), updatedFields);
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
    try {
        const q = query(collection(db, "users"), where("idNum", "==", idNum), limit(1));
        const snapshot = await getDocs(q);
        let user = null;
        snapshot.forEach((docSnap) => { user = { uid: docSnap.id, ...docSnap.data() }; });
        return user;
    } catch (err) {
        console.warn("findUserByIdNumFromFirestore: فشل البحث", err);
        return null;
    }
}

async function findUserByEmailFromFirestore(email) {
    try {
        const q = query(collection(db, "users"), where("email", "==", email), limit(1));
        const snapshot = await getDocs(q);
        let user = null;
        snapshot.forEach((docSnap) => { user = { uid: docSnap.id, ...docSnap.data() }; });
        return user;
    } catch (err) {
        console.warn("findUserByEmailFromFirestore: فشل البحث", err);
        return null;
    }
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

        await setDoc(doc(db, "users", uid), {
            ...profile,
            email: email ? email.trim() : "غير محدد",
            uid,
            role: "client",
            createdAt: new Date().toISOString()
        });

        return { uid, email: finalEmail };
    } catch (err) {
        console.error("registerClientUser: فشل التسجيل", err);
        return { error: err.code || "unknown", message: err.message };
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
        await setDoc(doc(db, "users", uid), profile, { merge: true });
        return true;
    } catch (err) {
        console.error("saveUserProfileToFirestore: فشل حفظ البروفايل", err);
        return false;
    }
}

async function saveOrderToFirestore(orderData) {
    try {
        const docRef = await addDoc(collection(db, "orders"), orderData);
        return docRef.id;
    } catch (err) {
        console.error("saveOrderToFirestore: فشل حفظ الأوردر", err);
        return null;
    }
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

async function savePromoCodeToFirestore(codeData) {
    try {
        const codeId = String(codeData.code).toUpperCase();
        await setDoc(doc(db, "promoCodes", codeId), codeData, { merge: true });
        return true;
    } catch (err) {
        console.error("savePromoCodeToFirestore: فشل حفظ كود الخصم", err);
        return false;
    }
}

async function deletePromoCodeFromFirestore(codeName) {
    try {
        await deleteDoc(doc(db, "promoCodes", String(codeName).toUpperCase()));
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
        const docSnap = await getDoc(doc(db, "promoCodes", String(code).toUpperCase()));
        if (!docSnap.exists()) return { valid: false, reason: "not_found" };
        const data = docSnap.data();
        if (data.status !== "active") return { valid: false, reason: "inactive" };
        if (typeof data.minOrder === "number" && cartTotal < data.minOrder) return { valid: false, reason: "min_order" };
        if (typeof data.maxUses === "number" && (data.uses || 0) >= data.maxUses) return { valid: false, reason: "expired" };

        let discountAmount = Number(data.discountAmount) || 0;
        if (data.type === "percentage" && typeof data.percentOff === "number") {
            discountAmount = cartTotal * (data.percentOff / 100);
            if (typeof data.maxDiscount === "number" && data.maxDiscount > 0) {
                discountAmount = Math.min(discountAmount, data.maxDiscount);
            }
        } else if (data.type === "fixed" && typeof data.fixedAmount === "number") {
            discountAmount = Math.min(data.fixedAmount, cartTotal);
        } else if (data.type === "free_shipping") {
            discountAmount = 0;
        }

        return { valid: true, discount_amount: Math.round(discountAmount * 100) / 100 };
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
        await setDoc(doc(db, "favorites", uid), { productIds }, { merge: true });
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

// إتاحة الدوال للملفات التانية
window.voltFirebase.getAllUsers = getAllUsersFromFirestore;
window.voltFirebase.findUserByIdNum = findUserByIdNumFromFirestore;
window.voltFirebase.findUserByEmail = findUserByEmailFromFirestore;
window.voltFirebase.registerClient = registerClientUser;
window.voltFirebase.signInClient = signInClientUser;
window.voltFirebase.signOutUser = signOutUser;
window.voltFirebase.saveUserProfile = saveUserProfileToFirestore;
window.voltFirebase.saveOrder = saveOrderToFirestore;
window.voltFirebase.getAllOrders = getAllOrdersFromFirestore;
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
window.voltFirebase.deleteUser = deleteUserFromFirestore;
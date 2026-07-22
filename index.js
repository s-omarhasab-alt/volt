/**
 * functions/index.js — VOLT Secure Order Creation
 * ==========================================================================
 * المشكلة اللي بتحلها الفانكشن دي:
 * حالياً processFinalOrder() في script.js بتحسب الإجمالي من cart[].price،
 * وده رقم موجود في localStorage — أي زائر يقدر يفتح Console ويغيّره قبل
 * ما يضغط "إتمام الشراء". الفانكشن دي بتقفل الثغرة دي: العميل يبعت بس
 * الـ IDs والكميات، والسيرفر (هنا) هو اللي يجيب السعر الحقيقي من Firestore
 * ويحسب بنفسه — العميل مبقاش له أي سيطرة على الرقم النهائي.
 *
 * إزاي هتتربط بالكود الحالي (script.js):
 * processFinalOrder() هتتغير عشان تنادي الفانكشن دي بدل ما تحسب الإجمالي
 * بنفسها. التفاصيل في التعليق آخر الملف.
 * ==========================================================================
 */

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

initializeApp();
const db = getFirestore();

/**
 * createSecureOrder
 * -----------------
 * Input (من العميل، عبر httpsCallable):
 *   {
 *     items: [{ productId: string, quantity: number }, ...],
 *     promoCode: string | null,
 *     customer: { name, phone, address, code },
 *     comment: string,
 *     method: "cash" | "instapay" | "pending-deposit"
 *   }
 *
 * Output:
 *   {
 *     orderId: string,
 *     total: number,          // الرقم الموثوق النهائي
 *     originalTotal: number,  // قبل الخصم
 *     discountApplied: number
 *   }
 *
 * ملاحظة أمان: الفانكشن دي بتتطلب request.auth (المستخدم لازم يكون
 * مسجل دخول فعلياً عبر Firebase Auth) — نفس الشرط الموجود في
 * orders Rule بتاعتك (allow create: if isSignedIn() && ...uid...).
 * الفانكشن هي اللي بتكتب uid في المستند، مش العميل، فمفيش طريقة
 * حد ينشئ أوردر باسم حد تاني.
 */
exports.createSecureOrder = onCall(async (request) => {
    // ── 1. التأكد إن المستخدم مسجل دخول ────────────────────────────────────
    if (!request.auth) {
        throw new HttpsError(
            "unauthenticated",
            "يجب تسجيل الدخول لإتمام الشراء."
        );
    }
    const uid = request.auth.uid;

    const { items, promoCode, customer, comment, method } = request.data;

    // ── 2. تحقق أساسي من شكل البيانات ──────────────────────────────────────
    if (!Array.isArray(items) || items.length === 0) {
        throw new HttpsError("invalid-argument", "السلة فارغة أو غير صالحة.");
    }
    if (!customer || !customer.name || !customer.address) {
        throw new HttpsError("invalid-argument", "بيانات العميل ناقصة.");
    }

    // ── 3. جلب السعر الحقيقي لكل منتج من Firestore مباشرة ──────────────────
    // هنا بالظبط بتتقفل الثغرة: مفيش سعر جاي من العميل بيتصدق.
    // كل سعر بييجي من مستند المنتج نفسه في قاعدة البيانات.
    let originalTotal = 0;
    const orderItems = [];
    const stockUpdates = []; // عشان نقلل المخزون بعد نجاح الأوردر

    for (const requestedItem of items) {
        const { productId, quantity } = requestedItem;

        if (!productId || typeof quantity !== "number" || quantity < 1) {
            throw new HttpsError(
                "invalid-argument",
                `بيانات المنتج غير صالحة: ${productId}`
            );
        }

        const productSnap = await db.collection("products").doc(String(productId)).get();
        if (!productSnap.exists) {
            throw new HttpsError(
                "not-found",
                `المنتج غير موجود: ${productId}`
            );
        }

        const productData = productSnap.data();
        const realPrice = Number(productData.price) || 0;
        const availableStock = Number(productData.stock) || 0;

        // ── تحقق المخزون سيرفر-سايد أيضاً — نفس منطق addToCart لكن موثوق ──
        if (availableStock < quantity) {
            throw new HttpsError(
                "failed-precondition",
                `الكمية المطلوبة من "${productData.name}" غير متوفرة. المتبقي: ${availableStock}`
            );
        }

        originalTotal += realPrice * quantity;

        orderItems.push({
            productId: String(productId),
            name: productData.name,
            price: realPrice, // السعر الحقيقي من قاعدة البيانات، مش من العميل
            emoji: productData.emoji || "📦",
            quantity
        });

        stockUpdates.push({
            ref: productSnap.ref,
            newStock: availableStock - quantity
        });
    }

    // ── 4. تحقق كود الخصم سيرفر-سايد (نفس منطق validatePromoCodeInFirestore) ─
    let discountAmount = 0;
    let appliedPromoLabel = "";

    if (promoCode) {
        const codeSnap = await db.collection("promoCodes").doc(String(promoCode).toUpperCase()).get();
        if (codeSnap.exists) {
            const codeData = codeSnap.data();
            const isValid =
                codeData.status === "active" &&
                (typeof codeData.minOrder !== "number" || originalTotal >= codeData.minOrder) &&
                (typeof codeData.maxUses !== "number" || (codeData.uses || 0) < codeData.maxUses);

            if (isValid) {
                if (codeData.type === "percentage" && typeof codeData.percentOff === "number") {
                    discountAmount = originalTotal * (codeData.percentOff / 100);
                    if (typeof codeData.maxDiscount === "number" && codeData.maxDiscount > 0) {
                        discountAmount = Math.min(discountAmount, codeData.maxDiscount);
                    }
                } else if (codeData.type === "fixed" && typeof codeData.fixedAmount === "number") {
                    discountAmount = Math.min(codeData.fixedAmount, originalTotal);
                }
                discountAmount = Math.round(discountAmount * 100) / 100;
                appliedPromoLabel = ` (تم استخدام كود: ${String(promoCode).toUpperCase()})`;
            }
            // لو مش valid: بنكمل من غير خصم، بصمت — نفس سلوك الكود الحالي
            // في applyCustomerPromo اللي بيرفض بهدوء من غير ما يكشف السبب.
        }
    }

    const finalTotal = Math.max(0, originalTotal - discountAmount);

    // ── 5. بناء وحفظ الأوردر — uid مطابق تماماً لما تطلبه orders Rule ──────
    const orderId = "VOLT-OR-" + Math.floor(Math.random() * 900000 + 100000);
    const finalComment = appliedPromoLabel ? (comment || "") + appliedPromoLabel : (comment || "لا توجد ملاحظات");

    const newOrder = {
        orderId,
        date: new Date().toLocaleString("ar-EG"),
        createdAt: new Date().toISOString(),
        customer: {
            name: customer.name,
            phone: customer.phone || "",
            address: customer.address,
            code: customer.code || "",
            uid
        },
        items: orderItems,
        total: finalTotal,
        comment: finalComment,
        method: method === "cash" ? "كاش عند الاستلام"
            : method === "pending-deposit" ? "كاش (بانتظار تحويل الديبوزت)"
            : "إنستاباي كامل",
        status: method === "pending-deposit" ? "معلق بانتظار العربون" : "قيد المراجعة",
        uid // ← هذا الحقل بالظبط هو اللي orders Rule بتتحقق منه (request.resource.data.uid)
    };

    const orderRef = await db.collection("orders").add(newOrder);

    // ── 6. تحديث المخزون بعد نجاح الحفظ (transaction-safe كان أفضل، ملاحظة تحت) ─
    for (const update of stockUpdates) {
        await update.ref.update({ stock: update.newStock });
    }

    return {
        orderId,
        firestoreId: orderRef.id,
        total: finalTotal,
        originalTotal,
        discountApplied: discountAmount
    };
});
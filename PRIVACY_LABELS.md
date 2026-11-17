# 🛡️ تعبئة خصوصية المتاجر لإصدار 1.4 (مشاركة الرحلة)

الإصدار 1.4 أضاف ميزة **اختيارية** ترفع نص الرحلة المشتركة إلى سيرفر الغرف. لازم تحدّث إجاباتك بالمتجرين **قبل** إرسال التحديث للمراجعة، وتحدّث صفحة سياسة الخصوصية المستضافة (استبدل محتواها بـ `privacy-policy.html` (بجذر المستودع) الجديد وأبقِ بريد التواصل الحقيقي).

> هذا ملخص للتعبئة بحسب طريقة عمل التطبيق، وهو مو استشارة قانونية. إذا مو متأكد من خانة، اختر الإفصاح الأوسع.

---

## 🍎 Apple — App Privacy (App Store Connect → App Privacy)

اضغط **Edit** على "Data Types" وغيّر "No, we do not collect data" إلى **Yes, we collect data**، ثم:

| النوع | الإجابة |
|---|---|
| **Contact Info** (اسم، إيميل، جوال) | ❌ لا نجمع |
| **User Content → Other User Content** | ✅ نعم — أسماء المشاركين (يكتبها المستخدم وقد تكون مستعارة) والتكاليف في الرحلات المشتركة فقط |
| Photos or Videos | ❌ لا (صور الفواتير تبقى على الجوال) |
| Identifiers (User ID / Device ID) | ❌ لا |
| Usage Data / Diagnostics / Location / Contacts | ❌ لا |

لنوع **Other User Content** اختر:
- **Used for tracking?** → **No**
- **Linked to the user's identity?** → **No** (لا حسابات ولا معرّفات؛ الدخول بكود عشوائي)
- **Purpose** → **App Functionality**

وفي الإصدار نفسه، أجب بـ **No** على التشفير غير المعفى (مضاف أصلًا بـ `ITSAppUsesNonExemptEncryption = false` لأننا نستخدم HTTPS القياسي فقط).

---

## 🤖 Google Play — Data safety (Play Console → App content → Data safety)

1. **Does your app collect or share any of the required user data types?** → **Yes**
2. **Is all of the user data collected by your app encrypted in transit?** → **Yes** (HTTPS)
3. **Do you provide a way for users to request that their data be deleted?** → **Yes** — حذف الغرفة من التطبيق مباشرة (للمالك)، وحذف تلقائي بعد 90 يومًا من الخمول.
4. أنواع البيانات:

| القسم / النوع | Collected | Shared | Optional | Purpose |
|---|---|---|---|---|
| **App activity → Other user-generated content** | ✅ Yes | ❌ No | ✅ Yes (فقط لمن يشارك رحلة) | App functionality |
| Personal info (Name, Email, Phone…) | ❌ | — | — | — |
| Photos and videos | ❌ (تبقى على الجوال) | — | — | — |
| Messages (SMS) | ❌ (نص يلصقه المستخدم ويُحلَّل على جهازه ولا يُرسل) | — | — | — |
| Device or other IDs / Location | ❌ | — | — | — |

> ملاحظة: التطبيق **لا يطلب إذن قراءة الرسائل** إطلاقًا — لصق نص فقط — فلا تنطبق سياسة أذونات SMS.

---

## 📋 أذونات التطبيق

- **الكاميرا:** فقط عند ضغط "التقاط بالكاميرا" لإرفاق فاتورة (اختياري). نص طلب الإذن بالعربي والإنجليزي موجود في `app.json`.
- **الصور:** عبر منتقي الصور — اختياري.
- **الإنترنت:** للمشاركة فقط. الرحلات المحلية تعمل بدون إنترنت.

---

## 🧾 ما تكتبه في "What's New" (انسخ)

**Arabic**
```
جديد في قطّة 1.4:
• الإعدادات: وضع ليلي، واختيار عملة لكل رحلة (ريال، درهم، دينار، دولار...)
• تعديل التكاليف بعد إضافتها
• إحصائيات الرحلة (حسب النوع، ومن دفع أكثر، واليوم)
• تصدير نتائج الرحلة بصيغة PDF
• إضافة تكلفة من رسالة البنك: ألصق الرسالة ويقرأ التطبيق المبلغ والمتجر على جوالك
• إرفاق صورة الفاتورة (تبقى على جوالك)
• مشاركة الرحلة بكود مع أصحابك بصلاحيات: مشاهد، مدخل فقط، مدخل ومعدّل — بدون حسابات
• تحسين الترجمة الإنجليزية
```

**English**
```
What's new in Qatta 1.4:
• Settings: dark mode and a currency for each trip (SAR, AED, KWD, USD...)
• Edit costs after adding them
• Trip statistics (by type, who paid most, daily)
• Export the trip results as a PDF
• Add a cost from a bank message: paste it and the app reads the amount and merchant on your phone
• Attach a receipt photo (stays on your phone)
• Share a trip with a code and choose each person's role: viewer, entry only, entry & edit — no accounts needed
• Improved English translation
```

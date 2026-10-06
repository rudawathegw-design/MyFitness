// Demo data: the real MY FITNESS café menu board (Healthy Meals, Milkshakes,
// Coffee, Pizza) in Kurdish / Arabic / English, plus tables, staff and settings.
// Prices are demo values — edit them in the staff panel.
import { uid, rid, dayKey, startOfDay, mulberry32, pickWeighted, parseHM, TZ } from './util.js';

const U = (id) => `https://images.unsplash.com/photo-${id}`;
const n3 = (en, ckb, ar) => ({ en, ckb, ar });

/* ---------- reusable option groups ---------- */
const SIZE_COFFEE = { id: 'size', type: 'one', required: true, name: n3('Size', 'قەبارە', 'الحجم'), choices: [
  { id: 's', name: n3('Small', 'بچووک', 'صغير'), price: 0 },
  { id: 'm', name: n3('Medium', 'مامناوەند', 'وسط'), price: 500 },
  { id: 'l', name: n3('Large', 'گەورە', 'كبير'), price: 1000 },
] };
const MILK = { id: 'milk', type: 'one', required: true, name: n3('Milk', 'شیر', 'الحليب'), choices: [
  { id: 'full', name: n3('Full cream', 'شیری تەواو', 'كامل الدسم'), price: 0 },
  { id: 'skim', name: n3('Skimmed', 'شیری بێ چەوری', 'خالي الدسم'), price: 0 },
  { id: 'oat', name: n3('Oat milk', 'شیری جۆ', 'حليب الشوفان'), price: 750 },
  { id: 'almond', name: n3('Almond milk', 'شیری بادەم', 'حليب اللوز'), price: 750 },
] };
const COFFEE_EXTRAS = { id: 'extras', type: 'many', required: false, max: 3, name: n3('Extras', 'زیادە', 'إضافات'), choices: [
  { id: 'shot', name: n3('Extra shot', 'شۆتی زیادە', 'شوت إضافي'), price: 750 },
  { id: 'vanilla', name: n3('Vanilla syrup', 'شەربەتی ڤانیلا', 'شراب الفانيلا'), price: 500 },
  { id: 'caramel', name: n3('Caramel syrup', 'شەربەتی کەرامێل', 'شراب الكراميل'), price: 500 },
  { id: 'sf', name: n3('Sugar-free sweetener', 'شیرینکەرەوەی بێ شەکر', 'محلٍّ خالٍ من السكر'), price: 0 },
] };
const SUGAR = { id: 'sugar', type: 'one', required: true, name: n3('Sugar', 'شەکر', 'السكر'), choices: [
  { id: 'none', name: n3('No sugar', 'بێ شەکر', 'بدون سكر'), price: 0 },
  { id: 'less', name: n3('Less sugar', 'شەکری کەم', 'سكر قليل'), price: 0 },
  { id: 'normal', name: n3('Normal', 'ئاسایی', 'عادي'), price: 0 },
] };
const SHOTS = { id: 'shots', type: 'one', required: true, name: n3('Shots', 'شۆت', 'الشوت'), choices: [
  { id: 'single', name: n3('Single', 'یەک شۆت', 'مفرد'), price: 0 },
  { id: 'double', name: n3('Double', 'دوو شۆت', 'مزدوج'), price: 750 },
] };
const SIZE_SHAKE = { id: 'size', type: 'one', required: true, name: n3('Size', 'قەبارە', 'الحجم'), choices: [
  { id: 'r', name: n3('Regular', 'ئاسایی', 'عادي'), price: 0 },
  { id: 'l', name: n3('Large', 'گەورە', 'كبير'), price: 1000 },
] };
const BOOSTERS = { id: 'boost', type: 'many', required: false, max: 3, name: n3('Boosters', 'بەهێزکەرەکان', 'معززات'), choices: [
  { id: 'whey', name: n3('Whey protein scoop', 'سکووپی پرۆتینی وەی', 'مغرفة بروتين واي'), price: 2000 },
  { id: 'pb', name: n3('Peanut butter', 'کەرەی فستق', 'زبدة الفول السوداني'), price: 750 },
  { id: 'oats', name: n3('Oats', 'جۆ', 'شوفان'), price: 500 },
  { id: 'cream', name: n3('Whipped cream', 'کرێمی شیرین', 'كريمة مخفوقة'), price: 500 },
] };
const FLAVOR = { id: 'flavor', type: 'one', required: true, name: n3('Flavour', 'تام', 'النكهة'), choices: [
  { id: 'choc', name: n3('Chocolate', 'چوکلێت', 'شوكولاتة'), price: 0 },
  { id: 'van', name: n3('Vanilla', 'ڤانیلا', 'فانيلا'), price: 0 },
  { id: 'straw', name: n3('Strawberry', 'شلیک', 'فراولة'), price: 0 },
] };
const SHAKE_MILK = { id: 'milk', type: 'one', required: true, name: n3('Milk', 'شیر', 'الحليب'), choices: [
  { id: 'almond', name: n3('Almond milk', 'شیری بادەم', 'حليب اللوز'), price: 0 },
  { id: 'skim', name: n3('Skimmed milk', 'شیری بێ چەوری', 'حليب خالي الدسم'), price: 0 },
  { id: 'oat', name: n3('Oat milk', 'شیری جۆ', 'حليب الشوفان'), price: 0 },
  { id: 'water', name: n3('Water', 'ئاو', 'ماء'), price: 0 },
] };
const MEAL_ADD = { id: 'add', type: 'many', required: false, max: 3, name: n3('Add-ons', 'زیادکراوەکان', 'إضافات'), choices: [
  { id: 'chicken', name: n3('Extra grilled chicken', 'مریشکی برژاوی زیادە', 'دجاج مشوي إضافي'), price: 2500 },
  { id: 'egg', name: n3('Boiled egg', 'هێلکەی کوڵاو', 'بيض مسلوق'), price: 750 },
  { id: 'avocado', name: n3('Avocado', 'ئەڤۆکادۆ', 'أفوكادو'), price: 1500 },
  { id: 'quinoa', name: n3('Extra quinoa', 'کینوای زیادە', 'كينوا إضافية'), price: 1000 },
] };
const DRESSING = { id: 'dressing', type: 'one', required: true, name: n3('Dressing', 'سۆس', 'الصلصة'), choices: [
  { id: 'lemon', name: n3('Lemon & olive oil', 'لیمۆ و زەیتی زەیتوون', 'ليمون وزيت زيتون'), price: 0 },
  { id: 'yogurt', name: n3('Yogurt & herbs', 'ماست و گیا', 'لبن وأعشاب'), price: 0 },
  { id: 'balsamic', name: n3('Balsamic', 'بالسامیک', 'بلسميك'), price: 0 },
  { id: 'tahini', name: n3('Tahini', 'تەحینە', 'طحينة'), price: 0 },
] };
const TOAST_ADD = { id: 'add', type: 'many', required: false, max: 3, name: n3('Add-ons', 'زیادکراوەکان', 'إضافات'), choices: [
  { id: 'egg', name: n3('Poached egg', 'هێلکەی کوڵاو', 'بيض مسلوق'), price: 750 },
  { id: 'feta', name: n3('Feta cheese', 'پەنیری فێتا', 'جبنة فيتا'), price: 1000 },
  { id: 'salmon', name: n3('Smoked salmon', 'سالمۆنی دووکەڵاوی', 'سلمون مدخن'), price: 3000 },
] };
const WRAP_SIDE = { id: 'side', type: 'one', required: true, name: n3('Side', 'لاوەکی', 'طبق جانبي'), choices: [
  { id: 'none', name: n3('No side', 'بێ لاوەکی', 'بدون'), price: 0 },
  { id: 'salad', name: n3('Side salad', 'زەڵاتە', 'سلطة جانبية'), price: 1500 },
  { id: 'fries', name: n3('Baked fries', 'پەتاتەی برژاو لە فڕن', 'بطاطا مخبوزة'), price: 2000 },
] };
const PIZZA_SIZE = { id: 'size', type: 'one', required: true, name: n3('Size', 'قەبارە', 'الحجم'), choices: [
  { id: 'p', name: n3('Personal 8″', 'تاکەکەسی 8″', 'فردي 8″'), price: 0 },
  { id: 'm', name: n3('Medium 12″', 'مامناوەند 12″', 'وسط 12″'), price: 4000 },
] };
const CRUST = { id: 'crust', type: 'one', required: true, name: n3('Crust', 'هەویر', 'العجينة'), choices: [
  { id: 'classic', name: n3('Classic', 'ئاسایی', 'كلاسيكية'), price: 0 },
  { id: 'thin', name: n3('Thin', 'تەنک', 'رقيقة'), price: 0 },
  { id: 'wheat', name: n3('Whole wheat', 'گەنمی تەواو', 'قمح كامل'), price: 1000 },
] };
const PIZZA_EXTRAS = { id: 'extras', type: 'many', required: false, max: 3, name: n3('Extra toppings', 'زیادکراوەکان', 'إضافات'), choices: [
  { id: 'cheese', name: n3('Extra cheese', 'پەنیری زیادە', 'جبنة إضافية'), price: 1500 },
  { id: 'mush', name: n3('Mushrooms', 'قارچک', 'فطر'), price: 1000 },
  { id: 'jal', name: n3('Jalapeños', 'هالاپینۆ', 'هالابينو'), price: 750 },
  { id: 'olive', name: n3('Olives', 'زەیتوون', 'زيتون'), price: 750 },
] };

export const SEED_CATEGORIES = [
  { id: 'healthy', icon: 'bowl', sort: 1, active: true, name: n3('Healthy Meals', 'خواردنی تەندروست', 'وجبات صحية'), tagline: n3('Good food · Stronger you', 'خواردنی باش · تۆی بەهێزتر', 'طعام جيد · أنت أقوى') },
  { id: 'shakes', icon: 'shake', sort: 2, active: true, name: n3('Milkshakes', 'میلک شەیک', 'ميلك شيك'), tagline: n3('Shake your goals', 'ئامانجەکانت بهەژێنە', 'حرّك أهدافك') },
  { id: 'coffee', icon: 'coffee', sort: 3, active: true, name: n3('Coffee', 'قاوە', 'قهوة'), tagline: n3('More than coffee', 'زیاتر لە قاوە', 'أكثر من مجرد قهوة') },
  { id: 'pizza', icon: 'pizza', sort: 4, active: true, name: n3('Pizza', 'پیتزا', 'بيتزا'), tagline: n3('Fuel happy moments', 'ساتە خۆشەکان پڕ وزە بکە', 'زوّد لحظاتك السعيدة') },
];

const I = (o) => ({ available: true, featured: false, tags: [], options: [], ...o });
export const SEED_ITEMS = [
  // ---- Healthy meals ----
  I({ id: 'protein-bowl', cat: 'healthy', sort: 1, price: 9500, kcal: 560, protein: 45, carbs: 52, fat: 18, tags: ['popular', 'protein'], featured: true, img: U('1546069901-ba9599a7e63c'),
    name: n3('Protein Bowl', 'پرۆتین بۆڵ', 'بول البروتين'),
    desc: n3('Grilled chicken, brown rice, black beans, sweet corn, cherry tomatoes & avocado with a light chipotle-yogurt sauce.', 'مریشکی برژاو، برنجی قاوەیی، فاسۆلیای ڕەش، گەنمەشامی، تەماتەی گیلاسی و ئەڤۆکادۆ لەگەڵ سۆسی ماستی سووک.', 'دجاج مشوي، أرز بني، فاصولياء سوداء، ذرة حلوة، طماطم كرزية وأفوكادو مع صلصة لبن خفيفة.'),
    options: [MEAL_ADD] }),
  I({ id: 'chicken-quinoa-bowl', cat: 'healthy', sort: 2, price: 10000, kcal: 520, protein: 42, carbs: 48, fat: 16, tags: ['protein'], img: U('1631311695255-8dde6bf96cb5'),
    name: n3('Chicken Quinoa Bowl', 'بۆڵی مریشک و کینوا', 'بول الدجاج والكينوا'),
    desc: n3('Herb chicken breast over tri-colour quinoa, roasted chickpeas, cucumber, red cabbage & a tahini drizzle.', 'سنگی مریشک بە گیا لەسەر کینوا، نۆکی برژاو، خەیار، کەلەمی سوور و سۆسی تەحینە.', 'صدر دجاج بالأعشاب على كينوا ملونة، حمص محمص، خيار، ملفوف أحمر ورذاذ طحينة.'),
    options: [MEAL_ADD] }),
  I({ id: 'avocado-toast', cat: 'healthy', sort: 3, price: 6500, kcal: 380, protein: 12, carbs: 38, fat: 20, tags: ['veg'], img: U('1650092194571-d3c1534562be'),
    name: n3('Avocado Toast', 'تۆستی ئەڤۆکادۆ', 'توست الأفوكادو'),
    desc: n3('Smashed avocado on toasted sourdough with cherry tomatoes, chilli flakes, lemon & seeds.', 'ئەڤۆکادۆی هاڕاو لەسەر نانی برژاو لەگەڵ تەماتەی گیلاسی، بیبەری سوور، لیمۆ و تۆو.', 'أفوكادو مهروس على خبز محمص مع طماطم كرزية، رقائق فلفل حار، ليمون وبذور.'),
    options: [TOAST_ADD] }),
  I({ id: 'salmon-bowl', cat: 'healthy', sort: 4, price: 14000, kcal: 610, protein: 38, carbs: 58, fat: 22, tags: ['protein', 'new'], img: U('1604259597308-5321e8e4789c'),
    name: n3('Salmon Bowl', 'بۆڵی سالمۆن', 'بول السلمون'),
    desc: n3('Seared salmon, sushi rice, edamame, cucumber, mango & a sesame-soy dressing.', 'سالمۆنی برژاو، برنجی سوشی، ئیدامامی، خەیار، مانگۆ و سۆسی کونجی و سۆیا.', 'سلمون محمر، أرز سوشي، إدامامي، خيار، مانجو وصلصة السمسم والصويا.'),
    options: [MEAL_ADD] }),
  I({ id: 'power-salad', cat: 'healthy', sort: 5, price: 7500, kcal: 390, protein: 16, carbs: 44, fat: 17, tags: ['veg'], img: U('1512621776951-a57141f2eefd'),
    name: n3('Power Salad', 'زەڵاتەی پاوەر', 'سلطة الطاقة'),
    desc: n3('Kale & greens, roasted sweet potato, chickpeas, avocado, beetroot & seeds. Choose your dressing.', 'کەیل و سەوزە، پەتاتەی شیرینی برژاو، نۆک، ئەڤۆکادۆ، چەوەندەر و تۆو. سۆسەکەت هەڵبژێرە.', 'كيل وخضار ورقية، بطاطا حلوة مشوية، حمص، أفوكادو، شمندر وبذور. اختر الصلصة.'),
    options: [DRESSING, MEAL_ADD] }),
  I({ id: 'healthy-wrap', cat: 'healthy', sort: 6, price: 7000, kcal: 450, protein: 34, carbs: 42, fat: 14, tags: ['popular', 'protein'], img: U('1626700051175-6818013e1d4f'),
    name: n3('Healthy Wrap', 'ڕاپی تەندروست', 'راب صحي'),
    desc: n3('Whole-wheat tortilla with grilled chicken, crunchy slaw, lettuce, tomato & garlic yogurt.', 'نانی گەنمی تەواو لەگەڵ مریشکی برژاو، زەڵاتەی کەلەم، کاهوو، تەماتە و ماستی سیر.', 'تورتيلا قمح كامل مع دجاج مشوي، سلطة ملفوف مقرمشة، خس، طماطم ولبن بالثوم.'),
    options: [WRAP_SIDE] }),
  // ---- Milkshakes ----
  I({ id: 'chocolate-shake', cat: 'shakes', sort: 1, price: 4500, kcal: 480, protein: 12, carbs: 62, fat: 20, tags: ['popular'], img: U('1553787499-6f9133860278'),
    name: n3('Chocolate', 'میلک شەیکی چوکلێت', 'ميلك شيك شوكولاتة'),
    desc: n3('Rich Belgian chocolate blended with cold milk & vanilla ice cream.', 'چوکلێتی بەلجیکی تێکەڵ لەگەڵ شیری سارد و ئایسکرێمی ڤانیلا.', 'شوكولاتة بلجيكية غنية مخفوقة مع حليب بارد وآيس كريم الفانيلا.'),
    options: [SIZE_SHAKE, BOOSTERS] }),
  I({ id: 'vanilla-shake', cat: 'shakes', sort: 2, price: 4000, kcal: 420, protein: 11, carbs: 55, fat: 17, img: U('1588775226864-8f71b7b86420'),
    name: n3('Vanilla', 'میلک شەیکی ڤانیلا', 'ميلك شيك فانيلا'),
    desc: n3('Madagascar vanilla, cold milk & creamy ice cream — a timeless classic.', 'ڤانیلای مەدەغەشقەر، شیری سارد و ئایسکرێمی کرێمی — کلاسیکێکی هەمیشەیی.', 'فانيلا مدغشقر، حليب بارد وآيس كريم كريمي — كلاسيكي لا يُنسى.'),
    options: [SIZE_SHAKE, BOOSTERS] }),
  I({ id: 'strawberry-shake', cat: 'shakes', sort: 3, price: 4500, kcal: 400, protein: 10, carbs: 58, fat: 14, img: U('1579954115545-a95591f28bfc'),
    name: n3('Strawberry', 'میلک شەیکی شلیک', 'ميلك شيك فراولة'),
    desc: n3('Fresh strawberries, milk & vanilla ice cream with a strawberry swirl.', 'شلیکی تازە، شیر و ئایسکرێمی ڤانیلا لەگەڵ سۆسی شلیک.', 'فراولة طازجة، حليب وآيس كريم فانيلا مع صلصة الفراولة.'),
    options: [SIZE_SHAKE, BOOSTERS] }),
  I({ id: 'banana-shake', cat: 'shakes', sort: 4, price: 4000, kcal: 380, protein: 12, carbs: 60, fat: 9, img: U('1685967836529-b0e8d6938227'),
    name: n3('Banana', 'میلک شەیکی مۆز', 'ميلك شيك موز'),
    desc: n3('Ripe banana, milk, oats & a touch of honey — the perfect pre-workout.', 'مۆزی پێگەیشتوو، شیر، جۆ و کەمێک هەنگوین — باشترین پێش ڕاهێنان.', 'موز ناضج، حليب، شوفان ولمسة عسل — مثالي قبل التمرين.'),
    options: [SIZE_SHAKE, BOOSTERS] }),
  I({ id: 'lotus-biscoff-shake', cat: 'shakes', sort: 5, price: 5500, kcal: 560, protein: 11, carbs: 70, fat: 26, tags: ['popular', 'new'], featured: true, img: U('1637178035222-a08f2d4dd1a3'),
    name: n3('Lotus Biscoff', 'میلک شەیکی لۆتس بیسکۆف', 'ميلك شيك لوتس بسكوف'),
    desc: n3('Caramelised Lotus Biscoff spread & crumbs blended with ice cream and milk.', 'کرێمی لۆتس بیسکۆف و وردکراوەی بیسکیت تێکەڵ لەگەڵ ئایسکرێم و شیر.', 'كريمة لوتس بسكوف المكرملة وفتات البسكويت مع الآيس كريم والحليب.'),
    options: [SIZE_SHAKE, BOOSTERS] }),
  I({ id: 'protein-shake', cat: 'shakes', sort: 6, price: 6000, kcal: 350, protein: 32, carbs: 38, fat: 8, tags: ['protein', 'popular'], featured: true, img: U('1558017487-06bf9f82613a'),
    name: n3('Protein Shake', 'پرۆتین شەیک', 'بروتين شيك'),
    desc: n3('30 g whey protein, banana, oats & almond milk. Built for recovery.', '30 گرام پرۆتینی وەی، مۆز، جۆ و شیری بادەم. بۆ چاکبوونەوە دروستکراوە.', '30 غرام بروتين واي، موز، شوفان وحليب اللوز. مصمم للاستشفاء.'),
    options: [FLAVOR, SHAKE_MILK, BOOSTERS] }),
  // ---- Coffee ----
  I({ id: 'espresso', cat: 'coffee', sort: 1, price: 2500, kcal: 5, protein: 0, carbs: 1, fat: 0, img: U('1558416165-5fb04b79b0e7'),
    name: n3('Espresso', 'ئێسپرێسۆ', 'إسبريسو'),
    desc: n3('A bold shot of our house blend with a velvety crema.', 'شۆتێکی بەهێز لە تێکەڵەی تایبەتی ئێمە لەگەڵ کرێمایەکی نەرم.', 'شوت قوي من خلطتنا الخاصة مع كريما ناعمة.'),
    options: [SHOTS, SUGAR] }),
  I({ id: 'americano', cat: 'coffee', sort: 2, price: 3000, kcal: 10, protein: 0, carbs: 2, fat: 0, img: U('1551030173-122aabc4489c'),
    name: n3('Americano', 'ئەمریکانۆ', 'أمريكانو'),
    desc: n3('Espresso topped with hot water for a smooth, long black coffee.', 'ئێسپرێسۆ لەگەڵ ئاوی گەرم بۆ قاوەیەکی ڕەشی نەرم.', 'إسبريسو مع الماء الساخن لقهوة سوداء ناعمة.'),
    options: [SIZE_COFFEE, SUGAR, COFFEE_EXTRAS] }),
  I({ id: 'cappuccino', cat: 'coffee', sort: 3, price: 3500, kcal: 130, protein: 7, carbs: 10, fat: 6, tags: ['popular'], img: U('1506372023823-741c83b836fe'),
    name: n3('Cappuccino', 'کاپوچینۆ', 'كابتشينو'),
    desc: n3('Espresso with steamed milk and a thick layer of silky foam.', 'ئێسپرێسۆ لەگەڵ شیری گەرم و چینێکی ئەستووری کەف.', 'إسبريسو مع حليب مبخر وطبقة كثيفة من الرغوة الحريرية.'),
    options: [SIZE_COFFEE, MILK, SUGAR, COFFEE_EXTRAS] }),
  I({ id: 'latte', cat: 'coffee', sort: 4, price: 4000, kcal: 180, protein: 9, carbs: 14, fat: 7, tags: ['popular'], featured: true, img: U('1541167760496-1628856ab772'),
    name: n3('Latte', 'لاتێ', 'لاتيه'),
    desc: n3('Smooth espresso with plenty of steamed milk and light foam.', 'ئێسپرێسۆی نەرم لەگەڵ شیری گەرمی زۆر و کەفێکی سووک.', 'إسبريسو ناعم مع الكثير من الحليب المبخر ورغوة خفيفة.'),
    options: [SIZE_COFFEE, MILK, SUGAR, COFFEE_EXTRAS] }),
  I({ id: 'mocha', cat: 'coffee', sort: 5, price: 4500, kcal: 290, protein: 9, carbs: 34, fat: 12, img: U('1786114922061-962a7b784ec3'),
    name: n3('Mocha', 'مۆکا', 'موكا'),
    desc: n3('Espresso, dark chocolate & milk, topped with whipped cream and cocoa.', 'ئێسپرێسۆ، چوکلێتی تاریک و شیر، لەگەڵ کرێمی شیرین و کاکاو.', 'إسبريسو وشوكولاتة داكنة وحليب مع كريمة مخفوقة وكاكاو.'),
    options: [SIZE_COFFEE, MILK, COFFEE_EXTRAS] }),
  I({ id: 'flat-white', cat: 'coffee', sort: 6, price: 4000, kcal: 120, protein: 7, carbs: 9, fat: 6, tags: ['new'], img: U('1502462041640-b3d7e50d0662'),
    name: n3('Flat White', 'فلات وایت', 'فلات وايت'),
    desc: n3('Double ristretto with velvety micro-foam milk — strong and smooth.', 'دوو ڕیستریتۆ لەگەڵ شیری کەفی ورد — بەهێز و نەرم.', 'ريستريتو مزدوج مع حليب برغوة دقيقة مخملية — قوي وناعم.'),
    options: [MILK, SUGAR, COFFEE_EXTRAS] }),
  // ---- Pizza ----
  I({ id: 'margherita', cat: 'pizza', sort: 1, price: 8000, kcal: 720, protein: 30, carbs: 88, fat: 26, tags: ['veg', 'popular'], img: U('1574071318508-1cdbab80d002'),
    name: n3('Margherita', 'پیتزای مارگریتا', 'بيتزا مارغريتا'),
    desc: n3('Tomato sauce, fresh mozzarella, basil & extra-virgin olive oil.', 'سۆسی تەماتە، پەنیری مۆتزارێلای تازە، ڕێحانە و زەیتی زەیتوون.', 'صلصة طماطم، موزاريلا طازجة، ريحان وزيت زيتون بكر.'),
    options: [PIZZA_SIZE, CRUST, PIZZA_EXTRAS] }),
  I({ id: 'chicken-alfredo-pizza', cat: 'pizza', sort: 2, price: 11000, kcal: 860, protein: 46, carbs: 82, fat: 36, tags: ['protein'], img: U('1652952561151-97e82f26c336'),
    name: n3('Chicken Alfredo', 'پیتزای ئەلفرێدۆی مریشک', 'بيتزا دجاج ألفريدو'),
    desc: n3('Creamy alfredo sauce, grilled chicken, mushrooms, mozzarella & parmesan.', 'سۆسی ئەلفرێدۆی کرێمی، مریشکی برژاو، قارچک، مۆتزارێلا و پارمیزان.', 'صلصة ألفريدو كريمية، دجاج مشوي، فطر، موزاريلا وبارميزان.'),
    options: [PIZZA_SIZE, CRUST, PIZZA_EXTRAS] }),
  I({ id: 'vegetarian-pizza', cat: 'pizza', sort: 3, price: 9000, kcal: 690, protein: 26, carbs: 90, fat: 22, tags: ['veg'], img: U('1625401514458-6c8a5e7d55da'),
    name: n3('Vegetarian', 'پیتزای ڕووەکی', 'بيتزا نباتية'),
    desc: n3('Tomato sauce, mozzarella, bell peppers, mushrooms, olives, red onion & sweetcorn.', 'سۆسی تەماتە، مۆتزارێلا، بیبەری شیرین، قارچک، زەیتوون، پیازی سوور و گەنمەشامی.', 'صلصة طماطم، موزاريلا، فلفل حلو، فطر، زيتون، بصل أحمر وذرة.'),
    options: [PIZZA_SIZE, CRUST, PIZZA_EXTRAS] }),
  I({ id: 'pepperoni-pizza', cat: 'pizza', sort: 4, price: 10000, kcal: 820, protein: 36, carbs: 84, fat: 34, tags: ['popular'], img: U('1534308983496-4fabb1a015ee'),
    name: n3('Pepperoni', 'پیتزای پێپەرۆنی', 'بيتزا بيبروني'),
    desc: n3('Beef pepperoni, tomato sauce & a generous layer of mozzarella.', 'پێپەرۆنی گۆشتی مانگا، سۆسی تەماتە و چینێکی زۆری مۆتزارێلا.', 'بيبروني لحم بقري، صلصة طماطم وطبقة سخية من الموزاريلا.'),
    options: [PIZZA_SIZE, CRUST, PIZZA_EXTRAS] }),
  I({ id: 'bbq-chicken-pizza', cat: 'pizza', sort: 5, price: 11000, kcal: 840, protein: 44, carbs: 92, fat: 30, tags: ['protein', 'spicy'], img: U('1734099387978-463d8fd09678'),
    name: n3('BBQ Chicken', 'پیتزای مریشکی باربیکیو', 'بيتزا دجاج باربكيو'),
    desc: n3('Smoky BBQ sauce, grilled chicken, red onion, mozzarella & fresh coriander.', 'سۆسی باربیکیوی دووکەڵاوی، مریشکی برژاو، پیازی سوور، مۆتزارێلا و گەشنیزی تازە.', 'صلصة باربكيو مدخنة، دجاج مشوي، بصل أحمر، موزاريلا وكزبرة طازجة.'),
    options: [PIZZA_SIZE, CRUST, PIZZA_EXTRAS] }),
];

export const SEED_TABLES = [
  ...Array.from({ length: 10 }, (_, i) => ({ id: `L${i + 1}`, name: `L${i + 1}`, floor: 'ladies', zone: i < 6 ? 'Coffee Lounge' : 'Window', seats: i < 6 ? 4 : 2, active: true })),
  ...Array.from({ length: 4 }, (_, i) => ({ id: `M${i + 1}`, name: `M${i + 1}`, floor: 'men', zone: 'Men’s Lounge', seats: 4, active: true })),
];

export const SEED_USERS = [
  { username: 'admin', name: 'Owner', role: 'owner', password: 'admin123' },
  { username: 'manager', name: 'Manager', role: 'manager', password: 'manager123' },
  { username: 'cashier', name: 'Cashier', role: 'cashier', password: 'cashier123' },
  { username: 'kitchen', name: 'Kitchen', role: 'kitchen', password: 'kitchen123' },
];

export const SEED_SETTINGS = {
  brand: {
    name: 'MY FITNESS',
    cafeName: n3('MY FITNESS Café', 'کافێی مای فیتنەس', 'مقهى ماي فيتنس'),
    phone: '0750 821 2524',
    address: n3('Ranya, Kurdistan Region, Iraq', 'ڕانیە، هەرێمی کوردستان، عێراق', 'رانية، إقليم كوردستان، العراق'),
  },
  currency: 'IQD',
  tzOffset: 180,
  defaultLang: 'ckb',
  hours: { open: '00:00', close: '00:00' }, // same open/close time = open 24 hours
  ordering: {
    open: true,
    allowDineIn: true,
    allowPickup: true,
    allowSchedule: true,
    scheduleLeadMinutes: 15,
    scheduleMinMinutes: 30,
    scheduleMaxDays: 3,
    slotMinutes: 15,
    prepMinutes: 15,
    requireName: true,
    requirePhone: true,
    payments: ['cash', 'card'],
  },
  charges: { servicePct: 0, taxPct: 0 },
  publicUrl: '',
  printer: {
    mode: 'browser',          // browser | bridge | rawbt
    paper: 80,                // 80 | 58
    format: 'image',          // image | text   (bridge / rawbt)
    target: 'network',        // network | windows
    host: '192.168.123.100',  // Xprinter factory default IP
    port: 9100,
    windowsPrinter: 'XP-N200L',
    bridgeUrl: 'http://127.0.0.1:9123',
    bridgeKey: '',
    printKitchen: true,
    printReceipt: false,
    kitchenCopies: 1,
    receiptCopies: 1,
    cut: true,
    drawer: false,
    logo: 'myfitness',        // myfitness | ladies | none
    ticketLang: 'en',         // en | ckb | ar | en+ckb
    showQr: true,
    header: n3('Ladies Floor · Coffee Lounge', 'نهۆمی ئافرەتان · کافێ لاونج', 'طابق السيدات · ركن القهوة'),
    footer: n3('Thank you — stay strong!', 'سوپاس — بەهێز بە!', 'شكراً — ابقَ قوياً!'),
  },
};

/* ---------- demo history (orders) ---------- */
const NAMES = ['Sara', 'Lana', 'Shilan', 'Hana', 'Rozhin', 'Dilan', 'Avin', 'Shno', 'Nazdar', 'Bahar', 'Zhino', 'Kazhal', 'Chnar', 'Shaida', 'Sozan', 'Hezha', 'Rezan', 'Tara', 'Niga', 'Sakar', 'Rawa', 'Dlnya', 'Ronak', 'Banu', 'Helin', 'Media', 'Payam', 'Zhilwan', 'Huda', 'Rasha', 'Noor', 'Maryam'];
const NAMES_KU = { Sara: 'سارا', Lana: 'لانا', Shilan: 'شیلان', Hana: 'هانا', Rozhin: 'ڕۆژین', Dilan: 'دیلان', Avin: 'ئاڤین', Shno: 'شنۆ', Nazdar: 'نازدار', Bahar: 'بەهار' };
const PREFIX = ['0750', '0751', '0770', '0771', '0772', '0780', '0781', '0750', '0750'];
const HOUR_W = { 8: 4, 9: 6, 10: 6, 11: 5, 12: 8, 13: 9, 14: 6, 15: 4, 16: 6, 17: 9, 18: 11, 19: 12, 20: 10, 21: 7, 22: 3 };
const WD_F = [1.0, 0.95, 0.95, 1.0, 1.15, 1.35, 1.25]; // Sun..Sat (Fri/Sat = weekend)
const POP = { 'protein-bowl': 10, 'chicken-quinoa-bowl': 6, 'avocado-toast': 5, 'salmon-bowl': 4, 'power-salad': 5, 'healthy-wrap': 7, 'chocolate-shake': 6, 'vanilla-shake': 4, 'strawberry-shake': 5, 'banana-shake': 4, 'lotus-biscoff-shake': 8, 'protein-shake': 11, espresso: 4, americano: 7, cappuccino: 8, latte: 10, mocha: 5, 'flat-white': 4, margherita: 5, 'chicken-alfredo-pizza': 4, 'vegetarian-pizza': 3, 'pepperoni-pizza': 5, 'bbq-chicken-pizza': 4 };
function affinity(cat, h) {
  if (cat === 'coffee') return h <= 11 ? 2.2 : h >= 15 && h <= 17 ? 1.4 : 0.8;
  if (cat === 'shakes') return h >= 17 && h <= 21 ? 1.9 : 0.8;
  if (cat === 'healthy') return (h >= 12 && h <= 14) || (h >= 18 && h <= 20) ? 1.6 : 0.8;
  if (cat === 'pizza') return h >= 19 ? 1.7 : h >= 12 && h <= 14 ? 1.1 : 0.5;
  return 1;
}

export function buildRandomLine(rnd, items, hour) {
  const avail = items.filter((i) => i.available !== false);
  const it = pickWeighted(rnd, avail, (x) => (POP[x.id] || 3) * affinity(x.cat, hour));
  const options = {};
  for (const g of it.options || []) {
    if (g.type === 'one') {
      const c = rnd() < 0.62 ? g.choices[0] : g.choices[Math.floor(rnd() * g.choices.length)];
      options[g.id] = c.id;
    } else if (rnd() < 0.28) {
      options[g.id] = [g.choices[Math.floor(rnd() * g.choices.length)].id];
    }
  }
  const r = rnd();
  return { id: it.id, qty: r < 0.86 ? 1 : r < 0.98 ? 2 : 3, options };
}
export function randomCustomer(rnd) {
  const name = NAMES[Math.floor(rnd() * NAMES.length)];
  const useKu = rnd() < 0.35 && NAMES_KU[name];
  const phone = PREFIX[Math.floor(rnd() * PREFIX.length)] + String(Math.floor(rnd() * 1e7)).padStart(7, '0');
  return { name: useKu ? NAMES_KU[name] : name, phone };
}

/**
 * Generate realistic past orders. `price` is a function(itemsInput) → priced lines
 * supplied by the service so totals follow the real pricing rules.
 */
export function generateHistory({ items, tables, settings, days = 45, now = Date.now(), price, seed = 20261006 }) {
  const rnd = mulberry32(seed);
  const ladies = tables.filter((t) => t.floor === 'ladies' && t.active !== false);
  const men = tables.filter((t) => t.floor === 'men' && t.active !== false);
  const open = parseHM(settings.hours?.open || '08:00');
  const close = parseHM(settings.hours?.close || '23:00');
  const lead = (settings.ordering?.scheduleLeadMinutes || 15) * 60000;
  const orders = [];
  const counters = {};
  const hours = Object.keys(HOUR_W).map(Number).filter((h) => h * 60 >= open && h * 60 < (close > open ? close : close + 1440));
  for (let d = days - 1; d >= 0; d--) {
    const dayStart = startOfDay(now - d * 86400000);
    const wd = new Date(dayStart + TZ.off * 60000 + 12 * 3600000).getUTCDay();
    const growth = 0.78 + 0.32 * (1 - d / days);
    const count = Math.round(34 * WD_F[wd] * growth * (0.85 + rnd() * 0.3));
    const stamps = [];
    for (let k = 0; k < count; k++) {
      const h = pickWeighted(rnd, hours, (x) => HOUR_W[x]);
      const ts = dayStart + h * 3600000 + Math.floor(rnd() * 3600000);
      if (d === 0 && ts > now - 25 * 60000) continue; // keep today's history in the past
      stamps.push(ts);
    }
    stamps.sort((a, b) => a - b);
    for (const ts of stamps) {
      const h = new Date(ts + TZ.off * 60000).getUTCHours();
      const nLines = rnd() < 0.55 ? 1 : rnd() < 0.75 ? 2 : 3;
      const input = [];
      for (let i = 0; i < nLines; i++) input.push(buildRandomLine(rnd, items, h));
      const lines = price(input);
      const subtotal = lines.reduce((a, l) => a + l.total, 0);
      const svc = Math.round((subtotal * (settings.charges?.servicePct || 0)) / 100 / 250) * 250;
      const pos = rnd() < 0.27;
      const dine = rnd() < 0.78;
      const pool = rnd() < 0.09 && men.length ? men : ladies;
      const table = dine ? pool[Math.floor(rnd() * pool.length)] || ladies[0] : null;
      const sched = !pos && rnd() < 0.07;
      const createdAt = sched ? ts - (40 + Math.floor(rnd() * 160)) * 60000 : ts;
      const startAt = sched ? ts - lead : ts;
      const cancelled = rnd() < 0.03;
      const prep = (5 + Math.floor(rnd() * 12)) * 60000;
      const dk = dayKey(createdAt);
      counters[dk] = (counters[dk] || 0) + 1;
      const pay = rnd() < 0.68 ? 'cash' : 'card';
      const times = { placed: createdAt, new: startAt };
      if (!cancelled) {
        times.preparing = startAt + (1 + Math.floor(rnd() * 3)) * 60000;
        times.ready = times.preparing + prep;
        times.completed = times.ready + (2 + Math.floor(rnd() * 8)) * 60000;
      } else times.cancelled = startAt + 4 * 60000;
      orders.push({
        id: 'o' + createdAt.toString(36) + rid(4), token: rid(16), no: counters[dk], day: dk,
        createdAt, updatedAt: times.completed || times.cancelled,
        status: cancelled ? 'cancelled' : 'completed',
        type: dine ? 'dinein' : 'pickup', table: table ? table.id : null, floor: table ? table.floor : null,
        customer: pos ? { name: rnd() < 0.5 ? randomCustomer(rnd).name : '', phone: '' } : randomCustomer(rnd),
        when: sched ? 'later' : 'now', scheduledFor: sched ? ts : null, releasedAt: startAt,
        items: lines, subtotal, service: svc, tax: 0, total: subtotal + svc,
        payment: { method: pay, status: cancelled ? 'unpaid' : 'paid', at: cancelled ? null : times.completed },
        note: '', lang: rnd() < 0.6 ? 'ckb' : rnd() < 0.5 ? 'ar' : 'en',
        source: pos ? 'pos' : 'qr', staff: pos ? 'cashier' : null,
        printed: { kitchen: startAt }, times, cancelReason: cancelled ? 'Customer left' : undefined,
      });
    }
  }
  return { orders, counters };
}

/** A handful of live orders for "right now" so the kitchen screen isn't empty in a demo. */
export function liveDemoOrders({ items, tables, settings, now = Date.now(), price, startNo = 1 }) {
  const rnd = mulberry32(now % 100000);
  const ladies = tables.filter((t) => t.floor === 'ladies');
  const lead = (settings.ordering?.scheduleLeadMinutes || 15) * 60000;
  const specs = [
    { ago: 2, status: 'new' }, { ago: 4, status: 'new' },
    { ago: 7, status: 'preparing' }, { ago: 11, status: 'preparing' },
    { ago: 15, status: 'ready' },
    { ahead: 95, status: 'scheduled' }, { ahead: 190, status: 'scheduled' },
  ];
  let no = startNo;
  return specs.map((s, i) => {
    const h = new Date(now + TZ.off * 60000).getUTCHours();
    const input = [buildRandomLine(rnd, items, h)];
    if (rnd() < 0.6) input.push(buildRandomLine(rnd, items, h));
    const lines = price(input);
    const subtotal = lines.reduce((a, l) => a + l.total, 0);
    const created = s.ago ? now - s.ago * 60000 : now - (10 + i * 7) * 60000;
    const tb = ladies[(i * 3) % ladies.length];
    const dine = i !== 1 && i !== 5;
    const times = { placed: created };
    if (s.status !== 'scheduled') {
      times.new = created;
      if (s.status !== 'new') times.preparing = created + 60000;
      if (s.status === 'ready') times.ready = now - 60000;
    }
    const sched = s.status === 'scheduled';
    const notes = ['', 'Less sugar please', '', 'No onion', '', 'Extra napkins', ''];
    return {
      id: 'o' + (created + i).toString(36) + rid(4), token: rid(16), no: no++, day: dayKey(created),
      createdAt: created, updatedAt: created, status: s.status,
      type: dine ? 'dinein' : 'pickup', table: dine ? tb.id : null, floor: dine ? tb.floor : null,
      customer: randomCustomer(rnd), when: sched ? 'later' : 'now',
      scheduledFor: sched ? now + s.ahead * 60000 : null, releasedAt: sched ? null : created,
      items: lines, subtotal, service: 0, tax: 0, total: subtotal,
      payment: { method: i % 3 ? 'cash' : 'card', status: 'unpaid', at: null },
      note: notes[i] || '', lang: i % 2 ? 'ckb' : 'en', source: 'qr', staff: null,
      printed: s.status === 'new' ? {} : { kitchen: created }, times, seed: true,
    };
  });
}

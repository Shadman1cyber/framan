import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  await prisma.rating.deleteMany();
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.qRCode.deleteMany();
  await prisma.cafeTable.deleteMany();
  await prisma.branch.deleteMany();
  await prisma.cafe.deleteMany();
  await prisma.productAllergen.deleteMany();
  await prisma.productIngredient.deleteMany();
  await prisma.productDietaryTag.deleteMany();
  await prisma.userAllergy.deleteMany();
  await prisma.userPreference.deleteMany();
  await prisma.userDietaryTag.deleteMany();
  await prisma.productCoffeeLine.deleteMany();
  await prisma.coffeeLine.deleteMany();
  await prisma.productImage.deleteMany();
  await prisma.product.deleteMany();
  await prisma.category.deleteMany();
  await prisma.ingredientAllergen.deleteMany();
  await prisma.ingredient.deleteMany();
  await prisma.allergen.deleteMany();
  await prisma.dietaryTag.deleteMany();
  await prisma.staff.deleteMany();
  await prisma.aIInsight.deleteMany();
  await prisma.importJob.deleteMany();
  await prisma.setting.deleteMany();
  await prisma.user.deleteMany();

  const allergens = await Promise.all(
    [
      { key: "PEANUTS", nameFa: "بادام زمینی", nameEn: "Peanuts", icon: "🥜" },
      { key: "TREE_NUTS", nameFa: "آجیل درختی", nameEn: "Tree Nuts", icon: "🌰" },
      { key: "MILK", nameFa: "شیر", nameEn: "Milk / Dairy", icon: "🥛" },
      { key: "EGGS", nameFa: "تخم مرغ", nameEn: "Eggs", icon: "🥚" },
      { key: "GLUTEN", nameFa: "گلوتن", nameEn: "Gluten / Wheat", icon: "🌾" },
      { key: "SOY", nameFa: "سویا", nameEn: "Soy", icon: "🫘" },
      { key: "FISH", nameFa: "ماهی", nameEn: "Fish", icon: "🐟" },
      { key: "SHELLFISH", nameFa: "صدف‌داران", nameEn: "Shellfish", icon: "🦐" },
      { key: "SESAME", nameFa: "کنجد", nameEn: "Sesame", icon: "🌱" },
    ].map((a) => prisma.allergen.create({ data: a })),
  );
  const allergenByKey = Object.fromEntries(allergens.map((a) => [a.key, a]));

  const dietaryTags = await Promise.all(
    [
      { key: "VEGETARIAN", nameFa: "گیاهخواری", nameEn: "Vegetarian", icon: "🌿" },
      { key: "VEGAN", nameFa: "وگان", nameEn: "Vegan", icon: "🥬" },
      { key: "GLUTEN_FREE", nameFa: "بدون گلوتن", nameEn: "Gluten-Free", icon: "✨" },
      { key: "DAIRY_FREE", nameFa: "بدون لبنیات", nameEn: "Dairy-Free", icon: "🥥" },
      { key: "SPICY", nameFa: "تند", nameEn: "Spicy", icon: "🌶️" },
      { key: "SWEET", nameFa: "شیرین", nameEn: "Sweet", icon: "🍯" },
    ].map((d) => prisma.dietaryTag.create({ data: d })),
  );
  const dietByKey = Object.fromEntries(dietaryTags.map((d) => [d.key, d]));

  const ingredients = await Promise.all(
    [
      { nameFa: "اسپرسو", nameEn: "Espresso", unit: "GRAM", stockQuantity: 5000, minQuantity: 1000, costPerUnit: 800, supplier: "قهوه ستاره" },
      { nameFa: "دانه قهوه اتیوپی", nameEn: "Ethiopia Beans", unit: "GRAM", stockQuantity: 3000, minQuantity: 800, costPerUnit: 1600, supplier: "قهوه ستاره" },
      { nameFa: "شیر تازه", nameEn: "Fresh Milk", isAllergen: true, unit: "MILLILITER", stockQuantity: 12000, minQuantity: 4000, costPerUnit: 28, supplier: "پگاه" },
      { nameFa: "شیر جو دوسر", nameEn: "Oat Milk", unit: "MILLILITER", stockQuantity: 6000, minQuantity: 2000, costPerUnit: 65 },
      { nameFa: "شیر بادام", nameEn: "Almond Milk", isAllergen: true, unit: "MILLILITER", stockQuantity: 3000, minQuantity: 1000, costPerUnit: 90 },
      { nameFa: "شکر قهوه‌ای", nameEn: "Brown Sugar", unit: "GRAM", stockQuantity: 8000, minQuantity: 2000, costPerUnit: 45 },
      { nameFa: "وانیل", nameEn: "Vanilla", unit: "MILLILITER", stockQuantity: 500, minQuantity: 200, costPerUnit: 900 },
      { nameFa: "کاکائو", nameEn: "Cocoa", unit: "GRAM", stockQuantity: 2000, minQuantity: 500, costPerUnit: 320 },
      { nameFa: "کره", nameEn: "Butter", isAllergen: true, unit: "GRAM", stockQuantity: 2500, minQuantity: 800, costPerUnit: 420 },
      { nameFa: "تخم مرغ", nameEn: "Egg", isAllergen: true, unit: "UNIT", stockQuantity: 180, minQuantity: 60, costPerUnit: 3500 },
      { nameFa: "آرد گندم", nameEn: "Wheat Flour", isAllergen: true, unit: "GRAM", stockQuantity: 15000, minQuantity: 5000, costPerUnit: 22 },
      { nameFa: "گردو", nameEn: "Walnut", isAllergen: true, unit: "GRAM", stockQuantity: 1200, minQuantity: 400, costPerUnit: 380 },
      { nameFa: "بادام", nameEn: "Almond", isAllergen: true, unit: "GRAM", stockQuantity: 900, minQuantity: 300, costPerUnit: 520 },
      { nameFa: "کنجد", nameEn: "Sesame", isAllergen: true, unit: "GRAM", stockQuantity: 700, minQuantity: 200, costPerUnit: 180 },
      { nameFa: "پنیر موزارلا", nameEn: "Mozzarella", isAllergen: true, unit: "GRAM", stockQuantity: 4000, minQuantity: 1500, costPerUnit: 260 },
      { nameFa: "مرغ", nameEn: "Chicken", unit: "GRAM", stockQuantity: 6000, minQuantity: 2000, costPerUnit: 180 },
      { nameFa: "ماهی سالمون", nameEn: "Salmon", isAllergen: true, unit: "GRAM", stockQuantity: 1500, minQuantity: 600, costPerUnit: 850 },
      { nameFa: "روغن زیتون", nameEn: "Olive Oil", unit: "MILLILITER", stockQuantity: 4000, minQuantity: 1000, costPerUnit: 210 },
      { nameFa: "گوجه فرنگی", nameEn: "Tomato", unit: "GRAM", stockQuantity: 5000, minQuantity: 1500, costPerUnit: 25 },
      { nameFa: "ریحان", nameEn: "Basil", unit: "GRAM", stockQuantity: 300, minQuantity: 150, costPerUnit: 150 },
      { nameFa: "عسل", nameEn: "Honey", unit: "GRAM", stockQuantity: 1500, minQuantity: 500, costPerUnit: 480 },
      { nameFa: "کشمش", nameEn: "Raisin", unit: "GRAM", stockQuantity: 800, minQuantity: 300, costPerUnit: 120 },
      { nameFa: "سیب", nameEn: "Apple", unit: "GRAM", stockQuantity: 7000, minQuantity: 2000, costPerUnit: 30 },
      { nameFa: "نعناع", nameEn: "Mint", unit: "GRAM", stockQuantity: 250, minQuantity: 100, costPerUnit: 90 },
      { nameFa: "لیمو", nameEn: "Lemon", unit: "UNIT", stockQuantity: 60, minQuantity: 20, costPerUnit: 4000 },
      { nameFa: "یخ", nameEn: "Ice", unit: "GRAM", stockQuantity: 20000, minQuantity: 5000, costPerUnit: 2 },
    ].map((i) => prisma.ingredient.create({ data: i })),
  );
  const ingByKey = Object.fromEntries(ingredients.map((i) => [i.nameFa, i]));

  const ingredientAllergenMap: Array<[string, string]> = [
    ["شیر تازه", "MILK"],
    ["شیر بادام", "TREE_NUTS"],
    ["کره", "MILK"],
    ["تخم مرغ", "EGGS"],
    ["آرد گندم", "GLUTEN"],
    ["گردو", "TREE_NUTS"],
    ["بادام", "TREE_NUTS"],
    ["کنجد", "SESAME"],
    ["پنیر موزارلا", "MILK"],
    ["ماهی سالمون", "FISH"],
  ];
  for (const [ingName, allergenKey] of ingredientAllergenMap) {
    const ing = ingByKey[ingName];
    const al = allergenByKey[allergenKey];
    if (ing && al) {
      await prisma.ingredientAllergen.create({
        data: { ingredientId: ing.id, allergenId: al.id },
      });
    }
  }

  const categories = await Promise.all(
    [
      { slug: "coffee", nameFa: "قهوه", nameEn: "Coffee", icon: "☕", order: 1 },
      { slug: "hot-drinks", nameFa: "نوشیدنی گرم", nameEn: "Hot Drinks", icon: "🍵", order: 2 },
      { slug: "cold-drinks", nameFa: "نوشیدنی سرد", nameEn: "Cold Drinks", icon: "🧊", order: 3 },
      { slug: "breakfast", nameFa: "صبحانه", nameEn: "Breakfast", icon: "🥐", order: 4 },
      { slug: "food", nameFa: "غذا", nameEn: "Food", icon: "🥗", order: 5 },
      { slug: "dessert", nameFa: "دسر", nameEn: "Dessert", icon: "🍰", order: 6 },
    ].map((c) => prisma.category.create({ data: c })),
  );
  const catBySlug = Object.fromEntries(categories.map((c) => [c.slug, c]));

  const coffeeLines = await Promise.all(
    [
      { nameFa: "بلند خانه", nameEn: "House Blend" },
      { nameFa: "اتیوپی", nameEn: "Ethiopia" },
      { nameFa: "کلمبیا", nameEn: "Colombia" },
      { nameFa: "رزرو ویژه", nameEn: "Special Reserve" },
    ].map((c) => prisma.coffeeLine.create({ data: c })),
  );
  const lineByName = Object.fromEntries(coffeeLines.map((c) => [c.nameEn, c]));

  const img = (q: string) =>
    `https://images.unsplash.com/${q}?auto=format&fit=crop&w=900&q=80`;

  type ProductSeed = {
    slug: string;
    nameFa: string;
    nameEn?: string;
    description: string;
    price: number;
    image: string;
    category: string;
    isFeatured?: boolean;
    prepBaseMin?: number;
    ingredients: Array<[string, number, string?]>;
    allergens?: string[];
    dietary?: string[];
    coffeeLinePrices?: Array<[string, number]>;
  };

  const products: ProductSeed[] = [
    {
      slug: "espresso", nameFa: "اسپرسو", nameEn: "Espresso",
      description: "یک شات اسپرسوی غلیظ و معطر، عصاره‌ی خالص دانه‌های تازه آسیاب شده.",
      price: 85000, image: img("photo-1510707577719-ae7c14805e3a"), category: "coffee",
      isFeatured: true, prepBaseMin: 2,
      ingredients: [["اسپرسو", 18, "GRAM"]],
      dietary: ["VEGAN", "GLUTEN_FREE", "DAIRY_FREE"],
      coffeeLinePrices: [["House Blend", 85000], ["Ethiopia", 105000], ["Colombia", 115000], ["Special Reserve", 155000]],
    },
    {
      slug: "cappuccino", nameFa: "کاپوچینو", nameEn: "Cappuccino",
      description: "اسپرسو با شیر بخار داده شده و کف مخملی.",
      price: 120000, image: img("photo-1572442388796-11668a67e53d"), category: "coffee",
      isFeatured: true, prepBaseMin: 4,
      ingredients: [["اسپرسو", 18, "GRAM"], ["شیر تازه", 150, "MILLILITER"]],
      allergens: ["MILK"],
      coffeeLinePrices: [["House Blend", 120000], ["Ethiopia", 140000], ["Colombia", 150000]],
    },
    {
      slug: "latte", nameFa: "لته", nameEn: "Latte",
      description: "اسپرسو با شیر نرم و لطیف، مناسب برای آرامش صبحگاهی.",
      price: 125000, image: img("photo-1561882468-9110e03e0f78"), category: "coffee",
      prepBaseMin: 4,
      ingredients: [["اسپرسو", 18, "GRAM"], ["شیر تازه", 200, "MILLILITER"]],
      allergens: ["MILK"],
      coffeeLinePrices: [["House Blend", 125000], ["Ethiopia", 145000], ["Special Reserve", 195000]],
    },
    {
      slug: "oat-latte", nameFa: "لته جو دوسر", nameEn: "Oat Latte",
      description: "لته کلاسیک با شیر جو دوسر بدون شکر.",
      price: 145000, image: img("photo-1592318445673-2d4cf2cd89d4"), category: "coffee",
      isFeatured: true, prepBaseMin: 4,
      ingredients: [["اسپرسو", 18, "GRAM"], ["شیر جو دوسر", 200, "MILLILITER"]],
      dietary: ["VEGAN", "DAIRY_FREE"],
    },
    {
      slug: "mocha", nameFa: "موکا", nameEn: "Mocha",
      description: "ترکیب اسپرسو، شیر گرم و سس کاکائوی غلیظ.",
      price: 140000, image: img("photo-1578314675229-95ea43bd1f5e"), category: "coffee",
      prepBaseMin: 5,
      ingredients: [["اسپرسو", 18, "GRAM"], ["شیر تازه", 180, "MILLILITER"], ["کاکائو", 15, "GRAM"]],
      allergens: ["MILK"],
    },
    {
      slug: "hot-chocolate", nameFa: "هات چاکلت", nameEn: "Hot Chocolate",
      description: "شکلات داغ غلیظ با خامه‌ی کاکائو.",
      price: 110000, image: img("photo-1542990253-0d0f5be5f0ed"), category: "hot-drinks",
      prepBaseMin: 4,
      ingredients: [["شیر تازه", 220, "MILLILITER"], ["کاکائو", 25, "GRAM"]],
      allergens: ["MILK"],
    },
    {
      slug: "tea", nameFa: "چای سیاه", nameEn: "Black Tea",
      description: "چای سیاه تازه‌دم با عطر و طعم اصیل.",
      price: 55000, image: img("photo-1597318236926-69cbf04f8d3e"), category: "hot-drinks",
      prepBaseMin: 3,
      ingredients: [],
      dietary: ["VEGAN", "GLUTEN_FREE", "DAIRY_FREE"],
    },
    {
      slug: "iced-latte", nameFa: "آیس لته", nameEn: "Iced Latte",
      description: "لته خنک با یخ، مناسب برای روزهای گرم.",
      price: 135000, image: img("photo-1461023058943-07fcbe16d735"), category: "cold-drinks",
      isFeatured: true, prepBaseMin: 3,
      ingredients: [["اسپرسو", 18, "GRAM"], ["شیر تازه", 150, "MILLILITER"], ["یخ", 120, "GRAM"]],
      allergens: ["MILK"],
    },
    {
      slug: "cold-brew", nameFa: "کولد برو", nameEn: "Cold Brew",
      description: "قهوه‌ی دم سرد ۱۲ ساعته با طعمی ملایم و کم‌تلخی.",
      price: 130000, image: img("photo-1517701604599-bb29b565090c"), category: "cold-drinks",
      prepBaseMin: 2,
      ingredients: [["اسپرسو", 25, "GRAM"], ["یخ", 150, "GRAM"]],
      dietary: ["VEGAN", "GLUTEN_FREE", "DAIRY_FREE"],
      coffeeLinePrices: [["House Blend", 130000], ["Ethiopia", 160000]],
    },
    {
      slug: "lemon-mint", nameFa: "لیموناد نعنایی", nameEn: "Mint Lemonade",
      description: "لیموناد خانگی با نعنای تازه.",
      price: 95000, image: img("photo-1556679343-c7306c1976bc"), category: "cold-drinks",
      prepBaseMin: 4,
      ingredients: [["لیمو", 1, "UNIT"], ["نعناع", 8, "GRAM"], ["یخ", 150, "GRAM"], ["شکر قهوه‌ای", 20, "GRAM"]],
      dietary: ["VEGAN", "GLUTEN_FREE", "DAIRY_FREE"],
    },
    {
      slug: "croissant", nameFa: "کرواسان کره‌ای", nameEn: "Butter Croissant",
      description: "کرواسان تازه پخته شده با کره‌ی فرانسوی.",
      price: 85000, image: img("photo-1555507036-ab1f4038808a"), category: "breakfast",
      isFeatured: true, prepBaseMin: 5,
      ingredients: [["آرد گندم", 90, "GRAM"], ["کره", 40, "GRAM"], ["تخم مرغ", 0.5, "UNIT"]],
      allergens: ["GLUTEN", "MILK", "EGGS"],
    },
    {
      slug: "cheese-plate", nameFa: "بشقاب پنیر و گردو", nameEn: "Cheese & Walnut Plate",
      description: "پنیر موزارلا، گردوی تازه و عسل.",
      price: 165000, image: img("photo-1452195100486-9cc805987862"), category: "breakfast",
      prepBaseMin: 6,
      ingredients: [["پنیر موزارلا", 120, "GRAM"], ["گردو", 30, "GRAM"], ["عسل", 20, "GRAM"]],
      allergens: ["MILK", "TREE_NUTS"],
    },
    {
      slug: "omelette", nameFa: "املت کلاسیک", nameEn: "Classic Omelette",
      description: "املت سه تخم مرغ با کره و ادویه.",
      price: 120000, image: img("photo-1525351484163-7529414344d8"), category: "breakfast",
      prepBaseMin: 8,
      ingredients: [["تخم مرغ", 3, "UNIT"], ["کره", 15, "GRAM"]],
      allergens: ["EGGS", "MILK"],
    },
    {
      slug: "margherita", nameFa: "پیتزا مارگاریتا", nameEn: "Margherita Pizza",
      description: "پیتزا ایتالیایی با سس گوجه، موزارلا و ریحان تازه.",
      price: 245000, image: img("photo-1604068549290-dea0e4a305ca"), category: "food",
      isFeatured: true, prepBaseMin: 12,
      ingredients: [["آرد گندم", 220, "GRAM"], ["پنیر موزارلا", 120, "GRAM"], ["گوجه فرنگی", 100, "GRAM"], ["ریحان", 5, "GRAM"], ["روغن زیتون", 15, "MILLILITER"]],
      allergens: ["GLUTEN", "MILK"],
    },
    {
      slug: "chicken-salad", nameFa: "سالاد مرغ", nameEn: "Chicken Salad",
      description: "سالاد سبز با مرغ گریل شده و سس روغن زیتون.",
      price: 195000, image: img("photo-1546069901-ba9599a7e63c"), category: "food",
      prepBaseMin: 10,
      ingredients: [["مرغ", 150, "GRAM"], ["روغن زیتون", 20, "MILLILITER"], ["ریحان", 3, "GRAM"]],
      dietary: ["GLUTEN_FREE", "DAIRY_FREE"],
    },
    {
      slug: "salmon-plate", nameFa: "بشقاب سالمون", nameEn: "Salmon Plate",
      description: "ماهی سالمون گریل شده با سبزیجات تازه.",
      price: 385000, image: img("photo-1467003909585-2f8a72700288"), category: "food",
      prepBaseMin: 14,
      ingredients: [["ماهی سالمون", 180, "GRAM"], ["روغن زیتون", 15, "MILLILITER"], ["لیمو", 0.5, "UNIT"]],
      allergens: ["FISH"],
    },
    {
      slug: "tiramisu", nameFa: "تیرامیسو", nameEn: "Tiramisu",
      description: "دسر ایتالیایی با قهوه، پنیر ماسکارپونه و کاکائو.",
      price: 145000, image: img("photo-1571877227200-a0d98ea607e9"), category: "dessert",
      isFeatured: true, prepBaseMin: 5,
      ingredients: [["پنیر موزارلا", 80, "GRAM"], ["تخم مرغ", 1, "UNIT"], ["کاکائو", 8, "GRAM"], ["آرد گندم", 40, "GRAM"]],
      allergens: ["MILK", "EGGS", "GLUTEN"],
    },
    {
      slug: "basque-cheesecake", nameFa: "چیزکیک باسک", nameEn: "Basque Cheesecake",
      description: "چیزکیک کرمی با لایه‌ی کاراملی.",
      price: 135000, image: img("photo-1565958011703-44f9829ba187"), category: "dessert",
      prepBaseMin: 5,
      ingredients: [["پنیر موزارلا", 90, "GRAM"], ["تخم مرغ", 1, "UNIT"], ["آرد گندم", 30, "GRAM"]],
      allergens: ["MILK", "EGGS", "GLUTEN"],
    },
    {
      slug: "vegan-brownie", nameFa: "براونی وگان", nameEn: "Vegan Brownie",
      description: "براونی شکلاتی بدون لبنیات و تخم مرغ.",
      price: 110000, image: img("photo-1606313564200-e75d5e30476c"), category: "dessert",
      prepBaseMin: 5,
      ingredients: [["کاکائو", 20, "GRAM"], ["آرد گندم", 60, "GRAM"]],
      allergens: ["GLUTEN"],
      dietary: ["VEGAN", "DAIRY_FREE"],
    },
    {
      slug: "fresh-apple-pie", nameFa: "پای سیب تازه", nameEn: "Fresh Apple Pie",
      description: "پای سیب خانگی با کنجد.",
      price: 125000, image: img("photo-1568571780765-9276ac8b75a2"), category: "dessert",
      prepBaseMin: 5,
      ingredients: [["آرد گندم", 80, "GRAM"], ["کره", 30, "GRAM"], ["سیب", 120, "GRAM"], ["کنجد", 5, "GRAM"]],
      allergens: ["GLUTEN", "MILK", "SESAME"],
    },
  ];

  for (const p of products) {
    const cat = catBySlug[p.category];
    if (!cat) continue;
    const created = await prisma.product.create({
      data: {
        slug: p.slug,
        nameFa: p.nameFa,
        nameEn: p.nameEn,
        description: p.description,
        price: p.price,
        image: p.image,
        categoryId: cat.id,
        isFeatured: p.isFeatured ?? false,
        prepBaseMin: p.prepBaseMin ?? 3,
        allergenStatus: (p.allergens?.length ?? 0) > 0 ? "CONTAINS" : "FREE",
      },
    });
    for (const [ingName, qty, unit] of p.ingredients) {
      const ing = ingByKey[ingName];
      if (ing) {
        await prisma.productIngredient.create({
          data: { productId: created.id, ingredientId: ing.id, quantity: qty, unit: unit ?? "GRAM" },
        });
      }
    }
    if (p.allergens) {
      for (const key of p.allergens) {
        const al = allergenByKey[key];
        if (al) {
          await prisma.productAllergen.create({
            data: { productId: created.id, allergenId: al.id },
          });
        }
      }
    }
    if (p.dietary) {
      for (const d of p.dietary) {
        const dt = dietByKey[d];
        if (dt) {
          await prisma.productDietaryTag.create({
            data: { productId: created.id, dietaryTagId: dt.id },
          });
        }
      }
    }
    if (p.coffeeLinePrices) {
      for (const [lineEn, price] of p.coffeeLinePrices) {
        const line = lineByName[lineEn];
        if (line) {
          await prisma.productCoffeeLine.create({
            data: { productId: created.id, coffeeLineId: line.id, price },
          });
        }
      }
    }
  }

  const cafe = await prisma.cafe.create({
    data: { nameFa: "کافه فرمان", nameEn: "Farmans Cafe", slug: "farmans" },
  });
  const branch = await prisma.branch.create({
    data: {
      cafeId: cafe.id,
      nameFa: "شعبه مرکزی",
      nameEn: "Main Branch",
      slug: "main",
      address: "تهران، خیابان ولیعصر",
    },
  });

  for (const num of ["1", "2", "3", "4", "5", "6", "7", "8"]) {
    const table = await prisma.cafeTable.create({
      data: { branchId: branch.id, number: num, label: `میز ${num}` },
    });
    await prisma.qRCode.create({
      data: {
        code: `main-table-${num}`,
        branchId: branch.id,
        tableId: table.id,
        label: `میز ${num}`,
      },
    });
  }
  await prisma.qRCode.create({
    data: { code: "main-menu", branchId: branch.id, label: "منوی اصلی" },
  });

  // Staff — chefs feed the preparation-time estimator.
  await prisma.staff.createMany({
    data: [
      { name: "امیر — شف قهوه", role: "CHEF" },
      { name: "سارا — شف آشپزخانه", role: "CHEF" },
      { name: "رضا — گارسون", role: "WAITER" },
    ],
  });

  // Users for the three roles.
  const ownerPassword = await bcrypt.hash("admin1234", 10);
  await prisma.user.create({
    data: {
      name: "مدیر کافه",
      email: "admin@farmans.cafe",
      passwordHash: ownerPassword,
      role: "OWNER",
    },
  });
  const cashierPassword = await bcrypt.hash("cashier1234", 10);
  await prisma.user.create({
    data: {
      name: "صندوق‌دار",
      email: "cashier@farmans.cafe",
      passwordHash: cashierPassword,
      role: "CASHIER",
    },
  });

  const userPassword = await bcrypt.hash("user1234", 10);
  const sampleUser = await prisma.user.create({
    data: {
      name: "کاربر نمونه",
      email: "user@farmans.cafe",
      passwordHash: userPassword,
      role: "CUSTOMER",
    },
  });

  const milkAllergen = allergenByKey["MILK"];
  await prisma.userAllergy.create({
    data: { userId: sampleUser.id, allergenId: milkAllergen.id },
  });

  await prisma.userPreference.createMany({
    data: [
      { userId: sampleUser.id, key: "favoriteCategory", value: "coffee" },
      { userId: sampleUser.id, key: "sweetOrSavory", value: "sweet" },
      { userId: sampleUser.id, key: "coffeePreference", value: "mild" },
    ],
  });

  const existingSettings = await prisma.salesFlowSettings.findFirst();
  if (!existingSettings) {
    await prisma.salesFlowSettings.create({
      data: {
        granularityMin: 30,
        timezone: "Asia/Tehran",
        schedules: {
          create: [
            { dayOfWeek: 0, startTime: "09:00", endTime: "23:00", isEnabled: true, crossesMidnight: false },
            { dayOfWeek: 1, startTime: "09:00", endTime: "23:00", isEnabled: true, crossesMidnight: false },
            { dayOfWeek: 2, startTime: "09:00", endTime: "23:00", isEnabled: true, crossesMidnight: false },
            { dayOfWeek: 3, startTime: "09:00", endTime: "23:00", isEnabled: true, crossesMidnight: false },
            { dayOfWeek: 4, startTime: "09:00", endTime: "23:00", isEnabled: true, crossesMidnight: false },
            { dayOfWeek: 5, startTime: "09:00", endTime: "23:00", isEnabled: true, crossesMidnight: false },
            { dayOfWeek: 6, startTime: "09:00", endTime: "23:00", isEnabled: true, crossesMidnight: false },
          ],
        },
      },
    });
  }

  const cappuccino = await prisma.product.findUnique({ where: { slug: "cappuccino" } });
  const croissant = await prisma.product.findUnique({ where: { slug: "croissant" } });
  const tiramisu = await prisma.product.findUnique({ where: { slug: "tiramisu" } });
  if (cappuccino && croissant && tiramisu) {
    await prisma.rating.createMany({
      data: [
        { userId: sampleUser.id, productId: cappuccino.id, rating: 5, review: "عالی" },
        { userId: sampleUser.id, productId: croissant.id, rating: 4, review: "خوب" },
        { userId: sampleUser.id, productId: tiramisu.id, rating: 5, review: "بی‌نظیر" },
      ],
    });
  }

  console.log("✅ Seed completed");
  console.log("Owner:   admin@farmans.cafe   / admin1234");
  console.log("Cashier: cashier@farmans.cafe / cashier1234");
  console.log("User:    user@farmans.cafe    / user1234");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

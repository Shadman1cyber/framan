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
  await prisma.product.deleteMany();
  await prisma.category.deleteMany();
  await prisma.ingredientAllergen.deleteMany();
  await prisma.ingredient.deleteMany();
  await prisma.allergen.deleteMany();
  await prisma.dietaryTag.deleteMany();
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
      { nameFa: "اسپرسو", nameEn: "Espresso" },
      { nameFa: "شیر تازه", nameEn: "Fresh Milk", isAllergen: true },
      { nameFa: "شیر جو دوسر", nameEn: "Oat Milk" },
      { nameFa: "شیر بادام", nameEn: "Almond Milk", isAllergen: true },
      { nameFa: "شکر قهوه‌ای", nameEn: "Brown Sugar" },
      { nameFa: "وانیل", nameEn: "Vanilla" },
      { nameFa: "کاکائو", nameEn: "Cocoa" },
      { nameFa: "کره", nameEn: "Butter", isAllergen: true },
      { nameFa: "تخم مرغ", nameEn: "Egg", isAllergen: true },
      { nameFa: "آرد گندم", nameEn: "Wheat Flour", isAllergen: true },
      { nameFa: "گردو", nameEn: "Walnut", isAllergen: true },
      { nameFa: "بادام", nameEn: "Almond", isAllergen: true },
      { nameFa: "کنجد", nameEn: "Sesame", isAllergen: true },
      { nameFa: "پنیر موزارلا", nameEn: "Mozzarella", isAllergen: true },
      { nameFa: "مرغ", nameEn: "Chicken" },
      { nameFa: "ماهی سالمون", nameEn: "Salmon", isAllergen: true },
      { nameFa: "روغن زیتون", nameEn: "Olive Oil" },
      { nameFa: "گوجه فرنگی", nameEn: "Tomato" },
      { nameFa: "ریحان", nameEn: "Basil" },
      { nameFa: "عسل", nameEn: "Honey" },
      { nameFa: "کشمش", nameEn: "Raisin" },
      { nameFa: "سیب", nameEn: "Apple" },
      { nameFa: "نعناع", nameEn: "Mint" },
      { nameFa: "لیمو", nameEn: "Lemon" },
      { nameFa: "یخ", nameEn: "Ice" },
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
    isAvailable?: boolean;
    allergenStatus?: "SAFE" | "UNKNOWN" | "CONTAINS";
    ingredients: string[];
    allergens?: Array<{ key: string; status?: "CONTAINS" | "MAY_CONTAIN" }>;
    dietary?: string[];
  };

  const products: ProductSeed[] = [
    {
      slug: "espresso",
      nameFa: "اسپرسو",
      nameEn: "Espresso",
      description: "یک شات اسپرسوی غلیظ و معطر، عصاره‌ی خالص دانه‌های تازه آسیاب شده.",
      price: 85000,
      image: img("photo-1510707577719-ae7c14805e3a"),
      category: "coffee",
      isFeatured: true,
      allergenStatus: "SAFE",
      ingredients: ["اسپرسو"],
      dietary: ["VEGAN", "GLUTEN_FREE", "DAIRY_FREE"],
    },
    {
      slug: "cappuccino",
      nameFa: "کاپوچینو",
      nameEn: "Cappuccino",
      description: "اسپرسو با شیر بخار داده شده و کف مخملی.",
      price: 120000,
      image: img("photo-1572442388796-11668a67e53d"),
      category: "coffee",
      isFeatured: true,
      allergenStatus: "CONTAINS",
      ingredients: ["اسپرسو", "شیر تازه"],
      allergens: [{ key: "MILK" }],
    },
    {
      slug: "latte",
      nameFa: "لته",
      nameEn: "Latte",
      description: "اسپرسو با شیر نرم و لطیف، مناسب برای آرامش صبحگاهی.",
      price: 125000,
      image: img("photo-1561882468-9110e03e0f78"),
      category: "coffee",
      allergenStatus: "CONTAINS",
      ingredients: ["اسپرسو", "شیر تازه"],
      allergens: [{ key: "MILK" }],
    },
    {
      slug: "oat-latte",
      nameFa: "لته جو دوسر",
      nameEn: "Oat Latte",
      description: "لته کلاسیک با شیر جو دوسر بدون شکر.",
      price: 145000,
      image: img("photo-1592318445673-2d4cf2cd89d4"),
      category: "coffee",
      isFeatured: true,
      allergenStatus: "SAFE",
      ingredients: ["اسپرسو", "شیر جو دوسر"],
      dietary: ["VEGAN", "DAIRY_FREE"],
    },
    {
      slug: "mocha",
      nameFa: "موکا",
      nameEn: "Mocha",
      description: "ترکیب اسپرسو، شیر گرم و سس کاکائوی غلیظ.",
      price: 140000,
      image: img("photo-1578314675229-95ea43bd1f5e"),
      category: "coffee",
      allergenStatus: "CONTAINS",
      ingredients: ["اسپرسو", "شیر تازه", "کاکائو"],
      allergens: [{ key: "MILK" }],
    },
    {
      slug: "hot-chocolate",
      nameFa: "هات چاکلت",
      nameEn: "Hot Chocolate",
      description: "شکلات داغ غلیظ با خامه‌ی کاکائو.",
      price: 110000,
      image: img("photo-1542990253-0d0f5be5f0ed"),
      category: "hot-drinks",
      allergenStatus: "CONTAINS",
      ingredients: ["شیر تازه", "کاکائو"],
      allergens: [{ key: "MILK" }],
    },
    {
      slug: "tea",
      nameFa: "چای سیاه",
      nameEn: "Black Tea",
      description: "چای سیاه تازه‌دم با عطر و طعم اصیل.",
      price: 55000,
      image: img("photo-1597318236926-69cbf04f8d3e"),
      category: "hot-drinks",
      allergenStatus: "SAFE",
      ingredients: [],
      dietary: ["VEGAN", "GLUTEN_FREE", "DAIRY_FREE"],
    },
    {
      slug: "iced-latte",
      nameFa: "آیس لته",
      nameEn: "Iced Latte",
      description: "لته خنک با یخ، مناسب برای روزهای گرم.",
      price: 135000,
      image: img("photo-1461023058943-07fcbe16d735"),
      category: "cold-drinks",
      isFeatured: true,
      allergenStatus: "CONTAINS",
      ingredients: ["اسپرسو", "شیر تازه", "یخ"],
      allergens: [{ key: "MILK" }],
    },
    {
      slug: "cold-brew",
      nameFa: "کولد برو",
      nameEn: "Cold Brew",
      description: "قهوه‌ی دم سرد ۱۲ ساعته با طعمی ملایم و کم‌تلخی.",
      price: 130000,
      image: img("photo-1517701604599-bb29b565090c"),
      category: "cold-drinks",
      allergenStatus: "SAFE",
      ingredients: ["اسپرسو", "یخ"],
      dietary: ["VEGAN", "GLUTEN_FREE", "DAIRY_FREE"],
    },
    {
      slug: "lemon-mint",
      nameFa: "لیموناد نعنایی",
      nameEn: "Mint Lemonade",
      description: "لیموناد خانگی با نعنای تازه.",
      price: 95000,
      image: img("photo-1556679343-c7306c1976bc"),
      category: "cold-drinks",
      allergenStatus: "SAFE",
      ingredients: ["لیمو", "نعناع", "یخ"],
      dietary: ["VEGAN", "GLUTEN_FREE", "DAIRY_FREE"],
    },
    {
      slug: "croissant",
      nameFa: "کرواسان کره‌ای",
      nameEn: "Butter Croissant",
      description: "کرواسان تازه پخته شده با کره‌ی فرانسوی.",
      price: 85000,
      image: img("photo-1555507036-ab1f4038808a"),
      category: "breakfast",
      isFeatured: true,
      allergenStatus: "CONTAINS",
      ingredients: ["آرد گندم", "کره", "تخم مرغ"],
      allergens: [{ key: "GLUTEN" }, { key: "MILK" }, { key: "EGGS" }],
    },
    {
      slug: "cheese-plate",
      nameFa: "بشقاب پنیر و گردو",
      nameEn: "Cheese & Walnut Plate",
      description: "پنیر موزارلا، گردوی تازه و عسل.",
      price: 165000,
      image: img("photo-1452195100486-9cc805987862"),
      category: "breakfast",
      allergenStatus: "CONTAINS",
      ingredients: ["پنیر موزارلا", "گردو", "عسل"],
      allergens: [{ key: "MILK" }, { key: "TREE_NUTS" }],
    },
    {
      slug: "omelette",
      nameFa: "املت کلاسیک",
      nameEn: "Classic Omelette",
      description: "املت سه تخم مرغ با کره و ادویه.",
      price: 120000,
      image: img("photo-1525351484163-7529414344d8"),
      category: "breakfast",
      allergenStatus: "CONTAINS",
      ingredients: ["تخم مرغ", "کره"],
      allergens: [{ key: "EGGS" }, { key: "MILK" }],
    },
    {
      slug: "margherita",
      nameFa: "پیتزا مارگاریتا",
      nameEn: "Margherita Pizza",
      description: "پیتزا ایتالیایی با سس گوجه، موزارلا و ریحان تازه.",
      price: 245000,
      image: img("photo-1604068549290-dea0e4a305ca"),
      category: "food",
      isFeatured: true,
      allergenStatus: "CONTAINS",
      ingredients: ["آرد گندم", "پنیر موزارلا", "گوجه فرنگی", "ریحان", "روغن زیتون"],
      allergens: [{ key: "GLUTEN" }, { key: "MILK" }],
    },
    {
      slug: "chicken-salad",
      nameFa: "سالاد مرغ",
      nameEn: "Chicken Salad",
      description: "سالاد سبز با مرغ گریل شده و سس روغن زیتون.",
      price: 195000,
      image: img("photo-1546069901-ba9599a7e63c"),
      category: "food",
      allergenStatus: "SAFE",
      ingredients: ["مرغ", "روغن زیتون", "ریحان"],
      dietary: ["GLUTEN_FREE", "DAIRY_FREE"],
    },
    {
      slug: "salmon-plate",
      nameFa: "بشقاب سالمون",
      nameEn: "Salmon Plate",
      description: "ماهی سالمون گریل شده با سبزیجات تازه.",
      price: 385000,
      image: img("photo-1467003909585-2f8a72700288"),
      category: "food",
      allergenStatus: "CONTAINS",
      ingredients: ["ماهی سالمون", "روغن زیتون", "لیمو"],
      allergens: [{ key: "FISH" }],
    },
    {
      slug: "tiramisu",
      nameFa: "تیرامیسو",
      nameEn: "Tiramisu",
      description: "دسر ایتالیایی با قهوه، پنیر ماسکارپونه و کاکائو.",
      price: 145000,
      image: img("photo-1571877227200-a0d98ea607e9"),
      category: "dessert",
      isFeatured: true,
      allergenStatus: "CONTAINS",
      ingredients: ["پنیر موزارلا", "تخم مرغ", "کاکائو", "آرد گندم"],
      allergens: [{ key: "MILK" }, { key: "EGGS" }, { key: "GLUTEN" }],
    },
    {
      slug: "basque-cheesecake",
      nameFa: "چیزکیک باسک",
      nameEn: "Basque Cheesecake",
      description: "چیزکیک کرمی با لایه‌ی کاراملی.",
      price: 135000,
      image: img("photo-1565958011703-44f9829ba187"),
      category: "dessert",
      allergenStatus: "CONTAINS",
      ingredients: ["پنیر موزارلا", "تخم مرغ", "آرد گندم"],
      allergens: [{ key: "MILK" }, { key: "EGGS" }, { key: "GLUTEN" }],
    },
    {
      slug: "vegan-brownie",
      nameFa: "براونی وگان",
      nameEn: "Vegan Brownie",
      description: "براونی شکلاتی بدون لبنیات و تخم مرغ.",
      price: 110000,
      image: img("photo-1606313564200-e75d5e30476c"),
      category: "dessert",
      allergenStatus: "SAFE",
      ingredients: ["کاکائو", "آرد گندم"],
      allergens: [{ key: "GLUTEN" }],
      dietary: ["VEGAN", "DAIRY_FREE"],
    },
    {
      slug: "fresh-apple-pie",
      nameFa: "پای سیب تازه",
      nameEn: "Fresh Apple Pie",
      description: "پای سیب خانگی با کنجد.",
      price: 125000,
      image: img("photo-1568571780765-9276ac8b75a2"),
      category: "dessert",
      allergenStatus: "CONTAINS",
      ingredients: ["آرد گندم", "کره", "سیب", "کنجد"],
      allergens: [{ key: "GLUTEN" }, { key: "MILK" }, { key: "SESAME" }],
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
        isAvailable: p.isAvailable ?? true,
        allergenStatus: p.allergenStatus ?? "UNKNOWN",
      },
    });
    for (const ingName of p.ingredients) {
      const ing = ingByKey[ingName];
      if (ing) {
        await prisma.productIngredient.create({
          data: { productId: created.id, ingredientId: ing.id },
        });
      }
    }
    if (p.allergens) {
      for (const a of p.allergens) {
        const al = allergenByKey[a.key];
        if (al) {
          await prisma.productAllergen.create({
            data: {
              productId: created.id,
              allergenId: al.id,
              status: a.status ?? "CONTAINS",
            },
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

  const adminPassword = await bcrypt.hash("admin1234", 10);
  await prisma.user.create({
    data: {
      name: "مدیر کافه",
      email: "admin@farmans.cafe",
      passwordHash: adminPassword,
      role: "ADMIN",
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
  console.log("Admin: admin@farmans.cafe / admin1234");
  console.log("User:  user@farmans.cafe  / user1234");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
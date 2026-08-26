import type {
  ActivityEvent,
  Agent,
  Approval,
  BudgetCategory,
  Company,
  Evidence,
  Offer,
  Policy,
  PurchaseOrder,
  PurchaseRequest,
  Recommendation,
  RFQ,
  Role,
  Supplier,
  User,
  Workflow,
} from "./types";

export const company: Company = {
  id: "co-meridian",
  name: "Meridian Roasters",
  workspace: "عملیات",
  cashPosition: 4128000000,
};

export const roles: Role[] = [
  {
    id: "role-director",
    title: "مدیر عملیات",
    approvalLimit: 25000,
    canApprove: [
      "تأیید سفارش‌های خرید تا ۲۵۰٬۰۰۰٬۰۰۰ ریال",
      "انتخاب تأمین‌کننده در چارچوب سیاست‌ها",
    ],
    cannotApprove: [
      "پرداخت به تأمین‌کننده جدید از ۵۰٬۰۰۰٬۰۰۰ ریال به بالا (نیازمند احراز انطباق)",
      "قراردادهای بیش از ۱۲ ماه",
    ],
  },
  {
    id: "role-procurement-lead",
    title: "سرپرست تدارکات",
    approvalLimit: 5000,
    canApprove: ["تأیید سفارش‌های خرید تا ۵۰٬۰۰۰٬۰۰۰ ریال"],
    cannotApprove: ["هر پرداختی به تأمین‌کننده جدید", "خرید خارج از قرارداد بالای ۵۰٬۰۰۰٬۰۰۰ ریال"],
  },
  {
    id: "role-finance-partner",
    title: "شریک مالی",
    approvalLimit: 50000,
    canApprove: [
      "تأیید سفارش‌های خرید تا ۵۰۰٬۰۰۰٬۰۰۰ ریال",
      "استثنای سقف بودجه تا ۱۰٪",
    ],
    cannotApprove: ["تغییر شرایط پرداخت تأمین‌کنندگان"],
  },
];

export const users: User[] = [
  {
    id: "u-alex",
    name: "Alex Chen",
    roleId: "role-director",
    title: "مدیر عملیات",
  },
  {
    id: "u-priya",
    name: "Priya Patel",
    roleId: "role-procurement-lead",
    title: "سرپرست تدارکات",
  },
  {
    id: "u-sam",
    name: "Sam Ortiz",
    roleId: "role-finance-partner",
    title: "شریک مالی",
  },
];

export const policies: Policy[] = [
  {
    id: "pol-2",
    code: "POL-2",
    name: "آستانه تأیید",
    description:
      "سفارش‌های خرید بالای ۱۰۰٬۰۰۰٬۰۰۰ ریال نیازمند امضای مدیر یا بالاتر هستند.",
    trigger: "مجموع سفارش بیش از ۱۰۰٬۰۰۰٬۰۰۰ ریال",
  },
  {
    id: "pol-3",
    code: "POL-3",
    name: "سقف بودجه دسته‌ها",
    description:
      "هزینه تعهدشدهٔ ماهانهٔ هر دسته بدون تأیید واحد مالی نباید از سقف بودجه عبور کند.",
    trigger: "عبور هزینهٔ تعهدشده از سقف دسته",
  },
  {
    id: "pol-5",
    code: "POL-5",
    name: "احراز تأمین‌کننده جدید",
    description:
      "اولین سفارش خرید ۵۰٬۰۰۰٬۰۰۰ ریال یا بیشتر با تأمین‌کننده جدید، پیش از عقد قرارداد نیازمند احراز هویت و انطباق است.",
    trigger: "پرداخت به تأمین‌کننده جدید از ۵۰٬۰۰۰٬۰۰۰ ریال به بالا",
  },
  {
    id: "pol-7",
    code: "POL-7",
    name: "قاعده دو استعلام",
    description:
      "خرید از فروشندگان فهرست ترجیحی به دو استعلام و فروشندگان خارج فهرست به سه استعلام نیاز دارد.",
    trigger: "دریافت استعلام کمتر از حد لازم",
  },
  {
    id: "pol-8",
    code: "POL-8",
    name: "شرایط پرداخت",
    description:
      "شرایط پیش‌فرض «خالص ۳۰ روز» است؛ تخفیف پرداخت زودهنگام از ۱٪ به بالا پذیرفته می‌شود.",
    trigger: "Terms outside Net 30 with no qualifying discount",
  },
];

export const agents: Agent[] = [
  {
    id: "ag-orchestrator",
    name: "هماهنگ‌کننده فرمان",
    purpose:
      "جریان‌های کاری را مرحله‌بندی می‌کند، عامل‌های تخصصی را زمان‌بندی می‌کند و نقاط کنترلی سیاست را اعمال می‌کند.",
    status: "working",
    statusLine:
      "زمان‌بندی جریان کار «سفارش مجدد دستکش ایمنی» — ارسال استعلام در جریان است.",
    worksOnWorkflowId: "wf-1045",
    doesAutonomously: [
      "برنامه‌ریزی و تغییر ترتیب مراحل جریان کار",
      "توزیع کار میان عامل‌ها",
      "توقف جریان کار هنگام برقرار نبودن نقطه کنترلی",
    ],
    escalatesWhen: [
      "وقتی سیاست، تأیید انسانی می‌خواهد",
      "وقتی دو عامل درباره یک ورودی اختلاف دارند",
    ],
  },
  {
    id: "ag-sourcing",
    name: "عامل تأمین",
    purpose:
      "یافتن تأمین‌کنندگان، ارسال استعلام قیمت، جمع‌آوری پیشنهادها و پیگیری پاسخ‌ها.",
    status: "waiting_external",
    statusLine:
      "در انتظار پاسخ تأمین‌کننده — استعلام ۲۶ دقیقه پیش برای «سفارش مجدد دستکش ایمنی» به ۳ تأمین‌کننده ارسال شد.",
    worksOnWorkflowId: "wf-1045",
    doesAutonomously: [
      "جست‌وجوی فهرست تأمین‌کنندگان تأییدشده",
      "ارسال استعلام به تأمین‌کنندگان منتخب",
      "ثبت و زمان‌نگاری پیشنهادهای دریافتی",
    ],
    escalatesWhen: [
      "وقتی تأمین‌کننده خارج از فهرست تأییدشده باشد",
      "وقتی تا مهلت هیچ پاسخی نرسد",
    ],
  },
  {
    id: "ag-evaluation",
    name: "عامل ارزیابی",
    purpose:
      "امتیازدهی پیشنهادها بر اساس مشخصات و سیاست‌ها و تنظیم پیشنهاد همراه با شواهد.",
    status: "idle",
    statusLine:
      "از ساعت ۱۱:۰۷ بیکار — آخرین اقدام، پیشنهاد «پک‌لاین اینداستریز» برای PR-1042 بود.",
    worksOnWorkflowId: "wf-1042",
    doesAutonomously: [
      "مقایسه گزینه‌به‌گزینه پیشنهادها با مشخصات",
      "نشانه‌گذاری پیشنهادهای با شواهد ناقص یا کم‌اطمینان",
      "تنظیم پیشنهاد همراه با دلیل رد هر گزینه",
    ],
    escalatesWhen: [
      "وقتی پیشنهاد از آستانه تأیید عبور می‌کند",
      "وقتی شواهد برای مقایسه منصفانه دو پیشنهاد کافی نیست",
    ],
  },
  {
    id: "ag-finance",
    name: "عامل مالی",
    purpose:
      "بررسی بودجه، زمان‌بندی پرداخت‌ها، ثبت به‌روزرسانی‌های مالی و مغایرت‌گیری رسیدها.",
    status: "retrying",
    statusLine:
      "تلاش دوباره برای همگام‌سازی ERP — به‌روزرسانی مالی «خرید ماهانه ملزومات نظافتی» با خطای اتصال ناموفق بود. تلاش بعدی تا ۴ دقیقه دیگر.",
    worksOnWorkflowId: "wf-1044",
    doesAutonomously: [
      "بررسی توان پرداخت بر اساس موجودی نقد و بودجه دسته‌ها",
      "زمان‌بندی پرداخت‌ها در شرایط تأییدشده",
      "ثبت به‌روزرسانی مالی پس از تأیید سفارش",
    ],
    escalatesWhen: [
      "وقتی ثبت مالی دو بار پشت‌هم شکست بخورد",
      "وقتی تراکنش دسته را از سقف عبور دهد",
    ],
  },
];

export const suppliers: Supplier[] = [
  {
    id: "sup-packline",
    name: "Packline Industries",
    status: "incumbent",
    location: "پورتلند، اورگن",
    onTimeRate: 98,
    ordersLast12m: 24,
    historyNote: "۲۴ سفارش در ۱۲ ماه گذشته با ما؛ ۹۸٪ تحویل به‌موقع.",
  },
  {
    id: "sup-verdepack",
    name: "VerdePack Co.",
    status: "new",
    location: "ساکرامنتو، کالیفرنیا",
    historyNote: "تأمین‌کننده جدید — نخستین تماس از طریق همین درخواست.",
  },
  {
    id: "sup-summit",
    name: "Summit Flexible Packaging",
    status: "verified",
    location: "دنور، کلرادو",
    onTimeRate: 89,
    ordersLast12m: 6,
    historyNote: "۶ سفارش در ۶ ماه گذشته؛ ۳ مورد با تأخیر تحویل شد.",
  },
];

export const purchaseRequest: PurchaseRequest = {
  id: "pr-1042",
  workflowId: "wf-1042",
  title: "بسته‌بندی خرده‌فروشی فصل چهارم — ۵۰٬۰۰۰ کیسه کرافت ایستاده",
  description:
    "کیسه‌های کرافت ایستاده ۸ اونسی با شیر یک‌طرفه تخلیه هوا و چاپ تک‌رنگ برای عرضهٔ خرده‌فروشی فصل چهارم. موجودی باید تا ۲۸ سپتامبر برسد تا آماده‌سازی عرضه از اول اکتبر آغاز شود.",
  requestedByName: "Alex Chen",
  quantity: 50000,
  unitLabel: "کیسه",
  category: "ملزومات بسته‌بندی",
  neededBy: "۲۸ سپتامبر",
  createdAt: "امروز · ۰۹:۱۲",
};

export const rfq: RFQ = {
  id: "rfq-1042",
  purchaseRequestId: "pr-1042",
  sentToSupplierNames: [
    "Packline Industries",
    "VerdePack Co.",
    "Summit Flexible Packaging",
  ],
  sentAt: "امروز · ۰۹:۲۴",
  responsesDue: "امروز · ۱۷:۰۰",
  responsesReceived: 3,
  statusLine: "هر ۳ تأمین‌کننده پاسخ دادند.",
};

export const offers: Offer[] = [
  {
    id: "off-packline",
    supplierId: "sup-packline",
    unitPrice: 3100,
    total: 155000000,
    leadTimeDays: 21,
    arrivalLabel: "می‌رسد ۲۲ سپتامبر — ۶ روز پیش از مهلت ۲۸ سپتامبر",
    meetsDeadline: true,
    paymentTerms: "خالص ۳۰ روز",
    policyCheck: {
      state: "pass",
      policyCode: "POL-5",
      note: "تأمین‌کنندهٔ فعلی، احرازشده",
    },
    receivedAt: "امروز · ۱۰:۴۰",
    evidenceId: "EV-110",
    reliabilityDisplay: "۹۸٪ تحویل به‌موقع در ۲۴ سفارش",
  },
  {
    id: "off-verdepack",
    supplierId: "sup-verdepack",
    unitPrice: 2600,
    total: 130000000,
    leadTimeDays: 35,
    arrivalLabel: "Arrives Oct 6 — after your Sep 28 deadline",
    meetsDeadline: false,
    paymentTerms: "خالص ۴۵ روز",
    policyCheck: {
      state: "flagged",
      policyCode: "POL-5",
      note: "تأمین‌کننده جدید — پیش از هر پرداخت ۵۰٬۰۰۰٬۰۰۰ ریال به بالا، احراز هویت و انطباق لازم است",
    },
    receivedAt: "امروز · ۱۰:۵۲",
    evidenceId: "EV-111",
    reliabilityDisplay: "بدون سابقهٔ تحویل",
    reliabilityConfidence: "unproven",
    uncertaintyNote:
      "بدون سابقهٔ تحویل — فرمان هنوز نمی‌تواند ادعای قابلیت اطمینان آن‌ها را راستی‌آزمایی کند.",
  },
  {
    id: "off-summit",
    supplierId: "sup-summit",
    unitPrice: 3600,
    total: 180000000,
    leadTimeDays: 12,
    arrivalLabel: "Arrives Sep 13 — 15 days before your Sep 28 deadline",
    meetsDeadline: true,
    paymentTerms: "خالص ۳۰ روز",
    paymentTermsNote: "۲٪ تخفیف در صورت پرداخت تا ۱۰ روز",
    policyCheck: {
      state: "pass",
      policyCode: "POL-5",
      note: "تأمین‌کننده احرازشده",
    },
    receivedAt: "امروز · ۱۱:۰۵",
    evidenceId: "EV-112",
    reliabilityDisplay: "۸۹٪ به‌موقع در ۶ سفارش اخیر",
    reliabilityConfidence: "low",
    uncertaintyNote: "بر پایه تنها ۶ سفارش اخیر — نمونه کوچک است.",
  },
];

export const recommendation: Recommendation = {
  id: "rec-1042",
  offerId: "off-packline",
  agentName: "Evaluation agent",
  headline: "پک‌لاین اینداستریز — ۱۵۵٬۰۰۰٬۰۰۰ ریال",
  because:
    "فرمان «پک‌لاین اینداستریز» را پیشنهاد می‌کند، زیرا کم‌هزینه‌ترین پیشنهادی است که مهلت ۲۸ سپتامبر را برآورده می‌کند و بهترین سابقهٔ تحویل (۹۸٪ به‌موقع در ۲۴ سفارش) را دارد.",
  notPickedNotes: {
    "sup-verdepack":
      "۲۵٬۰۰۰٬۰۰۰ ریال ارزان‌تر است، اما زمان تحویل ۳۵ روزه یعنی رسیدن ۶ اکتبر — پس از مهلت شما — و آن‌ها تأمین‌کنندهٔ جدید بدون سابقهٔ تحویل هستند.",
    "sup-summit":
      "مهلت را برآورده می‌کند، اما ۲۵٬۰۰۰٬۰۰۰ ریال (۱۶٪) گران‌تر است و نرخ ۸۹٪ تحویل به‌موقع (۳ ارسال دیرهنگام در ۶ ماه) ریسک زمانی دارد.",
  },
  evidenceIds: ["EV-110", "EV-111", "EV-112", "EV-120"],
};

export const approval: Approval = {
  id: "apr-1042",
  purchaseRequestId: "pr-1042",
  workflowId: "wf-1042",
  amount: 155000000,
  assignedToName: "Alex Chen",
  requestedAt: "امروز · ۱۱:۰۸",
  expiresIn: "۴۸ ساعت دیگر منقضی می‌شود",
  requiredBecause:
    "تأیید لازم است: سیاست POL-2 — سفارش‌های خرید بالای ۱۰۰٬۰۰۰٬۰۰۰ ریال نیازمند امضای مدیر هستند. مبلغ این سفارش ۱۵۵٬۰۰۰٬۰۰۰ ریال است.",
  policyCode: "POL-2",
  ifApproved:
    "با تأیید شما، فرمان PO-5521 را می‌سازد، برای «پک‌لاین اینداستریز» ارسال می‌کند، پرداخت «خالص ۳۰ روز» را برای ۱ اکتبر زمان‌بندی و بودجهٔ بسته‌بندی را به‌روزرسانی می‌کند.",
};

export const purchaseOrder: PurchaseOrder = {
  id: "PO-5521",
  offerId: "off-packline",
  supplierName: "Packline Industries",
  amount: 155000000,
  state: "drafted",
  note: "تنظیم‌شده از پیشنهاد پذیرفته‌شده (EV-110). پس از تأیید به‌طور خودکار ارسال می‌شود.",
};

export const budgetCategories: BudgetCategory[] = [
  { id: "cat-packaging", name: "ملزومات بسته‌بندی", monthlyCap: 600000000, committed: 376000000 },
  { id: "cat-ops", name: "ملزومات عملیات", monthlyCap: 250000000, committed: 98000000 },
  { id: "cat-cafe", name: "کافه و اتاق استراحت", monthlyCap: 120000000, committed: 74500000 },
];

export const evidenceRecords: Evidence[] = [
  {
    id: "EV-101",
    label: "درخواست خرید PR-1042",
    kind: "message",
    source: "Alex Chen",
    capturedAt: "Today · 09:12",
    detail:
      "\"این هفته باید ۵۰ هزار کیسهٔ کرافت با شیر هوا را سفارش دهیم تا موجودی پیش از آماده‌سازی عرضهٔ فصل چهارم برسد.\"",
  },
  {
    id: "EV-102",
    label: "برگه مشخصات — کیسه، نسخه ب",
    kind: "record",
    source: "Evaluation agent",
    capturedAt: "امروز · ۰۹:۱۵",
    detail:
      "۵۰٬۰۰۰ عدد · کرافت ایستاده ۸ اونس · شیر یک‌طرفه تخلیه هوا · چاپ تک‌رنگ · آستر مخصوص مواد غذایی. مهلت بر اساس تاریخ عرضه ۱ اکتبر تعیین شد.",
  },
  {
    id: "EV-103",
    label: "فهرست کوتاه تأمین‌کنندگان",
    kind: "record",
    source: "Sourcing agent",
    capturedAt: "امروز · ۰۹:۲۰",
    detail:
      "۶ تأمین‌کننده با «کیسه کرافت ایستاده با شیر، تحویل ≤۴۰ روز» مطابق بودند؛ پک‌لاین، وردپک و سامیت بر اساس ظرفیت و گواهینامه‌ها انتخاب شدند.",
  },
  {
    id: "EV-104",
    label: "گزارش ارسال استعلام RFQ-1042",
    kind: "record",
    source: "Sourcing agent",
    capturedAt: "امروز · ۰۹:۲۴",
    detail: "مشخصات و فرم پاسخ یکسان به هر ۳ تأمین‌کننده ارسال شد. مهلت پاسخ امروز ساعت ۱۷:۰۰.",
  },
  {
    id: "EV-110",
    label: "پیشنهاد — پک‌لاین اینداستریز",
    kind: "quote",
    source: "پرتال سفارش پک‌لاین",
    capturedAt: "امروز · ۱۰:۴۰",
    detail:
      "۳٬۱۰۰ ریال در واحد × ۵۰٬۰۰۰ = ۱۵۵٬۰۰۰٬۰۰۰ ریال · تحویل ۲۱ روزه · خالص ۳۰ روز · PDF امضاشده پیوست پرونده است.",
  },
  {
    id: "EV-111",
    label: "پیشنهاد — وردپک",
    kind: "quote",
    source: "پیوست ایمیل",
    capturedAt: "امروز · ۱۰:۵۲",
    detail:
      "۲٬۶۰۰ ریال در واحد × ۵۰٬۰۰۰ = ۱۳۰٬۰۰۰٬۰۰۰ ریال · تحویل ۳۵ روزه · خالص ۴۵ روز. هیچ سابقه عملکردی ارائه نشده است.",
  },
  {
    id: "EV-112",
    label: "پیشنهاد — سامیت فلکسیبل پکیجینگ",
    kind: "quote",
    source: "پرتال مشتریان سامیت",
    capturedAt: "امروز · ۱۱:۰۵",
    detail:
      "۳٬۶۰۰ ریال در واحد × ۵۰٬۰۰۰ = ۱۸۰٬۰۰۰٬۰۰۰ ریال · تحویل ۱۲ روزه · خالص ۳۰ روز با تخفیف ۲٪/۱۰ روزه پرداخت زودهنگام.",
  },
  {
    id: "EV-120",
    label: "تصویر سیاست POL-2",
    kind: "policy",
    source: "سیاست‌ها و دسترسی‌ها",
    capturedAt: "امروز · ۱۱:۰۷",
    detail:
      "'سفارش‌های خرید بالای ۱۰۰٬۰۰۰٬۰۰۰ ریال نیازمند امضای مدیر هستند.' بر مجموع پیشنهادی ۱۵۵٬۰۰۰٬۰۰۰ ریال اعمال شد → نقطه کنترلی تأیید درج شد.",
  },
  {
    id: "EV-130",
    label: "سابقه PO-5521",
    kind: "record",
    source: "هماهنگ‌کننده فرمان",
    capturedAt: "همین حالا",
    detail:
      "ایجادشده از پیشنهاد پذیرفته‌شده EV-110: پک‌لاین اینداستریز، ۱۵۵٬۰۰۰٬۰۰۰ ریال، شرایط خالص ۳۰ روز، بازه تحویل ۲۲ سپتامبر.",
  },
  {
    id: "EV-131",
    label: "رسید تحویل پرتال",
    kind: "receipt",
    source: "پرتال سفارش پک‌لاین",
    capturedAt: "همین حالا",
    detail: "PO-5521 توسط پرتال تأمین‌کننده پذیرفته شد. تأییدیه از پک‌لاین در انتظار است.",
  },
  {
    id: "EV-140",
    label: "قید دفتر بودجه",
    kind: "record",
    source: "Finance agent",
    capturedAt: "امروز · ۱۱:۰۷",
    detail:
      "ملزومات بسته‌بندی: ۳۷۶٬۰۰۰٬۰۰۰ ریال تعهدشده از سقف ۶۰۰٬۰۰۰٬۰۰۰ ریالی. پس از این سفارش ۶۹٬۰۰۰٬۰۰۰ ریال باقی می‌ماند.",
  },
  {
    id: "EV-090",
    label: "رسید کارت — خرید دانه قهوه",
    kind: "receipt",
    source: "گردش کارت سازمانی",
    capturedAt: "امروز · ۰۹:۴۱",
    detail: "۳٬۴۰۰٬۰۰۰ ریال به بودجه اتاق استراحت ثبت شد. رسید به PR-1038 الصاق شد.",
  },
  {
    id: "EV-150",
    label: "گزارش خطای ERP — وقفه همگام‌سازی",
    kind: "record",
    source: "یکپارچه‌سازی سیستم مالی",
    capturedAt: "امروز · ۱۱:۴۲",
    detail:
      "هنگام ثبت ذخیره ملزومات نظافتی، اتصال قطع شد. تلاش خودکار هر ۴ دقیقه صف شد؛ داده‌ای از دست نرفت.",
  },
];

export const workflows: Workflow[] = [
  {
    id: "wf-1042",
    purchaseRequestId: "pr-1042",
    title: "بسته‌بندی فصل چهارم — ۵۰٬۰۰۰ کیسه کرافت",
    amount: 155000000,
    stages: [
      { id: "specify", label: "مشخصات", state: "completed", completedAt: "امروز · ۰۹:۱۵" },
      { id: "source", label: "استعلام", state: "completed", completedAt: "امروز · ۱۱:۰۵" },
      { id: "compare", label: "مقایسه", state: "completed", completedAt: "امروز · ۱۱:۰۷" },
      { id: "approve", label: "تأیید", state: "active", enteredAt: "۶ دقیقه پیش" },
      { id: "execute", label: "اجرا", state: "upcoming" },
      { id: "complete", label: "تکمیل", state: "upcoming" },
    ],
    currentStageId: "approve",
    statusKind: "needs_user",
    statusLine: "در انتظار تأیید شما — ۶ دقیقه پیش وارد این مرحله شد.",
    initiatedByName: "Alex Chen",
    openedAt: "امروز · ۰۹:۱۲",
  },
  {
    id: "wf-1038",
    purchaseRequestId: "pr-1038",
    title: "خرید دانه قهوه اتاق استراحت",
    amount: 3400000,
    stages: [
      { id: "specify", label: "مشخصات", state: "completed", completedAt: "دیروز · ۱۶:۲۰" },
      { id: "source", label: "استعلام", state: "completed", completedAt: "دیروز · ۱۶:۳۵" },
      { id: "compare", label: "مقایسه", state: "completed", completedAt: "دیروز · ۱۶:۴۴" },
      { id: "approve", label: "تأیید", state: "completed", completedAt: "دیروز · ۱۷:۰۲" },
      { id: "execute", label: "اجرا", state: "completed", completedAt: "امروز · ۰۹:۴۰" },
      { id: "complete", label: "تکمیل", state: "completed", completedAt: "امروز · ۰۹:۴۱" },
    ],
    currentStageId: "complete",
    statusKind: "completed",
    statusLine: "امروز ساعت ۹:۴۱ تکمیل شد — پرداخت کارتی تسویه و رسید الصاق شد (EV-090).",
    initiatedByName: "Priya Patel",
    openedAt: "دیروز · ۱۶:۱۸",
  },
  {
    id: "wf-1040",
    purchaseRequestId: "pr-1040",
    title: "تعویض چاپگر برچسب انبار",
    amount: 23000000,
    stages: [
      { id: "specify", label: "مشخصات", state: "completed", completedAt: "امروز · ۰۸:۵۵" },
      { id: "source", label: "استعلام", state: "blocked", enteredAt: "امروز · ۰۹:۰۲" },
      { id: "compare", label: "مقایسه", state: "upcoming" },
      { id: "approve", label: "تأیید", state: "upcoming" },
      { id: "execute", label: "اجرا", state: "upcoming" },
      { id: "complete", label: "تکمیل", state: "upcoming" },
    ],
    currentStageId: "source",
    statusKind: "blocked",
    statusLine:
      "به موجب سیاست POL-7 متوقف شد — خرید از فروشندگان فهرست ترجیحی به ۲ استعلام نیاز دارد؛ فقط ۱ دریافت شد. استعلام دوم ساعت ۱۰:۱۵ درخواست شد.",
    initiatedByName: "Sam Ortiz",
    openedAt: "امروز · ۰۸:۵۴",
  },
  {
    id: "wf-1041",
    purchaseRequestId: "pr-1041",
    title: "چاپ مجدد کارت ویزیت تیم فروش",
    amount: 4100000,
    stages: [
      { id: "specify", label: "مشخصات", state: "completed", completedAt: "۲۹ اوت · ۱۴:۱۰" },
      { id: "source", label: "استعلام", state: "completed", completedAt: "۲۹ اوت · ۱۵:۲۶" },
      { id: "compare", label: "مقایسه", state: "completed", completedAt: "۲۹ اوت · ۱۵:۳۱" },
      { id: "approve", label: "تأیید", state: "active", enteredAt: "۲۹ اوت · ۱۵:۳۲" },
      { id: "execute", label: "اجرا", state: "upcoming" },
      { id: "complete", label: "تکمیل", state: "upcoming" },
    ],
    currentStageId: "approve",
    statusKind: "needs_user",
    statusLine:
      "تأیید منقضی شد — طی ۴۸ ساعت تصمیمی گرفته نشد. فرمان فردا ساعت ۹:۰۰ دوباره ارسال می‌کند، مگر اینکه اکنون تصمیم بگیرید.",
    initiatedByName: "Priya Patel",
    openedAt: "Aug 29 · 14:08",
  },
  {
    id: "wf-1044",
    purchaseRequestId: "pr-1044",
    title: "خرید ماهانه ملزومات نظافتی",
    amount: 11500000,
    stages: [
      { id: "specify", label: "مشخصات", state: "completed", completedAt: "امروز · ۰۸:۳۱" },
      { id: "source", label: "استعلام", state: "completed", completedAt: "امروز · ۰۹:۴۸" },
      { id: "compare", label: "مقایسه", state: "completed", completedAt: "امروز · ۰۹:۵۲" },
      { id: "approve", label: "تأیید", state: "completed", completedAt: "امروز · ۱۰:۰۱" },
      { id: "execute", label: "اجرا", state: "active", enteredAt: "امروز · ۱۰:۰۲" },
      { id: "complete", label: "تکمیل", state: "upcoming" },
    ],
    currentStageId: "execute",
    statusKind: "failed",
    statusLine:
      "به‌روزرسانی مالی ناموفق بود — همگام‌سازی ERP ساعت ۱۱:۴۲ قطع شد. تلاش مجدد هر ۴ دقیقه صف شده؛ خودِ سفارش تأیید و بدون تغییر است.",
    initiatedByName: "سفارش دائمی تأسیسات",
    openedAt: "امروز · ۰۸:۳۰",
  },
  {
    id: "wf-1045",
    purchaseRequestId: "pr-1045",
    title: "سفارش مجدد دستکش ایمنی پرسنل سالن",
    amount: 9800000,
    stages: [
      { id: "specify", label: "مشخصات", state: "completed", completedAt: "امروز · ۱۰:۲۰" },
      { id: "source", label: "استعلام", state: "active", enteredAt: "امروز · ۱۰:۲۶" },
      { id: "compare", label: "مقایسه", state: "upcoming" },
      { id: "approve", label: "تأیید", state: "upcoming" },
      { id: "execute", label: "اجرا", state: "upcoming" },
      { id: "complete", label: "تکمیل", state: "upcoming" },
    ],
    currentStageId: "source",
    statusKind: "waiting_external",
    statusLine:
      "در انتظار پاسخ تأمین‌کننده — استعلام ۲۶ دقیقه پیش به ۳ تأمین‌کننده ارسال شد؛ مهلت پاسخ ۱۷:۰۰ است.",
    initiatedByName: "سفارش دائمی ایمنی",
    openedAt: "امروز · ۱۰:۱۹",
  },
];

export const mainWorkflowId = "wf-1042";
export const mainApprovalId = "apr-1042";

type EventSeed = Omit<ActivityEvent, "id">;

const eventSeeds: EventSeed[] = [
  {
    seq: 1,
    at: "امروز · ۰۹:۱۲",
    workflowId: "wf-1042",
    actorName: "الکس چن",
    actorKind: "user",
    action: "درخواست خرید PR-1042 — بسته‌بندی خرده‌فروشی فصل چهارم را ثبت کرد.",
    evidenceIds: ["EV-101"],
    outcome: "جریان کار wf-1042 ایجاد شد.",
  },
  {
    seq: 2,
    at: "امروز · ۰۹:۱۳",
    workflowId: "wf-1042",
    actorName: "هماهنگ‌کننده فرمان",
    actorKind: "agent",
    action: "جریان کاری شش‌مرحله‌ای را برنامه‌ریزی کرد: مشخصات ← استعلام ← مقایسه ← تأیید ← اجرا ← تکمیل.",
    evidenceIds: [],
    outcome: "مرحلهٔ مشخصات آغاز شد.",
  },
  {
    seq: 3,
    at: "امروز · ۰۹:۱۵",
    workflowId: "wf-1042",
    actorName: "عامل ارزیابی",
    actorKind: "agent",
    action: "مشخصات نهایی شد: ۵۰٬۰۰۰ کیسه کرافت ۸ اونس با شیر تخلیه هوا.",
    evidenceIds: ["EV-102"],
    outcome: "مهلت بر اساس نیاز آماده‌سازی عرضه در ۱ اکتبر، ۲۸ سپتامبر تعیین شد.",
  },
  {
    seq: 4,
    at: "امروز · ۰۹:۲۰",
    workflowId: "wf-1042",
    actorName: "عامل تأمین",
    actorKind: "agent",
    action: "از ۶ مورد مطابق فهرست، ۳ تأمین‌کننده انتخاب شد.",
    evidenceIds: ["EV-103"],
    outcome: "پک‌لاین، وردپک و سامیت برای استعلام انتخاب شدند.",
  },
  {
    seq: 5,
    at: "امروز · ۰۹:۲۱",
    workflowId: "wf-1042",
    actorName: "هماهنگ‌کننده فرمان",
    actorKind: "agent",
    action: "سیاست POL-5 روی «وردپک» (تأمین‌کننده جدید) اعمال شد.",
    policyCode: "POL-5",
    evidenceIds: ["EV-103"],
    outcome: "وردپک نشانه‌گذاری شد: پیش از هر پرداخت بالای ۵۰٬۰۰۰٬۰۰۰ ریال، احراز لازم است.",
  },
  {
    seq: 6,
    at: "امروز · ۰۹:۲۴",
    workflowId: "wf-1042",
    actorName: "عامل تأمین",
    actorKind: "agent",
    action: "استعلام‌های یکسان به هر ۳ تأمین‌کننده منتخب ارسال شد.",
    evidenceIds: ["EV-104"],
    outcome: "مهلت پاسخ‌ها امروز ساعت ۱۷:۰۰ است.",
  },
  {
    seq: 7,
    at: "امروز · ۰۹:۵۸",
    workflowId: "wf-1042",
    actorName: "سیستم",
    actorKind: "system",
    action: "هنگام ارسال استعلام، همگام‌سازی پرتال تأمین‌کننده با وقفه مواجه شد.",
    evidenceIds: [],
    outcome: "تلاش مجدد خودکار ۴ دقیقه بعد موفق شد؛ تحویل هر ۳ استعلام تأیید شد.",
  },
  {
    seq: 8,
    at: "امروز · ۱۰:۴۰",
    workflowId: "wf-1042",
    actorName: "عامل تأمین",
    actorKind: "agent",
    action: "پیشنهاد «پک‌لاین اینداستریز» دریافت شد — ۱۵۵٬۰۰۰٬۰۰۰ ریال، تحویل ۲۱ روزه.",
    evidenceIds: ["EV-110"],
    outcome: "پیشنهاد ۱ از ۳ ثبت شد.",
  },
  {
    seq: 9,
    at: "امروز · ۱۰:۵۲",
    workflowId: "wf-1042",
    actorName: "عامل تأمین",
    actorKind: "agent",
    action: "پیشنهاد «وردپک» دریافت شد — ۱۳۰٬۰۰۰٬۰۰۰ ریال، تحویل ۳۵ روزه.",
    evidenceIds: ["EV-111"],
    outcome: "پیشنهاد ۲ از ۳ ثبت شد. شواهد قابلیت اطمینان موجود نیست — نشانه‌گذاری شد.",
  },
  {
    seq: 10,
    at: "امروز · ۱۱:۰۵",
    workflowId: "wf-1042",
    actorName: "عامل تأمین",
    actorKind: "agent",
    action: "پیشنهاد «سامیت فلکسیبل پکیجینگ» دریافت شد — ۱۸۰٬۰۰۰٬۰۰۰ ریال، تحویل ۱۲ روزه.",
    evidenceIds: ["EV-112"],
    outcome: "پیشنهاد ۳ از ۳ ثبت شد. مرحله استعلام کامل شد.",
  },
  {
    seq: 11,
    at: "امروز · ۱۱:۰۷",
    workflowId: "wf-1042",
    actorName: "عامل ارزیابی",
    actorKind: "agent",
    action: "هر ۳ پیشنهاد از نظر قیمت، زمان تحویل، قابلیت اطمینان و شرایط مقایسه شد.",
    evidenceIds: ["EV-110", "EV-111", "EV-112"],
    outcome: "پیشنهاد تنظیم شد: پک‌لاین اینداستریز (۱۵۵٬۰۰۰٬۰۰۰ ریال) همراه با دلیل رد هر گزینه.",
  },
  {
    seq: 12,
    at: "امروز · ۱۱:۰۷",
    workflowId: "wf-1042",
    actorName: "عامل مالی",
    actorKind: "agent",
    action: "توان پرداخت بررسی شد: موجودی نقد ۴٬۱۲۸٬۰۰۰٬۰۰۰ ریال؛ بودجه بسته‌بندی ۲۲۴٬۰۰۰٬۰۰۰ ریال از سقف ۶۰۰٬۰۰۰٬۰۰۰ ریالی باقی است.",
    evidenceIds: ["EV-140"],
    outcome: "مقرون‌به‌صرفه است — پرداخت در ۱ اکتبر با شرایط خالص ۳۰ روز انجام می‌شود و دسته زیر سقف می‌مانَد.",
  },
  {
    seq: 13,
    at: "امروز · ۱۱:۰۷",
    workflowId: "wf-1042",
    actorName: "هماهنگ‌کننده فرمان",
    actorKind: "agent",
    action: "سیاست POL-2 روی مجموع پیشنهادی ۱۵۵٬۰۰۰٬۰۰۰ ریال اعمال شد.",
    policyCode: "POL-2",
    evidenceIds: ["EV-120"],
    outcome: "نقطه کنترلی تأیید درج شد — امضای مدیر لازم است.",
  },
  {
    seq: 14,
    at: "امروز · ۱۱:۰۸",
    workflowId: "wf-1042",
    actorName: "هماهنگ‌کننده فرمان",
    actorKind: "agent",
    action: "درخواست تأیید از الکس چن (مدیر عملیات، سقف ۲۵۰٬۰۰۰٬۰۰۰ ریال) ثبت شد.",
    evidenceIds: ["EV-120"],
    outcome: "در انتظار الکس چن — ۴۸ ساعت دیگر منقضی می‌شود.",
  },
  {
    seq: 15,
    at: "۲۹ اوت · ۱۵:۳۲",
    workflowId: "wf-1041",
    actorName: "هماهنگ‌کننده فرمان",
    actorKind: "agent",
    action: "درخواست تأیید چاپ مجدد کارت ویزیت (۴٬۱۰۰٬۰۰۰ ریال) از پریا پتل ثبت شد.",
    evidenceIds: [],
    outcome: "طی ۴۸ ساعت تصمیمی گرفته نشد.",
  },
  {
    seq: 16,
    at: "۳۱ اوت · ۱۵:۳۲",
    workflowId: "wf-1041",
    actorName: "سیستم",
    actorKind: "system",
    action: "درخواست تأیید پس از ۴۸ ساعت منقضی شد.",
    evidenceIds: [],
    outcome: "فرمان ارسال دوباره را برای فردا ساعت ۹:۰۰ زمان‌بندی کرد، مگر اینکه زودتر تصمیم گرفته شود.",
  },
  {
    seq: 17,
    at: "Today · 09:40",
    workflowId: "wf-1038",
    actorName: "عامل مالی",
    actorKind: "agent",
    action: "پرداخت کارتی ۳٬۴۰۰٬۰۰۰ ریالی خرید دانه قهوه تسویه شد.",
    evidenceIds: ["EV-090"],
    outcome: "رسید به PR-1038 الصاق شد. جریان کار کامل شد.",
  },
  {
    seq: 18,
    at: "امروز · ۱۰:۱۵",
    workflowId: "wf-1040",
    actorName: "هماهنگ‌کننده فرمان",
    actorKind: "agent",
    action: "استعلام به موجب سیاست POL-7 متوقف شد — برای فروشنده فهرست ترجیحی فقط ۱ پیشنهاد دریافت شده است.",
    policyCode: "POL-7",
    evidenceIds: [],
    outcome: "استعلام دوم درخواست شد؛ جریان کار تا رسیدن آن متوقف می‌ماند.",
  },
  {
    seq: 19,
    at: "امروز · ۱۰:۲۶",
    workflowId: "wf-1045",
    actorName: "عامل تأمین",
    actorKind: "agent",
    action: "استعلام دستکش ایمنی به ۳ تأمین‌کننده تأییدشده ارسال شد.",
    evidenceIds: [],
    outcome: "در انتظار نخستین پاسخ‌ها، مهلت ۱۷:۰۰ است.",
  },
  {
    seq: 20,
    at: "امروز · ۱۱:۴۲",
    workflowId: "wf-1044",
    actorName: "عامل مالی",
    actorKind: "agent",
    action: "ثبت ذخیرهٔ ملزومات نظافتی در ERP تلاش شد.",
    evidenceIds: ["EV-150"],
    outcome: "وقفه اتصال — تلاش مجدد هر ۴ دقیقه صف شد. تأیید سفارش بی‌تأثیر است.",
  },
];

export const activityEvents: ActivityEvent[] = eventSeeds.map((e, i) => ({
  ...e,
  id: `act-${String(i + 1).padStart(3, "0")}`,
}));

// Decision-time events appended by the demo store.
export const decisionEvents: Record<
  string,
  { seqBase: number; events: Array<Omit<EventSeed, "seq">> }
> = {
  approved: {
    seqBase: 100,
    events: [
      {
        at: "همین حالا",
        workflowId: "wf-1042",
        actorName: "الکس چن",
        actorKind: "user",
        action: "پیشنهاد «پک‌لاین اینداستریز» به مبلغ ۱۵۵٬۰۰۰٬۰۰۰ ریال (PO-5521) تأیید شد.",
        policyCode: "POL-2",
        evidenceIds: ["EV-110", "EV-120"],
        outcome: "اجرا آزاد شد — هماهنگ‌کننده ادامه می‌دهد.",
      },
      {
        at: "همین حالا",
        workflowId: "wf-1042",
        actorName: "هماهنگ‌کننده فرمان",
        actorKind: "agent",
        action: "PO-5521 از پیشنهاد پذیرفته‌شدهٔ پک‌لاین ایجاد شد.",
        evidenceIds: ["EV-130"],
        outcome: "سفارش آماده ارسال است.",
      },
      {
        at: "همین حالا",
        workflowId: "wf-1042",
        actorName: "عامل تأمین",
        actorKind: "agent",
        action: "PO-5521 به پرتال سفارش پک‌لاین ارسال شد.",
        evidenceIds: ["EV-131"],
        outcome: "پرتال سفارش را پذیرفت. در انتظار تأییدیهٔ تأمین‌کننده.",
      },
    ],
  },
  rejected: {
    seqBase: 200,
    events: [
      {
        at: "همین حالا",
        workflowId: "wf-1042",
        actorName: "الکس چن",
        actorKind: "user",
        action: "پیشنهاد «پک‌لاین اینداستریز» به مبلغ ۱۵۵٬۰۰۰٬۰۰۰ ریال رد شد.",
        policyCode: "POL-2",
        evidenceIds: ["EV-110"],
        outcome: "جریان کار متوقف شد. هیچ سفارشی ثبت و هزینه‌ای نشد. تأمین‌کنندگان از پایان کار آگاه شدند.",
      },
    ],
  },
  change_requested: {
    seqBase: 300,
    events: [
      {
        at: "همین حالا",
        workflowId: "wf-1042",
        actorName: "الکس چن",
        actorKind: "user",
        action: "برای اصلاح پیشنهاد درخواست ثبت شد.",
        evidenceIds: ["EV-110"],
        outcome: "عامل ارزیابی در حال بازبینی — زمان تحویل به‌روز از هر سه تأمین‌کننده گرفته می‌شود.",
      },
    ],
  },
  evidence_requested: {
    seqBase: 400,
    events: [
      {
        at: "همین حالا",
        workflowId: "wf-1042",
        actorName: "الکس چن",
        actorKind: "user",
        action: "پیش از تصمیم، شواهد بیشتری درخواست شد.",
        evidenceIds: ["EV-111"],
        outcome: "گواهی تحویل به‌موقع مراجع «سامیت فلکسیبل پکیجینگ» درخواست می‌شود.",
      },
    ],
  },
};

// هزینهٔ روزانهٔ ۱۴ روز اخیر (ریال) — برای نمودار صفحهٔ مالی
export const spendLast14Days: Array<{ label: string; amount: number }> = [
  { label: "۱۵ اوت", amount: 1200000 },
  { label: "۱۶ اوت", amount: 800000 },
  { label: "۱۷ اوت", amount: 2400000 },
  { label: "۱۸ اوت", amount: 600000 },
  { label: "۱۹ اوت", amount: 1800000 },
  { label: "۲۰ اوت", amount: 950000 },
  { label: "۲۱ اوت", amount: 4200000 },
  { label: "۲۲ اوت", amount: 1500000 },
  { label: "۲۳ اوت", amount: 1100000 },
  { label: "۲۴ اوت", amount: 2600000 },
  { label: "۲۵ اوت", amount: 900000 },
  { label: "۲۶ اوت", amount: 6500000 },
  { label: "۲۷ اوت", amount: 21000000 },
  { label: "امروز", amount: 3400000 },
];

export const transactionsSeed = [
  {
    id: "txn-901",
    label: "خرید دانه قهوه (PR-1038)",
    workflowId: "wf-1038",
    amount: -3400000,
    state: "posted" as const,
    timing: "تسویه‌شده امروز · ۰۹:۴۱",
  },
  {
    id: "txn-884",
    label: "شارژ فیلم بسته‌بندی",
    amount: -21000000,
    state: "posted" as const,
    timing: "ثبت‌شده ۲۹ اوت",
  },
  {
    id: "txn-870",
    label: "سرویس تجهیزات کافه",
    amount: -6500000,
    state: "posted" as const,
    timing: "ثبت‌شده ۲۷ اوت",
  },
  {
    id: "txn-1044",
    label: "ذخیره ملزومات نظافتی (PR-1044)",
    workflowId: "wf-1044",
    amount: -11500000,
    state: "retry_queued" as const,
    timing: "تلاش هر ۴ دقیقه — خطای همگام‌سازی ERP",
  },
];

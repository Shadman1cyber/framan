import { getAiSettings, isAiEnabled } from "./settings";
import { getProvider } from "./provider";
import { AIContextService, type AiTopic } from "./context";
import { AI_MODEL } from "@/lib/config";

/**
 * AIService — the only entry point for asking the AI assistant.
 * Fails gracefully: when disabled, unconfigured, or unreachable it returns a
 * structured unavailable result; the rest of the app never depends on it.
 * AI is read-only: it can never execute mutations.
 */

export type AiAskResult =
  | { ok: true; answer: string; model: string }
  | { ok: false; reason: string };

const SYSTEM_PROMPT = `تو دستیار هوشمند و حسابدار یک کافه هستی. با فارسی روان، دقیق و کوتاه پاسخ بده.
فقط بر اساس «داده‌های ساختاریافته» که در اختیارت قرار می‌گیرد تحلیل کن و عدد از خودت نساز.
اگر داده کافی نیست، صادقانه بگو چه داده‌ای لازم است.
هرگز اطلاعات محرمانه، کلید API، یا مقادیر دقیق دستور پخت را در پاسخ فاش نکن.
برای پیشنهادهای عملیاتی (زمان سفارش مواد، نیروی انسانی، فروش) دلیل خود را خلاصه ذکر کن.`;

export class AIService {
  private contextService = new AIContextService();

  async ask(
    question: string,
    topic?: AiTopic,
    history?: Array<{ role: "user" | "assistant"; content: string }>,
  ): Promise<AiAskResult> {
    const enabled = await isAiEnabled();
    if (!enabled) {
      return { ok: false, reason: "دستیار هوشمند غیرفعال است." };
    }
    const settings = await getAiSettings();
    const provider = getProvider(settings.provider);
    if (!provider.isConfigured()) {
      return {
        ok: false,
        reason: "کلید API هوش مصنوعی تنظیم نشده است. متغیر ZHIPU_API_KEY را در فایل .env تنظیم کنید.",
      };
    }

    const detectedTopic = topic ?? this.detectTopic(question);
    const context = await this.contextService.buildContext(detectedTopic, question);

    // Multi-turn: include the recent conversation before the new question.
    const recentHistory = (history ?? []).slice(-6);

    try {
      const res = await provider.complete({
        model: settings.model || AI_MODEL,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          ...recentHistory,
          {
            role: "user",
            content: `داده‌های کافه:\n${context.summary}\n\nسوال مدیر:\n${question}`,
          },
        ],
        temperature: 0.3,
        maxTokens: 900,
      });
      return { ok: true, answer: res.content, model: res.model };
    } catch (e) {
      return { ok: false, reason: (e as Error).message };
    }
  }

  private detectTopic(q: string): AiTopic {
    if (/موجودی|مواد|انبار|سفارش مواد|تمام می|کم شده|stock/i.test(q)) return "inventory";
    if (/فروش|درآمد|سود|مالی|حساب|گزارش|تعطیلی|قیمت/i.test(q)) return "finance";
    if (/شف|پرسنل|نیرو|ظرفیت|زمان آماده|صف|سفارش فعال/i.test(q)) return "operations";
    return "general";
  }
}

export const aiService = new AIService();

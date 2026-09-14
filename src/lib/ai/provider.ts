import { AI_MODEL, AI_PROVIDER } from "@/lib/config";
import { AiProviderError, type AIProvider, type AiCompletionRequest, type AiCompletionResponse } from "./types";

/**
 * Zhipu AI (GLM-4) provider. All calls happen server-side only;
 * the API key never leaves the backend.
 */
export class ZhipuProvider implements AIProvider {
  readonly name = "zhipu";
  private readonly baseUrl = "https://open.bigmodel.cn/api/paas/v4/chat/completions";

  isConfigured(): boolean {
    return Boolean(process.env.ZHIPU_API_KEY?.trim());
  }

  async complete(req: AiCompletionRequest): Promise<AiCompletionResponse> {
    const apiKey = process.env.ZHIPU_API_KEY?.trim();
    if (!apiKey) {
      throw new AiProviderError("کلید API هوش مصنوعی تنظیم نشده است (ZHIPU_API_KEY)");
    }
    const model = req.model ?? AI_MODEL;

    let res: Response;
    try {
      res = await fetch(this.baseUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: req.messages,
          temperature: req.temperature ?? 0.3,
          max_tokens: req.maxTokens ?? 1024,
          stream: false,
        }),
        signal: AbortSignal.timeout(30_000),
      });
    } catch (e) {
      throw new AiProviderError(`خطا در ارتباط با سرویس هوش مصنوعی: ${(e as Error).message}`);
    }

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new AiProviderError(
        `سرویس هوش مصنوعی خطا برگرداند (${res.status})`,
        res.status,
      );
    }

    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const content = json.choices?.[0]?.message?.content;
    if (!content) throw new AiProviderError("پاسخی از سرویس هوش مصنوعی دریافت نشد");

    return {
      content,
      model,
      usage: {
        promptTokens: json.usage?.prompt_tokens,
        completionTokens: json.usage?.completion_tokens,
      },
    };
  }
}

/** Registry so other providers can be added later. */
export function getProvider(name?: string): AIProvider {
  const providerName = (name ?? AI_PROVIDER).toLowerCase();
  switch (providerName) {
    case "zhipu":
    default:
      return new ZhipuProvider();
  }
}

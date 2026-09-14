export type AiRole = "system" | "user" | "assistant";

export type AiMessage = { role: AiRole; content: string };

export type AiCompletionRequest = {
  messages: AiMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
};

export type AiCompletionResponse = {
  content: string;
  model: string;
  usage?: { promptTokens?: number; completionTokens?: number };
};

export interface AIProvider {
  readonly name: string;
  isConfigured(): boolean;
  complete(req: AiCompletionRequest): Promise<AiCompletionResponse>;
}

export class AiProviderError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
  }
}

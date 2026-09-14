/** Normalize Persian/Arabic text so "کی" matches "كي" etc. (pure, no DB imports). */
export function normalizeFa(input: string): string {
  return input
    .trim()
    .replace(/[يﻱﻲ]/g, "ی")
    .replace(/[كﻙﻚ]/g, "ک")
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ۀ/g, "ه")
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/\u200c/g, " ")
    .toLowerCase();
}

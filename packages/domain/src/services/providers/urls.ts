import { normalizeBaseUrl } from "../../config/providers";
import type { Provider, ProviderConfig } from "../../types/index";

export { normalizeBaseUrl };

export const ANTHROPIC_API_URL = "https://api.anthropic.com";
export const OPENAI_DEFAULT_URL = "https://api.openai.com/v1";

/** Where this provider's stored key may be sent; null when the config names no usable URL. */
export function keyTargetUrl(provider: Provider, config: ProviderConfig): string | null {
  switch (provider) {
    case "subscription":
      return null;
    case "anthropic_api":
      return ANTHROPIC_API_URL;
    case "openai":
      return normalizeBaseUrl(config.baseUrl ?? OPENAI_DEFAULT_URL);
    case "local":
      return config.baseUrl ? normalizeBaseUrl(config.baseUrl) : null;
  }
}

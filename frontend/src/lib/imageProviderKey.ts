import type { AppConfig } from "@/services/config";

export function getMissingImageProviderKeyMessage(config?: AppConfig | null): string | null {
  const provider = config?.image?.provider;
  if (!provider) return null;

  if (provider === "stability" && !config?.image?.stability?.apiKeyRef) {
    return "Select a Stability API key in Settings before generating.";
  }
  if (provider === "huggingface" && !config?.image?.huggingface?.apiKeyRef) {
    return "Select a Hugging Face API key in Settings before generating.";
  }
  if (provider === "google" && !config?.image?.google?.apiKeyRef) {
    return "Select a Google API key in Settings before generating.";
  }
  return null;
}

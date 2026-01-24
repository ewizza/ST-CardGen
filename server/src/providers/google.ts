import { GoogleGenAI, PersonGeneration } from "@google/genai";

type GoogleImagenConfig = {
  model: string;
  numberOfImages: number;
  imageSize: "1K" | "2K";
  aspectRatio: string;
  personGeneration?: "dont_allow" | "allow_adult" | "allow_all";
};

type GoogleNanoConfig = {
  model: "gemini-2.5-flash-image" | "gemini-3-pro-image-preview";
  aspectRatio: string;
  imageSize?: "1K" | "2K" | "4K";
};

export type GoogleImageConfig = {
  baseUrl?: string;
  mode: "imagen" | "nano";
  imagen: GoogleImagenConfig;
  nano: GoogleNanoConfig;
};

export async function generateGoogleImage(args: {
  prompt: string;
  negativePrompt?: string;
  cfgGoogle: GoogleImageConfig;
  apiKey: string;
}): Promise<{ buffer: Buffer; mime: string }> {
  const mergedPrompt = args.negativePrompt
    ? `${args.prompt}\n\nAvoid: ${args.negativePrompt}`
    : args.prompt;

  const ai = new GoogleGenAI({
    apiKey: args.apiKey,
    httpOptions: args.cfgGoogle.baseUrl ? { baseUrl: args.cfgGoogle.baseUrl } : undefined,
  });

  if (args.cfgGoogle.mode === "imagen") {
    const cfg = args.cfgGoogle.imagen;
    const response = await ai.models.generateImages({
      model: cfg.model,
      prompt: mergedPrompt,
      config: {
        numberOfImages: cfg.numberOfImages,
        imageSize: cfg.imageSize,
        aspectRatio: cfg.aspectRatio,
        personGeneration: cfg.personGeneration as PersonGeneration,
      },
    });
    const b64 = response.generatedImages?.[0]?.image?.imageBytes;
    if (!b64) throw new Error("Imagen response did not include image bytes.");
    return { buffer: Buffer.from(b64, "base64"), mime: "image/png" };
  }

  const cfg = args.cfgGoogle.nano;
  const response = await ai.models.generateContent({
    model: cfg.model,
    contents: mergedPrompt,
    config: {
      responseModalities: ["Image"],
      imageConfig: {
        aspectRatio: cfg.aspectRatio,
        ...(cfg.model === "gemini-3-pro-image-preview"
          ? { imageSize: cfg.imageSize ?? "2K" }
          : {}),
      },
    },
  });

  const parts = response.candidates?.[0]?.content?.parts ?? [];
  const part = parts.find((entry) => entry.inlineData?.data);
  const data = part?.inlineData?.data;
  if (!data) throw new Error("Nano Banana response did not include image bytes.");
  const mime = part?.inlineData?.mimeType || "image/png";
  return { buffer: Buffer.from(data, "base64"), mime };
}

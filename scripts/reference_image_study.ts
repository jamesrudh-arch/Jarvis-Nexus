/**
 * Reference-image study (PART II §2 / PART VIII §36 of the directive):
 * runs the ACTUAL uploaded image through the vision model (GLM-4V via
 * z-ai-web-dev-sdk, server-side) and derives the design language for
 * JARVIS NEXUS. Evidence is written to NEXUS_WORLD/reports/.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

async function main() {
  const img = readFileSync("upload/5C2E6BD6-432B-4351-A0A4-3D399216BFB2.png");
  const b64 = img.toString("base64");
  console.log(`image loaded: ${img.length} bytes, base64 ${b64.length} chars`);

  const { default: ZAI } = await import("z-ai-web-dev-sdk");
  const zai = await ZAI.create();
  const prompt =
    "Study this reference image and report: " +
    "1) overall scene and time of day; " +
    "2) the person: pose, attire, what she is doing; " +
    "3) every holographic interface element visible (shape, content, colour); " +
    "4) the room: materials, furniture, colour palette (approximate hex values); " +
    "5) the view outside the window; " +
    "6) lighting: sources, colour temperature; " +
    "7) any legible text (say 'illegible' if not readable); " +
    "8) a derived design-language summary (palette hex, materials, mood, " +
    "composition principles) usable by an engineering team building a product UI and a 3D world.";
  const message: unknown[] = [
    { role: "system", content: "You are a precise visual analyst. Describe exactly what is visible. Do not hallucinate. Where text is illegible, say so." },
    {
      role: "user",
      content: [
        { type: "text", text: prompt },
        { type: "image_url", image_url: { url: "data:image/png;base64," + b64 } },
      ],
    },
  ];
  const completion = (await Promise.race([
    zai.chat.completions.create({
      messages: message as never,
      thinking: { type: "disabled" },
    }),
    new Promise((_, rej) => setTimeout(() => rej(new Error("vision timeout")), 60000)),
  ])) as { choices?: Array<{ message?: { content?: string } }> };

  const text = completion.choices?.[0]?.message?.content ?? "";
  if (!text.trim()) throw new Error("empty vision response");
  mkdirSync("NEXUS_WORLD/reports", { recursive: true });
  const out = [
    "# REFERENCE IMAGE STUDY (VLM, live model call)",
    `Date: ${new Date().toISOString()}`,
    "Source: upload/5C2E6BD6-432B-4351-A0A4-3D399216BFB2.png (1672x941 PNG)",
    "Model path: z-ai-web-dev-sdk chat.completions, multimodal image input",
    "",
    text,
  ].join("\n");
  writeFileSync("NEXUS_WORLD/reports/REFERENCE_IMAGE_STUDY.txt", out);
  console.log("--- VLM ANALYSIS ---");
  console.log(text);
  console.log("--- written to NEXUS_WORLD/reports/REFERENCE_IMAGE_STUDY.txt ---");
}

main().catch((e) => {
  console.error("FAILED:", (e as Error).message);
  process.exit(1);
});

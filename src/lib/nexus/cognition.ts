/**
 * GLM cognition layer (ADR-003 layer 2 port): at genuinely ambiguous
 * decision points, ONE hosted-LLM choice per tick among allowed actions,
 * validated against the action set with utility fallback. An LLM can
 * never invent an action; provider failures degrade to the script.
 */
import type { Cognition, ResidentState, Action } from "./engine";
import { ACTIONS } from "./engine";

const VALID = new Set<string>(ACTIONS);

export class Gl_mCognition implements Cognition {
  async decide(
    rid: string,
    data: ResidentState,
    context: Record<string, unknown>,
    allowed: Array<[string, number]>
  ): Promise<{ chosen: Action; reason: string }> {
    const fallback: Action = allowed[0]?.[0] as Action;
    try {
      const { default: ZAI } = await import("z-ai-web-dev-sdk");
      const zai = await ZAI.create();
      const sys = [
        "You are the inner voice of a resident in a simulated town.",
        "Choose exactly ONE next action from this allowed list: " +
          allowed.map(([a, s]) => `${a} (score ${s.toFixed(1)})`).join(", ") +
          ".",
        "Reply with the single action word only. Never invent actions.",
      ].join(" ");
      const completion = await Promise.race([
        zai.chat.completions.create({
          messages: [
            { role: "system", content: sys },
            { role: "user", content: JSON.stringify(context) },
          ],
          thinking: { type: "disabled" },
        }),
        new Promise((_, rej) => setTimeout(() => rej(new Error("cognition timeout")), 8000)),
      ]) as { choices?: Array<{ message?: { content?: string } }> };
      const text = (completion.choices?.[0]?.message?.content ?? "").trim().toLowerCase();
      const word = text.split(/[^a-z]+/).find((w) => VALID.has(w));
      if (word) {
        // validate against the action set — an LLM can never invent an action
        return { chosen: word as Action, reason: "llm:choice" };
      }
      return { chosen: fallback, reason: "fallback:utility(llm-unparseable)" };
    } catch {
      // provider unavailable (rate window / network) → honest degradation
      return { chosen: fallback, reason: "fallback:utility(llm-unavailable)" };
    }
  }
}

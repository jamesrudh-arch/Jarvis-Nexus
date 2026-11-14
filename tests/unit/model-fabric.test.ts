import { describe, expect, test } from "bun:test";
import {
  EchoAdapter, ModelFabric, extractJson, CloudflareAdapter,
} from "@nexus/model-fabric";

describe("model fabric — echo provider", () => {
  test("echo adapter completes deterministically", async () => {
    const a = new EchoAdapter();
    const r = await a.complete(
      { taskType: "classification", messages: [{ role: "user", content: "hello world" }] },
      "default",
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.provider).toBe("echo");
      expect(r.value.content).toContain("hello world");
    }
  });

  test("fabric routes to available provider with fallback", async () => {
    const fabric = new ModelFabric({ providers: { echo: new EchoAdapter() } });
    const r = await fabric.complete({
      taskType: "planning",
      messages: [{ role: "user", content: "plan a city" }],
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.provider).toBe("echo");
  });

  test("fabric fails cleanly when no provider matches", async () => {
    const fabric = new ModelFabric({ providers: {}, disableEcho: true });
    const r = await fabric.complete({
      taskType: "planning",
      messages: [{ role: "user", content: "plan" }],
    });
    expect(r.ok).toBe(false);
  });

  test("fabric records health and usage", async () => {
    const usageEvents: unknown[] = [];
    const fabric = new ModelFabric({
      providers: { echo: new EchoAdapter() },
      usageSink: (e) => usageEvents.push(e),
    });
    await fabric.complete({ taskType: "reasoning", messages: [{ role: "user", content: "x" }] });
    expect(usageEvents.length).toBe(1);
    expect(fabric.providerHealth().length).toBeGreaterThan(0);
  });
});

describe("extractJson", () => {
  test("parses direct json", () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
  });
  test("parses fenced json", () => {
    expect(extractJson("Here you go:\n```json\n{\"a\": 2}\n```")).toEqual({ a: 2 });
  });
  test("parses embedded json with prose prefix", () => {
    expect(extractJson('Sure! {"a": 3}')).toEqual({ a: 3 });
  });
  test("returns undefined for no json", () => {
    expect(extractJson("no json here")).toBeUndefined();
  });
});

describe("model fabric — cloudflare LIVE (skipped without credentials)", () => {
  const token = process.env.CLOUDFLARE_API_TOKEN;
  const account = process.env.CLOUDFLARE_ACCOUNT_ID;

  test.skipIf(!token || !account)("live cloudflare completion round-trip", async () => {
    const adapter = new CloudflareAdapter(account!, token!);
    const r = await adapter.complete(
      {
        taskType: "extraction",
        systemPrompt: "You are a JSON emitter.",
        messages: [{ role: "user", content: 'Return a JSON object {"status":"ok"} exactly.' }],
        jsonSchema: { type: "object", properties: { status: { type: "string" } }, required: ["status"] },
        maxTokens: 100,
      },
      "@cf/meta/llama-3.1-8b-instruct",
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.provider).toBe("cloudflare");
      const parsed = r.value.parsedJson as { status?: string } | undefined;
      expect(parsed?.status).toBe("ok");
    }
  });

  test.skipIf(!token || !account)("live fabric routing uses cloudflare when available", async () => {
    const fabric = new ModelFabric({
      providers: {
        cloudflare: new CloudflareAdapter(account!, token!),
        echo: new EchoAdapter(),
      },
    });
    const r = await fabric.complete({
      taskType: "summarisation",
      messages: [{ role: "user", content: "Summarise: The NEXUS grid came online at dawn." }],
      maxTokens: 100,
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.provider).toBe("cloudflare");
  });
});

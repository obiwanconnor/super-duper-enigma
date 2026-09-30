import { describe, expect, it } from "vitest";
import { AssistantOutput, knownSlugs, mergePriority } from "@/lib/ai/assistant";

describe("AI triage rules", () => {
  it("only ever raises priority", () => {
    expect(mergePriority("NORMAL", "URGENT")).toBe("URGENT");
    expect(mergePriority("URGENT", "LOW")).toBe("URGENT");
    expect(mergePriority("LOW", "LOW")).toBe("LOW");
  });

  it("drops article slugs the model was not given", () => {
    expect(knownSlugs(["a", "made-up", "a", "b"], ["a", "b", "c"])).toEqual(["a", "b"]);
  });

  it("validates model output", () => {
    const ok = {
      summary: "s",
      type: "BUG",
      priority: "HIGH",
      priorityReason: "r",
      likelyIncident: false,
      clarifyingQuestions: "",
      relevantArticleSlugs: [],
      draftReply: "",
      confidence: "medium",
    };
    expect(AssistantOutput.safeParse(ok).success).toBe(true);
    expect(AssistantOutput.safeParse({ ...ok, priority: "CRITICAL" }).success).toBe(false);
  });
});

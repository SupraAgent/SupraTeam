import { describe, it, expect } from "vitest";
import { renderTemplate, buildOutreachVars } from "@/lib/outreach-templates";

describe("renderTemplate", () => {
  it("replaces simple variables", () => {
    const result = renderTemplate("Hello {{name}}", { name: "Alice" });
    expect(result).toBe("Hello Alice");
  });

  it("replaces multiple variables", () => {
    const result = renderTemplate(
      "Hi {{name}}, welcome to {{company}}!",
      { name: "Bob", company: "Supra" }
    );
    expect(result).toBe("Hi Bob, welcome to Supra!");
  });

  it("uses fallback when variable is missing", () => {
    const result = renderTemplate("Hello {{name|friend}}", {});
    expect(result).toBe("Hello friend");
  });

  it("uses fallback when variable is null", () => {
    const result = renderTemplate("Hello {{name|friend}}", { name: null });
    expect(result).toBe("Hello friend");
  });

  it("uses fallback when variable is empty string", () => {
    const result = renderTemplate("Hello {{name|friend}}", { name: "" });
    expect(result).toBe("Hello friend");
  });

  it("prefers actual value over fallback", () => {
    const result = renderTemplate("Hello {{name|friend}}", { name: "Alice" });
    expect(result).toBe("Hello Alice");
  });

  it("removes variable with no value and no fallback", () => {
    const result = renderTemplate("Hello {{name}}, how are you?", {});
    expect(result).toBe("Hello , how are you?");
  });

  it("handles empty fallback (pipe with nothing after)", () => {
    const result = renderTemplate("Hello {{name|}}", {});
    expect(result).toBe("Hello ");
  });

  it("leaves non-matching text unchanged", () => {
    const result = renderTemplate("No variables here", {});
    expect(result).toBe("No variables here");
  });

  it("handles template with only a variable", () => {
    expect(renderTemplate("{{x}}", { x: "val" })).toBe("val");
  });
});

describe("buildOutreachVars", () => {
  it("builds vars from full data", () => {
    const vars = buildOutreachVars({
      contact_name: "Alice Smith",
      contact_first_name: "Alice",
      deal_name: "Acme Deal",
      stage: "Outreach",
      company: "Acme",
      value: 50000,
    });
    expect(vars).toEqual({
      contact_name: "Alice Smith",
      contact_first_name: "Alice",
      deal_name: "Acme Deal",
      stage: "Outreach",
      company: "Acme",
      value: "$50,000",
    });
  });

  it("derives contact_first_name from contact_name when not provided", () => {
    const vars = buildOutreachVars({ contact_name: "Alice Smith" });
    expect(vars.contact_first_name).toBe("Alice");
  });

  it("omits null/undefined fields", () => {
    const vars = buildOutreachVars({
      contact_name: null,
      deal_name: undefined,
    });
    expect(vars).toEqual({});
  });

  it("returns empty object for empty input", () => {
    expect(buildOutreachVars({})).toEqual({});
  });

  it("formats value with dollar sign and commas", () => {
    const vars = buildOutreachVars({ value: 1234567 });
    expect(vars.value).toBe("$1,234,567");
  });

  it("handles value of 0", () => {
    const vars = buildOutreachVars({ value: 0 });
    expect(vars.value).toBe("$0");
  });
});

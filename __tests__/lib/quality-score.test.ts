import { describe, it, expect } from "vitest";
import { computeQualityScore } from "@/lib/quality-score";

describe("computeQualityScore", () => {
  it("returns 0 for an empty contact", () => {
    expect(computeQualityScore({})).toBe(0);
  });

  it("returns 100 for a fully populated contact", () => {
    const contact = {
      name: "Alice",
      email: "alice@example.com",
      telegram_username: "@alice",
      company: "Supra",
      phone: "+1234567890",
      title: "CEO",
      x_handle: "@alice_x",
      wallet_address: "0xabc123",
      on_chain_score: 85,
    };
    expect(computeQualityScore(contact)).toBe(100);
  });

  it("scores individual fields correctly", () => {
    expect(computeQualityScore({ name: "Bob" })).toBe(10);
    expect(computeQualityScore({ email: "b@b.com" })).toBe(15);
    expect(computeQualityScore({ telegram_username: "@bob" })).toBe(15);
    expect(computeQualityScore({ company: "Acme" })).toBe(10);
    expect(computeQualityScore({ phone: "+1" })).toBe(5);
    expect(computeQualityScore({ title: "Dev" })).toBe(5);
    expect(computeQualityScore({ x_handle: "@x" })).toBe(15);
    expect(computeQualityScore({ wallet_address: "0x1" })).toBe(15);
    expect(computeQualityScore({ on_chain_score: 50 })).toBe(10);
  });

  it("does not count on_chain_score of 0", () => {
    expect(computeQualityScore({ on_chain_score: 0 })).toBe(0);
  });

  it("does not count on_chain_score if it is a string", () => {
    expect(computeQualityScore({ on_chain_score: "high" })).toBe(0);
  });

  it("sums partial fields correctly", () => {
    const contact = {
      name: "Alice",
      email: "alice@example.com",
      wallet_address: "0xabc",
    };
    expect(computeQualityScore(contact)).toBe(10 + 15 + 15);
  });

  it("ignores unknown fields", () => {
    expect(computeQualityScore({ random_field: "value", foo: 42 })).toBe(0);
  });

  it("does not count falsy values (empty string, null, undefined)", () => {
    const contact = {
      name: "",
      email: null,
      telegram_username: undefined,
    };
    expect(computeQualityScore(contact)).toBe(0);
  });
});

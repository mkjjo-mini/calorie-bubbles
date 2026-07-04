import { describe, it, expect } from "vitest";
import { sanitizeDecimalInput } from "@/lib/numeric-input";

describe("sanitizeDecimalInput", () => {
  it("선행 0 제거 (0200 → 200)", () => {
    expect(sanitizeDecimalInput("0200")).toBe("200");
    expect(sanitizeDecimalInput("007")).toBe("7");
    expect(sanitizeDecimalInput("00")).toBe("0");
  });

  it("의미 있는 0은 유지", () => {
    expect(sanitizeDecimalInput("0")).toBe("0");
    expect(sanitizeDecimalInput("0.5")).toBe("0.5");
    expect(sanitizeDecimalInput("00.5")).toBe("0.5");
    expect(sanitizeDecimalInput("0.")).toBe("0.");
  });

  it("소수점은 하나만", () => {
    expect(sanitizeDecimalInput("2.5.3")).toBe("2.53");
    expect(sanitizeDecimalInput("200.")).toBe("200.");
  });

  it("숫자·소수점 외 문자 제거", () => {
    expect(sanitizeDecimalInput("2a0b0")).toBe("200");
    expect(sanitizeDecimalInput("-50")).toBe("50");
  });

  it("빈 문자열 유지", () => {
    expect(sanitizeDecimalInput("")).toBe("");
  });

  it("일반 값은 그대로", () => {
    expect(sanitizeDecimalInput("200")).toBe("200");
    expect(sanitizeDecimalInput("12.3")).toBe("12.3");
  });
});

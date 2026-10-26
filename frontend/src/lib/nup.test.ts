import { describe, expect, it } from "vitest";
import { formatarNup, nupDoInstrumento } from "./nup";

describe("NUP", () => {
  it("formata os 17 dígitos", () => {
    expect(formatarNup("25000198305202459")).toBe("25000.198305/2024-59");
  });
  it("não mexe no que não é NUP", () => {
    expect(formatarNup("948686")).toBe("948686");
    expect(formatarNup("PS1-503028")).toBe("PS1-503028");
  });
  it("só FAF e TED exibem NUP", () => {
    expect(nupDoInstrumento("FAF", "25000198305202459")).toBe(
      "25000.198305/2024-59",
    );
    expect(nupDoInstrumento("TED", "25000198305202459")).toBe(
      "25000.198305/2024-59",
    );
    expect(nupDoInstrumento("Convênio", "25000198305202459")).toBeNull();
    expect(nupDoInstrumento("PERSUS I", "PS1-503028")).toBeNull();
    expect(nupDoInstrumento("FAF", "123")).toBeNull();
  });
});

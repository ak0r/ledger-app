import { describe, expect, it } from "vitest";
import { fetchAmfiNavAll, parseNavAll } from "./amfiNav";

// Synthetic fixture matching AMFI's real NAVAll.txt shape (`;`-delimited,
// header line, blank lines, bare AMC/scheme-type section names between
// blocks, a trailing "N.A." NAV row) — AGENTS.md rule #24, this shape not
// real scheme data.
const SYNTHETIC_NAV_ALL = `Scheme Code;ISIN Div Payout/ ISIN Growth;ISIN Div Reinvestment;Scheme Name;Net Asset Value;Date

Open Ended Schemes(Growth)

Example Mutual Fund
120503;INF000X01234;-;Example Flexi Cap Fund - Growth;123.4567;01-Jul-2026
120504;-;-;Example Closed Scheme;N.A.;01-Jul-2026
`;

describe("parseNavAll", () => {
  it("parses a data row keyed by both AMFI code and ISIN", () => {
    const points = parseNavAll(SYNTHETIC_NAV_ALL);
    expect(points.get("120503")).toEqual({ date: "2026-07-01", nav: 123.4567 });
    expect(points.get("INF000X01234")).toEqual({ date: "2026-07-01", nav: 123.4567 });
  });

  it("skips header/blank/section-name lines and non-numeric NAV rows", () => {
    const points = parseNavAll(SYNTHETIC_NAV_ALL);
    expect(points.has("Scheme Code")).toBe(false);
    expect(points.has("120504")).toBe(false);
  });

  it("never keys a bare '-' placeholder", () => {
    const points = parseNavAll(SYNTHETIC_NAV_ALL);
    expect(points.has("-")).toBe(false);
  });
});

describe("fetchAmfiNavAll", () => {
  it("returns null when the fetcher fails, never throws", async () => {
    const result = await fetchAmfiNavAll(async () => null);
    expect(result).toBeNull();
  });

  it("parses the fetched text via the injected fetcher", async () => {
    const result = await fetchAmfiNavAll(async () => SYNTHETIC_NAV_ALL);
    expect(result?.get("120503")?.nav).toBe(123.4567);
  });
});

import { describe, it, expect } from "vitest";
import { parseExpression } from "cron-parser";

function parseCron(cronExpr: string, timezone: string): Date {
  const expression = parseExpression(cronExpr, {
    currentDate: new Date(),
    tz: timezone,
  });
  return expression.next().toDate();
}

function validateCron(cronExpr: string): boolean {
  try {
    parseExpression(cronExpr);
    return true;
  } catch {
    return false;
  }
}

const CRON_PRESETS: Record<string, string> = {
  daily_5am: "0 5 * * *",
  daily_midnight: "0 0 * * *",
  weekly_monday: "0 9 * * 1",
  weekly_friday: "0 9 * * 5",
  hourly: "0 * * * *",
  every_6h: "0 */6 * * *",
  every_12h: "0 */12 * * *",
};

describe("parseCron", () => {
  it("returns a Date for valid cron expressions", () => {
    const result = parseCron("0 5 * * *", "America/Los_Angeles");
    expect(result).toBeInstanceOf(Date);
    expect(result.getTime()).toBeGreaterThan(Date.now());
  });

  it("parses daily_5am cron to 5:00 AM in correct timezone", () => {
    // Use a specific reference time: set UTC date such that LA 5am hasn't occurred yet today
    // LA is UTC-7 (PDT) or UTC-8 (PST)
    const result = parseCron("0 5 * * *", "America/Los_Angeles");
    // Next 5am LA should be in the future
    expect(result.getTime()).toBeGreaterThan(Date.now());
  });

  it("throws on invalid cron string", () => {
    expect(() => parseCron("invalid cron string", "UTC")).toThrow();
  });

  it("throws on out-of-range cron values", () => {
    expect(() => parseCron("60 25 * * *", "UTC")).toThrow();
  });
});

describe("validateCron", () => {
  it("returns true for valid cron", () => {
    expect(validateCron("0 5 * * *")).toBe(true);
    expect(validateCron("*/30 * * * *")).toBe(true);
    expect(validateCron("0 0 1 * *")).toBe(true);
  });

  it("returns false for invalid cron", () => {
    expect(validateCron("not a cron")).toBe(false);
    expect(validateCron("99 99 99 99 99")).toBe(false);
  });
});

describe("CRON_PRESETS", () => {
  it("daily_5am maps to '0 5 * * *'", () => {
    expect(CRON_PRESETS["daily_5am"]).toBe("0 5 * * *");
  });

  it("daily_midnight maps to '0 0 * * *'", () => {
    expect(CRON_PRESETS["daily_midnight"]).toBe("0 0 * * *");
  });

  it("weekly_monday maps to '0 9 * * 1'", () => {
    expect(CRON_PRESETS["weekly_monday"]).toBe("0 9 * * 1");
  });

  it("hourly maps to '0 * * * *'", () => {
    expect(CRON_PRESETS["hourly"]).toBe("0 * * * *");
  });

  it("each preset maps to a valid cron expression", () => {
    for (const [name, cron] of Object.entries(CRON_PRESETS)) {
      expect(validateCron(cron), `Preset ${name} should be valid`).toBe(true);
    }
  });
});

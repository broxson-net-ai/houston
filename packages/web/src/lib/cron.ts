import { parseExpression } from "cron-parser";

export const CRON_PRESETS: Record<string, string> = {
  daily_5am: "0 5 * * *",
  daily_midnight: "0 0 * * *",
  weekly_monday: "0 9 * * 1",
  weekly_friday: "0 9 * * 5",
  hourly: "0 * * * *",
  every_6h: "0 */6 * * *",
  every_12h: "0 */12 * * *",
};

export function parseCron(cronExpr: string, timezone: string): Date {
  const expression = parseExpression(cronExpr, {
    currentDate: new Date(),
    tz: timezone,
  });
  return expression.next().toDate();
}

export function validateCron(cronExpr: string): boolean {
  try {
    parseExpression(cronExpr);
    return true;
  } catch {
    return false;
  }
}

export function computeNextRunAt(cronExpr: string, timezone: string, after?: Date): Date {
  const expression = parseExpression(cronExpr, {
    currentDate: after ?? new Date(),
    tz: timezone,
  });
  return expression.next().toDate();
}

export function resolvePreset(preset: string): string | null {
  return CRON_PRESETS[preset] ?? null;
}

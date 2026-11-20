export const defaultDailyRunTime = "09:00";

export function validateDailyRunTime(value: unknown): string {
  if (typeof value !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) {
    throw new Error("Daily run time must use HH:mm (00:00–23:59)");
  }
  return value;
}

export function dailyCron(time: string): string {
  const [hour, minute] = validateDailyRunTime(time).split(":").map(Number);
  return `${minute} ${hour} * * *`;
}

export function localDay(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function dailyTimeReached(time: string, now = new Date()): boolean {
  const [hour, minute] = validateDailyRunTime(time).split(":").map(Number);
  return now.getHours() * 60 + now.getMinutes() >= hour! * 60 + minute!;
}

export function ranOnDay(
  run: { startedAt: string } | null,
  day = localDay(),
): boolean {
  return Boolean(run && localDay(new Date(run.startedAt)) === day);
}

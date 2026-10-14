export type ScheduleFrequency =
  "daily" | "weekdays" | "weekly" | "hourly" | "interval" | "custom";
export interface ScheduleDraft {
  frequency: ScheduleFrequency;
  time: string;
  day: number;
  minute: number;
  interval: number;
}
export function readSchedule(cron: string): ScheduleDraft {
  const draft: ScheduleDraft = {
    frequency: "custom",
    time: "09:00",
    day: 1,
    minute: 0,
    interval: 30,
  };
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return draft;
  const [minute, hour, date, month, day] = parts;
  if (date !== "*" || month !== "*") return draft;
  if (hour === "*" && day === "*") {
    if (/^\d+$/.test(minute!) && Number(minute) < 60)
      return { ...draft, frequency: "hourly", minute: Number(minute) };
    if (
      /^\*\/\d+$/.test(minute!) &&
      Number(minute!.slice(2)) >= 1 &&
      Number(minute!.slice(2)) <= 59
    )
      return {
        ...draft,
        frequency: "interval",
        interval: Number(minute!.slice(2)),
      };
  }
  if (
    !/^\d+$/.test(minute!) ||
    Number(minute) > 59 ||
    !/^\d+$/.test(hour!) ||
    Number(hour) > 23
  )
    return draft;
  const time = `${hour!.padStart(2, "0")}:${minute!.padStart(2, "0")}`;
  if (day === "*") return { ...draft, frequency: "daily", time };
  if (day === "1-5") return { ...draft, frequency: "weekdays", time };
  if (/^[0-6]$/.test(day!))
    return { ...draft, frequency: "weekly", time, day: Number(day) };
  return draft;
}
export function writeSchedule(draft: ScheduleDraft): string {
  const match = /^(\d{2}):(\d{2})$/.exec(draft.time);
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59)
    throw new Error("Invalid schedule time");
  const integer = (value: number, min: number, max: number) => {
    if (!Number.isInteger(value) || value < min || value > max)
      throw new Error("Invalid schedule value");
    return value;
  };
  switch (draft.frequency) {
    case "hourly":
      return `${integer(draft.minute, 0, 59)} * * * *`;
    case "interval":
      return `*/${integer(draft.interval, 1, 59)} * * * *`;
    case "daily":
      return `${Number(match[2])} ${Number(match[1])} * * *`;
    case "weekdays":
      return `${Number(match[2])} ${Number(match[1])} * * 1-5`;
    case "weekly":
      return `${Number(match[2])} ${Number(match[1])} * * ${integer(draft.day, 0, 6)}`;
    default:
      throw new Error("Custom schedules retain their original expression");
  }
}

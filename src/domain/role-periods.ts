export type RoleReportPeriod = "daily" | "weekly" | "monthly";

export interface RoleDateRange {
  startDate: string;
  endDateExclusive: string;
}

interface LocalClock {
  date: string;
  hour: number;
  minute: number;
  second: number;
}

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T12:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function monthStart(date: string): string {
  return `${date.slice(0, 7)}-01`;
}

function addMonths(date: string, months: number): string {
  const value = new Date(`${monthStart(date)}T12:00:00.000Z`);
  value.setUTCMonth(value.getUTCMonth() + months);
  return value.toISOString().slice(0, 10);
}

function weekStart(date: string): string {
  const day = new Date(`${date}T12:00:00.000Z`).getUTCDay();
  return addDays(date, -((day + 6) % 7));
}

function localClock(now: Date, timezone: string): LocalClock {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23"
  }).formatToParts(now);
  const read = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "0";
  return {
    date: `${read("year")}-${read("month")}-${read("day")}`,
    hour: Number(read("hour")), minute: Number(read("minute")), second: Number(read("second"))
  };
}

export function currentRolePeriodRange(period: RoleReportPeriod, now: Date, timezone: string): RoleDateRange {
  const date = localClock(now, timezone).date;
  if (period === "daily") return { startDate: date, endDateExclusive: addDays(date, 1) };
  if (period === "weekly") {
    const startDate = weekStart(date);
    return { startDate, endDateExclusive: addDays(startDate, 7) };
  }
  const startDate = monthStart(date);
  return { startDate, endDateExclusive: addMonths(startDate, 1) };
}

export function completedRoleReportRanges(now: Date, timezone: string): Array<{ period: RoleReportPeriod; range: RoleDateRange }> {
  const clock = localClock(now, timezone);
  const closingNow = clock.hour === 23 && clock.minute === 59 && clock.second >= 50;
  const reportDate = closingNow ? clock.date : addDays(clock.date, -1);
  const daily: RoleDateRange = { startDate: reportDate, endDateExclusive: addDays(reportDate, 1) };

  const currentWeekStart = weekStart(clock.date);
  const isSunday = new Date(`${clock.date}T12:00:00.000Z`).getUTCDay() === 0;
  const weeklyStart = closingNow && isSunday ? currentWeekStart : addDays(currentWeekStart, -7);

  const currentMonthStart = monthStart(clock.date);
  const isLastDayOfMonth = addDays(clock.date, 1) === addMonths(currentMonthStart, 1);
  const monthlyStart = closingNow && isLastDayOfMonth ? currentMonthStart : addMonths(currentMonthStart, -1);

  return [
    { period: "daily", range: daily },
    { period: "weekly", range: { startDate: weeklyStart, endDateExclusive: addDays(weeklyStart, 7) } },
    { period: "monthly", range: { startDate: monthlyStart, endDateExclusive: addMonths(monthlyStart, 1) } }
  ];
}

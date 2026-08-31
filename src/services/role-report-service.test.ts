import { describe, expect, it } from "vitest";
import { completedRoleReportRanges, currentRolePeriodRange } from "../domain/role-periods.js";

const timezone = "Europe/Istanbul";

describe("rol sıralaması takvim dönemleri", () => {
  it("haftalık sıralamayı pazartesi günü sıfırdan başlatır", () => {
    expect(currentRolePeriodRange("weekly", new Date("2026-08-31T09:00:00.000Z"), timezone))
      .toEqual({ startDate: "2026-08-31", endDateExclusive: "2026-09-07" });
  });

  it("aylık sıralamayı yalnızca içinde bulunulan ayla sınırlar", () => {
    expect(currentRolePeriodRange("monthly", new Date("2026-08-18T09:00:00.000Z"), timezone))
      .toEqual({ startDate: "2026-08-01", endDateExclusive: "2026-09-01" });
  });

  it("pazar 23:59 kapanışında biten haftayı raporlar", () => {
    const weekly = completedRoleReportRanges(new Date("2026-08-30T20:59:55.000Z"), timezone)
      .find((item) => item.period === "weekly");
    expect(weekly?.range).toEqual({ startDate: "2026-08-24", endDateExclusive: "2026-08-31" });
  });

  it("pazartesi 00:00 sonrasında aynı biten haftayı yakalar", () => {
    const weekly = completedRoleReportRanges(new Date("2026-08-30T21:00:05.000Z"), timezone)
      .find((item) => item.period === "weekly");
    expect(weekly?.range).toEqual({ startDate: "2026-08-24", endDateExclusive: "2026-08-31" });
  });
});
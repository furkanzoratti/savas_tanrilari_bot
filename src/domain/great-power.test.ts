import { describe, expect, it } from "vitest";
import { calculateGreatPower, currentGreatPowerReportDate, currentLocalDate } from "./great-power.js";

describe("Büyük Güç puanı", () => {
  it("tamamlanmış, eğitimde ve geçici güçleri kendi katsayılarıyla toplar", () => {
    const result = calculateGreatPower({
      payableIncome: 1_000,
      fieldUnits: [],
      musteringUnits: [],
      settlements: [{
        is_conquered: false,
        temporaryMilitia: 500,
        units: [
          { unit_type: "light_infantry", quantity: 1_000 },
          { unit_type: "heavy_infantry", quantity: 1_000 }
        ],
        ships: [{ ship_type: "trireme", quantity: 1 }],
        pendingRecruitment: [{ unit_type: "archer", quantity: 1_000 }],
        pendingGarrison: [{ personnel_reserved: 1_000 }],
        buildings: [
          { building_type: "trade_guild", level: 2, status: "ACTIVE" },
          { building_type: "farm", level: 3, status: "BUILDING" }
        ],
        mercenaries: [{
          status: "ACTIVE",
          units: [{ unit_type: "heavy_infantry", quantity: 1_000 }],
          ships: [{ ship_type: "kerkouros", quantity: 2 }]
        }, {
          status: "UNPAID",
          units: [{ unit_type: "heavy_cavalry", quantity: 50_000 }],
          ships: []
        }]
      }]
    });

    expect(result).toEqual({
      land: 6_930,
      economy: 1_000,
      settlements: 5_000,
      navy: 1_380,
      buildings: 2_250,
      total: 16_560
    });
  });

  it("fethedilmiş şehre, bitmemiş binaya ve kaldırılmış Lupanara puan vermez", () => {
    expect(calculateGreatPower({
      payableIncome: -500,
      fieldUnits: [],
      musteringUnits: [],
      settlements: [{
        is_conquered: true,
        temporaryMilitia: 0,
        units: [], ships: [], pendingRecruitment: [], pendingGarrison: [], mercenaries: [],
        buildings: [
          { building_type: "academy", level: 3, status: "BUILDING" },
          { building_type: "lupanar", level: 3, status: "ACTIVE" }
        ]
      }]
    })).toEqual({ land: 0, economy: 0, settlements: 0, navy: 0, buildings: 0, total: 0 });
  });

  it("askeri yerleşkeden orduya veya intikale taşırken kara gücünü değiştirmez", () => {
    const settlement = {
      is_conquered: false, temporaryMilitia: 0, buildings: [], ships: [], pendingRecruitment: [],
      pendingGarrison: [], mercenaries: []
    };
    const stationed = calculateGreatPower({
      payableIncome: 0, fieldUnits: [], musteringUnits: [],
      settlements: [{ ...settlement, units: [{ unit_type: "heavy_infantry", quantity: 1_000 }] }]
    });
    const fielded = calculateGreatPower({
      payableIncome: 0, fieldUnits: [{ unit_type: "heavy_infantry", quantity: 1_000 }], musteringUnits: [],
      settlements: [{ ...settlement, units: [] }]
    });
    const mustering = calculateGreatPower({
      payableIncome: 0, fieldUnits: [], musteringUnits: [{ unit_type: "heavy_infantry", quantity: 1_000 }],
      settlements: [{ ...settlement, units: [] }]
    });

    expect(stationed.land).toBe(2_600);
    expect(fielded.land).toBe(stationed.land);
    expect(mustering.land).toBe(stationed.land);
  });
});

describe("Büyük Güç günlük saati", () => {
  const timezone = "Europe/Istanbul";

  it("17.00'dan önce otomatik rapor tarihi üretmez", () => {
    expect(currentGreatPowerReportDate(new Date("2026-08-31T13:59:59.000Z"), timezone)).toBeNull();
  });

  it("17.00 ve sonrasında yerel günü döndürür", () => {
    expect(currentGreatPowerReportDate(new Date("2026-08-31T14:00:00.000Z"), timezone)).toBe("2026-08-31");
    expect(currentLocalDate(new Date("2026-08-31T21:30:00.000Z"), timezone)).toBe("2026-09-01");
  });
});

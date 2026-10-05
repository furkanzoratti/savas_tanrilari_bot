import {describe,expect,it} from "vitest";
import {LAST_STAND_DURATION_TURNS,lastStandDeadline,lastStandRemainingTurns} from "./country-last-stand-service.js";

describe("Son Direniş süre hesabı",()=>{
  it("son yerleşke kaybından sonra üç tam oyun turu tanır",()=>{
    expect(LAST_STAND_DURATION_TURNS).toBe(3);
    expect(lastStandDeadline(30)).toBe(33);
    expect(lastStandRemainingTurns(33,31)).toBe(3);
    expect(lastStandRemainingTurns(33,32)).toBe(2);
    expect(lastStandRemainingTurns(33,33)).toBe(1);
    expect(lastStandRemainingTurns(33,34)).toBe(0);
  });
});

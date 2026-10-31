import {describe,expect,it} from "vitest";
import {MISSIONARY_BASE_PROGRESS,missionaryBeliefPenalty,missionaryPopulationPenalty} from "../domain/missionary.js";

describe("fixed missionary progress",()=>{
  it("uses transparent population tiers",()=>{
    expect([49_999,50_000,100_000,200_000,400_000].map(missionaryPopulationPenalty)).toEqual([0,1,2,3,4]);
  });
  it("uses the resisting belief share without dice",()=>{
    expect([0,1,40,60,80].map(missionaryBeliefPenalty)).toEqual([0,1,2,3,4]);
    expect(MISSIONARY_BASE_PROGRESS).toBe(8);
  });
});

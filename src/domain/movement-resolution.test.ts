import { describe, expect, it } from "vitest";
import { eligibleForMovementStage, selectTurnMovementSteps } from "./movement-resolution.js";

const route = [
  { stepIndex: 1, fromHexId: "A", toHexId: "B", cost: 1 },
  { stepIndex: 2, fromHexId: "B", toHexId: "C", cost: 1 },
  { stepIndex: 3, fromHexId: "C", toHexId: "D", cost: 1 },
  { stepIndex: 4, fromHexId: "D", toHexId: "E", cost: 1 }
];

describe("movement turn resolution", () => {
  it("moves only the current turn allowance and resumes next turn", () => {
    const first = selectTurnMovementSteps(route, 0, 2);
    expect(first.traversed.map((step) => step.toHexId)).toEqual(["B", "C"]);
    expect(first.complete).toBe(false);
    const second = selectTurnMovementSteps(route, 2, 2);
    expect(second.traversed.map((step) => step.toHexId)).toEqual(["D", "E"]);
    expect(second.complete).toBe(true);
  });

  it("honors fractional edge costs without exceeding allowance", () => {
    const result = selectTurnMovementSteps([{ ...route[0]!, cost: 1.25 }, { ...route[1]!, cost: 1.5 }], 0, 2.5);
    expect(result.traversed).toHaveLength(1);
    expect(result.nextStep?.stepIndex).toBe(2);
  });

  it("refuses corrupt or unaffordable routes", () => {
    expect(() => selectTurnMovementSteps([{ ...route[0]!, stepIndex: 2 }], 0, 1)).toThrow();
    expect(selectTurnMovementSteps([{ ...route[0]!, cost: 2 }], 0, 1).traversed).toHaveLength(0);
  });

  it("processes fresh orders on stop and continuing orders only on advance", () => {
    expect(eligibleForMovementStage({ status: "SUBMITTED", issuedTurn: 8, lastProcessedTurn: null }, 8, "STOP")).toBe(true);
    expect(eligibleForMovementStage({ status: "SUBMITTED", issuedTurn: 8, lastProcessedTurn: null }, 9, "ADVANCE")).toBe(false);
    expect(eligibleForMovementStage({ status: "IN_PROGRESS", issuedTurn: 8, lastProcessedTurn: 8 }, 9, "ADVANCE")).toBe(true);
    expect(eligibleForMovementStage({ status: "IN_PROGRESS", issuedTurn: 8, lastProcessedTurn: 9 }, 9, "STOP")).toBe(false);
  });
});

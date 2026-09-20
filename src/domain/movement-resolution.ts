import type { MovementOrderStatus } from "./movement.js";

export type MovementResolutionStage = "STOP" | "ADVANCE";

export interface ResolutionStep {
  stepIndex: number;
  fromHexId: string;
  toHexId: string;
  cost: number;
}

export function eligibleForMovementStage(order: {
  status: MovementOrderStatus;
  issuedTurn: number;
  lastProcessedTurn: number | null;
}, turn: number, stage: MovementResolutionStage): boolean {
  if (order.lastProcessedTurn !== null && order.lastProcessedTurn >= turn) return false;
  return stage === "STOP"
    ? order.status === "SUBMITTED" && order.issuedTurn === turn
    : order.status === "IN_PROGRESS" && order.issuedTurn < turn;
}

export function selectTurnMovementSteps(
  steps: readonly ResolutionStep[], currentStep: number, allowance: number
): { traversed: ResolutionStep[]; nextStep: ResolutionStep | null; complete: boolean } {
  if (!Number.isInteger(currentStep) || currentStep < 0 || !Number.isFinite(allowance) || allowance <= 0) {
    throw new Error("Geçersiz hareket ilerlemesi veya tur hareket hakkı.");
  }
  if (!steps.length || currentStep >= steps.length) throw new Error("Hareket rotasında işlenecek adım bulunmuyor.");
  for (let index = 0; index < steps.length; index += 1) {
    const step = steps[index]!;
    if (step.stepIndex !== index + 1 || !Number.isFinite(step.cost) || step.cost <= 0
      || (index > 0 && step.fromHexId !== steps[index - 1]!.toHexId)) {
      throw new Error("Hareket rotasının adımları veya maliyeti tutarsız.");
    }
  }
  const remaining = steps.filter((step) => step.stepIndex > currentStep);
  let expected = currentStep + 1;
  let used = 0;
  const traversed: ResolutionStep[] = [];
  for (const step of remaining) {
    if (step.stepIndex !== expected) throw new Error("Hareket rotasının adımları tutarsız.");
    expected += 1;
    if (Math.round((used + step.cost) * 1000) > Math.round(allowance * 1000)) break;
    traversed.push(step);
    used += step.cost;
  }
  return {
    traversed,
    nextStep: remaining[traversed.length] ?? null,
    complete: currentStep + traversed.length === steps.length
  };
}

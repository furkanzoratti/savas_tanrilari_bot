export interface TreasuryTransferQuotaInput {
  countryOpeningTreasury: number;
  countryTransferred: number;
  sourceOpeningTreasury: number;
  sourceTransferred: number;
  sourceIncoming: number;
  sourceCurrentTreasury: number;
  maintenanceReserve: number;
}

export interface TreasuryTransferQuota {
  countryLimit: number;
  countryRemaining: number;
  sourceLimit: number;
  sourceRemaining: number;
  maintenanceReserve: number;
  transferableOwnFunds: number;
  maximumTransfer: number;
}

const amount = (value: number): number => Math.max(0, Math.floor(Number.isFinite(value) ? value : 0));

export function calculateTreasuryTransferQuota(input: TreasuryTransferQuotaInput): TreasuryTransferQuota {
  const countryLimit = Math.floor(amount(input.countryOpeningTreasury) * 0.25);
  const sourceLimit = Math.floor(amount(input.sourceOpeningTreasury) * 0.50);
  const countryRemaining = Math.max(0, countryLimit - amount(input.countryTransferred));
  const sourceRemaining = Math.max(0, sourceLimit - amount(input.sourceTransferred));
  const maintenanceReserve = amount(input.maintenanceReserve);
  const transferableOwnFunds = Math.max(0,
    amount(input.sourceCurrentTreasury) - amount(input.sourceIncoming) - maintenanceReserve
  );
  return {
    countryLimit,
    countryRemaining,
    sourceLimit,
    sourceRemaining,
    maintenanceReserve,
    transferableOwnFunds,
    maximumTransfer: Math.min(countryRemaining, sourceRemaining, transferableOwnFunds)
  };
}

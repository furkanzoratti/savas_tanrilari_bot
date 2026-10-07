export const SETTLEMENT_TRANSFER_TYPES = {
  CONQUEST: {
    label: "Fetih",
    historyType: "CONQUEST",
    conquered: true,
    restorationClaim: true
  },
  PEACE_TRANSFER: {
    label: "Barış Antlaşması",
    historyType: "PEACE_TRANSFER",
    conquered: false,
    restorationClaim: true
  },
  VOLUNTARY_TRANSFER: {
    label: "Dostça Devir",
    historyType: "VOLUNTARY_TRANSFER",
    conquered: false,
    restorationClaim: false
  }
} as const;

export type SettlementTransferType = keyof typeof SETTLEMENT_TRANSFER_TYPES;

export function settlementTransferPolicy(type: SettlementTransferType) {
  return SETTLEMENT_TRANSFER_TYPES[type];
}

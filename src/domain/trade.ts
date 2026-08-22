export type TradeRoute = "LAND" | "SEA";
export type TradeStatus = "PENDING" | "ACTIVE" | "REJECTED" | "ENDED";

export const TRADE_INCOME_PER_COUNTRY = 0;

export const TRADE_ROUTE_LABELS: Record<TradeRoute, string> = {
  LAND: "Kara Ticareti",
  SEA: "Deniz Ticareti"
};

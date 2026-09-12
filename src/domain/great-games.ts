export const GREAT_GAMES_TURN = 15;

export const GREAT_GAME_TYPES = {
  AUCTION: { label: "Devletler Müzayedesi", emoji: "🏺", stake: 0 },
  CHARIOT: { label: "Savaş Arabaları Turnuvası", emoji: "🏇", stake: 1_000 },
  CARAVAN: { label: "Ticaret Kervanı", emoji: "🐫", stake: 0 },
  KINGS_BET: { label: "Kralların Bahsi", emoji: "👑", stake: 1_000 },
  DIPLOMACY: { label: "Diplomasi Masası", emoji: "🤝", stake: 500 }
} as const;

export type GreatGameType = keyof typeof GREAT_GAME_TYPES;
export type ChariotTactic = "AGGRESSIVE" | "BALANCED" | "CAUTIOUS" | "SQUEEZE";
export type KingsDecision = "COOPERATE" | "BETRAY";

export function parseKingsDecision(value: string): KingsDecision | null {
  const normalized = value.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toUpperCase().replace(/[\s_-]+/g, "");
  if (normalized === "ISBIRLIGI" || normalized === "COOPERATE") return "COOPERATE";
  if (normalized === "IHANET" || normalized === "BETRAY" || normalized === "BETRAYAL") return "BETRAY";
  return null;
}
export type CaravanRoute = "SAFE" | "BALANCED" | "DANGEROUS";
export type CaravanChallenge = "TRADE" | "SECURITY" | "TRAVEL";
export type CaravanRole = "MERCHANT" | "GUARD" | "GUIDE" | "FINANCIER";

export const CHARIOT_TACTICS: Record<ChariotTactic, { label: string; bonus: number; crashMaximum: number }> = {
  AGGRESSIVE: { label: "Saldırgan Sürüş", bonus: 4, crashMaximum: 4 },
  BALANCED: { label: "Dengeli Sürüş", bonus: 2, crashMaximum: 1 },
  CAUTIOUS: { label: "Temkinli Sürüş", bonus: 0, crashMaximum: 0 },
  SQUEEZE: { label: "Rakibi Sıkıştır", bonus: 1, crashMaximum: 3 }
};

export const CARAVAN_ROUTES: Record<CaravanRoute, { label: string; difficulty: number; success: number; failure: number }> = {
  SAFE: { label: "Güvenli Yol", difficulty: 9, success: 1, failure: 0 },
  BALANCED: { label: "Dengeli Yol", difficulty: 12, success: 2, failure: -1 },
  DANGEROUS: { label: "Tehlikeli Yol", difficulty: 15, success: 3, failure: -2 }
};

export const CARAVAN_ROLE_FOR_CHALLENGE: Record<CaravanChallenge, CaravanRole> = {
  TRADE: "MERCHANT",
  SECURITY: "GUARD",
  TRAVEL: "GUIDE"
};

export const AUCTION_REWARDS = {
  CONSTRUCTION_HALF: "Bir inşaatın kalan süresini %50 azaltma",
  CHARACTER_STAT: "Bir Akademi karakterine kalıcı +1 stat",
  RESOURCE_CHANGE: "Bir yerleşkenin hammaddesini değiştirme",
  EXTRA_TRADE: "Bir yerleşkeye kalıcı +1 ticaret hakkı",
  CANCEL_MERCENARY: "Başka bir devletin paralı asker kontratını feshetme",
  FREE_SIEGE: "Seçilen iki kuşatma aletini ücretsiz alma",
  FREE_SHIPS: "Seçilen üç gemiyi ücretsiz ve anında alma",
  POPULATION_ROLL: "1d10 × 1.000 tek seferlik özgür nüfus",
  LAND_TRADE_ROLL: "Bir sonraki Alım Turunda 1d10 kadar Kara Ticareti bonusu"
} as const;

export type AuctionRewardType = keyof typeof AUCTION_REWARDS;

export function rollDie(sides: number, random = Math.random): number {
  return Math.floor(random() * sides) + 1;
}

export interface ChariotRoundEntry {
  countryId: string;
  tactic: ChariotTactic;
  targetCountryId?: string | null;
}

export interface ChariotRoundResult {
  countryId: string;
  tactic: ChariotTactic;
  naturalRoll: number;
  penaltyRoll: number;
  crashed: boolean;
  score: number;
}

export function resolveChariotRound(entries: ChariotRoundEntry[], random = Math.random): ChariotRoundResult[] {
  const initial = entries.map((entry) => {
    const naturalRoll = rollDie(20, random);
    const rule = CHARIOT_TACTICS[entry.tactic];
    const crashed = rule.crashMaximum > 0 && naturalRoll <= rule.crashMaximum;
    return {
      countryId: entry.countryId,
      tactic: entry.tactic,
      naturalRoll,
      penaltyRoll: 0,
      crashed,
      score: crashed ? 0 : naturalRoll + rule.bonus
    } satisfies ChariotRoundResult;
  });

  for (const entry of entries) {
    if (entry.tactic !== "SQUEEZE" || !entry.targetCountryId) continue;
    const actor = initial.find((item) => item.countryId === entry.countryId);
    const target = initial.find((item) => item.countryId === entry.targetCountryId);
    if (!actor || actor.crashed || !target) continue;
    const penalty = rollDie(4, random);
    target.penaltyRoll += penalty;
    target.score = Math.max(0, target.score - penalty);
  }

  if (initial.some((result) => result.crashed)) {
    for (const result of initial) {
      if (result.tactic === "CAUTIOUS" && !result.crashed) result.score += 3;
    }
  }
  return initial;
}

export function resolveKingsRound(
  left: { decision: KingsDecision; prediction: KingsDecision },
  right: { decision: KingsDecision; prediction: KingsDecision }
): { left: number; right: number } {
  let leftScore = 0;
  let rightScore = 0;
  if (left.prediction === right.decision) leftScore += 2;
  if (right.prediction === left.decision) rightScore += 2;
  if (right.prediction !== left.decision) leftScore += 1;
  if (left.prediction !== right.decision) rightScore += 1;
  if (left.decision === "COOPERATE" && right.decision === "COOPERATE") {
    leftScore += 1;
    rightScore += 1;
  } else if (left.decision === "BETRAY" && right.decision === "COOPERATE") {
    leftScore += 2;
  } else if (right.decision === "BETRAY" && left.decision === "COOPERATE") {
    rightScore += 2;
  } else if (left.decision === "BETRAY" && right.decision === "BETRAY") {
    leftScore -= 1;
    rightScore -= 1;
  }
  return { left: leftScore, right: rightScore };
}

export function caravanChallengeFromRoll(roll: number): CaravanChallenge {
  if (roll <= 2) return "TRADE";
  if (roll <= 4) return "SECURITY";
  return "TRAVEL";
}

export function caravanMultiplier(score: number): number {
  if (score <= 2) return 0.60;
  if (score <= 4) return 0.90;
  if (score <= 6) return 1.15;
  if (score <= 8) return 1.35;
  if (score <= 10) return 1.55;
  return 1.80;
}

export function resolveCaravanStage(input: {
  route: CaravanRoute;
  roles: readonly CaravanRole[];
  financierUsed: boolean;
  useFinancier: boolean;
}, random = Math.random): {
  challengeRoll: number;
  challenge: CaravanChallenge;
  dice: [number, number];
  rerollDice: [number, number] | null;
  bonus: number;
  total: number;
  success: boolean;
  scoreDelta: number;
  financierUsed: boolean;
} {
  const challengeRoll = rollDie(6, random);
  const challenge = caravanChallengeFromRoll(challengeRoll);
  const requiredRole = CARAVAN_ROLE_FOR_CHALLENGE[challenge];
  const bonus = input.roles.includes(requiredRole) ? 3 : 0;
  let dice: [number, number] = [rollDie(10, random), rollDie(10, random)];
  let total = dice[0] + dice[1] + bonus;
  const route = CARAVAN_ROUTES[input.route];
  let success = total >= route.difficulty;
  let rerollDice: [number, number] | null = null;
  let financierUsed = input.financierUsed;
  if (!success && input.useFinancier && !input.financierUsed && input.roles.includes("FINANCIER")) {
    rerollDice = [rollDie(10, random), rollDie(10, random)];
    dice = rerollDice;
    total = dice[0] + dice[1] + bonus;
    success = total >= route.difficulty;
    financierUsed = true;
  }
  return {
    challengeRoll, challenge, dice, rerollDice, bonus, total, success,
    scoreDelta: success ? route.success : route.failure,
    financierUsed
  };
}

export function allocatePool(total: number, weights: readonly number[]): number[] {
  if (total <= 0 || !weights.length) return weights.map(() => 0);
  const normalized = weights.map((weight) => Math.max(0, weight));
  const sum = normalized.reduce((accumulator, weight) => accumulator + weight, 0);
  if (sum <= 0) {
    const base = Math.floor(total / weights.length);
    return weights.map((_, index) => base + (index < total - base * weights.length ? 1 : 0));
  }
  const exact = normalized.map((weight) => total * weight / sum);
  const result = exact.map(Math.floor);
  let remaining = total - result.reduce((accumulator, value) => accumulator + value, 0);
  const order = exact.map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((left, right) => right.fraction - left.fraction || left.index - right.index);
  for (let index = 0; index < remaining; index += 1) result[order[index % order.length]!.index]! += 1;
  return result;
}

export const DIPLOMACY_DEVELOPMENTS = [
  "Ana sonuçlardan biri görüşme dışı kaldı.",
  "İkincil tavizin altın bedeli arttı.",
  "Taraflar sonuçlanmadan önce bir yeniden oylama hakkı kazandı.",
  "Mevcut ikincil tavizlerden biri kaldırıldı.",
  "Yalnız bir devlete verilebilen yeni bir taviz açıldı.",
  "Oylama süresi kısaldı."
] as const;

export const DIPLOMACY_SCENARIOS = [
  {
    key: "PORT_CRISIS",
    title: "Tartışmalı Liman",
    description: "Üç devlet aynı limanın geleceği konusunda anlaşmak zorundadır.",
    primary: ["Liman devletin tam kontrolüne geçsin", "Liman tarafsız ve askerî kullanıma kapalı kalsın", "Liman devletin korumasına alınsın"],
    secondary: ["İki turluk ticaret hakkı", "1.000 Altın tazminat", "Anlaşmanın tek garantörü olma"]
  },
  {
    key: "BORDER_CITY",
    title: "Sınır Şehri Krizi",
    description: "Tartışmalı sınır şehrinin siyasî statüsü belirlenmelidir.",
    primary: ["Şehir devlete bağlansın", "Şehir bağımsız tampon bölge olsun", "Şehir devletin himayesine girsin"],
    secondary: ["Şehirde ticaret mahallesi", "İki turluk askerî geçiş", "Sınır vergisinden pay"]
  },
  {
    key: "ROYAL_SUCCESSION",
    title: "Veraset Bunalımı",
    description: "Varissiz hükümdarın ardından yeni düzen üç devlet tarafından belirlenmelidir.",
    primary: ["Devletin desteklediği aday tahta çıksın", "Ortak naiplik konseyi kurulsun", "Taht kaldırılarak şehir meclisi kurulsun"],
    secondary: ["Hanedan evliliği hakkı", "Hazineden tazminat", "Kalıcı diplomatik temsilcilik"]
  }
] as const;

export function resolveDiplomacyVote(
  countryIds: readonly string[],
  primaryVotes: Readonly<Record<string, string>>,
  secondaryVotes: Readonly<Record<string, string | null>>,
  random = Math.random
): { primaryWinnerId: string; secondaryWinnerId: string | null; influenceRolls: Record<string, number> } {
  if (countryIds.length !== 3) throw new Error("Diplomasi Masası tam olarak üç devlet gerektirir.");
  const counts = new Map<string, number>();
  for (const countryId of countryIds) {
    const vote = primaryVotes[countryId];
    if (!vote || !countryIds.includes(vote)) throw new Error("Bütün devletler geçerli bir ana hedef oyu vermelidir.");
    counts.set(vote, (counts.get(vote) ?? 0) + 1);
  }
  const ordered = [...counts.entries()].sort((left, right) => right[1] - left[1]);
  const influenceRolls: Record<string, number> = {};
  let primaryWinnerId: string;
  if (ordered[0]![1] >= 2) {
    primaryWinnerId = ordered[0]![0];
  } else {
    const rolled = countryIds.map((countryId) => {
      const roll = rollDie(20, random);
      influenceRolls[countryId] = roll;
      return { countryId, roll };
    }).sort((left, right) => right.roll - left.roll || left.countryId.localeCompare(right.countryId));
    primaryWinnerId = rolled[0]!.countryId;
  }

  const secondaryCounts = new Map<string, number>();
  for (const countryId of countryIds) {
    const vote = secondaryVotes[countryId];
    if (!vote || vote === primaryWinnerId || !countryIds.includes(vote)) continue;
    secondaryCounts.set(vote, (secondaryCounts.get(vote) ?? 0) + 1);
  }
  const secondaryWinnerId = [...secondaryCounts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0]?.[0] ?? null;
  return { primaryWinnerId, secondaryWinnerId, influenceRolls };
}

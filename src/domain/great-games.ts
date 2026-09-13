export const GREAT_GAMES_TURN = 15;
export const GREAT_GAMES_RACE_ROUNDS = 6;
export const RACE_TRACK_STEPS = 50;
export const CHARIOT_TRACK_TARGET = 100;
export const CARAVAN_TRACK_TARGET = 20;
export const AUCTION_OPENING_BID = 500;
export const AUCTION_BID_INCREMENT = 250;

export function isValidAuctionBidAmount(amount: number): boolean {
  return Number.isSafeInteger(amount)
    && amount >= AUCTION_OPENING_BID
    && (amount - AUCTION_OPENING_BID) % AUCTION_BID_INCREMENT === 0;
}

export function auctionNextMinimum(currentBid: number): number {
  return currentBid > 0 ? currentBid + AUCTION_BID_INCREMENT : AUCTION_OPENING_BID;
}

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

function normalizeGameChoice(value: string): string {
  return value.trim().toLocaleUpperCase("tr-TR").normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "").replace(/[^A-Z0-9]/g, "");
}

export function parseKingsDecision(value: string): KingsDecision | null {
  const normalized = normalizeGameChoice(value);
  if (normalized === "ISBIRLIGI" || normalized === "COOPERATE") return "COOPERATE";
  if (normalized === "IHANET" || normalized === "BETRAY" || normalized === "BETRAYAL") return "BETRAY";
  return null;
}
export type CaravanRoute = "SAFE" | "BALANCED" | "DANGEROUS";
export type CaravanChallenge = "TRADE" | "SECURITY" | "TRAVEL";
export type CaravanRole = "MERCHANT" | "GUARD" | "GUIDE" | "FINANCIER";

export function parseChariotTactic(value: string): ChariotTactic | null {
  const normalized = normalizeGameChoice(value);
  if (["SALDIRGAN", "SALDIRGANSURUS", "AGGRESSIVE"].includes(normalized)) return "AGGRESSIVE";
  if (["DENGELI", "DENGELISURUS", "BALANCED"].includes(normalized)) return "BALANCED";
  if (["TEMKINLI", "TEMKINLISURUS", "CAUTIOUS"].includes(normalized)) return "CAUTIOUS";
  if (["SIKISTIR", "RAKIBISIKISTIR", "SQUEEZE"].includes(normalized)) return "SQUEEZE";
  return null;
}

export function parseCaravanRoute(value: string): CaravanRoute | null {
  const normalized = normalizeGameChoice(value);
  if (["GUVENLI", "GUVENLIYOL", "SAFE"].includes(normalized)) return "SAFE";
  if (["DENGELI", "DENGELIYOL", "BALANCED"].includes(normalized)) return "BALANCED";
  if (["TEHLIKELI", "TEHLIKELIYOL", "DANGEROUS"].includes(normalized)) return "DANGEROUS";
  return null;
}

export const KINGS_DECISION_LABELS: Record<KingsDecision, string> = {
  COOPERATE: "İşbirliği",
  BETRAY: "İhanet"
};

export const CARAVAN_CHALLENGE_LABELS: Record<CaravanChallenge, string> = {
  TRADE: "Ticaret Sınaması",
  SECURITY: "Güvenlik Sınaması",
  TRAVEL: "Yolculuk Sınaması"
};

export function raceTrackPosition(score: number, target: number): number {
  if (!Number.isFinite(score) || !Number.isFinite(target) || target <= 0) return 0;
  return Math.max(0, Math.min(RACE_TRACK_STEPS, Math.floor(score / target * RACE_TRACK_STEPS)));
}

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
  "Saray arşivinden çıkan eski bir ferman iddialardan birini güçlendirdi; taraflar belgeyi kimin yorumlayacağını belirlemelidir.",
  "Meydanda toplanan halk görüşmelerin uzamasına öfkeli; anlaşma sağlanamazsa masanın itibarı sarsılacak.",
  "Tarafsız arabulucu yalnızca tek bir ikincil tavizin metne girmesine izin veriyor.",
  "Bir ticaret loncası anlaşmayı finanse etmeyi teklif etti; karşılığında kazanan taraftan ayrıcalık istiyor.",
  "Sınırdaki askerî hareketlilik müzakere süresini daralttı; elçiler kararlarını geciktiremeyecek.",
  "Dini önderler kan dökülmemesi şartıyla anlaşmayı destekleyeceklerini ilan etti.",
  "Gizli bir mektup taraflardan birinin niyetini tartışmalı hâle getirdi; güven sorunu masanın merkezine oturdu.",
  "Komşu şehirler alınacak kararın kendilerine de uygulanmasından korkuyor ve ek güvence talep ediyor.",
  "Kıtlık haberi ulaştı; ikincil tavizlerden biri tahıl veya hazine yardımı biçiminde yorumlanmalıdır.",
  "Müzakere salonundaki suikast söylentisi yüzünden heyetler yalnızca yazılı ve garantili taahhütleri kabul ediyor."
] as const;

export const DIPLOMACY_SCENARIOS = [
  {
    key: "PORT_CRISIS",
    title: "Tartışmalı Liman",
    description: "Fırtınada zarar gören stratejik limanın eski yönetimi çöktü. Üç devlet limanın askerî, ticari ve siyasi geleceğini belirlemek zorunda.",
    primary: ["Limanın tam egemenliğini ve gümrük gelirini almak", "Limanı tarafsızlaştırıp bütün savaş gemilerine kapatmak", "Limanı himaye altına alıp güvenliğini üstlenmek"],
    secondary: ["İki turluk ayrıcalıklı ticaret hakkı", "1.000 Altın yeniden inşa tazminatı", "Anlaşmanın tek diplomatik garantörü olmak"]
  },
  {
    key: "BORDER_CITY",
    title: "Sınır Şehri Krizi",
    description: "İki ticaret yolunu ve bir dağ geçidini denetleyen sınır şehri hükümdarsız kaldı. Halk, komşu devletlerin kararını bekliyor.",
    primary: ["Şehri doğrudan kendi devletine bağlamak", "Şehri silahsızlandırılmış bağımsız tampon bölge yapmak", "Şehri kendi himayesine alıp yerel yönetimi korumak"],
    secondary: ["Şehirde ayrıcalıklı ticaret mahallesi", "İki turluk askerî geçiş hakkı", "Sınır vergilerinden pay almak"]
  },
  {
    key: "ROYAL_SUCCESSION",
    title: "Veraset Bunalımı",
    description: "Varissiz hükümdarın ölümü sarayı üç hizbe böldü. Yanlış karar bir iç savaşı, doğru uzlaşma yeni bir siyasi düzeni doğurabilir.",
    primary: ["Kendi desteklediği hanedan adayını tahta çıkarmak", "Üç devletin denetlediği geçici naiplik konseyi kurmak", "Tahtı kaldırıp bağımsız şehir meclisi kurmak"],
    secondary: ["Hanedan evliliği ve miras hakkı", "Kraliyet hazinesinden tazminat", "Kalıcı diplomatik temsilcilik açmak"]
  },
  {
    key: "GRAIN_EMBARGO",
    title: "Tahıl Ablukası",
    description: "Kuraklık bölge ambarlarını boşalttı. Tahıl taşıyan filolar sınırda bekletilirken üç devlet kıtlığın bedelini kimin ödeyeceğine karar vermeli.",
    primary: ["Tahıl sevkiyatının önce kendi şehirlerine yönelmesini sağlamak", "Tahılı nüfusa göre tarafsız biçimde paylaştırmak", "Ablukayı kaldırma karşılığında bölgesel dağıtımı yönetmek"],
    secondary: ["Bir turluk gümrük muafiyeti", "Acil yardım için 1.000 Altın katkı", "Tahıl yollarının denetim hakkı"]
  },
  {
    key: "SACRED_SITE",
    title: "Kutsal Şehir Anlaşmazlığı",
    description: "Üç halkın da kutsal saydığı şehirde rahipler ve muhafızlar karşı karşıya geldi. Şehrin statüsü belirlenmezse mezhep çatışması başlayabilir.",
    primary: ["Kutsal şehrin koruyuculuğunu üstlenmek", "Şehri bütün inançlara açık tarafsız bölge ilan etmek", "Yerel ruhban meclisine siyasi özerklik vermek"],
    secondary: ["Hac yollarında vergi muafiyeti", "Tapınakların güvenlik sorumluluğu", "Dini törenlerde öncelik hakkı"]
  },
  {
    key: "ROYAL_HOSTAGE",
    title: "Kraliyet Rehinesi",
    description: "Bir taht varisi sınır çatışmasında esir düştü. İadesi, yargılanması veya siyasi güvence olarak tutulması savaş ile barış arasındaki çizgiyi belirleyecek.",
    primary: ["Varisin koşulsuz iadesini sağlamak", "Varisi tarafsız mahkemede yargılatmak", "Barış antlaşması tamamlanana kadar varisi güvence altında tutmak"],
    secondary: ["Fidye gelirinden pay", "İki turluk saldırmazlık güvencesi", "Esir değişiminin denetimini üstlenmek"]
  },
  {
    key: "PIRATE_LEAGUE",
    title: "Korsan Birliği Tehdidi",
    description: "Birleşen korsan filoları kıyı ticaretini felç etti. Üç devlet ortak harekâtın komutasını, masrafını ve ele geçirilen ganimeti paylaşmalı.",
    primary: ["Ortak filonun başkomutanlığını almak", "Kıyıları bölgesel sorumluluk alanlarına ayırmak", "Korsanlarla kontrollü af ve ticaret anlaşması yapmak"],
    secondary: ["Ele geçirilen gemilerden pay", "Sefer masrafları için 1.000 Altın katkı", "Kurtarılan limanlarda ticaret önceliği"]
  },
  {
    key: "CARAVAN_TOLL",
    title: "Büyük Kervan Yolu",
    description: "Yeni açılan kıtalar arası kervan yolu büyük gelir vaat ediyor. Geçiş vergisi, yol güvenliği ve pazar ayrıcalıkları konusunda üç devlet yarışıyor.",
    primary: ["Ana geçiş kapısını ve vergileri denetlemek", "Yolu vergisiz uluslararası ticaret koridoru yapmak", "Yol güvenliğini üstlenip koruma payı toplamak"],
    secondary: ["Başkentte kalıcı pazar yeri", "Kervanlara askerî refakat hakkı", "Gümrük gelirinden iki turluk pay"]
  }
] as const;

export function pickNonRepeatingValue<T>(
  values: readonly T[], recent: readonly T[], used: readonly T[] = [], random = Math.random
): T {
  if (!values.length) throw new Error("Seçilecek diplomasi içeriği bulunmuyor.");
  const recentSet = new Set(recent);
  const usedSet = new Set(used);
  let pool = values.filter((value) => !recentSet.has(value) && !usedSet.has(value));
  if (!pool.length) pool = values.filter((value) => !recentSet.has(value));
  if (!pool.length && recent.length) pool = values.filter((value) => value !== recent.at(-1));
  if (!pool.length) pool = [...values];
  return pool[Math.floor(random() * pool.length)]!;
}

export function diplomacyGoalKey(ownerCountryId: string, tier: "PRIMARY" | "SECONDARY"): string {
  return `${tier === "PRIMARY" ? "P" : "S"}:${ownerCountryId}`;
}

export interface DiplomacyGoalOption {
  key: string;
  ownerCountryId: string;
  tier: "PRIMARY" | "SECONDARY";
  text: string;
}

export function resolveDiplomacyGoalVote(
  countryIds: readonly string[],
  goals: readonly DiplomacyGoalOption[],
  primaryVotes: Readonly<Record<string, string>>,
  secondaryVotes: Readonly<Record<string, string>>,
  random = Math.random
): {
  primaryGoalKey: string;
  secondaryGoalKey: string | null;
  primaryWinnerId: string;
  secondaryWinnerId: string | null;
  influenceRolls: Record<string, number>;
} {
  if (countryIds.length !== 3) throw new Error("Diplomasi Masası tam olarak üç devlet gerektirir.");
  const goalByKey = new Map(goals.map((goal) => [goal.key, goal]));
  if (goalByKey.size !== goals.length) throw new Error("Diplomasi hedef anahtarları benzersiz olmalıdır.");
  for (const goal of goals) {
    if (!countryIds.includes(goal.ownerCountryId)) throw new Error("Diplomasi hedefinin sahibi masada bulunmuyor.");
  }

  const validateVote = (voterId: string, goalKey: string | undefined): DiplomacyGoalOption => {
    const goal = goalKey ? goalByKey.get(goalKey) : undefined;
    if (!goal) throw new Error("Bütün devletler geçerli hedeflere oy vermelidir.");
    if (goal.ownerCountryId === voterId) throw new Error("Bir devlet kendi diplomasi hedefine oy veremez.");
    return goal;
  };

  const primaryCounts = new Map<string, number>();
  for (const voterId of countryIds) {
    const goal = validateVote(voterId, primaryVotes[voterId]);
    primaryCounts.set(goal.key, (primaryCounts.get(goal.key) ?? 0) + 1);
  }
  const highestPrimaryCount = Math.max(...primaryCounts.values());
  const primaryCandidates = [...primaryCounts.keys()].filter((key) => primaryCounts.get(key) === highestPrimaryCount);
  const influenceRolls: Record<string, number> = {};
  let primaryGoalKey: string;
  if (primaryCandidates.length === 1) {
    primaryGoalKey = primaryCandidates[0]!;
  } else {
    primaryGoalKey = primaryCandidates.map((key) => {
      const roll = rollDie(20, random);
      influenceRolls[key] = roll;
      return { key, roll };
    }).sort((left, right) => right.roll - left.roll || left.key.localeCompare(right.key))[0]!.key;
  }
  const primaryGoal = goalByKey.get(primaryGoalKey)!;

  const secondaryCounts = new Map<string, number>();
  for (const voterId of countryIds) {
    const primaryVote = validateVote(voterId, primaryVotes[voterId]);
    const secondaryVote = validateVote(voterId, secondaryVotes[voterId]);
    if (primaryVote.key === secondaryVote.key) throw new Error("Ana ve ikincil sonuç için aynı hedef seçilemez.");
    if (secondaryVote.ownerCountryId === primaryGoal.ownerCountryId) continue;
    secondaryCounts.set(secondaryVote.key, (secondaryCounts.get(secondaryVote.key) ?? 0) + 1);
  }
  const secondaryGoalKey = [...secondaryCounts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0]?.[0] ?? null;
  return {
    primaryGoalKey,
    secondaryGoalKey,
    primaryWinnerId: primaryGoal.ownerCountryId,
    secondaryWinnerId: secondaryGoalKey ? goalByKey.get(secondaryGoalKey)!.ownerCountryId : null,
    influenceRolls
  };
}

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

const ACTION_LABELS: Record<string, string> = {
  "admin.panel.country.update": "Devlet bilgileri güncellendi",
  "admin.panel.settlement.update": "Yerleşke bilgileri güncellendi",
  "admin.panel.character.update": "Karakter bilgileri güncellendi",
  "admin.panel.character.assignment.cancel": "Karakter görevi iptal edildi",
  "admin.panel.army.update": "Ordu bilgileri güncellendi",
  "admin.panel.army.unit.update": "Ordu mevcudu güncellendi",
  "admin.panel.army.create": "Yeni ordu oluşturuldu",
  "CHARACTER_ASSIGN": "Karakter görevlendirildi",
  "CHARACTER_UNASSIGN": "Karakter görevi kaldırıldı",
  "ACADEMY_CHARACTER_CREATE": "Akademi karakteri oluşturuldu",
  "ACADEMY_CHARACTER_DISMISS": "Akademi karakteri görevden alındı",
  "DIPLOMAT_ASSIMILATION_ASSIGN": "Diplomat asimilasyona atandı",
  "CAPTURED_SPY_EXECUTED": "Tutsak casus idam edildi",
  "battle.create": "Savaş formu oluşturuldu",
  "battle.army.add": "Savaşa ordu eklendi",
  "battle.army.remove": "Savaştan ordu çıkarıldı",
  "battle.fleet.add": "Savaşa filo eklendi",
  "battle.fleet.remove": "Savaştan filo çıkarıldı",
  "battle.casualties.apply": "Savaş kayıpları uygulandı",
  "army.create": "Ordu oluşturuldu",
  "army.units.add": "Orduya asker eklendi",
  "army.units.remove": "Ordudan asker çıkarıldı",
  "army.commander.assign": "Orduya komutan atandı",
  "army.commander.remove": "Ordu komutanı kaldırıldı",
  "army.disband": "Ordu dağıtıldı",
  "fleet.create": "Filo oluşturuldu",
  "fleet.commander.assign": "Filoya amiral atandı",
  "fleet.commander.remove": "Filo amirali kaldırıldı",
  "fleet.disband": "Filo dağıtıldı",
  "naval.blockade.start": "Liman ablukası başlatıldı",
  "naval.blockade.lift": "Liman ablukası kaldırıldı",
  "naval.raid.start": "Deniz yağması başlatıldı",
  "naval.raid.resolve": "Deniz yağması sonuçlandırıldı",
  "naval.raid.cancel": "Deniz yağması iptal edildi",
  "STATE_WAR_DECLARE": "Resmî savaş ilan edildi",
  "STATE_WAR_FORCE_END": "Resmî savaş sona erdirildi",
  "MOVEMENT_ORDER_SUBMIT": "Hareket emri verildi",
  "MOVEMENT_ORDER_CANCEL": "Hareket emri iptal edildi",
  "MOVEMENT_ORDER_RESUME": "Hareket emri sürdürüldü",
  "FORMATION_POSITION": "Birlik konumu girildi",
  "FORMATION_POSITION_CORRECT": "Birlik konumu düzeltildi",
  "ARMY_SCOUT_ASSIGN": "Keşif birliği atandı",
  "ARMY_SCOUT_WITHDRAW": "Keşif birliği geri çekildi"
};

const ENTITY_LABELS: Record<string, string> = {
  country: "Devlet", settlement: "Yerleşke", character: "Karakter", army: "Ordu", fleet: "Filo",
  battle: "Savaş", naval_operation: "Deniz operasyonu", state_war: "Savaş ilanı",
  movement_order: "Hareket emri", map: "Harita", map_edge: "Harita geçişi", guild: "Oyun"
};

const FIELD_LABELS: Record<string, string> = {
  name: "Ad", treasury: "Hazine", mobilization: "Seferberlik", population: "Nüfus",
  slave_population: "Köle nüfusu", local_treasury: "Yerel hazine", tax_rate_percent: "Vergi oranı",
  base_land_trade_income: "Kara ticareti", ruin_stage: "Haraplık", is_coastal: "Kıyı",
  is_conquered: "Fetih durumu", skill_bonus: "Karakter puanı", specialization: "Uzmanlık",
  specialization_level: "Uzmanlık seviyesi", doctrine: "Doktrin", commander_victories: "Kara zaferi",
  admiral_specialization: "Amiral uzmanlığı", admiral_specialization_level: "Amiral uzmanlık seviyesi",
  admiral_doctrine: "Amiral doktrini", admiral_victories: "Deniz zaferi", commander_character_id: "Komutan",
  previousAssignment: "Önceki görev", merchantOperations: "Kapatılan tüccar görevi",
  diplomatOperations: "Kapatılan diplomat görevi", espionageOperations: "Kapatılan casusluk görevi",
  assimilationAssignments: "Kaldırılan asimilasyon görevi", armyCommands: "Kaldırılan ordu komutanlığı",
  fleetCommands: "Kaldırılan filo komutanlığı", battleCommands: "Kaldırılan savaş komutanlığı",
  unitType: "Birlik", quantity: "Yeni mevcut", previousQuantity: "Önceki mevcut", settlementId: "Yerleşke",
  targetSettlementId: "Hedef yerleşke", targetCountryId: "Hedef devlet", countryId: "Devlet",
  armyId: "Ordu", fleetId: "Filo", commanderId: "Komutan", characterId: "Karakter",
  side: "Taraf", terrain: "Savaş türü", total: "Toplam", loot: "Yağmalanan altın"
};

const VALUE_LABELS: Record<string, string> = {
  NONE: "Görevsiz", CURIA: "Curia", AGORA: "Agora / Forum", ARMY: "Ordu komutanlığı", FLEET: "Filo komutanlığı",
  ESPIONAGE: "Casusluk", ESPIONAGE_RETURNING: "Casusluktan dönüş", CAPTURED: "Tutsak",
  COUNTERINTELLIGENCE_COUNTRY: "Ülke karşı casusluğu", COUNTERINTELLIGENCE_SETTLEMENT: "Yerleşke karşı casusluğu",
  COUNTERINTELLIGENCE_TRAVELING_COUNTRY: "Ülke karşı casusluğuna intikal",
  COUNTERINTELLIGENCE_TRAVELING_SETTLEMENT: "Yerleşke karşı casusluğuna intikal",
  PERSONAL_GUARD: "Kişisel koruma", ASSIMILATION: "Asimilasyon", PEACE: "Barış",
  PARTIAL: "Kısmi seferberlik", GENERAL: "Genel seferberlik", true: "Evet", false: "Hayır"
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const IGNORED_FIELDS = new Set(["id", "guild_id", "country_id", "created_at", "updated_at"]);

export function auditActionLabel(action: string): string {
  if (ACTION_LABELS[action]) return ACTION_LABELS[action]!;
  return action.replaceAll(".", " ").replaceAll("_", " ").replace(/\s+/gu, " ").trim();
}

export function auditEntityTypeLabel(entityType: string): string {
  return ENTITY_LABELS[entityType] ?? entityType.replaceAll("_", " ");
}

export function collectAuditUuids(value: unknown, result = new Set<string>()): Set<string> {
  if (typeof value === "string" && UUID.test(value)) result.add(value);
  else if (Array.isArray(value)) value.forEach((item) => collectAuditUuids(item, result));
  else if (value && typeof value === "object") Object.values(value as Record<string, unknown>).forEach((item) => collectAuditUuids(item, result));
  return result;
}

function displayValue(value: unknown, names: ReadonlyMap<string, string>): string {
  if (value === null || value === undefined || value === "") return "Yok";
  if (typeof value === "boolean") return value ? "Evet" : "Hayır";
  if (typeof value === "number") return value.toLocaleString("tr-TR");
  if (typeof value === "string") {
    if (names.has(value)) return names.get(value)!;
    if (UUID.test(value)) return "Kayıt";
    return VALUE_LABELS[value] ?? value;
  }
  if (Array.isArray(value)) return value.map((item) => displayValue(item, names)).join(", ");
  return "Güncellendi";
}

export function auditDetailsSummary(details: unknown, names: ReadonlyMap<string, string>): string {
  if (!details || typeof details !== "object" || Array.isArray(details)) return "";
  const object = details as Record<string, unknown>;
  const previous = object.previous;
  const updated = object.updated;
  if (previous && updated && typeof previous === "object" && typeof updated === "object" && !Array.isArray(previous) && !Array.isArray(updated)) {
    const before = previous as Record<string, unknown>;
    const after = updated as Record<string, unknown>;
    const changes = Object.entries(after)
      .filter(([key, value]) => !IGNORED_FIELDS.has(key) && JSON.stringify(before[key]) !== JSON.stringify(value))
      .map(([key, value]) => `${FIELD_LABELS[key] ?? key}: ${displayValue(before[key], names)} → ${displayValue(value, names)}`);
    if (changes.length) return changes.slice(0, 6).join(" • ");
  }
  return Object.entries(object)
    .filter(([key, value]) => !IGNORED_FIELDS.has(key) && key !== "previous" && key !== "updated" && value !== null && value !== false && value !== 0)
    .map(([key, value]) => `${FIELD_LABELS[key] ?? key}: ${displayValue(value, names)}`)
    .slice(0, 6)
    .join(" • ");
}

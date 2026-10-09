const ACTION_LABELS: Record<string, string> = {
  "admin.panel.country.update": "Devlet bilgileri güncellendi",
  "admin.panel.settlement.update": "Yerleşke bilgileri güncellendi",
  "admin.panel.character.update": "Karakter bilgileri güncellendi",
  "admin.panel.character.assignment.cancel": "Karakter görevi iptal edildi",
  "admin.panel.dynasty.update": "Hanedan bilgileri güncellendi",
  "admin.panel.dynasty.member.add": "Hanedana yeni üye eklendi",
  "admin.panel.dynasty.member.update": "Hanedan üyesi güncellendi",
  "admin.panel.dynasty.member.death": "Hanedan üyesi öldü olarak işlendi",
  "admin.panel.dynasty.local_noble_marriage": "Yerel soylu evliliği yapıldı",
  "admin.panel.army.update": "Ordu bilgileri güncellendi",
  "admin.panel.army.unit.update": "Ordu mevcudu güncellendi",
  "admin.panel.army.create": "Yeni ordu oluşturuldu",
  "admin.panel.rebellion.update": "İsyan durumu güncellendi",
  "admin.panel.rebellion.calm": "İsyan gerilimi azaltıldı",
  "admin.panel.rebellion.escalate": "İsyan gerilimi yükseltildi",
  "admin.panel.rebellion.outbreak": "İsyan yönetici tarafından başlatıldı",
  "admin.panel.rebellion.suppress": "İsyan yönetici tarafından bastırıldı",
  "admin.panel.rebellion.clear_protection": "Ayaklanma koruması kaldırıldı",
  "admin.panel.battle.participant.add": "Aktif savaşa devlet eklendi",
  "admin.panel.battle.participant.remove": "Aktif savaştan devlet çıkarıldı",
  "admin.panel.battle.army.add": "Aktif savaşa ordu eklendi",
  "admin.panel.battle.army.remove": "Aktif savaştan ordu çıkarıldı",
  "admin.panel.battle.fleet.add": "Aktif deniz savaşına filo eklendi",
  "admin.panel.battle.fleet.remove": "Aktif deniz savaşından filo çıkarıldı",
  "admin.panel.battle.mercenary.add": "Aktif savaşa paralı asker eklendi",
  "admin.panel.battle.mercenary.remove": "Aktif savaştan paralı asker çıkarıldı",
  "admin.panel.battle.roster.unit.remove": "Savaş kadrosundan birlik çıkarıldı",
  "admin.panel.battle.roster.clear": "Manuel savaş kadrosu temizlendi",
  "admin.panel.ai.profile.update": "AI devlet profili güncellendi",
  "admin.panel.ai.test_mode.update": "AI test modu güncellendi",
  "admin.panel.ai.plan.generate": "AI devlet planı taslağı üretildi",
  "admin.panel.ai.plan.review": "AI devlet planı incelendi",
  "CHARACTER_ASSIGN": "Karakter görevlendirildi",
  "CHARACTER_UNASSIGN": "Karakter görevi kaldırıldı",
  "ACADEMY_CHARACTER_CREATE": "Akademi karakteri oluşturuldu",
  "ACADEMY_CHARACTER_DISMISS": "Akademi karakteri görevden alındı",
  "DIPLOMAT_ASSIMILATION_ASSIGN": "Diplomat asimilasyona atandı",
  "MISSIONARY_PURCHASE": "Misyoner alındı",
  "MISSIONARY_TASK_START": "Misyoner din değiştirme görevine gönderildi",
  "MISSIONARY_TASK_CANCEL": "Misyoner görevi iptal edildi",
  "CAPTURED_SPY_EXECUTED": "Tutsak casus idam edildi",
  "battle.create": "Savaş formu oluşturuldu",
  "battle.army.add": "Savaşa ordu eklendi",
  "battle.army.remove": "Savaştan ordu çıkarıldı",
  "battle.fleet.add": "Savaşa filo eklendi",
  "battle.fleet.remove": "Savaştan filo çıkarıldı",
  "battle.naval_cargo.assign": "Deniz savaşında taşınan ordu seçildi",
  "battle.naval_cargo.clear": "Deniz savaşında taşınan ordu temizlendi",
  "battle.naval_cargo.casualties": "Batan gemilerde taşınan asker kaybı işlendi",
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
  country: "Devlet", settlement: "Yerleşke", character: "Karakter", dynasty: "Hanedan", dynasty_member: "Hanedan üyesi", army: "Ordu", fleet: "Filo",
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
  diplomatOperations: "Kapatılan diplomat görevi", missionaryOperations: "Kapatılan Misyoner görevi",
  espionageOperations: "Kapatılan casusluk görevi", religionKey: "Din", cost: "Maliyet",
  assimilationAssignments: "Kaldırılan asimilasyon görevi", armyCommands: "Kaldırılan ordu komutanlığı",
  fleetCommands: "Kaldırılan filo komutanlığı", battleCommands: "Kaldırılan savaş komutanlığı",
  unitType: "Birlik", quantity: "Yeni mevcut", requestedQuantity: "Girilen miktar", previousQuantity: "Önceki mevcut",
  targetQuantity: "Yeni mevcut", operation: "İşlem", settlementId: "Yerleşke",
  plannedFactionName: "Planlanan isyancı adı", plannedFactionPersonnel: "Planlanan isyancı personeli",
  rebellionProgress: "İsyan gerilimi", factionType: "İsyan türü", unrestActive: "Huzursuzluk",
  recentUprisingUntilTurn: "Koruma bitiş turu", liveFactionName: "İsyancı grup adı",
  liveFactionPersonnel: "İsyancı personeli", liveFactionStatus: "İsyancı durumu",
  targetSettlementId: "Hedef yerleşke", targetCountryId: "Hedef devlet", countryId: "Devlet",
  armyId: "Ordu", fleetId: "Filo", commanderId: "Komutan", characterId: "Karakter",
  side: "Taraf", terrain: "Savaş türü", total: "Toplam", loot: "Yağmalanan altın",
  aggression: "Saldırganlık", riskTolerance: "Risk toleransı",
  reservePercent: "Hazine rezervi", strategicGoals: "Stratejik hedefler", enabled: "Planlamaya hazır",
  testModeEnabled: "AI test modu", automaticPlanning: "Otomatik planlama", automaticExecution: "Otomatik yürütme",
  turn: "Tur", revision: "Taslak sürümü", status: "Taslak durumu", model: "Model",
  executionApplied: "Oyun emri uygulandı", decision: "İnceleme kararı", reviewNote: "İnceleme notu",
  dynastyId: "Hanedan", title: "Unvan", relation: "Akrabalık", age: "Yaş", health: "Sağlık",
  diedTurn: "Ölüm turu", reason: "Ölüm nedeni", memberName: "Hanedan üyesi",
  spouseName: "Yerel soylu eş", spouseAge: "Eşin yaşı"
};

const VALUE_LABELS: Record<string, string> = {
  SET: "Toplamı ayarla", ADD: "Mevcuda ekle",
  NONE: "Görevsiz", CURIA: "Curia", AGORA: "Agora / Forum", ARMY: "Ordu komutanlığı", FLEET: "Filo komutanlığı",
  ESPIONAGE: "Casusluk", ESPIONAGE_RETURNING: "Casusluktan dönüş", CAPTURED: "Tutsak",
  COUNTERINTELLIGENCE_COUNTRY: "Ülke karşı casusluğu", COUNTERINTELLIGENCE_SETTLEMENT: "Yerleşke karşı casusluğu",
  COUNTERINTELLIGENCE_TRAVELING_COUNTRY: "Ülke karşı casusluğuna intikal",
  COUNTERINTELLIGENCE_TRAVELING_SETTLEMENT: "Yerleşke karşı casusluğuna intikal",
  PERSONAL_GUARD: "Kişisel koruma", ASSIMILATION: "Asimilasyon", PEACE: "Barış",
  PARTIAL: "Kısmi seferberlik", GENERAL: "Genel seferberlik", HEALTHY: "Sağlıklı", SICK: "Hasta",
  MALE: "Erkek", FEMALE: "Kadın", ALIVE: "Hayatta", DEAD: "Ölü", true: "Evet", false: "Hayır"
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const IGNORED_FIELDS = new Set(["id", "guild_id", "country_id", "created_at", "updated_at"]);

export function auditActionLabel(action: string): string {
  if (ACTION_LABELS[action]) return ACTION_LABELS[action]!;
  const normalized = action.toLocaleLowerCase("tr-TR");
  if (/(create|add|assign|start|declare)/u.test(normalized)) return "Yeni kayıt veya görevlendirme oluşturuldu";
  if (/(cancel|remove|delete|withdraw|end|lift|disband)/u.test(normalized)) return "Kayıt veya görevlendirme sona erdirildi";
  if (/(update|set|configure|correct|change)/u.test(normalized)) return "Kayıt bilgileri güncellendi";
  if (/(resolve|apply|finish|complete)/u.test(normalized)) return "İşlem sonuçlandırıldı";
  return "Sistem işlemi kaydedildi";
}

export function auditEntityTypeLabel(entityType: string): string {
  return ENTITY_LABELS[entityType] ?? "Oyun kaydı";
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
      .filter(([key, value]) => Boolean(FIELD_LABELS[key]) && !IGNORED_FIELDS.has(key) && JSON.stringify(before[key]) !== JSON.stringify(value))
      .map(([key, value]) => `${FIELD_LABELS[key]}: ${displayValue(before[key], names)} → ${displayValue(value, names)}`);
    if (changes.length) return changes.slice(0, 6).join(" • ");
  }
  return Object.entries(object)
    .filter(([key, value]) => Boolean(FIELD_LABELS[key]) && !IGNORED_FIELDS.has(key) && key !== "previous" && key !== "updated" && value !== null && value !== false && value !== 0)
    .map(([key, value]) => `${FIELD_LABELS[key]}: ${displayValue(value, names)}`)
    .slice(0, 6)
    .join(" • ");
}

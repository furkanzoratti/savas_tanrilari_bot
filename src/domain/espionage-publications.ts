import { ESPIONAGE_TARGETS, PLAYER_ESPIONAGE_TARGETS, type EspionageTarget } from "./espionage.js";

export type EspionagePublicationOutcome = "SUCCESS" | "FAILURE";
export type PlayerEspionageTarget = typeof PLAYER_ESPIONAGE_TARGETS[number];
export type EspionagePublicDetectionState = "UNTRACED" | "INTERVENTION_NOTICED" | "COUNTRY_IDENTIFIED" | "CAPTURED";

export const ESPIONAGE_PUBLICATION_PLACEHOLDERS = [
  { key: "yerleske", label: "Yerleşke adı", example: "Atina" },
  { key: "ulke", label: "Hedef devlet", example: "Trakya" },
  { key: "gorev", label: "Görev adı", example: "Hazine Çalma" },
  { key: "hedef", label: "Hedef kişi veya birim", example: "Kraliyet hazinesi" },
  { key: "etki", label: "Oyundaki sonuç", example: "2.400 Altın kaybedildi." },
  { key: "tur", label: "Sonuç turu", example: "38" },
  { key: "tespit", label: "Tespit bilgisi", example: "Saldırının arkasındaki güç tespit edilemedi." }
] as const;

export const ESPIONAGE_PUBLICATION_IMAGE_KEYS = [
  "recruitment-sabotage-success.png", "recruitment-sabotage-failure.png",
  "building-sabotage-success.png", "building-sabotage-failure.png",
  "income-sabotage-success.png", "income-sabotage-failure.png",
  "treasury-infiltration-success.png", "treasury-infiltration-failure.png",
  "incite-unrest-success.png", "incite-unrest-failure.png",
  "aggravate-event-success.png", "aggravate-event-failure.png",
  "production-sabotage-success.png", "production-sabotage-failure.png",
  "desertion-success.png", "desertion-failure.png",
  "poison-garrison-success.png", "poison-garrison-failure.png",
  "siege-supplies-destroyed-success.png", "siege-supplies-destroyed-failure.png",
  "assassination-success.png", "assassination-failure.png",
  "character-kidnap-success.png", "character-kidnap-failure.png",
  "noble-kidnap-success.png", "noble-kidnap-failure.png",
  "captured-spy-success.png", "captured-spy-failure.png",
  "spy-untraced.png", "spy-country-identified.png"
] as const;

export type EspionagePublicationImageKey = typeof ESPIONAGE_PUBLICATION_IMAGE_KEYS[number];

export interface EspionagePublicationTemplate {
  targetType: PlayerEspionageTarget;
  targetLabel: string;
  outcome: EspionagePublicationOutcome;
  titleTemplate: string;
  bodyTemplate: string;
  imageKey: EspionagePublicationImageKey | null;
  enabled: boolean;
}

type TemplateSeed = Omit<EspionagePublicationTemplate, "targetType" | "targetLabel" | "outcome" | "enabled">;

const seed = (
  successTitle: string,
  successBody: string,
  failureTitle: string,
  failureBody: string,
  successImage: EspionagePublicationImageKey | null,
  failureImage: EspionagePublicationImageKey | null
): Record<EspionagePublicationOutcome, TemplateSeed> => ({
  SUCCESS: { titleTemplate: successTitle, bodyTemplate: successBody, imageKey: successImage },
  FAILURE: { titleTemplate: failureTitle, bodyTemplate: failureBody, imageKey: failureImage }
});

const TEMPLATE_SEEDS: Record<PlayerEspionageTarget, Record<EspionagePublicationOutcome, TemplateSeed>> = {
  RECRUITMENT_SABOTAGE: seed(
    "⚔️ {{yerleske}}’de Asker Alımı Sabote Edildi",
    "Kışla kayıtları ile erzak sevkiyatları değiştirilerek birliklerin zamanında toplanması engellendi.\n\n**Sonuç:** {{etki}}",
    "🛡️ {{yerleske}} Kışlalarında Sabotaj Önlenmiş",
    "Görevliler değiştirilmiş kayıtları zamanında fark etti; alım düzeni ve teslim takvimi korundu.\n\n**Sonuç:** {{etki}}",
    "recruitment-sabotage-success.png", "recruitment-sabotage-failure.png"
  ),
  CONSTRUCTION: seed(
    "🏗️ {{yerleske}}’de İnşaat Sabotajı",
    "**{{hedef}}** şantiyesinin planları değiştirildi, malzemeleri bozularak çalışmalar sekteye uğratıldı.\n\n**Sonuç:** {{etki}}",
    "🔨 {{yerleske}}’de İnşaat Sabotajı Önlenmiş",
    "Ustalar **{{hedef}}** planlarındaki müdahaleyi zamanında fark ederek şantiyeyi güvence altına aldı.\n\n**Sonuç:** {{etki}}",
    "building-sabotage-success.png", "building-sabotage-failure.png"
  ),
  PRODUCTION_SABOTAGE: seed(
    "🛠️ {{yerleske}} Kuşatma Atölyelerinde Sabotaj",
    "Üretim kalıpları ile kritik parçalar sabote edilerek atölye takvimi aksatıldı.\n\n**Sonuç:** {{etki}}",
    "🛡️ {{yerleske}} Kuşatma Atölyeleri Korundu",
    "Denetçiler değiştirilmiş parçaları üretime girmeden buldu; atölyelerin çalışma düzeni korundu.\n\n**Sonuç:** {{etki}}",
    "production-sabotage-success.png", "production-sabotage-failure.png"
  ),
  INCOME_SABOTAGE: seed(
    "📉 {{yerleske}}’nin Gelir Düzeni Sabote Edildi",
    "Sahte hesaplar ve değiştirilen vergi kayıtları yerleşkenin mali düzenini zarara uğrattı.\n\n**Sonuç:** {{etki}}",
    "📜 {{yerleske}}’de Mali Sabotaj Önlenmiş",
    "Mali görevliler sahte kayıtları zamanında ortaya çıkararak vergi ve pazar gelirlerini korudu.\n\n**Sonuç:** {{etki}}",
    "income-sabotage-success.png", "income-sabotage-failure.png"
  ),
  TREASURY_INFILTRATION: seed(
    "💰 {{yerleske}} Hazinesi Soyuldu",
    "Taklit edilen mühürlerle hazineye sızıldı ve nöbet değişimi sırasında altınlar dışarı çıkarıldı.\n\n**Sonuç:** {{etki}}",
    "🔐 {{yerleske}} Hazinesi Korundu",
    "Gece nöbetçileri sızma girişimini durdurdu; kasa ve mali kayıtlar zarar görmedi.\n\n**Sonuç:** {{etki}}",
    "treasury-infiltration-success.png", "treasury-infiltration-failure.png"
  ),
  INCITE_PUBLIC: seed(
    "🔥 {{yerleske}} Sokaklarında Huzursuzluk",
    "Yayılan söylentiler ve kışkırtıcı konuşmalar halk arasındaki hoşnutsuzluğu büyüttü.\n\n**Sonuç:** {{etki}}",
    "🕊️ {{yerleske}}’de Kışkırtma Sonuçsuz Kaldı",
    "Asılsız söylentiler karşılık bulmadı; yerel görevliler kalabalığı yatıştırarak düzeni korudu.\n\n**Sonuç:** {{etki}}",
    "incite-unrest-success.png", "incite-unrest-failure.png"
  ),
  AGGRAVATE_EVENT: seed(
    "🌪️ {{yerleske}}’deki Kriz Körüklendi",
    "Kimliği belirsiz kişiler mevcut krizi ve halkın korkularını kullanarak gerilimi büyüttü.\n\n**Sonuç:** {{etki}}",
    "🕯️ {{yerleske}}’de Krizi Körükleme Girişimi Önlenmiş",
    "Krizden yararlanmak isteyen kışkırtıcıların yaydığı haberler etkisiz kaldı.\n\n**Sonuç:** {{etki}}",
    "aggravate-event-success.png", "aggravate-event-failure.png"
  ),
  DESERTION: seed(
    "🏃 {{ulke}} Ordusunda Toplu Firar",
    "Sahte emirler ve yayılan söylentiler bazı askerleri saflarını terk etmeye sürükledi.\n\n**Sonuç:** {{etki}}",
    "🛡️ {{ulke}} Ordusunda Firar Girişimi Önlenmiş",
    "Komutanlar sahte emirleri ele geçirerek askerler arasındaki kışkırtıcı ağı dağıttı.\n\n**Sonuç:** {{etki}}",
    "desertion-success.png", "desertion-failure.png"
  ),
  POISON_GARRISON: seed(
    "☠️ {{yerleske}} Garnizonu Zehirlendi",
    "Garnizonun erzak ve su kaynaklarına karıştırılan zehir askerleri etkisiz hâle getirdi.\n\n**Sonuç:** {{etki}}",
    "🧪 {{yerleske}}’de Zehirleme Girişimi Önlenmiş",
    "Şüpheli erzak dağıtıma girmeden durduruldu ve su kaynakları güvence altına alındı.\n\n**Sonuç:** {{etki}}",
    "poison-garrison-success.png", "poison-garrison-failure.png"
  ),
  DESTROY_SIEGE_SUPPLIES: seed(
    "🔥 {{yerleske}} Kuşatmasında Erzak Depoları Yakıldı",
    "Gece çıkarılan yangın savunma için ayrılan erzak ve kuşatma stoklarını kullanılamaz hâle getirdi.\n\n**Sonuç:** {{etki}}",
    "🧯 {{yerleske}} Kuşatma Erzağı Kurtarıldı",
    "Depolarda çıkarılan yangın büyümeden söndürüldü ve savunma stokları korundu.\n\n**Sonuç:** {{etki}}",
    "siege-supplies-destroyed-success.png", "siege-supplies-destroyed-failure.png"
  ),
  CHARACTER_ASSASSINATE: seed(
    "🗡️ {{hedef}} Suikasta Uğradı",
    "**{{hedef}}**, {{yerleske}}’de düzenlenen planlı bir saldırının hedefi oldu.\n\n**Sonuç:** {{etki}}",
    "🛡️ {{hedef}} Suikasttan Kurtuldu",
    "Muhafızlar saldırıyı son anda engelleyerek **{{hedef}}** adlı kişiyi güvenli bir yere götürdü.\n\n**Sonuç:** {{etki}}",
    "assassination-success.png", "assassination-failure.png"
  ),
  CHARACTER_KIDNAP: seed(
    "⛓️ {{hedef}} Kaçırıldı",
    "**{{hedef}}**, {{yerleske}}’de düzenlenen gizli bir operasyonla kaçırıldı.\n\n**Sonuç:** {{etki}}",
    "🛡️ {{hedef}} İçin Kaçırma Girişimi Önlenmiş",
    "Muhafızlar kaçırma girişimini bozarak **{{hedef}}** adlı kişiyi koruma altına aldı.\n\n**Sonuç:** {{etki}}",
    "character-kidnap-success.png", "character-kidnap-failure.png"
  ),
  NOBLE_ASSASSINATE: seed(
    "🗡️ Hanedan Mensubu {{hedef}} Suikasta Uğradı",
    "Başkent {{yerleske}}’de hanedan mensubu **{{hedef}}** hedef alınarak bir saldırı düzenlendi.\n\n**Sonuç:** {{etki}}",
    "🏛️ {{hedef}} İçin Suikast Girişimi Önlenmiş",
    "Başkent muhafızları saldırıyı bozarak hanedan mensubu **{{hedef}}** adlı kişiyi koruma altına aldı.\n\n**Sonuç:** {{etki}}",
    "assassination-success.png", "assassination-failure.png"
  ),
  NOBLE_KIDNAP: seed(
    "⛓️ Hanedan Mensubu {{hedef}} Kaçırıldı",
    "Hanedan mensubu **{{hedef}}**, başkent {{yerleske}}’de düzenlenen gizli bir operasyonla kaçırıldı.\n\n**Sonuç:** {{etki}}",
    "🏛️ {{hedef}} İçin Kaçırma Girişimi Önlenmiş",
    "Başkent muhafızları kurulan tuzağı bozarak hanedan mensubu **{{hedef}}** adlı kişiyi güvenli biçimde saraya ulaştırdı.\n\n**Sonuç:** {{etki}}",
    "noble-kidnap-success.png", "noble-kidnap-failure.png"
  )
};

export const ESPIONAGE_PUBLICATION_DEFAULTS: readonly EspionagePublicationTemplate[] = PLAYER_ESPIONAGE_TARGETS.flatMap((targetType) =>
  (["SUCCESS", "FAILURE"] as const).map((outcome) => ({
    targetType,
    targetLabel: ESPIONAGE_TARGETS[targetType as EspionageTarget].label,
    outcome,
    ...TEMPLATE_SEEDS[targetType][outcome],
    enabled: true
  }))
);

export function espionagePublicationTemplate(targetType: string, outcome: string): EspionagePublicationTemplate | undefined {
  return ESPIONAGE_PUBLICATION_DEFAULTS.find((item) => item.targetType === targetType && item.outcome === outcome);
}

export function espionagePublicDetectionState(
  detectionLevel: number | null,
  captured: boolean
): EspionagePublicDetectionState {
  if (captured || (detectionLevel ?? 0) >= 3) return "CAPTURED";
  if (detectionLevel === 2) return "COUNTRY_IDENTIFIED";
  if (detectionLevel === 1) return "INTERVENTION_NOTICED";
  return "UNTRACED";
}

export function espionagePublicDetectionImage(
  detectionLevel: number | null,
  captured: boolean
): EspionagePublicationImageKey {
  const state = espionagePublicDetectionState(detectionLevel, captured);
  if (state === "CAPTURED") return "captured-spy-success.png";
  if (state === "COUNTRY_IDENTIFIED") return "spy-country-identified.png";
  if (state === "INTERVENTION_NOTICED") return "captured-spy-failure.png";
  return "spy-untraced.png";
}

export function espionagePublicDetectionDisclosure(input: {
  detectionLevel:number|null;
  captured:boolean;
  attackerCountryName:string;
  spyName:string;
}): string {
  const state=espionagePublicDetectionState(input.detectionLevel,input.captured);
  if (state === "CAPTURED") {
    return `Muhafızlar izleri takip ederek operasyonun **${input.attackerCountryName}** adına yürütüldüğünü ortaya çıkardı. **${input.spyName}** yakalandı.`;
  }
  if (state === "COUNTRY_IDENTIFIED") {
    return `Casus kaçmayı başardı; ancak geride kalan deliller operasyonun **${input.attackerCountryName}** adına yürütüldüğünü gösterdi.`;
  }
  if (state === "INTERVENTION_NOTICED") {
    return "Olayın ardında yabancı bir müdahale olduğu anlaşıldı; casus izini kaybettirerek kaçtı.";
  }
  return "Muhafızların araştırmasına rağmen casusa veya onu gönderen devlete ulaşan hiçbir iz bulunamadı.";
}

export function espionagePublicationPlaceholders(value: string): string[] {
  return [...value.matchAll(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/gu)].map((match) => match[1] ?? "");
}

export function renderEspionagePublication(value: string, variables: Record<string, string | number>): string {
  return value.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/gu, (_match, key: string) => String(variables[key] ?? `{{${key}}}`));
}

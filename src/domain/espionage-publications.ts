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
    "⚔️ {{yerleske}}’de Asker Alımı Aksadı",
    "Kışla kayıtları ile erzak sayımları birbirini tutmadı. Yeni askerlerin toplanması ciddi biçimde aksadı. **Sonuç:** {{etki}}",
    "🛡️ {{yerleske}} Kışlalarında Sabotaj Girişimi",
    "Muhafızlar değiştirilmiş kayıtları zamanında fark etti ve asker alımı kesintiye uğramadı. {{tespit}}",
    "recruitment-sabotage-success.png", "recruitment-sabotage-failure.png"
  ),
  CONSTRUCTION: seed(
    "🏗️ {{yerleske}}’de İnşaat Sabotajı",
    "Şantiye ölçüleri ve yapı malzemeleri kasıtlı olarak bozuldu. Çalışmalar durdurulurken sorumlular aranıyor. **Sonuç:** {{etki}}",
    "🔨 {{yerleske}}’de Şüpheli Müdahale Önlenmiş",
    "Ustalar yapı planlarındaki değişikliği erkenden fark etti. İnşaat güvenli biçimde devam ediyor. {{tespit}}",
    "production-sabotage-success.png", "production-sabotage-failure.png"
  ),
  PRODUCTION_SABOTAGE: seed(
    "🛠️ {{yerleske}} Kuşatma Atölyelerinde Sabotaj",
    "Atölyedeki kritik parçalar ve üretim kalıpları kullanılamaz hâle getirildi. **Sonuç:** {{etki}}",
    "🛡️ Kuşatma Atölyeleri Korundu",
    "Denetçiler bozulmuş parçaları üretime girmeden buldu; kuşatma aleti üretimi zarar görmedi. {{tespit}}",
    "building-sabotage-success.png", "building-sabotage-failure.png"
  ),
  INCOME_SABOTAGE: seed(
    "📉 {{yerleske}} Pazarlarında Gelir Kaybı",
    "Sahte kayıtlar, kayıp mühürler ve yönü değiştirilen vergiler şehrin gelirini düşürdü. **Sonuç:** {{etki}}",
    "📜 Sahte Mali Kayıtlar Yakalandı",
    "Mali görevliler hesap defterlerindeki tutarsızlığı zamanında ortaya çıkardı. Gelir akışı korundu. {{tespit}}",
    "income-sabotage-success.png", "income-sabotage-failure.png"
  ),
  TREASURY_INFILTRATION: seed(
    "💰 {{yerleske}} Hazinesine Sızıldı",
    "Hazine mühürleri gizlice açıldı ve muhafız değişimi sırasında değerli sandıklar kayboldu. **Sonuç:** {{etki}}",
    "🔐 {{yerleske}} Hazinesi Korundu",
    "Gece nöbetçileri hazineye girmeye çalışan yabancıları durdurdu. Kasa ve kayıtlar zarar görmedi. {{tespit}}",
    "treasury-infiltration-success.png", "treasury-infiltration-failure.png"
  ),
  INCITE_PUBLIC: seed(
    "🔥 {{yerleske}} Sokaklarında Huzursuzluk",
    "Yayılan söylentiler ve kışkırtıcı konuşmalar kalabalıkları harekete geçirdi. **Sonuç:** {{etki}}",
    "🕊️ {{yerleske}}’de Kışkırtma Sonuçsuz Kaldı",
    "Halk arasında yayılan asılsız söylentiler şehir görevlilerince yatıştırıldı. {{tespit}}",
    "aggravate-event-success.png", "aggravate-event-failure.png"
  ),
  AGGRAVATE_EVENT: seed(
    "🌪️ {{yerleske}}’de Kriz Derinleşti",
    "Kimliği belirsiz kışkırtıcılar mevcut sıkıntıları büyüttü ve şehirdeki gerilimi artırdı. **Sonuç:** {{etki}}",
    "🕯️ {{yerleske}}’de Provokasyon Sonuçsuz Kaldı",
    "Krizden yararlanmak isteyen kişilerin yaydığı söylentiler karşılık bulmadı. {{tespit}}",
    "incite-unrest-success.png", "incite-unrest-failure.png"
  ),
  DESERTION: seed(
    "🏃 {{yerleske}} Birliklerinde Firar",
    "Sahte emirler ve kasıtlı söylentiler askerlerin bir bölümünü saflarını terk etmeye yöneltti. **Sonuç:** {{etki}}",
    "🛡️ Firar Ağı Ortaya Çıkarıldı",
    "Komutanlar sahte emirleri zamanında ele geçirdi ve birlik düzeni korundu. {{tespit}}",
    "desertion-success.png", "desertion-failure.png"
  ),
  POISON_GARRISON: seed(
    "☠️ {{yerleske}} Garnizonunda Zehirlenme",
    "Garnizonun erzak ve su kaynaklarına zehir karıştırıldığı anlaşıldı. **Sonuç:** {{etki}}",
    "🧪 Zehirleme Girişimi Önlenmiş",
    "Şüpheli erzak sevkiyatı dağıtılmadan durduruldu; garnizon kayıp vermedi. {{tespit}}",
    "poison-garrison-success.png", "poison-garrison-failure.png"
  ),
  DESTROY_SIEGE_SUPPLIES: seed(
    "🔥 {{yerleske}}’de Kuşatma Erzağı Yakıldı",
    "Gece çıkan yangın kuşatma için ayrılan erzak ve malzemeleri kullanılamaz hâle getirdi. **Sonuç:** {{etki}}",
    "🧯 Kuşatma Erzağı Kurtarıldı",
    "Depolarda başlayan yangın hızla söndürüldü ve kuşatma stokları korundu. {{tespit}}",
    "siege-supplies-destroyed-success.png", "siege-supplies-destroyed-failure.png"
  ),
  CHARACTER_ASSASSINATE: seed(
    "🗡️ {{yerleske}}’de Kanlı Saldırı",
    "{{hedef}} kimliği belirsiz bir saldırganın hedefi oldu. **Sonuç:** {{etki}}",
    "🛡️ {{hedef}} Suikasttan Kurtuldu",
    "Muhafızlar saldırıyı son anda engelledi. Hedef güvenli bir yere götürüldü. {{tespit}}",
    "assassination-success.png", "assassination-failure.png"
  ),
  CHARACTER_KIDNAP: seed(
    "⛓️ {{yerleske}}’de Karakter Kaçırıldı",
    "{{hedef}} son görüldüğü yerden iz bırakmadan kayboldu. **Sonuç:** {{etki}}",
    "🛡️ {{hedef}} İçin Kaçırma Girişimi",
    "Kaçırma girişimi muhafızların müdahalesiyle başarısız oldu. {{tespit}}",
    "character-kidnap-success.png", "character-kidnap-failure.png"
  ),
  NOBLE_ASSASSINATE: seed(
    "🗡️ {{yerleske}} Soylularına Saldırı",
    "Hanedan mensubu {{hedef}} hedef alınarak saray çevresinde kanlı bir saldırı düzenlendi. **Sonuç:** {{etki}}",
    "🏛️ Hanedan Mensubuna Suikast Önlenmiş",
    "{{hedef}} için hazırlanan saldırı başkent muhafızlarınca engellendi. {{tespit}}",
    "assassination-success.png", "assassination-failure.png"
  ),
  NOBLE_KIDNAP: seed(
    "⛓️ {{yerleske}}’de Soylu Kaçırıldı",
    "Hanedan mensubu {{hedef}} başkentte düzenlenen gizli bir operasyonla kaçırıldı. **Sonuç:** {{etki}}",
    "🏛️ Soylu Kaçırma Girişimi Önlenmiş",
    "{{hedef}} için kurulan tuzak başkent muhafızlarınca bozuldu. {{tespit}}",
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
    return `Operasyonun **${input.attackerCountryName}** tarafından yürütüldüğü ortaya çıktı. **${input.spyName}** yakalandı.`;
  }
  if (state === "COUNTRY_IDENTIFIED") {
    return `Casus kaçmayı başardı; ancak operasyonun arkasında **${input.attackerCountryName}** olduğu tespit edildi.`;
  }
  if (state === "INTERVENTION_NOTICED") {
    return "Yabancı müdahale fark edildi; casus yakalanmadan kaçmayı başardı. Kaynak ülke belirlenemedi.";
  }
  return "Operasyonun ardından casusa veya onu gönderen devlete ulaşan hiçbir iz bulunamadı.";
}

export function espionagePublicationPlaceholders(value: string): string[] {
  return [...value.matchAll(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/gu)].map((match) => match[1] ?? "");
}

export function renderEspionagePublication(value: string, variables: Record<string, string | number>): string {
  return value.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/gu, (_match, key: string) => String(variables[key] ?? `{{${key}}}`));
}

import type { CultureGroup } from "./cultures.js";
import type { RebelFactionType } from "./stability.js";

export interface RebelLeaderProfile {
  name: string;
  skillBonus: 1 | 2 | 3;
}

const regionalNames: Partial<Record<CultureGroup, readonly [readonly string[], readonly string[]]>> = {
  BRITTONIC: [["Caratacos", "Cunobelinos", "Brennos", "Tasciovanos"], ["ap Catuvellaun", "ap Brigantos", "Demir Yeminli"]],
  CELTIC: [["Brennos", "Vercassivellaunos", "Dumnorix", "Orgetorix"], ["Arvern", "Aedui", "Bozkurt"]],
  GERMANIC: [["Arminius", "Segimer", "Inguiomer", "Ariovistus"], ["Cherusk", "Suebi", "Kartal"]],
  BALTIC: [["Svelgatas", "Vilikaila", "Dausprungas", "Ringaudas"], ["Auksas", "Perkunas", "Kurt"]],
  IBERIAN: [["Indibilis", "Mandonius", "Istolatius", "Retogenes"], ["Ilerget", "Arevak", "Tagus"]],
  ITALIC: [["Marcus", "Titus", "Aulus", "Gaius"], ["Varro", "Corvinus", "Flaccus", "Drusus"]],
  ILLYRO_PANNONIAN: [["Bato", "Monunius", "Pleuratus", "Teuta"], ["Daesitiates", "Dardan", "Taulant"]],
  DACO_GETIC: [["Dromichaites", "Cotiso", "Rholes", "Zalmodegikos"], ["Getas", "Daos", "Karp"]],
  THRACIAN: [["Seuthes", "Kotys", "Rhascuporis", "Teres"], ["Odrys", "Bessos", "Haimos"]],
  HELLENIC: [["Damon", "Leontes", "Nikandros", "Kallias"], ["Kallistratos", "Philokrates", "Andronikos", "Soter"]],
  PUNIC: [["Hanno", "Mago", "Bomilcar", "Hasdrubal"], ["Barcid", "Giskonid", "Adonibaal", "Melqart"]],
  BERBER: [["Massin", "Naravas", "Tacfarinas", "Mazipa"], ["Aures", "Numid", "Atlas"]],
  LIBYAN: [["Inaros", "Adicran", "Tefnakht", "Osorkon"], ["Libu", "Marmarid", "Batı Çölü"]],
  EGYPTIAN: [["Pamenes", "Hori", "Nakht", "Djedhor"], ["Amunhotep", "Meryra", "Saisli", "Memfisli"]],
  KUSHITIC: [["Arkamani", "Nastasen", "Akinidad", "Amanikhabale"], ["Meroeli", "Napatalı", "Kandake"]],
  HABESHA: [["Zoskales", "Gersem", "Mahrem", "Ela"], ["Aksumlu", "Adulisli", "Dağ Aslanı"]],
  ARABIAN: [["Zayd", "Malik", "Harith", "Rabi'a"], ["el-Kindi", "en-Nabati", "el-Ezdi", "Teymalı"]],
  LEVANTINE: [["Abdmelqart", "Mattanos", "Azimilk", "Yatonbaal"], ["Surî", "Sidonî", "Bybloslu", "Eshmun"]],
  MESOPOTAMIAN: [["Nabû-bel", "Marduk-nasir", "Bel-iddin", "Shamash-eriba"], ["Uruklu", "Nippurlu", "Keldani"]],
  ANATOLIAN: [["Ariarathes", "Zipoites", "Manes", "Pylamenes"], ["Halysli", "Kappadok", "Paflagon"]],
  ARMENIAN: [["Vardan", "Tigran", "Artavazd", "Zariadres"], ["Mamikon", "Arshakuni", "Hayk"]],
  CAUCASIAN: [["Pharnavaz", "Kuji", "Saurmag", "Artag"], ["Kartli", "Kolhis", "Kafkas"]],
  SARMATIAN: [["Amage", "Skopasis", "Saumakos", "Palakos"], ["Roxolan", "Iazyg", "Bozkır"]],
  SCYTHIAN: [["Ateas", "Skyles", "Idanthyrsos", "Octamasadas"], ["Saka", "Borysthen", "Altın Yay"]],
  WEST_IRANIAN: [["Artaban", "Vardanes", "Mithradates", "Gotarzes"], ["Surena", "Karen", "Mihran", "Ateş Yeminli"]],
  EAST_IRANIAN: [["Oxyartes", "Spitamenes", "Arsames", "Bessos"], ["Baktriyalı", "Sogdlu", "Hindukuş"]],
  GANDHARAN: [["Taxiles", "Ambhi", "Sanjaya", "Pushkara"], ["Gandharalı", "İnduslu", "Takşasilalı"]],
  MADHYADESHI: [["Virata", "Jayatsena", "Udayana", "Prasenajit"], ["Pançalalı", "Kuru", "Yamunalı"]],
  MAGADHAN: [["Ajatashatru", "Udayin", "Shishunaga", "Mahapadma"], ["Magadhalı", "Pataliputralı", "Ganjlı"]],
  KALINGAN: [["Kharavela", "Mahamegh", "Vakradeva", "Lalatendra"], ["Kalingalı", "Dantapuralı", "Mahendralı"]],
  MAHARASHTRI: [["Simuka", "Kanha", "Satakarni", "Hala"], ["Pratişthanalı", "Dekanlı", "Godavari"]],
  ANDHRA: [["Gautamiputra", "Pulumavi", "Yajna", "Sivasvati"], ["Andhralı", "Krishnalı", "Amaravatili"]],
  TAMIL: [["Karikala", "Neduncheliyan", "Senguttuvan", "Perunarkilli"], ["Chola", "Pandya", "Chera"]],
  SOUTHEAST_ASIAN: [["Soma", "Kaundinya", "Jayavarman", "Rudravarman"], ["Mekonglu", "Funanlı", "Denizdoğan"]],
  UNASSIGNED: [["Ariston", "Dagan", "Varro", "Brennos"], ["Halk Önderi", "Özgür", "Demir Yeminli"]]
};

function stableHash(value: string): number {
  let hash = 2166136261;
  for (const char of value) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return hash >>> 0;
}

export function rebelLeaderProfile(input: {
  cultureGroup: CultureGroup | string | null | undefined;
  factionType: RebelFactionType;
  settlementName: string;
  seed: string;
}): RebelLeaderProfile {
  const culture = (input.cultureGroup ?? "UNASSIGNED") as CultureGroup;
  const [firstNames, epithets] = regionalNames[culture] ?? regionalNames.UNASSIGNED!;
  const hash = stableHash(`${input.seed}:${input.settlementName}:${input.factionType}:${culture}`);
  const first = firstNames[hash % firstNames.length]!;
  const epithet = epithets[Math.floor(hash / firstNames.length) % epithets.length]!;
  return { name: `${first} ${epithet}`, skillBonus: (1 + (Math.floor(hash / 97) % 3)) as 1 | 2 | 3 };
}

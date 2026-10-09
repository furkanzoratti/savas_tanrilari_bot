import type {CultureGroup} from "./cultures.js";
import type {DynastyGender} from "./dynasty.js";

type CulturalNamePool={MALE:readonly string[];FEMALE:readonly string[]};

const MEDITERRANEAN={
  MALE:["Alexandros","Demetrios","Nikandros","Philotas","Theodoros","Leonidas"],
  FEMALE:["Helena","Kleopatra","Laodike","Berenike","Thaleia","Nikaia"]
} as const;

export const DYNASTY_CULTURAL_NAMES:Partial<Record<CultureGroup,CulturalNamePool>>={
  BRITTONIC:{MALE:["Caratacos","Cunobelin","Bran","Cingetorix","Tasciovanus","Adminius"],FEMALE:["Boudica","Cartimandua","Aife","Briga","Eirwen","Rhiannon"]},
  CELTIC:{MALE:["Brennos","Ambiorix","Caturix","Orgetorix","Dumnorix","Vercassivellaunos"],FEMALE:["Chiomara","Onomaris","Aunia","Camma","Rigantona","Eponina"]},
  GERMANIC:{MALE:["Ariovistus","Segimer","Arminius","Inguiomer","Malorix","Theudomer"],FEMALE:["Thusnelda","Ganna","Veleda","Albruna","Swanhild","Himiltrude"]},
  BALTIC:{MALE:["Brutenis","Widewutis","Skomantas","Dargis","Gintaras","Mantigirdas"],FEMALE:["Austeja","Birute","Laima","Daina","Gintare","Vaidilute"]},
  IBERIAN:{MALE:["Indibilis","Mandonius","Istolatius","Orison","Retogenes","Tanginus"],FEMALE:["Himilce","Aunia","Belesa","Iltirta","Nertis","Turtola"]},
  ITALIC:{MALE:["Lucius","Marcus","Gaius","Quintus","Tiberius","Aulus"],FEMALE:["Julia","Cornelia","Livia","Claudia","Tullia","Aemilia"]},
  ILLYRO_PANNONIAN:{MALE:["Bato","Pinnes","Monunius","Gentius","Pleuratus","Skerdilaidas"],FEMALE:["Teuta","Etuta","Bircenna","Triteuta","Cinna","Audata"]},
  DACO_GETIC:{MALE:["Dromichaetes","Oroles","Rhemaxos","Cotiso","Zalmodegikos","Rubobostes"],FEMALE:["Dapyxana","Zia","Bendis","Dierna","Rhemaxa","Cotisa"]},
  THRACIAN:{MALE:["Seuthes","Cotys","Teres","Rhoemetalces","Sadalas","Amadocus"],FEMALE:["Meda","Pythodoris","Antonia Tryphaina","Gepaepyris","Bendis","Rhescuporis"]},
  HELLENIC:MEDITERRANEAN,
  PUNIC:{MALE:["Hanno","Mago","Bomilcar","Hasdrubal","Hamilcar","Adherbal"],FEMALE:["Sophonisba","Elissa","Salammbo","Baalhanno","Arishat","Tanitbaal"]},
  BERBER:{MALE:["Massinissa","Syphax","Gala","Vermina","Lacumazes","Oezalces"],FEMALE:["Sofonisba","Tin Hinan","Tadla","Tala","Dihya","Tiziri"]},
  LIBYAN:{MALE:["Adicran","Ankhmakis","Inaros","Masaharta","Osorkon","Shoshenq"],FEMALE:["Karomama","Tashepenese","Tentamun","Mehtenweskhet","Shepenwepet","Nesitanebetashru"]},
  EGYPTIAN:{MALE:["Ptolemaios","Petosiris","Horemheb","Nakhthorheb","Pasherenptah","Harsiesis"],FEMALE:["Arsinoe","Berenike","Nefertari","Taimhotep","Iset","Nanefer"]},
  KUSHITIC:{MALE:["Arqamani","Natakamani","Tarekeniwal","Amanakhabale","Aspelta","Harsiotef"],FEMALE:["Amanirenas","Amanishakheto","Nawidemak","Amanitore","Malaqaye","Patrapeamani"]},
  HABESHA:{MALE:["GDRT","Sembrouthes","Aphilas","Wazeba","Gersem","Bazen"],FEMALE:["Makeda","Sofya","Eleni","Mariam","Aster","Saba"]},
  ARABIAN:{MALE:["Aretas","Obodas","Malichus","Rabbel","Zayd","Wahballahi"],FEMALE:["Shaqilat","Huldu","Samsi","Zabibe","Gamilat","Hagaru"]},
  LEVANTINE:{MALE:["Abdastartus","Bodashtart","Eshmunazar","Tabnit","Mattan","Azemilcus"],FEMALE:["Astarte","Batnoam","Amoashtart","Yatonmilk","Elissa","Abibaal"]},
  MESOPOTAMIAN:{MALE:["Artabanos","Orodes","Vologases","Sinatruces","Nergal-shar","Belshunu"],FEMALE:["Musa","Rinnu","Berenice","Beltiya","Nanaia","Ishtarbel"]},
  ANATOLIAN:{MALE:["Attalos","Ariarathes","Nikomedes","Mithridates","Zipoetes","Prusias"],FEMALE:["Stratonike","Apama","Nysa","Amastris","Laodike","Pythodoris"]},
  ARMENIAN:{MALE:["Tigranes","Artavasdes","Artaxias","Zariadres","Arsames","Orontes"],FEMALE:["Erato","Tigranui","Ashkhen","Satenik","Zarmandukht","Parandzem"]},
  CAUCASIAN:{MALE:["Pharnavaz","Saurmag","Artoces","Kuji","Mirian","Aderk"],FEMALE:["Nana","Salome","Ketevan","Rusudan","Mzevinar","Gvantsa"]},
  SARMATIAN:{MALE:["Gatalos","Amageios","Saios","Tasius","Inismeus","Rhadamsades"],FEMALE:["Amage","Tirgatao","Dynamis","Amastris","Zaraza","Sarmatia"]},
  SCYTHIAN:{MALE:["Ateas","Scyles","Octamasadas","Ariapeithes","Idanthyrsus","Spargapeithes"],FEMALE:["Argimpasa","Opoea","Tirgatao","Senamotis","Amastris","Tomyris"]},
  WEST_IRANIAN:{MALE:["Artabanos","Mithradates","Phraates","Gotarzes","Vardanes","Pacorus"],FEMALE:["Rhodogune","Musa","Aryazate","Ispubarza","Artazostre","Parysatis"]},
  EAST_IRANIAN:{MALE:["Spitamenes","Oxyartes","Bessos","Sisimithres","Arimazes","Dataphernes"],FEMALE:["Roxana","Apama","Barsine","Stateira","Drypetis","Amastris"]},
  GANDHARAN:{MALE:["Menandros","Antialkidas","Apollodotos","Agathokles","Straton","Zoilos"],FEMALE:["Agathokleia","Berenike","Theodora","Nikaia","Sophia","Dionysia"]},
  MADHYADESHI:{MALE:["Ashoka","Dasharatha","Samprati","Pushyamitra","Agnimitra","Vasumitra"],FEMALE:["Devi","Charumati","Tishyaraksha","Kanchanamala","Malavika","Dharini"]},
  MAGADHAN:{MALE:["Brihadratha","Shalishuka","Devavarman","Satadhanvan","Brahmamitra","Indragnimitra"],FEMALE:["Subhadrangi","Asandhimitra","Padmavati","Kurangi","Karuvaki","Sanghamitra"]},
  KALINGAN:{MALE:["Kharavela","Vakradeva","Lalaka","Kudepasiri","Mahameghavahana","Saktivarman"],FEMALE:["Naganika","Gautami","Vasumati","Padmavati","Kalingasena","Prabhavati"]},
  MAHARASHTRI:{MALE:["Simuka","Satakarni","Kanha","Hala","Pulumavi","Gautamiputra"],FEMALE:["Naganika","Gautami Balashri","Vasishthi","Mrigavati","Lilavati","Prabhavati"]},
  ANDHRA:{MALE:["Satakarni","Pulumavi","Yajna Sri","Sivasvati","Skandastambhi","Lambodara"],FEMALE:["Gautami","Vasishthi","Naganika","Madhari","Sivakhada","Balashri"]},
  TAMIL:{MALE:["Karikala","Neduncheliyan","Perunarkilli","Senguttuvan","Ilamchetchenni","Nalliyakkodan"],FEMALE:["Kannagi","Kopperundevi","Manimekalai","Venmal","Madhavi","Alli"]},
  SOUTHEAST_ASIAN:{MALE:["Soma","Kaundinya","Sri Mara","Fan Shih-man","Hun Pan-huang","Jayavarman"],FEMALE:["Liuye","Soma Devi","Kulaprabhavati","Jayadevi","Indrani","Vasudhara"]}
};

const FALLBACK:CulturalNamePool={
  MALE:["Ariston","Diodoros","Nikias","Theon","Leon","Menandros"],
  FEMALE:["Daphne","Irene","Kallista","Myrrine","Phoibe","Theano"]
};

export function culturalDynastyNameCandidates(culture:CultureGroup,gender:DynastyGender):readonly string[]{
  return (DYNASTY_CULTURAL_NAMES[culture]??FALLBACK)[gender];
}

export function availableCulturalDynastyName(
  culture:CultureGroup,gender:DynastyGender,usedNames:Iterable<string>,randomIndex:(maximum:number)=>number
):string{
  const used=new Set([...usedNames].map((name)=>name.trim().toLocaleLowerCase("tr-TR")));
  const pool=[...culturalDynastyNameCandidates(culture,gender)];
  const available=pool.filter((name)=>!used.has(name.toLocaleLowerCase("tr-TR")));
  if(available.length)return available[randomIndex(available.length)]!;
  const base=pool[randomIndex(pool.length)]!;
  for(let suffix=2;;suffix+=1){
    const candidate=base+" "+suffix;
    if(!used.has(candidate.toLocaleLowerCase("tr-TR")))return candidate;
  }
}

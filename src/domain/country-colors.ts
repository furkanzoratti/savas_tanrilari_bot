// Bu tablo haritanın özgün fraksiyon renklerinden otomatik üretilmiştir.
const COUNTRY_COLORS = new Map<string, number>([
  ["aedui", 0xa62416], // Aedui
  ["aestii", 0xa65738], // Aestii
  ["aestiler", 0xa65738], // Aestiler
  ["aksum", 0x857456], // Aksum
  ["anartes", 0xdcd4ad], // Anartes
  ["anartlar", 0xdcd4ad], // Anartlar
  ["aorslar", 0xfae5a4], // Aorslar
  ["aorsoi", 0xfae5a4], // Aorsoi
  ["apulii", 0xa65f35], // Apulii
  ["apuller", 0xa65f35], // Apuller
  ["arachosia", 0x4a484b], // Arachosia
  ["arahozya", 0x4a484b], // Arahozya
  ["ardhan", 0x3b7674], // Ardhan
  ["ardiaei", 0xebd8c7], // Ardiaei
  ["ardiailer", 0xebd8c7], // Ardiailer
  ["arevaci", 0xaa4a3c], // Arevaci
  ["arevaklar", 0xaa4a3c], // Arevaklar
  ["aria", 0xb76849], // Aria
  ["armenia", 0x7d8f75], // Armenia
  ["arverni", 0x24412d], // Arverni
  ["arvernler", 0x24412d], // Arvernler
  ["arya", 0xb76849], // Arya
  ["athens", 0x6386a4], // Athens
  ["atina", 0x6386a4], // Atina
  ["atrebartes", 0xa2c3a6], // Atrebartes
  ["atrebatlar", 0xa2c3a6], // Atrebatlar
  ["atropatena", 0xe5841d], // Atropatena
  ["axum", 0x857456], // Axum
  ["baktria", 0x2b4e84], // Baktria
  ["baktriya", 0x2b4e84], // Baktriya
  ["bastarnae", 0x743734], // Bastarnae
  ["bastarnlar", 0x743734], // Bastarnlar
  ["bergama", 0xa66c30], // Bergama
  ["bithynia", 0x95a4bb], // Bithynia
  ["bitinya", 0x95a4bb], // Bitinya
  ["boii", 0x79a568], // Boii
  ["boylar", 0x79a568], // Boylar
  ["breuci", 0xd6cfbc], // Breuci
  ["breuklar", 0xd6cfbc], // Breuklar
  ["brigantes", 0x1b35bb], // Brigantes
  ["brigantlar", 0x1b35bb], // Brigantlar
  ["budini", 0xfcf253], // Budini
  ["budinler", 0xfcf253], // Budinler
  ["caledones", 0x243f5a], // Caledones
  ["cantabri", 0xbeada3], // Cantabri
  ["cappadocia", 0xa83f43], // Cappadocia
  ["carnutes", 0x3b6442], // Carnutes
  ["carthage", 0xe4d9c7], // Carthage
  ["catiaroi", 0x84d879], // Catiaroi
  ["celtici", 0x48644d], // Celtici
  ["cessetani", 0xc7a77e], // Cessetani
  ["cherusci", 0x323547], // Cherusci
  ["cherusklar", 0x323547], // Cherusklar
  ["cimbri", 0xdda960], // Cimbri
  ["cimmeria", 0x25354c], // Cimmeria
  ["colchis", 0x9d96a8], // Colchis
  ["cyprus", 0xf6d27c], // Cyprus
  ["cyrenaica", 0xf5ce6f], // Cyrenaica
  ["dahae", 0x64964f], // Dahae
  ["dahalar", 0x64964f], // Dahalar
  ["dalmatae", 0xc2cec4], // Dalmatae
  ["dalmatlar", 0xc2cec4], // Dalmatlar
  ["daorsi", 0xa67e41], // Daorsi
  ["daorslar", 0xa67e41], // Daorslar
  ["demetae", 0xcbba82], // Demetae
  ["demetler", 0xcbba82], // Demetler
  ["drangiana", 0x53b125], // Drangiana
  ["dumnonii", 0x943515], // Dumnonii
  ["dumnonlar", 0x943515], // Dumnonlar
  ["ebdani", 0x7f8488], // Ebdani
  ["ebdaniler", 0x7f8488], // Ebdaniler
  ["edetani", 0x70e1ae], // Edetani
  ["edetanlar", 0x70e1ae], // Edetanlar
  ["eduiler", 0xa62416], // Eduiler
  ["egypt", 0x2552b1], // Egypt
  ["epir", 0xba7148], // Epir
  ["epirus", 0xba7148], // Epirus
  ["eravisci", 0x603f33], // Eravisci
  ["eraviskler", 0x603f33], // Eraviskler
  ["ermenistan", 0x7d8f75], // Ermenistan
  ["etruscanleague", 0x4e9fda], // Etruscan League
  ["etruskbirligi", 0x4e9fda], // Etrüsk Birliği
  ["etruskler", 0x4e9fda], // Etrüskler
  ["frisii", 0x704b39], // Frisii
  ["frizler", 0x704b39], // Frizler
  ["gaetuli", 0x30a631], // Gaetuli
  ["galatia", 0x3d4a2e], // Galatia
  ["galatya", 0x3d4a2e], // Galatya
  ["gallaeci", 0xe4a244], // Gallaeci
  ["gallaekler", 0xe4a244], // Gallaekler
  ["garamantia", 0xa67a57], // Garamantia
  ["garamantlar", 0xa67a57], // Garamantlar
  ["gerra", 0xab844b], // Gerra
  ["gerrhaea", 0xab844b], // Gerrhaea
  ["getae", 0x8d6b48], // Getae
  ["getler", 0x8d6b48], // Getler
  ["getuller", 0x30a631], // Getuller
  ["gutones", 0x5976cf], // Gutones
  ["gutonlar", 0x5976cf], // Gutonlar
  ["harezmliler", 0xfcc29d], // Harezmliler
  ["helvetii", 0xe17570], // Helvetii
  ["helvetler", 0xe17570], // Helvetler
  ["iceni", 0x4674b0], // Iceni
  ["ikenler", 0x4674b0], // İkenler
  ["insubres", 0x9239c6], // Insubres
  ["insubrlar", 0x9239c6], // İnsubrlar
  ["kaledonlar", 0x243f5a], // Kaledonlar
  ["kantabrlar", 0xbeada3], // Kantabrlar
  ["kapadokya", 0xa83f43], // Kapadokya
  ["karnutlar", 0x3b6442], // Karnutlar
  ["kartaca", 0xe4d9c7], // Kartaca
  ["kartli", 0x996a58], // Kartli
  ["katarlar", 0x84d879], // Katarlar
  ["kedar", 0xbcc0af], // Kedar
  ["keltikler", 0x48644d], // Keltikler
  ["kessetanlar", 0xc7a77e], // Kessetanlar
  ["khorasmii", 0xfcc29d], // Khorasmii
  ["kibris", 0xf6d27c], // Kıbrıs
  ["kimbriler", 0xdda960], // Kimbriler
  ["kimmerya", 0x25354c], // Kimmerya
  ["kirenayka", 0xf5ce6f], // Kirenayka
  ["knossos", 0xa6306a], // Knossos
  ["kolhis", 0x9d96a8], // Kolhis
  ["kraliyetiskityasi", 0xcd79d8], // Kraliyet İskityası
  ["kus", 0xdb9124], // Kuş
  ["kush", 0xdb9124], // Kush
  ["libya", 0x5244e4], // Libya
  ["liguria", 0x827e72], // Liguria
  ["ligurya", 0x827e72], // Ligurya
  ["lugii", 0x8e7978], // Lugii
  ["lugiler", 0x8e7978], // Lugiler
  ["lusitani", 0xecc03b], // Lusitani
  ["lusitanlar", 0xecc03b], // Lusitanlar
  ["macedon", 0x53152a], // Macedon
  ["main", 0x82aba3], // Main
  ["makedonya", 0x53152a], // Makedonya
  ["marcomanni", 0x4d2819], // Marcomanni
  ["markomanlar", 0x4d2819], // Markomanlar
  ["marsilya", 0x212540], // Marsilya
  ["masaesyli", 0x39c64c], // Masaesyli
  ["masaysiller", 0x39c64c], // Masaysiller
  ["mascat", 0x8a4eda], // Mascat
  ["maskat", 0x8a4eda], // Maskat
  ["massagetae", 0xb7de9b], // Massagetae
  ["massagetler", 0xb7de9b], // Massagetler
  ["massilia", 0x212540], // Massilia
  ["media", 0xd22da0], // Media
  ["mediaatropatene", 0xe5841d], // Media Atropatene
  ["medya", 0xd22da0], // Medya
  ["misir", 0x2552b1], // Mısır
  ["nabataea", 0xa05142], // Nabataea
  ["namnetes", 0xb13e25], // Namnetes
  ["namnetler", 0xb13e25], // Namnetler
  ["nasamones", 0x20df79], // Nasamones
  ["nasamonlar", 0x20df79], // Nasamonlar
  ["nebatiler", 0xa05142], // Nebatiler
  ["nervii", 0xe5cf95], // Nervii
  ["nerviler", 0xe5cf95], // Nerviler
  ["nori", 0x7c6d46], // Nori
  ["norikler", 0x7c6d46], // Norikler
  ["novacarthago", 0x74192b], // Nova Carthago
  ["odriskralligi", 0xc6396c], // Odris Krallığı
  ["odrysiankingdom", 0xc6396c], // Odrysian Kingdom
  ["partava", 0x83868d], // Partava
  ["parthava", 0x83868d], // Parthava
  ["parthia", 0x855c6a], // Parthia
  ["partlar", 0x855c6a], // Partlar
  ["pergamon", 0xa66c30], // Pergamon
  ["persia", 0x6daeee], // Persia
  ["persler", 0x6daeee], // Persler
  ["pictones", 0x4f360e], // Pictones
  ["piktonlar", 0x4f360e], // Piktonlar
  ["pontus", 0x264c61], // Pontus
  ["qidri", 0xbcc0af], // Qidri
  ["raeti", 0xc4aa93], // Raeti
  ["retler", 0xc4aa93], // Retler
  ["rhodos", 0x5568a2], // Rhodos
  ["rodos", 0x5568a2], // Rodos
  ["roksolanlar", 0x39b2c6], // Roksolanlar
  ["roma", 0xbba31b], // Roma
  ["rome", 0xbba31b], // Rome
  ["roxolani", 0x39b2c6], // Roxolani
  ["royalscythia", 0xcd79d8], // Royal Scythia
  ["rugii", 0x866846], // Rugii
  ["rugiler", 0x866846], // Rugiler
  ["saba", 0x8ce967], // Saba
  ["sagartia", 0x526b6f], // Sagartia
  ["sagartiya", 0x526b6f], // Sagartiya
  ["sardes", 0xd25f2d], // Sardes
  ["scordisci", 0xc3a35a], // Scordisci
  ["sebe", 0x8ce967], // Sebe
  ["sekvanlar", 0x4b8300], // Sekvanlar
  ["seleucid", 0xb4c7d6], // Seleucid
  ["seleukos", 0xb4c7d6], // Seleukos
  ["seleukoslar", 0xb4c7d6], // Seleukoslar
  ["sequani", 0x4b8300], // Sequani
  ["siraces", 0xcf5975], // Siraces
  ["siraklar", 0xcf5975], // Siraklar
  ["sirakuza", 0xc69339], // Siraküza
  ["skordiskler", 0xc3a35a], // Skordiskler
  ["sparta", 0x600502], // Sparta
  ["suebi", 0x603433], // Suebi
  ["suevler", 0x603433], // Süevler
  ["syracuse", 0xc69339], // Syracuse
  ["thyssagetae", 0xc6534c], // Thyssagetae
  ["tilis", 0x79d89e], // Tilis
  ["tissagetler", 0xc6534c], // Tissagetler
  ["trabzon", 0xe967cc], // Trabzon
  ["trapezos", 0xe967cc], // Trapezos
  ["treverii", 0x4e7d5d], // Treverii
  ["treverler", 0x4e7d5d], // Treverler
  ["triballer", 0x5a7e52], // Triballer
  ["triballi", 0x5a7e52], // Triballi
  ["turdetani", 0xe45344], // Turdetani
  ["turdetanlar", 0xe45344], // Turdetanlar
  ["tylis", 0x79d89e], // Tylis
  ["veneti", 0x982e2e], // Veneti
  ["venetler", 0x982e2e], // Venetler
  ["vivisci", 0xdfda20], // Vivisci
  ["viviskler", 0xdfda20], // Viviskler
  ["volcae", 0x59b0cf], // Volcae
  ["volklar", 0x59b0cf], // Volklar
  ["yenikartaca", 0x74192b], // Yeni Kartaca
]);

export function normalizeCountryColorKey(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase("tr-TR")
    .replaceAll("ı", "i")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]/g, "");
}

export function countryRoleColor(countryName: string): number | null {
  return COUNTRY_COLORS.get(normalizeCountryColorKey(countryName)) ?? null;
}

export const COUNTRY_ROLE_COLOR_COUNT = COUNTRY_COLORS.size;

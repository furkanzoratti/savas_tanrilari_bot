# R56 Hex hareket altyapısı

Bu sürüm hareketi **varsayılan olarak kapalı** tutar; güvenlik kilidiyle açılması da şimdilik reddedilir. R56 verisi, canlı veritabanı aktarım komutu, yönetici konumlandırması ve tur çözümleme altyapısı kodda hazırdır. Bunlar dağıtılmış veya canlı oyunda uygulanmış sayılmaz.

## Harita veri sözleşmesi

R56 üretim verisi [hex-map-r56.json](../assets/hex-map-r56.json) dosyasındadır. Düzenlenebilir [QGIS projesi](../maps/r56/qgis/amrp-harita.qgz) ve kullanıcıya gösterilen [koordinatlı görsel](../maps/r56/NEWHEXMAP.png) aynı grid üzerindedir. Haritada 1.800 Hex (749 kara, 400 deniz, 651 geçilemez) ve 173 tekil yerleşke eşleşmesi bulunur.

Her Hex'in kalıcı bir koordinatı (ör. `AA12`), piksel merkezi, alanı (`LAND`, `SEA`, `VOID`), arazisi, geçilebilirlik durumu ve bölge anahtarı vardır. Görsel dışındaki hücreler `VOID` ve `passable: false` olur. Eski harita üretimindeki bölgesiz 33 kara Hex'i kaynak eyalet poligonlarıyla eşleştirildi; J23, N06, T25, X15 ve AD13 sınırda yakın oy farkıyla seçildiğinden inceleme bayrağı taşır.

Yönetici yerleşke merkezlerini Iol **J22**, Flevum **L07**, Macomades **S26**, Odessos **Z15** ve Solokha **AD12** olarak doğruladı; harita kaynağı bu beş konumu zaten böyle içeriyor. Aşağıdaki beş **ayrı sınır hücresi** bu yerleşke Hex'leri değildir. Kaynak poligon örneklemesinin çoğunluk sonucu korunur; siyasi sınırlarını değiştirmek için bu merkez koordinatları tek başına kanıt sayılmaz. `/harita aktar sinir-onayi: Evet` mevcut çoğunluk atamasının ayrıca kabul edildiği anlamına gelir.

| Hex | Şimdilik seçilen bölge | Kaynak örnekleme oyu | Yakın ikinci bölge |
| --- | --- | ---: | --- |
| J23 | Iol | 62–58 | Dimmidi |
| N06 | Flevum | 39–34 | Alabu |
| T25 | Macomades | 12–11 | Kirene |
| X15 | Odessos | 58–44 | Malva |
| AD13 | Solokha | 36–26 | Pantikapaion |

Yönetici, bu beş sınır Hex'inin tabloda yazan mevcut çoğunluk sahipliklerini ayrıca onayladı. Bu onay yalnız bu hücrelerin harita aktarımına ilişkindir; canlı veritabanına aktarım yapıldığı anlamına gelmez.

Sabit tarihî ülke renkleri **güncel oyun sahipliği değildir**. [Harita hazırlayıcısı](../src/domain/hex-map-data.ts), Hex'in bölgesini o bölgedeki yerleşkenin canlı veritabanı sahibine bağlar. [Önizleme ve aktarım servisi](../src/services/movement-map-service.ts) adlar eksiksiz eşleşmezse veya etkin emir varken harita değiştirilmeye çalışılırsa işlemi durdurur. Veritabanı erişimi olmadan güncel sahiplik bu aşamada doğrulanmış veya yazılmış sayılmaz.

Yönetici, dağıtımın ardından önce `/harita kontrol` kullanır: bu komut canlı yerleşke kayıtlarıyla 173 eşleşmeyi ve beş sınır uyarısını **salt okunur** olarak doğrular. `/harita aktar sinir-onayi: Evet` aynı eşleşmeyi tekrar doğrular, Hex/yerleşke konumlarını tek işlemde kaydeder ve hareketi kapalı tutar. İlk komut başarılı değilse aktarım yapılmamalıdır. Aktarımın çalışması için hareket migration'ının uygulanmış olması gerekir. Harita aktarımı, orduları ve filoları kendiliğinden konumlandırmaz.

`/harita durum` aktarılmış Hex ve konumlandırılmış ordu/filo sayılarını, ayrıca yönetici kararında bekleyen emirleri gösterir. `/harita log-kanali kanal: #özel-kanal` bütün hareket denetimlerini yalnız yetkililerin görebildiği metin kanalına yönlendirir. `@everyone` kanalını veya botun mesaj/gömme yetkisi olmayan kanalı reddeder. Kanal seçilmezse `/harita sistem aktif: Evet` ilk açılışta `#hareket-loglari` adlı özel kanalı kurar; bunun için botta **Kanalları Yönet** izni gerekir. Gönderilemeyen kayıtlar veritabanında bekler; bot açıldığında ve her 10 saniyede tekrar gönderilir. Kanal değişiminde bekleyen kayıtlar silinmez. `/harita hazirlik` açılış engellerini salt okunur kontrol eder ve log kanalı yoksa bunu bildirir; sistem açma komutu önce kanalı otomatik kurar. Hareket ancak harita aktarılmış, yerleşkeler ve etkin birlikler konumlandırılmış, özel log kanalı var ve tur açıkken başlar; `aktif: Hayır` acil duraklatmadır ve kayıtları silmez. `/harita birim-yerlestir` seçilen ordu veya filoya başlangıç koordinatı verir. Hareket açıkken de en az beş karakterlik gerekçe ile konum **düzeltilebilir**, fakat etkin emir, savaş, karşılaşma veya orduya gelen asker intikali varken konum değiştirilemez.

Oyuncu `/hareket panel` ile ordu/filo seçer; butonlar rota önizlemesi veya emir formunu açar. Birlik listesi 25'lik sayfalıdır. Form hedef Hex'i, isteğe bağlı manuel rotayı ve emirde GM'ye özel hamle notunu alır. Gönderimde ülke yetkisi ve birlik sahipliği yeniden doğrulanır. Panel ve emir yanıtları yalnız kullanan oyuncuya görünür; hareket logu özel yönetici kanalına düşer. Eski `/hareket rota` ve `/hareket emir-ver` komutları alternatif olarak çalışır.

`/harita emir-incele` tam emir ID'si veya benzersiz ilk sekiz karakteriyle rota, ilerleme, durma nedeni ve oyuncu notunu gösterir. `/harita emir-iptal` karşılaşmaya bağlanmamış etkin emri gerekçe denetim kaydına işleyerek iptal eder. `/harita emir-devam` karşılaşma dışı engelli emrin kalan rotasını, yeni harita sürümünü ve hareket kapasitesini yeniden doğrular; bir sonraki turda devam eder. Temas veya yabancı ülke sınırında duran emirler `/harita karsilasmalar` ve `/harita karsilasma-karari` ile yönetilir.

Koordinat kimliği bir kez belirlendikten sonra değiştirilmemelidir. Harita genişlerken yeni koordinatlar eklenir; mevcut koordinatların sahipliği güncellenebilir. `upsertHexes` mevcut Hex kimliğini korur ve harita sürümünü yükseltir. Yeni harita sürümündeki geçişler, daha önce kaydedilmiş fakat henüz çözülmemiş emirler için ayrıca yeniden doğrulanmalıdır.

## Rota ve emir akışı

1. `planRoute` bir ordunun/filonun mevcut konumundan hedef Hex'e en düşük maliyetli rotayı hesaplar. Kara ve deniz birbirine karışmaz; özel bağlantıların yönü ve birlik izinleri uygulanır.
2. `submitPlannedOrder` rotayı yeniden doğrulayarak emri kaydeder. Manuel rota isteyen sıra dışı hamleler için `submitOrder` ayrıca mevcuttur.
3. Tamamı aynı devletin kontrolündeki Hex'lerden geçen rota +1 Hex kazanır. Başka bir devlette sonlanan rota bu bonusu alamaz.
4. Şimdilik yalnızca normal hareket emri kabul edilir. Stratejik/zorunlu/gizli yürüyüş kipleri veri modelinde yer alır ancak yorgunluk ve istihbarat sonuçları tamamlanana kadar kapalıdır.
5. Tur çözümleyici kayıtlı emrin o tura sığan adımlarını ilerletir. Başka devletin kara bölgesine giriş, düşman birliğiyle temas ve farklı devletlerin eşzamanlı rota kesişmesi otomatik savaş başlatmaz; emir **BLOCKED** olup tek bir yönetici dosyasına bağlanır. Kayıtlı gözcü/keşif temasları gizli istihbarat kontrolü üretir.
6. Etkin emri bulunan birliklerin kadrosu/komutanı ve elle konumu değiştirilemez. Aynı birlik bir turda tamamlanan emrin ardından ikinci emirle ilave hareket kazanamaz.

Oyuncu arayüzü `/hareket konumlar`, `/hareket rota`, `/hareket emir-ver`, `/hareket emirler` ve `/hareket iptal` komutlarından oluşur. Yanıtlar yalnız kullanıcıya görünür; oyuncular yalnız kendi devletlerinin kayıtlarına erişir. Listeler sayfalıdır. Rota önizlemesi emir vermez ve başka devlete geçiş izni garantisi değildir. Rota alanı boşsa en kısa yol hesaplanır; oyuncu isterse başlangıç ve hedef dâhil **bütün Hex adımlarını** yazarak farklı bir güzergâh seçer. Manuel adımların komşuluğu, kara/deniz türü ve maliyeti hem önizlemede hem emri kaydederken doğrulanır. Emirde isteğe bağlı bir GM notu bulunur; özel hamle talebi bu yolla kaydedilir, kendiliğinden uygulanmaz. `/hareket emir-ver` güvenlik kilidi açılana kadar açık değildir.

Oyuncu hamleleri için özel kenarlar (`map_hex_edges`) ve emir metadata alanı tutulur. İstisnalar doğrudan harita geometrisini bozmak yerine, doğrulanan kural/olay olarak bu alanlarda temsil edilmelidir.

## Karşılaşma ve savaş taslağı

`/harita karsilasmalar` yöneticiye temas ve sınır geçişi dosyalarını, iki tarafın o tur/bölgedeki en yüksek gizli bilgi seviyesini ve farktan doğabilecek +1/+2/+3 pusu zarı avantajını gösterir. Bu fark otomatik pusu veya zafer değildir; GM arazi ve pusu koşullarını mevcut savaş sistemiyle değerlendirir. `/harita karsilasma-karari` dosyayı gerekçeli olarak geçişe izin verme, savaş bekletme, bulunduğu Hex'te çekilme, özel inceleme veya **özel sonucu uygulayıp emirleri kapatma** durumuna alır. Geçiş izni yalnız düşman birliğiyle temas olmayan kara sınır dosyasında verilir; kullanılmamış tur hareketi yeterliyse bir izinli Hex adımı aynı turda uygulanır ve keşif kontrolü yapılır. Ordu/filo teması otomatik savaş kartı üretmez.

Savaş kararında ilgili emirler **BLOCKED** kalır. GM seçtiği savaş kanalında mevcut `/savas baslat` komutuna `karsilasma-id` girer, araziyi ve taraf kontrolünü belirler. Bu işlem **DRAFT** savaş taslağı oluşturur ve karşılaşan iki orduyu kadroya otomatik bağlar. GM kadroyu kontrol eder; konum ve katılım uygunluğunu ayrıca doğruladığı ek orduları mevcut `/savas ordu-ekle` ile ekleyebilir, ardından `/savas yayinla` ile savaşı herkese açar. Bir taslak iptal edilirse karşılaşma yeniden savaş bekler; savaş sonuçlanırsa ilişkili hareket emirleri kapanır. Kuşatma ve deniz savaşı için bu otomatik kadro bağlantısı kullanılmaz; GM mevcut manuel savaş akışını izler.

## Ordu toplama

`/ordu olustur` sırasında isteğe bağlı `toplanma-yerleskesi` seçilebilir. Harita konumu olmayan boş orduda ilk asker eklenen yerleşke toplanma noktasını belirler. Hareket sistemi açıkken `/ordu asker-ekle` başka yerleşkedeki askeri **anında** ordu mevcuduna yazmaz: asker kaynak yerleşkenin serbest asker stokundan çıkarılır ve yalnız kendi Hex'leri üzerinden toplanma alanına ayrı intikal emri kaydeder. Bu nedenle aynı asker ikinci bir orduya tahsis edilemez. İntikal, tur durdurma ve sonraki tur açılışlarında kendi büyüklüğü ve süvari yapısına göre Hex ilerler. Ordu hâlâ hedef Hex'teyse ve savaşa/karşılaşmaya bağlı değilse varışta kadroya eklenir. Ordu ayrılmışsa asker hedefte onu bekler. Yoldaki asker savaş kadrosuna veya ordu hareket büyüklüğüne katılmaz; buna rağmen devlet ve köken yerleşke askerî personel sınırlarında sayılmaya devam eder.

Orduya katılmış asker artık yerleşke stokunun bir kopyası değil, **bağımsız saha ordusu envanteridir**. Kaynak yerleşkenin adı yalnız tarihî köken bilgisi olarak korunur. Köken yerleşke fethedilirse ordudaki asker silinmez veya yeni devlete geçmez; yalnız şehirde bırakılmış serbest asker ve garnizon fetih sonucuna girer. Yeni asker eğitiminde nüfus sipariş anında bir kez düşer; asker orduya eklenirken, savaşta kaybedilirken veya intikal ederken nüfus ikinci kez düşmez. Eski askerler geçiş sırasında geriye dönük nüfus kesintisine uğramaz.

`/ordu asker-cikar` ve `/ordu dagit` askerleri eski köken şehrine ışınlamaz. İşlem yalnız ordu kendi devletine ait bir yerleşke Hex'indeyken yapılabilir ve askerler ordunun **o anda bulunduğu** yerleşkenin serbest asker stokuna aktarılır. Ordunun köken dağılımı belgede gösterilmeye devam eder, fakat mülkiyet veya fiziksel konum anlamına gelmez.

`/ordu toplama-emirleri` kaynak, güncel/varış Hex'i ve durumu gösterir. `/ordu toplama-iptal` yalnız henüz hiç Hex ilerlememiş bir emri iptal eder; kaynak şehir hâlâ aynı devlete aitse asker stokuna geri döner. Yoldaki asker kaynağa ışınlanmaz. GM `/harita durum` ile engelli intikalleri görür, sebep giderildiyse `/harita toplama-devam` ile yeniden denemeye açar. `/harita toplama-geri-cagir` askerleri geldikleri rota üzerinden **bir sonraki turdan başlayarak** kaynağa döndürür; kaynak Hex'e ulaşana kadar askerler rezerve kalır. Yolda düşman veya sahiplik değişimi varsa geri dönüş engellenir; ele geçirilmiş bir şehre asker yazılmaz ve GM kararı beklenir. Uzak kaynağa asker/araç iadesi ve uzaktan kuşatma aleti ekleme hareket açıkken engellenir; bunlar için ayrıca konvoy kuralı gerekir.

Deniz grafiği 10 ayrı bileşen içerir. İç denizlerin ayrılığı normaldir. Cebelitarık, Türk boğazları ve Adriyatik gibi dar geçişlerin somut Hex çiftleri yönetici tarafından görselde doğrulanıp `/harita bogaz-tanimla` ile girilir. Bu işlem en fazla 3 Hex aralıklı, geçilebilir iki deniz hücresini bağlar; karadan filo geçişi veya geniş çaplı otomatik bağlantı açmaz. Oyun canlıyken veya etkin emir varken harita bağlantısı değişmez. Belirli boğaz çiftleri henüz onaylanıp canlı haritaya yazılmadı.

## Deniz taşıması

`/hareket filo-yuku` asker/yük durumunu gösterir. `/hareket gemiye-bin`, kendi kontrolündeki kıyı Hex'inde duran orduyu bitişik deniz Hex'indeki aynı devlet filosuna yükler. `/hareket karaya-cik` bir çıkarma emri açar; çıkarma **bir tur sürer**, verildiği turun `/tur durdur` çözümünde tamamlanır ve ordunun ya da filonun Hex hareket hakkından düşmez. Karaya çıkan ordu o tur ayrıca kara hareketi alamaz. GM `/harita cikarma` ile **düşman ordusu bulunmayan** bitişik yabancı kıyıya gerekçeli çıkarma emri verebilir; işgal edilmiş kıyı önce savaş/temas kararı gerektirir. Emir verildikten sonra filo yer değiştirirse veya hedef geçersiz hâle gelirse çıkarma engelli duruma alınır ve yöneticiye bildirilir. Aktif savaş veya hareket emri varken yükleme/çıkarma yapılamaz; gemiye binen ordu bağımsız kara konumundan çıkar, filonun manifestinde kalır ve ikinci bir kara hareketi veremez. Deniz taşıması hareket güvenlik kilidi açılana kadar reddedilir.

Mevcut gemi asker taşıma kapasitesi (200/500/800) korunur. Kuşatma güverte yükü Kerkouros/Trireme/Quinquereme için 1/2/3'tür; 2 Balista 1, Mantlet 1, Katapult 1, Kule 2 yük oluşturur. `asker / asker kapasitesi + kuşatma yükü / güverte kapasitesi` toplamı 1'i aşamaz. **İlk testte yürürlükteki ceza yüzde doluluk bantlarıdır:** %0–50 ceza yok, %50–75 −1, %75–90 −2, %90–100 −3 Hex. Her gemi sayısında ölçeklendiği için mutlak 1–10/11–25/26+ yük cezası bu testte kullanılmaz. Emir çözümünde kapasite yeniden denetlenir.

## Gözcü ve gizli keşif

Var olan `/gozcu-alimi` ile alınmış ve eğitimi bitmiş birlikler R56 aktarımında veya eğitim tamamlandığında otomatik haritaya bağlanır. Gözcü sabittir; **yerleşkesinin Hex'i ve ona bitişik altı Hex** kapsanır. Örneğin Uburzis O10 gözcüsü O10, P10, P09, O09, N09, N10 ve O11'i izler. Harita dışı/geçilemez hücreler gösterilmez. Eyalet başına bir gözcü sınırı satın almada denetlenir; eskiden alınmış fazlalıklar silinmez ama aynı eyalet için ek zar üretmez. `/hareket gozcu-alani` kapsama ve etkinlik durumunu yalnız o devlete gösterir.

`/hareket kesif-ata` bir ordudaki süvariden tek hareketli keşif birliği kurar: hafif süvari/atlı okçu tam, ağır süvari yarım sayılır; en az 200 etkin süvari gerekir. Sıfır miktarlarla atama geri çekilir. Tur çözümünde kapsanan düşman kara ordusu hareketleri için gizli d20 atılır. Doğal 1 kritik başarısızlık, doğal 20 üstün başarıdır; bonusla ulaşılan 20 üstün sayılmaz. Aynı devlet/bölgede tur başına en fazla bir normal gözcü veya hareketli keşif zarı yazılır. Gözcü doğal 1 atarsa bir sonraki tur etkisiz kalır; düşmanın etkin keşif birliği Güçlü veya üstü sonuç alırsa gözcü birliği imha edilir. Gözcüsüz düşman bölgesine girişte söylenti zarı ayrı işler; 15–19 bir tur gecikmeli, doğal 20 aynı tur haber verir. Düşük düzey raporlar kesin Hex, tam asker sayısı veya komutan kimliği sızdırmaz. Oyuncu yalnız kendi raporunu `/hareket istihbarat`, yönetici bütün zarları `/harita kesif-kayitlari` ile görebilir. GM `/harita istihbarat-ekle` ile belirli Hex ve hedef devlet hakkında ek rapor verebilir; bu rapor ayrı türde denetlenir, doğal zarı silmez ve karşılaşma bilgi seviyesine katılır. Keşif felaketi, düşman aksiyonu için yöneticiyi uyarır; otomatik pusu/savaş yaratmaz. Farkındalık farkı ve pusu/kaçınma seçimi Madde 2 karar akışıyla birlikte uygulanmalıdır.

## Tur çözümleme bağlantısı

- `/tur durdur`, turu `RESOLVING` aşamasına alırken yalnızca o tur verilmiş `SUBMITTED` emirleri çözer.
- `/tur atla`, yeni tur açılırken yalnızca önceki turlardan gelen `IN_PROGRESS` emirlerin yeni tur hareket payını işler. Önceki turun yeni emirleri atlanmışsa tur atlama reddedilir.
- İki çözümleme de tur işlemiyle aynı veritabanı transaction'ındadır. `movement_resolution_runs` aşama kaydı ve emir başına `last_processed_turn` tekrar hareketi önler. Yerleşke devrinden sonra Hex sahipliği canlı yerleşke sahibiyle eşitlenir; sürüm değişirse bekleyen rota yönetici incelemesine alınır.
- Hareket çözülmüş bir tur yeniden oyuncu emirlerine açılamaz. Tur duyurusundan sonra çözümleme sayıları yalnızca yöneticiye bildirilir.

## İlk testin açılış sırası ve sınırları

Yönetici `/harita konum-listesi yalniz-eksik: Evet` ile konumu zorunlu fakat girilmemiş birlikleri 12'lik sayfalar halinde görür. Boş ve gemideki ordular açılış eksiği sayılmaz. `/harita ordu-konum-gir ulke: ... ordu: ... hex: ...` mevcut ordunun gerçek başlangıç kara Hex'ini kaydeder; sahiplik, geçilebilir Hex ve etkin savaş/emir/karşılaşma çakışmaları yeniden doğrulanır. Hareket açıkken konum düzeltmesinde gerekçe zorunludur. Filo konumu için `/harita birim-yerlestir` kullanılabilir.

1. Dağıtımdan sonra migration 69–74 ve slash komutlarının kaydedildiğini doğrula. `/harita kontrol` ile **173/173** eşleşmeyi gör; beş sınır hücresinin mevcut çoğunluk atamasını kabul ediyorsan `/harita aktar sinir-onayi: Evet` kullan. Özel log kanalı açılışta kendiliğinden kurulur; başka bir özel kanal istenirse `/harita log-kanali` kullanılabilir.
2. `/harita konum-listesi yalniz-eksik: Evet` ile mevcut etkin orduları tespit et ve her birini `/harita ordu-konum-gir` ile gerçek Hex'ine kaydet. Konumsuz etkin filolar varsa `/harita birim-yerlestir` ile gir. `/harita hazirlik` açılış engellerini denetler. Gerekli boğaz çiftlerini harita üzerinde doğrulayıp `/harita bogaz-tanimla` ile tanımla.
3. Eski uzaktan tahsis edilmiş orduların kadro kaynakları ve fiziksel Hex konumu yönetici tarafından karşılaştırılmalı. Sadece sayısal hazırlık raporu bunu otomatik kanıtlamaz.
4. Hazırlık engelleri sıfırsa `/harita sistem aktif: Evet onay: Evet` ile **oyuncu kullanımını** başlat. Oyuncular `/hareket panel` üzerinden emir verir; GM özel hareket logunu ve `/harita karsilasmalar` listesini izler. Kritik hata varsa `/harita sistem aktif: Hayır onay: Evet` ile duraklat; kayıtlar saklanır.

GM'nin gerekçeli konum düzeltmesi, emir iptali/devamı, temasın özel sonucu, yabancı kıyı çıkarması ve asker geri çağırması vardır. Ancak pusu ve diplomatik özel hamle sonuçları otomatik zafer yaratmaz; GM mevcut savaş araçlarıyla karar verir. İntikal birliğinin sahada kaybı, alternatif rota, düşmanla çatışması ve uzaktan kuşatma konvoyu **henüz otomatik çözülmez**; ilk testte böyle dosyalar durdurulup elle değerlendirilmelidir. Bu nedenle ilk testin başarı ölçütü kontrollü hareket ve müdahale akışıdır, tüm olası oyuncu hamlelerinin otomatik çözümü değil.

# 🎭 SAVAŞ TANRILARI ROLE PLAY: YERLEŞKE OLAYLARI SİSTEMİ

## ⚖️ 1. TEMEL KURALLAR

Yerleşke olayları, oyun turu ilerlediğinde kendiliğinden başlamaz. Bir olayın seçilmesi ve uygulanması **Oyun Yöneticisi** veya yetkilendirilmiş **Olay Yöneticisi** kontrolündedir.

• `/olay riskler`, seçilen olay için bütün uygun yerleşkelerin ağırlıklarını gösterir.
• `/olay sec`, uygun yerleşkeler arasında ağırlıklı seçim yapar.
• `/olay uygula`, bekleyen seçimi onaylar veya ülke ve yerleşke birlikte belirtilirse uygun bir yerleşkeye doğrudan olay uygular.
• `/olay aktif`, devam eden bütün yerleşke olaylarını gösterir.
• `/olay sonlandir`, seçilen yerleşkedeki etkin olayı sona erdirir.

Olay taraması varsayılan olarak sunucudaki bütün aktif devletleri kapsar. Yönetici isterse `ulke` seçeneğiyle taramayı tek bir devletle sınırlandırabilir.

Bot olay ağırlıklarını hesaplarken şunları denetler:

• Özgür ve köle nüfusu
• Yerleşke binaları ve seviyeleri
• Etkin şehir politikaları
• Yerel hammaddeler ve aktif ticaret antlaşmaları
• Agora / Forum'a atanmış Tüccar
• Fetih, kuşatma ve haraplık durumu
• Hâlen etkin olan diğer yerleşke olayları
• Kurulabilir ülkelerden gelen huzursuzluk ve isyan koruması
• Aynı olayın önceki gerçekleşme turu

Bir yerleşkenin seçilmesi olayı doğrudan başlatmaz. Seçim kartındaki onay düğmesine basılması veya `/olay uygula` kullanılması gerekir.

Olay başladığında bot, olay durumunu yerleşke belgesine işler. Olayın gelir, hazine, nüfus, bina veya birlik sonuçları kendiliğinden uygulanmaz; olayın şiddeti ve sayısal sonuçları yönetici tarafından belirlenip ilgili yönetim komutlarıyla işlenir.

## 🎲 2. AĞIRLIKLI YERLEŞKE SEÇİMİ

Her yerleşke için **0–100** arasında bir Olay Ağırlığı hesaplanır.

• Ağırlığı **0** olan yerleşke seçim havuzuna girmez.
• Ağırlık yükseldikçe yerleşkenin seçilme ihtimali artar.
• Ağırlık doğrudan gerçekleşme yüzdesi değildir.
• Bütün uygun yerleşkelerin ağırlıkları toplanır ve bot **1dToplam Ağırlık** atar.

Bir yerleşkenin seçilme ihtimali:

**Yerleşkenin Olay Ağırlığı ÷ Bütün uygun yerleşkelerin toplam ağırlığı**

### 📌 Örnek

• Roma: **60**
• Capua: **30**
• Athena: **20**
• Toplam: **110**

Bot **1d110** atar:

• 1–60: Roma
• 61–90: Capua
• 91–110: Athena

Aynı olay türü için yeniden `/olay sec` kullanılırsa daha önce onaylanmamış bekleyen seçim iptal edilir ve yerini yeni seçim alır.

## ⏳ 3. TEKRAR KORUMASI VE BİRLİKTE ÇALIŞAN OLAYLAR

Aynı yerleşkede aynı olay, gerçekleştiği turdan sonraki **3 oyun turu** boyunca yeniden seçilemez.

Örneğin Tur 20'de gerçekleşen bir olay:

• Tur 20, 21 ve 22'de yeniden uygulanamaz.
• Tur 23'ten itibaren yeniden değerlendirilebilir.

Olay hâlâ etkinse tekrar koruması bitmiş olsa bile aynı olay yeniden seçilemez. Farklı olay türleri ise aynı yerleşkede birlikte bulunabilir.

Örneğin:

• Salgın bulunan bir yerleşkede Huzursuzluk başlayabilir.
• Huzursuzluk yaşayan bir yerleşkede İsyan başlayabilir.
• Karaborsa ile Ticari Canlanma aynı anda etkin olabilir; ancak Karaborsa, Ticari Canlanma ağırlığını azaltır.

## 🕶️ 4. KARABORSA

Karaborsa; kaçakçılık, denetimsiz ticaret ve yasa dışı ekonomik ağların büyümesini temsil eder.

### 📈 Ağırlığı Artıran Etkenler

• Temel risk: **+10**
• Her 50.000 özgür nüfus: **+2** — azami **+8**
• Liman bulunması: **+5**
• Ticaret Loncası: Her seviye için **+4**
• Etkin Huzursuzluk: **+8**
• Fethedilmiş yerleşke: **+4**

### 🛡️ Ağırlığı Azaltan Etkenler

Liman bulunan yerleşkelerde Gümrükhane:

• Sv1: **-3**
• Sv2: **-6**
• Sv3: **-10**

Agora / Forum'a atanmış bir Tüccar, kalan Karaborsa ağırlığını **%60 azaltır**. Sonuç yukarı yuvarlanan **%40** değer olarak kullanılır.

### 🏛️ Tam Koruma

Yerleşkede **Agora / Forum Sv3** bulunuyor ve bu binaya bir **Tüccar atanmışsa** Karaborsa tamamen engellenir; yerleşke seçim havuzuna girmez.

## 🦠 5. SALGIN

Salgın ağırlığı; nüfus yoğunluğu, liman hareketliliği, sağlık altyapısı, kuşatma ve haraplık durumuna göre hesaplanır.

### 📈 Ağırlığı Artıran Etkenler

• Temel risk: **+20**
• Her 75.000 özgür nüfus: **+3** — azami **+9**
• Liman bulunması: **+4**
• Harap yerleşke: **+10**
• Toparlanma aşamasındaki yerleşke: **+5**
• Kuşatma altında olma: **+8**

### 🛡️ Ağırlığı Azaltan Etkenler

• Şifacı Evi: Her seviye için **-4**
• Su Kemerleri ve Sarnıç: Her seviye için **-3**
• Hanlar ve Hamamlar: Her seviye için **-2**
• Zeytin erişimi: **-10**
• Panteon Sv2 veya Sv3: Kalan pozitif ağırlığı **yarıya indirir**; kesirli sonuç aşağı yuvarlanır.

## ⚠️ 6. HUZURSUZLUK

Huzursuzluk doğrudan isyan değildir; ancak sonraki İsyan seçimlerinde yerleşkenin ağırlığını ciddi biçimde yükseltir.

### 📈 Ağırlığı Artıran Etkenler

• Temel risk: **+5**
• Köle Kampı: Her seviye için **+10**
• Sayım ve Vergi Dairesi Sv1: **+3**
• Sayım ve Vergi Dairesi Sv2: **+6**
• Sayım ve Vergi Dairesi Sv3: **+10**
• Vergi Sıkılaştırması politikası: **+10**
• Fethedilmiş yerleşke: **+15**
• Kuşatma altında olma: **+8**
• Etkin Salgın: **+10**

### 🛡️ Ağırlığı Azaltan Etkenler

• Panteon bulunması: **-10**
• Curia: Her seviye için **-2**
• Hanlar ve Hamamlar Sv1: **-3**
• Hanlar ve Hamamlar Sv2: **-6**
• Hanlar ve Hamamlar Sv3: **-10**
• Şarap erişimi: **-10**
• Kehribar erişimi: **-10**
• Kurulabilir ülkenin huzursuzluk koruması: İlgili ülke etkisi kadar ek azalma

## 🔥 7. İSYAN

İsyan her yerleşkede sebepsiz biçimde ortaya çıkamaz. Yerleşkenin seçim havuzuna girebilmesi için aşağıdaki koşullardan en az biri bulunmalıdır:

• Etkin Huzursuzluk
• Fethedilmiş yerleşke durumu
• Etkin Salgın
• Etkin kuşatma
• Köle Kampı ve sıfırdan fazla köle nüfusu

Bu koşulların hiçbiri yoksa yerleşke İsyan havuzuna girmez.

### 📈 Ağırlığı Artıran Etkenler

• Temel risk: **+5**
• Etkin Huzursuzluk: **+25**
• Fethedilmiş yerleşke: **+20**
• Köle Kampı: Her seviye için **+8**
• Köle nüfusunun özgür nüfusa oranı: Yüzde değeri kadar, azami **+15**
• Vergi Sıkılaştırması politikası: **+10**
• Etkin Salgın: **+10**
• Kuşatma altında olma: **+10**

### 🛡️ Ağırlığı Azaltan Etkenler

• Panteon bulunması: **-10**
• Curia: Her seviye için **-2**
• Şarap erişimi: **-10**
• Kehribar erişimi: **-10**
• Kurulabilir ülkenin isyan koruması: İlgili ülke etkisi kadar ek azalma

İsyan uygulandığında bot, yerleşkenin **Huzursuzluk** durumunu da otomatik olarak etkinleştirir.

## 🏜️ 8. KURAKLIK

### 📈 Ağırlığı Artıran Etkenler

• Temel risk: **+10**
• Harap yerleşke: **+8**
• Toparlanma aşamasındaki yerleşke: **+4**
• Kuşatma altında olma: **+10**
• Çiftlik bulunmaması: **+10**
• Su Kemeri ve Sarnıç bulunmaması: **+8**

### 🛡️ Ağırlığı Azaltan Etkenler

• Çiftlik: Her seviye için **-3**
• Su Kemerleri ve Sarnıç: Her seviye için **-3**
• Tahıl erişimi: **-10**

Kuraklığın başlaması Kıtlığı otomatik olarak başlatmaz; ancak etkin Kuraklık, sonraki Kıtlık ağırlığını büyük ölçüde artırır.

## 🥣 9. KITLIK

### 📈 Ağırlığı Artıran Etkenler

• Temel risk: **+8**
• Etkin Kuraklık: **+25**
• Harap yerleşke: **+10**
• Toparlanma aşamasındaki yerleşke: **+5**
• Kuşatma altında olma: **+15**
• Çiftlik bulunmaması: **+10**

### 🛡️ Ağırlığı Azaltan Etkenler

• Çiftlik: Her seviye için **-3**
• Su Kemerleri ve Sarnıç: Her seviye için **-2**
• Tahıl erişimi: **-10**

## 🌾 10. BEREKETLİ HASAT

Kuşatma veya açık İsyan altındaki yerleşkeler Bereketli Hasat havuzuna giremez.

### 📈 Fırsat Ağırlığı

• Temel fırsat: **+10**
• Çiftlik: Her seviye için **+5**
• Su Kemerleri ve Sarnıç: Her seviye için **+3**
• Tahıl erişimi: **+10**
• Zeytin veya Şarap erişimi: **+3** — ikisi birlikte bulunsa da bir kez uygulanır
• Harap veya toparlanma aşamasındaki yerleşke: **-5**

## 🪙 11. TİCARİ CANLANMA

Kuşatma veya açık İsyan altındaki yerleşkeler Ticari Canlanma havuzuna giremez.

### 📈 Fırsat Ağırlığı

• Temel fırsat: **+8**
• Agora / Forum: Her seviye için **+4**
• Liman bulunması: **+5**
• Ticaret Loncası: Her seviye için **+5**
• Hanlar ve Hamamlar: Her seviye için **+3**
• Kervansaray: Her seviye için **+5**
• Agora / Forum'a atanmış Tüccar: **+5**
• Etkin Karaborsa: **-8**
• Etkin Huzursuzluk: **-4**

## 🧳 12. GÖÇ DALGASI

Fethedilmiş, kuşatma altında, Salgınlı veya açık İsyanlı yerleşkeler Göç Dalgası havuzuna giremez.

### 📈 Fırsat Ağırlığı

• Temel fırsat: **+8**
• Özgür nüfus 100.000'in altındaysa: **+5**
• Su Kemerleri ve Sarnıç: Her seviye için **+3**
• Çiftlik: Her seviye için **+2**
• Liman bulunması: **+2**
• Şarap erişimi: **+3**

## 🛠️ 13. USTA ZANAATKÂRLARIN GELİŞİ

Kuşatma veya açık İsyan altındaki yerleşkeler Usta Zanaatkârların Gelişi havuzuna giremez.

### 📈 Fırsat Ağırlığı

• Temel fırsat: **+8**
• Mühendislik Atölyesi: Her seviye için **+4**
• Agora / Forum: Her seviye için **+2**
• Ticaret Loncası: Her seviye için **+2**
• Zanaatkârlar Mahallesi: Her seviye için **+5**
• Kereste, Demir veya Mermer erişimi: **+5** — birden fazlası bulunsa da bir kez uygulanır

## 🛡️ 14. YEREL GÖNÜLLÜLER

Açık İsyan bulunan yerleşkeler Yerel Gönüllüler havuzuna giremez.

### 📈 Fırsat Ağırlığı

• Temel fırsat: **+5**
• Savaş Hazırlığı politikası: **+10**
• Garnizon Güçlendirme politikası: **+5**
• Kuşatma tehdidi: **+8**
• Curia: Her seviye için **+2**

Verilecek Milis miktarı yönetici tarafından belirlenir ve `/milis-ekle` ile ücretsiz olarak işlenir. Bu manuel işlem nüfus veya hazineyi kendiliğinden düşürmez.

## 🤝 15. HAMMADDE VE TİCARET ETKİLERİ

Olay hesaplarında hem yerleşkenin yerel hammaddesi hem de aktif ticaret antlaşmalarıyla eriştiği hammaddeler dikkate alınır.

• Aynı hammadde hem yerel üretimden hem ticaretten geliyorsa etkisi yalnızca bir kez uygulanır.
• Ticaret antlaşması sona ererse sağladığı olay etkisi de sona erer.
• Zeytin, Salgın ağırlığını azaltır.
• Şarap, Huzursuzluk ve İsyan ağırlığını azaltır; bazı olumlu olayları destekler.
• Kehribar, Huzursuzluk ve İsyan ağırlığını azaltır.
• Tahıl, Kuraklık ve Kıtlık ağırlığını azaltır; Bereketli Hasadı destekler.
• Kereste, Demir ve Mermer, Usta Zanaatkârların Gelişi fırsatını destekler.

## 🧑‍⚖️ 16. OYUNCU MÜDAHALESİ

Oyuncular bazı etkin kötü olaylara Akademi karakterleriyle müdahale edebilir:

• `/tuccar karaborsa-tasfiyesi`: Müsait Tüccarı kendi yerleşkesindeki etkin Karaborsaya gönderir. Bir turluk yolculuk tamamlandığında Karaborsa doğrudan sona erer ve Tüccar yerleşkede göreve başlar.
• `/diplomat halkla-uzlas`: Müsait Diplomatı kendi yerleşkesindeki Karaborsa, Salgın, Huzursuzluk veya İsyanı sona erdirmeye gönderir. Görev bir turda tamamlanır.

Halkla Uzlaşma için gereken asgari Diplomat yeteneği:

• Karaborsa: **+1**
• Salgın veya Huzursuzluk: **+2**
• İsyan: **+3**

Diplomat bir İsyanı sona erdirdiğinde açık İsyan kaldırılır ancak yerleşkenin Huzursuzluk durumu etkin kalır. Kuraklık, Kıtlık ve olumlu olaylar şu anda Halkla Uzlaşma hedefi değildir; bunlar yönetici tarafından sonuçlandırılır.

## 🕊️ 17. OLAY SONUÇLARI VE SONA ERME

Bir olayın başlaması tek başına gelir, hazine, nüfus, bina veya birlik değiştirmez. Yönetici olayın anlatısına göre **Hafif, Orta, Ağır veya Özel** sonuç belirler.

Sonuçlar gerektiğinde şu komutlarla elle işlenir:

• `/yonetim nufus-sil` — Özgür veya köle nüfusu kaybı
• `/nufus-ekle` — Özgür veya köle nüfusu kazanımı
• `/yonetim yerleske-hazinesi` — Yerel hazine artışı veya kaybı
• `/gelir-cezasi uygula` — Süreli yerleşke geliri cezası
• `/milis-ekle` — Yerel Gönüllüler veya olay kaynaklı Milis
• `/yonetim harap` — Yönetici kararıyla haraplık durumunun değiştirilmesi

Etkin olay, yönetici tarafından `/olay sonlandir` kullanılana veya `/olay aktif` panelinden kaldırılana kadar yerleşke belgesinde görünmeye devam eder.

Olumlu olaylarda ödül uygulandıktan sonra olay sonlandırılır. Kötü olaylarda yönetici bir olay zinciri, kontrol zarları ve yayılma sonuçları kullanabilir. Sayısal şiddet, kontrol ve yayılma kuralları **Yerleşke Olayı Sonuçları** metninde ayrıca açıklanır.

## 🤖 18. YÖNETİCİ KOMUTLARI

• `/olay riskler tur:<olay> [ulke]` — Ağırlıkları ve havuz dışı kalma nedenlerini gösterir.
• `/olay sec tur:<olay> [ulke]` — Ağırlıklı seçim yapar; olay henüz başlamaz.
• `/olay uygula tur:<olay> [ulke] [yerleske]` — Bekleyen seçimi veya belirtilen uygun yerleşkeyi uygular.
• `/olay aktif` — Bütün etkin olayları gösterir ve panel üzerinden sonlandırma sağlar.
• `/olay sonlandir tur:<olay> ulke:<ülke> yerleske:<yerleşke>` — Etkin olayı kaldırır.
• `/olay-yoneticisi` — Bir üyeye Olay Yöneticisi rolü verir veya rolü kaldırır; yalnız Oyun Yöneticisi kullanabilir.

Eski `/olay salgin`, `/olay salgin-iyilesme` ve `/olay karaborsa` komutları özel manuel işlemler için sistemde tutulmaktadır. Genel olay seçimi ve yönetimi için ana yöntem `/olay riskler`, `/olay sec`, `/olay uygula`, `/olay aktif` ve `/olay sonlandir` komutlarıdır.

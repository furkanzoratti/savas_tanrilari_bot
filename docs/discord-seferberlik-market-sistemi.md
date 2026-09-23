# 📜 ANTİK MEDENİYETLER ROLE PLAY — SEFERBERLİK, ASKER ALIMI VE ASKERÎ MARKET SİSTEMİ

## ⚖️ 1. TEMEL KURALLAR

• Her 3 rol turunda bir **Alım Turu** gerçekleştirilir.

• Normal asker, gemi, bina ve Mühendislik Atölyesi üretim emirleri yalnızca Alım Turlarında verilebilir.

• Merdiven Grubu ve Koçbaşı, aktif bir kuşatma sırasında Alım Turu beklenmeden hazırlanabilir.

• Seferberlik ilanı yeni askerleri anında ortaya çıkarmaz. Seferberlik; askerî personel sınırını, yerleşke Eğitim Kapasitesini, ekonomik etkileri ve askerlerin hazır olma dalgalarını değiştirir.

• Birlikler hazır olduklarında satın alındıkları yerleşkenin asker stokuna eklenir. Herhangi bir orduya otomatik olarak katılmazlar. Oyuncu hazır askerleri daha sonra `/ordu asker-ekle` ile istediği kalıcı orduya tahsis eder.

• Gemiler hazır olduklarında üretildikleri limanın rezervine eklenir. Herhangi bir filoya otomatik olarak katılmazlar. Oyuncu hazır gemileri `/filo gemi-ekle` ile filosuna tahsis eder.

• Asker, gemi, bina ve kuşatma aleti ücretleri emir verildiği anda seçilen yerleşkenin **yerel hazinesinden** tahsil edilir.

• Asker, gemi ve bina bakım giderleri her Alım Turunda bağlı oldukları yerleşkenin yerel hazinesinden kesilir.

• Eğitimdeki askerlerden ve üretimi devam eden gemilerden bakım alınmaz. Hazır birlikler, hazır oldukları ilk Alım Turunun bakım hesabına dâhil edilir.

• Kuşatma altındaki savunmacı yerleşke yeni asker, Gözcü, gemi, bina veya atölye üretim emri veremez.

• Daha önce başlatılmış asker eğitimleri ve bina inşaatları kuşatma sırasında ilerlemeye devam eder.

• Kuşatma sürerken mevcut gemi ve kuşatma aleti üretimleri teslim edilmez. Kuşatma kalktıktan sonraki tur ilerlemesinde teslim edilir.

• Yerleşke fethedilirse tamamlanmamış asker, gemi ve kuşatma aleti siparişleri iptal edilir; bunlar için ödenen altın otomatik olarak geri verilmez.

• Yeni fethedilmiş ve henüz asimile edilmemiş yerleşkelerde asker, Gözcü ve gemi alımı yapılamaz.

• Normal asker alımı en az **100 kişi** ve 100'ün katları hâlinde yapılır. Fiyatlar 1.000 asker üzerinden gösterilir ve alınan miktara orantılı hesaplanır.

• Asker ve gemi alımı sırasında yerleşke nüfusu ayrıca azaltılmaz. Bu personel, özgür nüfusun silah altındaki bölümünü temsil eder.

• Asker terhis edildiğinde nüfusa yeniden kişi eklenmez.

• Kara savaşlarında ölen devlet askerleri, bağlı oldukları kaynak yerleşkelerin özgür nüfusundan **1:1** oranında düşülür.

• Devlet gemisi kaybedildiğinde zorunlu mürettebat, geminin kaynak yerleşkesinin özgür nüfusundan düşülür.

## ⚔️ 2. AKTİF ASKERÎ PERSONEL SINIRI

Aktif askerî personel sınırı, devletin asimile edilmiş yerleşkelerindeki toplam özgür nüfus üzerinden hesaplanır.

Hesaba katılmayan nüfus:

• Köle nüfusu
• Yeni fethedilmiş ve henüz asimile edilmemiş yerleşkelerin nüfusu
• Yalnızca geçici savunma için ortaya çıkan milisler

Aktif askerî personel kullanımına dâhil olanlar:

• Hazır kara birlikleri
• Standart garnizon birlikleri
• Eğitimde bulunan askerler
• Gözcü birliklerinin personeli
• Hazır gemilerin zorunlu mürettebatı
• Üretim emri verilmiş gemiler için ayrılan mürettebat
• Zorunlu garnizon yenilemesinde bulunan personel
• Kalıcı milis birlikleri

Kalıcı bir orduya tahsis edilen askerler ikinci kez sayılmaz. Ordu kadrosu, yerleşke asker stokunun nasıl bölüştürüldüğünü gösterir.

Her asker kaydı kaynak yerleşkesine bağlı kalır. Bu nedenle asker bir kalıcı orduya eklense bile kaynak yerleşkenin Ordu Limitini kullanmaya devam eder.

Bir yerleşkenin nüfusu askerî personel hesabına katılmıyorsa o yerleşkenin Ordu Limiti ve Eğitim Kapasitesi **0** kabul edilir.

## 🏕️ 3. YERLEŞKE EĞİTİM KAPASİTESİ

Eğitim Kapasitesi, bir yerleşkenin tek bir Alım Turunda eğitime alabileceği yeni asker sayısını gösterir.

• **Ordu Limiti:** Yerleşkeye bağlı tutulabilecek toplam askerî personeldir.

• **Eğitim Kapasitesi:** Aynı Alım Turunda verilebilecek yeni asker ve Gözcü eğitim emirlerinin toplamıdır.

Yerleşkede önceden bulunan askerler Eğitim Kapasitesini tüketmez. Yalnızca o Alım Turunda verilen yeni eğitim emirleri kapasiteden düşülür.

Asker alımı için aşağıdaki şartların tamamı karşılanmalıdır:

• Yerleşkenin Ordu Limitinde yeterli alan bulunmalıdır.
• Yerleşkenin o Alım Turundaki Eğitim Kapasitesi yeterli olmalıdır.
• Devletin genel askerî personel sınırında yeterli alan bulunmalıdır.
• Yerleşkenin yerel hazinesinde yeterli altın bulunmalıdır.

Kullanılmayan Eğitim Kapasitesi sonraki Alım Turuna aktarılmaz.

## 🕊️ 4. SEFERBERLİK SEVİYELERİ

### 🟢 BARIŞ DÜZENİ

• Azami askerî personel: Asimile edilmiş özgür nüfusun **%7,5'i**
• Yerleşke Eğitim Kapasitesi: Yerleşke nüfusunun **%5'i**
• Gelir cezası: Yok
• Nüfus artışı cezası: Yok
• Ek bakım cezası: Yok
• Hazır olma süresi: Siparişin tamamı **2 rol turu** sonra hazır olur.

### 🟡 KISMİ SEFERBERLİK

• Azami askerî personel: Asimile edilmiş özgür nüfusun **%12,5'i**
• Yerleşke Eğitim Kapasitesi: Yerleşke nüfusunun **%10'u**
• Gelir cezası: **-%10**
• Nüfus artışı cezası: **-%25**
• Ek bakım cezası: Yok
• Hazır olma süresi: Siparişin **%50'si 1 rol turu**, kalan **%50'si 2 rol turu** sonra hazır olur.

### 🔴 GENEL SEFERBERLİK

• Azami askerî personel: Asimile edilmiş özgür nüfusun **%17,5'i**
• Yerleşke Eğitim Kapasitesi: Yerleşke nüfusunun **%15'i**
• Gelir cezası: **-%25**
• Nüfus artışı cezası: **-%75**
• Asker ve donanma bakımı: **+%25**
• Hazır olma süresi: Siparişin **%40'ı 1 rol turu**, **%35'i 2 rol turu**, kalan **%25'i 3 rol turu** sonra hazır olur.

## 📯 5. SEFERBERLİK İLANI VE KALDIRILMASI

• Seferberlik seviyesi tur açıkken `/seferberlik` komutuyla ilan edilebilir veya yükseltilebilir.

• Yeni seferberlik seviyesi, değişiklikten sonra verilen asker emirlerinin personel sınırını, Eğitim Kapasitesini ve hazır olma dalgalarını belirler.

• Gelir, nüfus artışı ve bakım etkileri ilk ilgili Alım Turunda uygulanır. Tamamlanmış bir Alım Turuna geriye dönük etki uygulanmaz.

• Seferberlik seviyesi yalnızca Alım Turunda düşürülebilir.

• Genel Seferberlik en az bir tam Alım Dönemi boyunca sürmelidir. Mevcut üç turluk düzende bu süre en az **3 rol turudur**.

• Seferberlik düşürülecekse mevcut askerî personel yeni seviyenin sınırını aşmamalıdır.

• Aynı seviyenin yeniden seçilmesi asgari bekleme süresini yeniden başlatmaz.

• Seferberlik, Alım Turlarının üç turluk sıklığını değiştirmez ve standart turlarda yeni üretim hakkı sağlamaz.

• Hazır olma dalgaları her asker türü için ayrı hesaplanır. Bölünemeyen küsuratlar son teslimat dalgasına eklenir.

## ⚠️ 6. ASKERÎ PERSONEL SINIRININ AŞILMASI

Nüfus, asimilasyon veya toprak kaybı nedeniyle personel sınırı aşılırsa mevcut birlikler anında silinmez.

Bu durumda:

• Yeni asker, Gözcü veya gemi emri verilemez.
• Uygunsa daha yüksek bir seferberlik seviyesine geçilebilir.
• Tahsis edilmemiş askerler terhis edilerek personel kullanımı azaltılabilir.
• Bot sınır aşımının başladığı turu kaydeder ve düzeltme için bir Alım Dönemi tanır.

Sınır aşımı giderilmezse asker ve donanma bakımına **+%25 sınır aşımı cezası** uygulanır. Bu ceza, Genel Seferberliğin +%25 bakım etkisiyle çarpılarak birlikte uygulanır.

## ⚔️ 7. KARA BİRLİĞİ FİYATLARI VE BAKIMI

Aşağıdaki değerler **1.000 asker** içindir. Daha küçük alımlar 100'ün katları hâlinde ve orantılı bedelle yapılır.

### Standart Birlikler

• Hafif Piyade / Ciritçi: **1.000 Altın** — Bakım: **100 Altın**
• Sapancı: **1.500 Altın** — Bakım: **150 Altın**
• Mızraklı Piyade: **2.000 Altın** — Bakım: **200 Altın**
• Okçu: **2.500 Altın** — Bakım: **250 Altın**
• Ağır Piyade: **4.500 Altın** — Bakım: **450 Altın**
• Hafif Süvari: **3.000 Altın** — Bakım: **300 Altın**
• Ağır Süvari: **5.000 Altın** — Bakım: **500 Altın**

### Özel Birlikler

Özel birlikler yalnızca ilgili devlete açılmışsa satın alınabilir.

• Lejyoner: **5.000 Altın** — Bakım: **500 Altın**
• Hoplit: **3.500 Altın** — Bakım: **400 Altın**
• Atlı Okçu: **4.500 Altın** — Bakım: **450 Altın**
• Deve Süvarisi: **4.000 Altın** — Bakım: **350 Altın**
• Briton Uzun Yaycıları: **3.500 Altın** — Bakım: **400 Altın**
• Pers Ölümsüzleri: **5.000 Altın** — Bakım: **500 Altın**
• Kartaca Savaş Filleri: **6.500 Altın** — Bakım: **650 Altın**
• İber Caetratileri: **3.000 Altın** — Bakım: **300 Altın**
• Cermen Şok Savaşçıları: **3.500 Altın** — Bakım: **350 Altın**
• Anadolu Kalkanlıları (Thureophoroi): **3.000 Altın** — Bakım: **300 Altın**

### 🪙 Bakım Hesaplaması

Konuma bağlı bakım çarpanları şu anda **pasiftir**. Garnizondaki, dost bölgede veya düşman bölgesindeki aynı birlik, aynı temel bakım oranını kullanır.

Bakımı değiştiren etkin unsurlar:

• Genel Seferberlik: **+%25**
• Etkin personel sınırı cezası: **+%25**
• Tahıl erişimi: Ordu bakımı **-%10**
• Kurulabilir ülke ve diğer özel devlet etkileri

Kayıplar nedeniyle 1.000 kişinin altına düşen birliklerin bakımı mevcut asker sayısıyla orantılı hesaplanır ve yukarı yuvarlanır.

Gözcü bakımı birlik adedine göre sabittir; personeli eksilse bile etkin Gözcü Birliği temel Gözcü bakımını kullanır.

### ⚠️ Bakım Açığı ve Terhis

• Yerel hazinesi sıfırın altına düşen bir devletin bakım açığı bulunur.

• Bakım açığı giderilmeden yeni asker, Gözcü, gemi, atölye kuşatma aleti veya saha kuşatma aleti alınamaz.

• `/asker-terhis` yalnızca kalıcı ordulara tahsis edilmemiş askerler üzerinde kullanılabilir.

• Terhis edilen askerler stoktan silinir; nüfusa eklenmez ve altın iadesi sağlamaz.

## 🛡️ 8. MİLİS KURALI

Milisler normal marketten satın alınamaz. Yalnızca politika, etkinlik veya yönetici kararıyla oluşturulabilir.

### Geçici Savunma Milisleri

• Yalnızca bağlı oldukları yerleşkeyi savunabilir.
• Yerleşkeden ayrılamaz.
• Askerî personel sınırına dâhil değildir.
• Bakım ödemez.
• Etkileri sona erdiğinde dağıtılır.
• Savaşta ölen geçici milisler yerleşke nüfusundan düşülür.

### Kalıcı Milisler

• Askerî personel sınırına dâhildir.
• Kaynakta farklı bir değer belirtilmedikçe 1.000 kişi başına **100 Altın** bakım öder.
• Normal bir ordu birliği gibi kalıcı ordulara tahsis edilebilir.

## 👁️ 9. GÖZCÜ BİRLİĞİ

• Alım fiyatı: **500 Altın**
• Bakım: **100 Altın / Alım Turu**
• Standart personel yükü: **200 kişi**
• Hazır olma süresi: **1 rol turu**
• Her yerleşkede en fazla 1 Gözcü bulunabilir.
• Aynı eyalette aynı devlete ait en fazla 1 Gözcü bulunabilir.

Gözcü yalnızca Alım Turunda `/gozcu-alimi` ile satın alınabilir. Normal 100 kişilik asker alım kuralından muaftır.

Gözcü, satın alındığı yerleşkeye bağlı sabit bir birliktir ve aktif askerî personel sınırı ile Eğitim Kapasitesinden 200 kişi kullanır.

Koordinatlı keşif sistemi kullanıldığında Gözcü, bağlı olduğu yerleşkenin Hex'i ile çevresindeki komşu Hex'leri kapsar.

Yerleşke düşerse bağlı Gözcü kaydı imha edilir.

## 🛠️ 10. MÜHENDİSLİK ATÖLYESİ VE ÜRETİM SLOTLARI

### 🔨 Mühendislik Atölyesi Sv1

• Kuşatma sırasında Koçbaşı hazırlama hakkını açar.
• Balista üretimini açar.
• Her Alım Turunda **1 üretim slotu** sağlar.

### ⚒️ Mühendislik Atölyesi Sv2

• Mantlet Grubu, Katapult ve Hafif Sur Balistası üretimini açar.
• Her Alım Turunda toplam **2 üretim slotu** sağlar.

### 🏗️ Mühendislik Atölyesi Sv3

• Kuşatma Kulesi üretimini açar.
• Her Alım Turunda toplam **3 üretim slotu** sağlar.
• Bu atölyede üretilen Balista ve Katapultların ilgili savaş hasar zarlarına **+1** verir.

### ⚙️ Üretim Slotu

• Mantlet Grubu, Balista, Hafif Sur Balistası ve Katapult: **1 slot / adet**
• Kuşatma Kulesi: **2 slot / adet**
• Merdiven Grubu ve Koçbaşı: Saha aracı oldukları için atölye slotu kullanmaz.

Slot kullanımı yalnız emrin verildiği Alım Turu için hesaplanır. Kullanılmayan slotlar sonraki Alım Turuna aktarılmaz.

## 🏹 11. KUŞATMA ALETİ FİYATLARI VE ÜRETİMİ

### 🪵 Sahada Hazırlanan Araçlar

• 1 Merdiven Grubu — 10 Merdiven: **500 Altın**
• 1 Koçbaşı: **2.000 Altın**

Merdiven ve Koçbaşı yalnızca aktif kuşatma başladıktan sonra, savaş zarları atılmadan önce alınabilir.

Koçbaşı için ödeme yapan yerleşkede Mühendislik Atölyesi Sv1 bulunmalıdır. Bir kuşatmada en fazla **1 Koçbaşı** kullanılabilir.

Saha araçları kuşatma sona erdiğinde başka bir yerleşkeye veya savaşa taşınmaz.

### 🏭 Atölyede Üretilen Araçlar

• Mantlet Grubu: **1.000 Altın** — 1 Tur — Atölye Sv2 — 1 slot
• Balista: **3.000 Altın** — 2 Tur — Atölye Sv1 — 1 slot
• Hafif Sur Balistası: **2.500 Altın** — 2 Tur — Atölye Sv2 — 1 slot
• Katapult: **4.000 Altın** — 3 Tur — Atölye Sv2 — 1 slot
• Kuşatma Kulesi: **5.000 Altın** — 3 Tur — Atölye Sv3 — 2 slot

Atölye üretim emri yalnızca Alım Turunda `/kusatma-uretimi` ile verilebilir.

Tamamlanan araçlar üretildikleri yerleşkenin stokuna eklenir. Taşınabilir araçların bir kalıcı orduya verilmesi için `/ordu kusatma-aleti-ekle` kullanılır.

Bir şehirde en fazla **4 Hafif Sur Balistası** bulunabilir. Hafif Sur Balistası savunma aracıdır ve başka bir yerleşkeye taşınamaz.

Kuşatma aletleri düzenli bakım ödemez.

## 🏰 12. KUŞATMA SAVAŞINDA ARAÇLAR VE HÜCUM ERİŞİMİ

Kuşatma savaşında A tarafı saldıran, B tarafı savunandır. Saldıranın normal kuşatma cephesi **15.000 askerdir**.

Sur ve kapı birlikte sağlamken:

• 1 Merdiven Grubu, **1.000 Hücum Birliğine** erişim sağlar.
• 1 Kuşatma Kulesi, **3.000 Hücum Birliğine** erişim sağlar.
• Kuleler kapasite hesabında önce, merdivenler kalan alanda değerlendirilir.
• Toplam hücum erişimi 15.000 kişilik cepheyi aşamaz.
• Sur veya kapı yıkılırsa saldıranın normal 15.000 kişilik cephesi açılır.

Hücum Birlikleri:

• Hafif Piyade / Ciritçi
• Milis
• Mızraklı Piyade
• Ağır Piyade
• Lejyoner
• Hoplit
• Pers Ölümsüzleri
• İber Caetratileri
• Cermen Şok Savaşçıları
• Anadolu Kalkanlıları

Sadece menzilli veya atlı birliklerden oluşan ordu şehir ele geçiremez. Hücum Birliği kalmayan kuşatan taraf geri çekilir.

Kuşatan taraf, sur ve kapı sağlamken `/savas suvari-indir` ile seçtiği süvarileri yaya karşılıklarıyla savaştırabilir. Kayıplar yine özgün süvari kaydından düşer.

### 🎲 Araçların Savaş Etkileri

• Merdiven Grubu: Zar üretmez; 1.000 Hücum Birliğine erişim sağlar.
• Koçbaşı: **1d8 × 35 Kapı Hasarı**
• Mantlet Grubu: Adet başına **1d4 Çarpışma**; savunanın saldırana Hasarını adet başına %5 azaltır, azami %50.
• Balista — Sur: Adet başına **1d10 × 5 Sur Hasarı**
• Balista — Ordu: Adet başına **1d10 Hasar**
• Katapult — Sur: Adet başına **2d20 × 20 Sur Hasarı**
• Katapult — Ordu: Adet başına **1d20 Hasar**
• Kuşatma Kulesi: Adet başına **2d20 Çarpışma + 1d6 Hasar** ve 3.000 Hücum Birliğine erişim
• Hafif Sur Balistası: Adet başına **2d8 Savunma Hasarı**

Bir araç türünden aynı savaş turunda en fazla 25 adet etkin olabilir. Koçbaşı 1 adetle; kule ve merdivenler ayrıca 15.000 kişilik erişim cephesiyle sınırlıdır.

## 💣 13. BOMBARDIMAN

Saldıran taraf, ordu hücumuna başlamadan önce yalnızca sur hedefli Katapultlarla bombardıman yapabilir.

• Bombardıman sırasında ordular temas etmez.
• Asker kaybı, baskı ve normal savaş turu ilerlemesi oluşmaz.
• Bir kuşatma aynı oyun turunda en fazla **4 kez** bombalanabilir.
• Bombardıman hakları yeni oyun turunda yenilenir.
• Hücum başladıktan sonra bombardıman aşamasına geri dönülemez.
• Sur yıkılırsa bombardıman sona erer ve saldırgan hücuma geçer.

Şehrin düşme şartları, tahkimat çarpanları, baskı, açlık ve kayıp hesapları güncel **Savaş Sistemi** belgesinde açıklanır.

## 🚢 14. SAVAŞ GEMİLERİ

### 💰 Fiyat, Bakım ve Kapasite

• Kerkouros: **750 Altın** — Bakım **75** — Mürettebat **50** — Taşıma **200** — Yapım **2 Tur** — Rıhtım **1**
• Trireme: **1.500 Altın** — Bakım **150** — Mürettebat **100** — Taşıma **500** — Yapım **3 Tur** — Rıhtım **2**
• Quinquereme: **3.000 Altın** — Bakım **300** — Mürettebat **150** — Taşıma **800** — Yapım **4 Tur** — Rıhtım **4**

### 👥 Mürettebat

• Hazır ve üretimdeki gemilerin zorunlu mürettebatı aktif askerî personel sınırına dâhildir.

• Mürettebat, geminin asker taşıma kapasitesini kullanmaz.

• Gemi alındığında mürettebat nüfustan ayrıca düşülmez.

• Kaybedilen Kerkouros için 50, Trireme için 100, Quinquereme için 150 mürettebat kaynak yerleşkenin nüfusundan düşülür.

### ⚓ Filo Tahsisi ve Ordu Taşıma

• Hazır gemiler önce kaynak limanın rezervinde bulunur; `/filo gemi-ekle` ile filoya tahsis edilir.

• Aynı gemi aynı anda yalnızca bir filoya tahsis edilebilir.

• Bir filoya ordu bindirilmiş olması filoya **yeni gemi eklenmesini engellemez**.

• Ordu taşıyan filodan gemi çıkarmak, komutanı değiştirmek veya filoyu dağıtmak için önce taşınan yük boşaltılmalıdır.

• Etkin savaşa bağlı bir filonun kadrosu değiştirilemez.

## ⚓ 15. LİMAN VE TERSANE KAPASİTESİ

### 🛟 Liman Rıhtım Kapasitesi

• Liman Sv1: **30 rıhtım puanı**
• Liman Sv2: **40 rıhtım puanı**
• Liman Sv3: **50 rıhtım puanı**

Kaynak limana bağlı hazır gemiler ve devam eden gemi üretimleri rıhtım kapasitesini kullanır. Bir geminin filoya tahsis edilmesi kaynak liman bağını veya rıhtım kullanımını kaldırmaz.

Kapasiteyi aşan eski kayıtlar otomatik silinmez; kullanım sınırın altına inene kadar yeni gemi siparişi verilemez.

### 🏗️ Gemi Üretim Puanları

• Kerkouros: **1 puan**
• Trireme: **2 puan**
• Quinquereme: **4 puan**

### 🔨 Tersane Seviyeleri

• Tersane Sv1: **5 üretim puanı**; Quinquereme üretilemez.
• Tersane Sv2: **10 üretim puanı**
• Tersane Sv3: **15 üretim puanı**

Quinquereme üretmek için en az Tersane Sv2 gerekir.

Oyuncular aynı Alım Turunda farklı gemi türlerini birlikte sipariş edebilir. Toplam üretim puanı Tersane sınırını, toplam rıhtım puanı ise Liman kapasitesini aşamaz.

Tersane ücretsiz gemi sağlamaz; yalnızca ücretli üretimin azami kapasitesini belirler.

## 🧱 16. ORDU VE FİLO TAHSİSİ

• Hazır askerler yerleşke stokunda tutulur ve `/ordu asker-ekle` ile orduya ayrılır.

• Orduya ayrılan askerler kaynak yerleşkenin stokunda ve Ordu Limiti hesabında kalır; yalnızca başka bir orduya ikinci kez tahsis edilemez.

• `/ordu asker-cikar`, askerin ordu tahsisini kaldırır. Asker kaynak yerleşkede hemen yeniden kullanılabilir.

• `/ordu dagit`, hayatta kalan askerleri silmez; bütün asker tahsislerini kaynak yerleşkelere bırakır.

• Hazır gemiler liman rezervinde tutulur ve `/filo gemi-ekle` ile filoya ayrılır.

• `/filo gemi-cikar`, geminin filo tahsisini kaldırır ve gemiyi kaynak liman rezervine döndürür.

## 🧱 17. HAMMADDE VE İNDİRİMLER

Belgede gösterilen fiyatlar temel fiyatlardır. Etkin hammadde, politika, Tüccar görevi ve devlet bonusları nihai bedeli değiştirebilir.

Askerî alımları doğrudan etkileyen hammaddeler:

• Tahıl: Ordu bakımı **-%10**
• Demir: Mızraklı, Ağır Piyade ve Ağır Süvari alımı **-%10**; Koçbaşı, Katapult ve Balista **-%10**
• Kereste: Gemi üretimi **-%10**
• At: Hafif Süvari, Ağır Süvari ve Atlı Okçu alımı **-%10**
• Deri: Hafif Piyade, Okçu ve Sapancı alımı **-%10**; Mantlet, Koçbaşı ve Kuşatma Kulesi **-%10**
• Kurşun: Sapancı alımı **-%10**; Katapult ve Balista **-%10**

Aynı alıma birden fazla geçerli kaynak indirimi uygulanabilir. Kaynak indirimlerinin toplamında nihai maliyet çarpanı en fazla **%50'ye** kadar düşebilir. Devlet ve Tüccar etkileri bot tarafından ayrıca hesaplanır.

Bir yerleşkenin iki etkin ticareti varsa kendi yerel hammaddesinin etkisini kullanamaz; yalnız ticaretle eriştiği hammaddeler geçerli olur.

## 🤖 18. TEMEL OYUNCU KOMUTLARI

• `/belge` — Devletin hazine, nüfus, gelir, limit, birlik, gemi ve üretim durumunu gösterir.
• `/seferberlik` — Devletin seferberlik seviyesini değiştirir.
• `/asker-alimi` — Alım Turunda yerleşkeden asker siparişi verir.
• `/gozcu-alimi` — Alım Turunda yerleşkeye Gözcü alır.
• `/asker-terhis` — Tahsis edilmemiş hazır askerleri kalıcı olarak terhis eder.
• `/gemi-alimi` — Alım Turunda tersaneden gemi siparişi verir.
• `/kusatma-uretimi` — Alım Turunda Mühendislik Atölyesinde araç üretir.
• `/alim` — Alım Turunda bina inşası veya seviye yükseltmesi başlatır.
• `/ordu olustur` — Kalıcı ordu kurar.
• `/ordu asker-ekle` ve `/ordu asker-cikar` — Hazır asker tahsislerini yönetir.
• `/ordu kusatma-aleti-ekle` ve `/ordu kusatma-aleti-cikar` — Taşınabilir araç tahsislerini yönetir.
• `/filo olustur` — Kalıcı filo kurar.
• `/filo gemi-ekle` ve `/filo gemi-cikar` — Hazır gemi tahsislerini yönetir.

Bot; yerel hazineyi, Eğitim Kapasitesini, yerleşke ve devlet Ordu Limitini, Tersane üretim puanını, Liman rıhtım kapasitesini, bina/atölye slotlarını ve geçerli indirimleri emri onaylamadan önce otomatik olarak denetler.

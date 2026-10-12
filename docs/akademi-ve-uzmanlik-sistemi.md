# 🎓 ANTİK MEDENİYETLER ROLE PLAY: AKADEMİ VE UZMANLIK SİSTEMİ

Akademiler; **Komutan, Tüccar, Casus ve Diplomat** yetiştirir. Uygun bir Komutan daha sonra kalıcı olarak **Amirale** dönüştürülebilir.

## 🏛️ AKADEMİLER VE KARAKTER SINIRI

- Her aktif Akademi binası devlete **5 etkin karakter kapasitesi** sağlar.
- Akademinin seviyesi kapasiteyi değiştirmez: 1 Akademi 5, 2 Akademi 10, 3 Akademi 15 karakter barındırır.
- Mevcut karakter sayısı sınırı aşarsa hiçbir karakter silinmez. Ancak kapasite yeniden yeterli hâle gelene kadar yeni eğitim başlatılamaz.
- Devam eden eğitimler de kapasitede yer ayırır.
- Akademi Sv1'den Sv2'ye veya Sv2'den Sv3'e geliştirilirken mevcut seviyesiyle karakter eğitmeye devam eder.
- Her Akademi, her Alım Turunda yalnızca bir karakter yetiştirebilir.
- Karakter eğitimi yalnızca Alım Turunda `/akademi egit` ile başlatılır.

### Akademi seviyeleri

- **Akademi Sv1:** 1d40 atılır. Casus, Tüccar, Komutan ve Diplomat eşit ihtimalle gelir. Karakter **+0** yetişir.
- **Akademi Sv2:** Oyuncu istemediği bir görev türünü havuzdan çıkarır; kalan üç görev için 1d30 atılır. Karakter **+1** yetişir.
- **Akademi Sv3:** Oyuncu yetiştirilecek görev türünü doğrudan seçer. Karakter **+2** yetişir.
- **İpek erişimi:** Akademide yetişen karaktere ayrıca **+1 özellik puanı** verir.
- Devlete veya kurulabilir ülkeye ait özel Akademi bonusları ayrıca uygulanır.

Karakterin özellik puanı Akademiden aldığı kalıcı **+0/+1/+2/+3** değeridir. Görev zarlarına ve karakter türüne bağlı mekaniklere eklenir.

## 👥 KARAKTER YÖNETİMİ

- `/karakterlerim`: Akademi sayısını, toplam kapasiteyi, etkin karakter sayısını, görevleri, konumları, ilerlemeleri ve ölü karakterleri gösterir.
- `/akademi karakterler`: Ülkenin Akademi karakterlerini listeler.
- `/akademi ata`: Uygun karakteri Curia veya Agora/Forum görevine atar.
- `/akademi gorevden-al`: Yalnızca Curia veya Agora/Forum bina atamasını kaldırır; karakter silinmez.
- `/akademi karakteri-gorevden-al`: Boşta bulunan bir karakteri kalıcı olarak Akademi kadrosundan çıkarır. Karakterin tarihî kaydı korunur fakat artık kapasitede yer tutmaz ve yeniden kullanılamaz.

Görevdeki bir karakter kalıcı olarak görevden alınmadan önce mevcut görevi bitirilmelidir. Ölen karakterler kapasitede yer tutmaz; `/karakterlerim` panelinin **Ölü Karakterler** bölümünde karakter türü ve öldüğü şehirle birlikte saklanır.

---

# ⚔️ KOMUTAN

Komutanlar kara ordularına atanır. Özellik puanları savaş zarlarına eklenir; doktrinleri ve uzmanlıkları ise ordunun savaş tarzını belirler.

Bir savaş tarafında birden fazla Komutan bulunabilir. Bot, tarafın **özellik puanı en yüksek** uygun Komutanını otomatik olarak Başkomutan yapar. Eşitlikte uzmanlık seviyesi, zafer sayısı ve ardından ad sırası kullanılır. Taraf çapındaki doktrin ve uzmanlık etkilerini yalnız bu Başkomutan uygular; Başkomutan elle seçilmez.

## 📜 Komutan doktrinleri

Doktrin `/komutan doktrin-sec` ile bir kez seçilir ve sonradan değiştirilemez.

### 🔥 Saldırı Doktrini

- Çarpışma gücü ×1,05
- Alınan kayıplar ×1,05

### 🛡️ Savunma Doktrini

- Alınan hasar ×0,95
- Verilen hasar ×0,95

### ⚖️ Esnek Düzen

- Olumsuz ordu kompozisyon çarpanını bir kademe iyileştirir.
- ×0,80 → ×0,90
- ×0,90 → ×1,00
- Pozitif kompozisyon bonusu sağlamaz.

### 🏳️ Düzenli Geri Çekilme

- Geri çekilme kayıpları %20 azalır.
- Çarpışma gücü ×0,97

### 🏰 Kuşatma Hazırlığı

- Kuşatma aletlerinin sur ve kapı hasarı %5 artar.
- Meydan ve deniz savaşlarında çalışmaz.

## 🎖️ Komutan gelişimi

- **0–2 zafer:** Sv0
- **3–5 zafer:** Sv1 — `/komutan uzmanlik-sec` açılır.
- **6–8 zafer:** Sv2
- **9 zafer:** Sv3 — Mareşal

Zaferin sayılması için savaş bot üzerinde kesin bir kazananla sonuçlanmalı, en az bir savaş turu çözülmüş olmalı ve Komutanın ordusu savaş kadrosuna önceden eklenmiş olmalıdır. Beyaz barış, iptal veya çatışma yaşanmadan biten savaşlar zafer sayılmaz. Kazanan tarafta yalnızca otomatik seçilen Başkomutan 1 zafer puanı alır; aynı taraftaki diğer Komutanlar puan kazanmaz.

## ⚔️ Komutan uzmanlıkları

Uzmanlık 3 zaferden sonra oyuncu tarafından seçilir, kalıcıdır ve değiştirilemez.

### Meydan Taktisyeni

- **Sv1:** İlk savaş turunda çarpışma ×1,03
- **Sv2:** İlk iki savaş turunda çarpışma ×1,03
- **Sv3:** İlk iki savaş turunda çarpışma ×1,05

### Kuşatma Uzmanı

- **Sv1:** Sur ve kapı hasarı +%5
- **Sv2:** Sur ve kapı hasarı +%10; ilk hücum turunda çarpışma ×1,03
- **Sv3:** Sur ve kapı hasarı +%10; ilk iki hücum turunda çarpışma ×1,03

Savunma tarafındaki kuşatma hasarı bonusu yalnızca surlara yerleştirilen savunma aletlerinde çalışır.

### Muhafız

- **Sv1:** Savaş kayıpları −%3
- **Sv2:** Savaş kayıpları −%5
- **Sv3:** Savaş kayıpları −%7; savaşta yaşanan ilk baskı artışı bir kez yok sayılır.

### Levazımcı

- **Sv1:** Geri çekilme kayıpları −%10
- **Sv2:** Geri çekilme kayıpları −%20; normal savaş kayıpları −%3
- **Sv3:** Geri çekilme kayıpları −%25; normal savaş kayıpları −%5

## 🏅 Mareşal seferberliği

Dokuz kara savaşı kazanan Komutan Mareşal olur. Ülkenin bir Mareşali ve en az bir etkin savaşı varsa Kısmi Seferberlik:

- Askerî personel sınırını nüfusun %12,5'i yapar.
- Eğitim kapasitesini nüfusun %10'u yapar.
- Kısmi Seferberliğin gelir ve nüfus artış cezalarını kaldırır.
- Genel Seferberlik cezalarını, asker bakımını veya sınır aşımı cezalarını kaldırmaz.
- Müttefiklere ve pakt üyelerine aktarılmaz; birden fazla Mareşal ile birikmez.

---

# ⚓ AMİRAL

Amiral Akademiden doğrudan yetişmez. Boşta bulunan bir Komutan, `/komutan amirale-donustur` ile **kalıcı olarak Amirale** dönüştürülür.

- Dönüşüm geri alınamaz.
- Ordu yöneten bir Komutan önce ordu görevinden çıkarılmalıdır.
- Amiraller kara ordularına değil, filolara atanır.
- Filolara yalnızca Amiral atanabilir.
- Kara zaferleri ile deniz zaferleri ayrı tutulur. Eski kara zaferleri Amiral seviyesine aktarılmaz.
- Komutan doktrini ve kara uzmanlığı Amiral etkisi olarak çalışmaz; Amiral kendi deniz doktrinini ve uzmanlığını ayrıca seçer.

## 📜 Amiral doktrinleri

Doktrin `/amiral doktrin-sec` ile bir kez seçilir ve sonradan değiştirilemez.

### 🛡️ Kapalı Savaş Hattı

- Alınan hasar ×0,95
- Verilen hasar ×0,95

### ⚖️ Esnek Filo

- Az çeşitli filolardaki kompozisyon kaybını hafifletir.
- Tek gemi türünde çarpışma ve hasar ×1,03; iki gemi türünde ×1,02 uygulanır.

### 🏳️ Düzenli Ayrılma

- Geri çekilme kayıpları %20 azalır.
- Çarpışma gücü ×0,97

### 🪝 Bordalama Düzeni

- Geri çekilen düşmanın kaybı %15 artar.
- İlk savaş turunda çarpışma gücü ×0,97

### ⚔️ Birleşik Filo Doktrini

- Tek gemi türü: çarpışma ×0,97
- İki gemi türü: çarpışma ×1,03
- Üç gemi türü: çarpışma ×1,05

## 🎖️ Amiral gelişimi

- **0–2 deniz zaferi:** Sv0
- **3–5 deniz zaferi:** Sv1 — `/amiral uzmanlik-sec` açılır.
- **6–8 deniz zaferi:** Sv2
- **9 deniz zaferi:** Sv3

Deniz zaferinin sayılması için savaş botta **Deniz Savaşı** olarak sonuçlandırılmalı, en az bir tur çözülmüş olmalı, kesin kazanan bulunmalı ve Amiralin filosu savaş kadrosuna önceden eklenmiş olmalıdır.

Bir tarafta birden fazla Amiral varsa bot özellik puanı en yüksek Amirali otomatik olarak ana Amiral yapar. Eşitlikte uzmanlık seviyesi, deniz zaferi ve ad sırası kullanılır. Yalnız bu Amiralin etkileri çalışır ve kazanan tarafta yalnız bu Amiral 1 deniz zaferi kazanır.

## ⭐ Amiral uzmanlıkları

Uzmanlık 3 deniz zaferinden sonra oyuncu tarafından seçilir, kalıcıdır ve değiştirilemez.

### 🏴‍☠️ Deniz Akıncısı

- **Sv1:** Deniz yağması zarına +1
- **Sv2:** Yağma ganimeti +%15; yakalanma zarına −1
- **Sv3:** Yağma ganimeti +%25; yağma kayıpları −%20

### ⚔️ Hat Amirali

- **Sv1:** İlk deniz savaşı turunda çarpışma ×1,03
- **Sv2:** İlk iki deniz savaşı turunda çarpışma ×1,03
- **Sv3:** İlk iki deniz savaşı turunda çarpışma ×1,05

### 🛡️ Filo Muhafızı

- **Sv1:** Gemi kayıpları −%3
- **Sv2:** Gemi kayıpları −%5
- **Sv3:** Gemi kayıpları −%7; geri çekilme kayıpları ayrıca −%10

### ⚓ Abluka Uzmanı

- Uzmanlığı olmayan filonun ablukası hedef yerleşkenin deniz ticaretini %10 düşürür.
- **Sv1:** Deniz ticareti kaybı %15
- **Sv2:** Deniz ticareti kaybı %30
- **Sv3:** Deniz ticareti kaybı %60; yerleşke aynı anda kuşatma altındaysa açlık dayanıklılığı bir kez 1 tur azalır.
- Kuşatma bitmeden abluka kaldırılırsa azaltılan 1 tur geri verilir.

Abluka ve deniz yağması formlarını yönetici açar. Deniz yağmasında oyuncu formdaki düğmeyle zarını atar; zar ayrıntıları gizli kalır, yalnızca sonuç ve yağmalanan Altın açıklanır.

---

# 💰 TÜCCAR

Tüccarlar Agora/Forum yönetimi, yerel ticaret, yabancı ticari imtiyaz, satın alma temsilciliği ve karaborsa tasfiyesi görevlerinde kullanılır. Aynı anda yalnızca bir görev yapabilirler. Yolculuk gerektiren görevlerde hedefe ulaşmaları 1 tur sürer.

Tüccarların doğrudan Altın üreten bütün görev kazançları hesaplamanın sonunda **×1,10** ile artırılır. Agora/Forum yöneticiliğinin temel +%10 gelir etkisi de %10 güçlendirilerek **+%11** olur.

## 🏛️ Agora/Forum yöneticiliği

Tüccar en az Sv2 Agora/Forum bulunan bir yerleşkeye `/akademi ata` ile atanabilir.

- Temel yerleşke gelir bonusu: +%11
- Her özellik puanı: ilave +%2
- Agora Ustası uzmanlığı: ilave +%2
- Karaborsa ihtimali %60 azalır.
- Agora Sv3 ve görevli Tüccar varsa Karaborsa tamamen engellenir.

## 🪙 Yerel ticaret

`/tuccar yerel-ticaret` ile başlatılır. Her Alım Turunda:

- Etkin oran = 1d10 + özellik puanı + varsa Kervanbaşı bonusu
- Etkin oran en fazla %10'dur.
- Kazanç, Tüccar etkileri uygulanmadan önceki kara ve deniz ticareti üzerinden hesaplanır.
- %10 genel görev artışıyla bir Tüccar bir Alım Turunda en fazla 1.100 Altın kazanabilir; yabancı imtiyazdaki Kervansaray bonusu bunun üzerine uygulanır.
- Kuşatma altındaki yerleşke gelir üretemez.
- Bir yerleşkede aynı anda yalnızca bir yerel Tüccar çalışabilir.

## 🌍 Yabancı ticari imtiyaz

`/tuccar ticari-imtiyaz` ile hedef devlete teklif gönderilir. Kabul edilirse Tüccar 1 tur yolculuk yapar ve sonraki Alım Turlarında gelir üretir.

- Karşılıklı değildir ve hammadde paylaşmaz.
- Hedef hazineden para eksiltmez.
- Yalnızca Tüccarı gönderen ülkeye gelir sağlar.
- Taraflardan biri feshedebilir; savaş veya hedef şehrin el değiştirmesi görevi bitirir.
- Gelir 1d10 + özellik puanı üzerinden hesaplanır; %10 genel görev artışından sonra taban üst sınır 1.100 Altındır ve varsa Kervansaray bonusu ayrıca uygulanır.
- Kazanç, görev başında seçilen kendi yerleşkenize yatırılır; bu hedef sonradan değiştirilemez.

Devletin yabancı ülkelerdeki imtiyaz sınırı normalde 2, Mor Boya erişimiyle 3'tür. Bir hedef şehir Agora seviyesine göre 1/2/3 yabancı Tüccar kabul edebilir.

## 📦 Satın alma temsilciliği

`/tuccar satin-alma-temsilciligi` ile bir sonraki asker, gemi, bina veya kuşatma aleti siparişine hazırlanır.

- +0 Tüccar: %3 indirim
- +1 Tüccar: %5 indirim
- +2 Tüccar: %7 indirim
- +3 Tüccar: %9 indirim
- Mali Müşavir: ayrıca +%2 indirim

İndirim tek siparişte çalışır ve kullanılmadan sonraki Alım Turuna ulaşırsa sona erer.

## 🕯️ Karaborsa tasfiyesi

`/tuccar karaborsa-tasfiyesi` ile etkin Karaborsa bulunan kendi yerleşkenize gönderilir. Ulaştığında ekonomik etkileri durdurur, olayı kontrol altına alır ve yayılmasını engeller.

## ⭐ Tüccar uzmanlıkları

Başarılar uzmanlık dalı bazında ayrı ayrı birikir. Bir dalda 3 başarıya ulaşınca oyuncu `/tuccar uzmanlik-sec` ile açılan dallardan birini seçer. Seçim kalıcıdır; dal değiştirmek diğer dallardaki ilerlemeyi silmez fakat seçimin ardından yalnızca seçilen uzmanlık gelişir.

- **Agora Ustası:** Agora/Forum yöneticiliğinde 3 başarılı Alım Turu; gelir bonusuna +%2
- **Kervanbaşı:** Yerel veya yabancı ticarette 3 başarılı Alım Turu; ticaret gelir zarına +1
- **Mali Müşavir:** Satın alma indirimini 3 kez kullandırma; indirime +%2
- **Pazar Denetçisi:** Karaborsa tasfiyesinde 3 başarı; bu görev dalında uzmanlaşır.

Seçilen uzmanlıkta 3/6/9 başarı sırasıyla Sv1/Sv2/Sv3 açar.

---

# 🕵️ CASUS

Casuslar sabotaj, ekonomik operasyon, istikrarsızlaştırma, askerî operasyon, karakter operasyonu ve karşı casuslukta kullanılır. Casusluk bilgi toplamak için kullanılmaz; hedef ülkenin gizli hazinesi, orduları, binaları veya emirleri oyuncuya açıklanmaz.

## 🗺️ Operasyon döngüsü

`/casusluk gorev-baslat` ile Casus, hedef devlet, hedef şehir, operasyon türü, hazırlık seviyesi ve gerekiyorsa özel hedef seçilir.

- Göreve gidiş 1 tur sürer.
- Operasyon hedefe ulaşılan tur otomatik çözülür.
- Yakalanmayan Casus dönüş turundan sonra yeniden kullanılabilir.
- Görevde, dönüşte, gözaltında veya karşı casuslukta olan Casus yeni göreve gönderilemez.

## 💰 Hazırlık seviyeleri

- **Hazırlıksız:** 0 Altın, saldırı +0, tespit +0
- **Tedbirli:** 500 Altın, saldırı +1, tespit +0
- **Kapsamlı:** 1.000 Altın, saldırı +2, tespit zarına +1
- **Yoğun:** 2.000 Altın, saldırı +3, tespit zarına +2

Hazırlık bedeli yerleşke hazinelerinden alınır ve sonuç ne olursa olsun iade edilmez. Suikastın ayrıca 2.000 Altın temel maliyeti vardır.

## 🎲 Casusluk çözümü

- Saldırı: 1d20 + Casus özelliği + hazırlık + uygun uzmanlık
- Savunma: 1d20 + karşı casusluk + bina güvenliği
- Fark 0 veya altı: Başarısız
- Fark 1–4: Hafif başarı
- Fark 5–8: Orta başarı
- Fark 9+: Ağır başarı

Başarı ve tespit ayrı hesaplanır; başarılı Casus yine de yakalanabilir.

## 🧨 Operasyon grupları

- **Sabotajcı:** Asker alımı sabotajı, bina inşa sabotajı, kuşatma aleti üretimi sabotajı
- **Mali Casus:** Gelir düşürme, hazine çalma
- **Provokatör:** Halkı kışkırtma, olayı körükleme
- **Askerî Ajan:** Ordu firarı, garnizon zehirleme, kuşatma erzağı yakma
- **Suikastçı:** Akademi karakteri veya hanedan/Roma ailesi soylusuna suikast; sonuç hedefi yaralayabilir veya doğrudan öldürebilir
- **Karşı Casus:** Ülke, şehir, tek karakter/soylu veya bütün aile koruması

Yeni operasyonlarda yalnız bu görevler açılır. Eski kaldırılmış görevlerin devam eden kayıtları kaybolmaz ve çözüm turunda sonuçlandırılır.

### Askerî Ajan ayrıntıları

- **Ordu firarı** başlatılırken düşman ordusu seçilmez.
- Operasyon başarılı olursa bot hedef ülkenin asker taşıyan etkin ordularından birini rastgele seçer.
- Firar eden askerler hem seçilen ordudan hem de bağlı kaynak yerleşkelerin asker stokundan silinir.
- **Garnizon zehirleme** yalnız hedef şehrin garnizonunu etkiler.
- **Kuşatma erzağı yakma** yalnız etkin kuşatmada çalışır ve hedefin açlık dayanıklılığını düşürür.

### Suikast ayrıntıları

- Görev açılırken hedef olarak Akademi karakteri, normal hanedan soylusu veya Roma siyasi ailesi üyesi seçilebilir.
- Hafif ve orta başarı hedefi sırasıyla 3 veya 6 tur yaralar/kullanılamaz hâle getirir.
- Ağır başarı hedefi kalıcı olarak öldürür. Hanedan hükümdarı veya varisi ölürse veraset sistemi çalışır.

## 🛡️ Karşı casusluk

- **Ülke geneli:** +1 + Casus özelliği
- **Tek şehir:** +3 + Casus özelliği
- **Şahsi koruma:** +4 + Casus özelliği

Göreve ulaşmak 1 tur sürer. Birden fazla savunma bonusu birikmez; en yüksek uygun savunma kullanılır.

- Ülke savunmasındaki Karşı Casus yalnız ülkeye yönelen ve başarısız olan operasyondan 1 puan alır.
- Şehir savunmasındaki Karşı Casus yalnız kendi koruduğu şehre yönelen ve başarısız olan operasyondan 1 puan alır.
- Tek karaktere/soyluya atanan Karşı Casus yalnız o kişiye yapılan başarısız saldırıdan 1 puan alır; aynı aileye yapılan başka saldırıdan puan alamaz.
- Aileye atanan Karşı Casus yalnız o ailenin üyelerine yapılan başarısız saldırılardan 1 puan alır; aile dışındaki kişisel saldırılardan puan alamaz.
- Savunmada beklemek veya yalnızca saldırganı tespit etmek tur başına puan vermez.

## ⭐ Casus uzmanlıkları

Her görev başarısı ilgili dalda ilerleme sağlar. Bir dalda 3 başarıya ulaşıldığında oyuncu `/casusluk uzmanlik-sec` ile açılmış uzmanlıklardan birini seçer. Seçim otomatik değildir ve kalıcıdır.

- **3 başarı:** Sv1, ilgili operasyonlara +1
- **6 başarı:** Sv2, ilgili operasyonlara +2
- **9 başarı:** Sv3, ilgili operasyonlara +3

Karşı Casus yalnızca kendi koruma kapsamındaki bir düşman operasyonu tamamen başarısız olduğunda 1 ilerleme kazanır. Sadece tespit veya yakalama, operasyon başarılıysa puan vermez.

## ⛓️ Yakalanma ve ölüm

- Yakalanan normal Casus gözaltında kalır; idam edilmezse belirlenen sürenin sonunda ülkesine döner.
- Yakalanan Suikastçı kalıcı olarak ölür.
- Yakalanmış bir Casus, yönetici tarafından `/casusluk-yonetim idam-et` ile kalıcı olarak idam edilebilir.
- Ölüm, Casusun devam eden görevlerini iptal eder ve karakteri **Ölü Karakterler** kaydına taşır.

Operasyonun gizli zarları, gerçek hedef ayrıntıları ve mekanik sonucu yalnızca yönetici kayıtlarında görünür.

---

# 🕯️ MİSYONER

Misyonerler Akademi kapasitesinden bağımsız olarak `/misyoner al` ile yalnız Alım Turunda alınır. Her devlet aynı anda en fazla **5 etkin Misyonere** sahip olabilir. Misyonerler kendi devletlerinin tamamen asimile edilmiş yerleşkelerinde din değiştirme görevi yürütür.

- Alım bedeli: 2.000 Altın
- Görev yolculuğu: 1 tur
- Aynı yerleşkede aynı anda yalnız bir Misyoner görevi yürür.
- Görev, hedef din yerleşkede %100 olduğunda otomatik tamamlanır.

Misyoner ile yürütülen din değiştirme görevinde Misyonerin toplam zarı ile yerleşkenin toplam savunma zarı arasındaki fark kullanılır:

- Fark 1–3: Yerleşke nüfusunun %5'i dönüştürülür.
- Fark 4–7: Yerleşke nüfusunun %10'u dönüştürülür.
- Fark 8 veya üzeri: Yerleşke nüfusunun %15'i dönüştürülür.
- Fark 0 veya daha düşük: O tur din değişimi gerçekleşmez.

Hristiyanlığın komşu yerleşkelere pasif yayılım oranı uygun sınır koşullarında **%10** olarak uygulanır.

# 🤝 DİPLOMAT

Diplomatlar asimilasyon, toplumsal olayların çözümü, kültür değişimi, diplomatik vassallaştırma, vassal entegrasyonu ve egemenlik savunmasında kullanılır.

- Hedefe ulaşmak 1 tur sürer.
- İlk görev zarı hedefe ulaşılan tur atılır.
- Uzun görevler her tur otomatik devam eder; yeniden komut gerekmez.
- Aynı Diplomat aynı anda yalnızca bir görev yapabilir.
- Diplomatik zar: 1d20 + özellik puanı + uygun uzmanlık + görev bonusları
- Direnç zarı: 1d20 + savunmacı Diplomat + Curia + yerel/devlet bonusları

## 🌍 Asimilasyonu hızlandırma

`/diplomat asimilasyon` ile fethedilmiş ve asimilasyonu süren bir yerleşkeye atanır.

- +0/+1 Diplomat süreyi 1 tur kısaltır.
- +2/+3 Diplomat süreyi 2 tur kısaltır.
- Bir yerleşkeye en fazla bir Diplomat atanır.
- Asimilasyon süresi 2 turun altına inmez.
- Tamamlanınca Diplomat otomatik serbest kalır.
- Asimilasyon tamamen bittiğinde görevli Diplomat **1 Eyalet Valisi uzmanlık puanı** kazanır; beklediği her tur için puan kazanmaz.

## 🕊️ Halkla uzlaşma

`/diplomat halkla-uzlas` ile Karaborsa, Salgın, Huzursuzluk veya İsyan olayına gönderilir. Başarılı görev olayı sonlandırır; açık isyan gibi özel durumlar yönetici anlatımına göre ayrıca ele alınabilir.

## 🎭 Kültür değiştirme

`/diplomat kultur-degistir` yalnızca tamamen asimile edilmiş, kuşatma altında olmayan ve ağır olay yaşamayan yerleşkede başlatılabilir. Hedef kültür devletin ana kültürü veya tamamen asimile edilmiş yerleşkelerinden birinin kültürü olmalıdır.

Görev için **8 Kültürel Etki** gerekir:

- Diplomat 1–3 farkla kazanır: +1
- 4–7 farkla kazanır: +2
- 8+ farkla kazanır: +3
- Yerleşke 1–4 farkla kazanır: değişmez
- 5–8 farkla kazanır: −1
- 9+ farkla kazanır: −2

Nüfus direnci 100.000/200.000/300.000 eşiklerinde sırasıyla +1/+2/+3 artar. Diplomat görevden ayrılırsa biriken etki her tur 1 azalır. Kültür tamamen değiştiğinde Diplomat **1 Kültür Elçisi uzmanlık puanı** kazanır; ara turlardaki olumlu ilerleme puan vermez.

## 👑 Diplomatik vassallaştırma

`/diplomat vassallastir` için saldıran devletin gizli güç puanı hedefin en az 1,50 katı olmalıdır. Yalnız devletlerin kendi güçleri sayılır; müttefik, pakt ve mevcut vassallar hesaba katılmaz.

- 1,50–1,74: +1
- 1,75–1,99: +2
- 2,00–2,49: +3
- 2,50 ve üzeri: +4

Kampanyanın hedefi **12 Bağımlılık Puanıdır**:

- Diplomat 1–4 farkla kazanır: +1
- 5–8 farkla kazanır: +2
- 9+ farkla kazanır: +3
- Hedef 1–4 farkla kazanır: değişmez
- Hedef 5–8 farkla kazanır: −1
- Hedef 9+ farkla kazanır: kampanya başarısız olur.

Başarısız kampanyadan sonra aynı devlet 6 tur yeniden hedeflenemez.

## 🏰 Vassal entegrasyonu

`/diplomat vassal-entegre-et` ile etkin vassal üzerinde 0/18 Entegrasyon süreci yürütülür.

- Diplomat 9+ farkla kazanır: +3
- Diplomat 1–8 farkla kazanır: +2
- Beraberlik veya vassal 1–4 farkla kazanır: +1
- Vassal 5–8 farkla kazanır: değişmez
- Vassal 9+ farkla kazanır: −1

Bağlılık aşamaları:

- 0–5: İstikrarsız Vassal
- 6–11: Bağlı Vassal
- 12–17: Sadık Vassal
- 18: Tam Bağlı — İlhaka Hazır

18 puan nihai ilhakı otomatik yapmaz; ilhak yönetici işlemiyle tamamlanır.

## 🛡️ Egemenlik savunması

`/diplomat savunma-ata` ile ülke geneline veya bir yerleşkeye kalıcı savunma atanabilir. Savunmacı Diplomat, ilgili direnç zarına özellik puanını ekler. Curia Sv1/Sv2/Sv3 ayrıca +1/+2/+3 savunma sağlar.

## ⭐ Diplomat uzmanlıkları

Uzmanlık puanı yalnız görev tamamen sonuçlandığında verilir; kısmi tur ilerlemeleri puan değildir. Bir dalda 3 tamamlanmış görev puanına ulaşıldığında oyuncu `/diplomat uzmanlik-sec` ile açılmış dallardan birini seçer. Seçim otomatik değildir ve kalıcıdır.

- **Eyalet Valisi:** Asimilasyon ve Halkla Uzlaşma
- **Kültür Elçisi:** Kültür değiştirme
- **Hegemon Elçisi:** Diplomatik vassallaştırma
- **Mukim Temsilci:** Vassal entegrasyonu

Seçilen dalda 3/6/9 başarı sırasıyla ilgili görevlere +1/+2/+3 verir.

---

# 📌 HIZLI KOMUT LİSTESİ

- `/karakterlerim` — bütün karakterler, kapasite, görevler ve ölüler
- `/akademi egit` — Akademide karakter yetiştir
- `/akademi ata` — Curia veya Agora/Forum görevi ver
- `/akademi gorevden-al` — bina görevini kaldır
- `/akademi karakteri-gorevden-al` — boşta karakteri kalıcı görevden çıkar
- `/komutan doktrin-sec` — kalıcı kara doktrini seç
- `/komutan uzmanlik-sec` — 3 kara zaferinden sonra uzmanlık seç
- `/komutan amirale-donustur` — boşta Komutanı kalıcı Amirale dönüştür
- `/amiral doktrin-sec` — kalıcı deniz doktrini seç
- `/amiral uzmanlik-sec` — 3 deniz zaferinden sonra uzmanlık seç
- `/tuccar ...` — ticaret görevleri, uzmanlık ve görev bitirme
- `/diplomat ...` — diplomatik görevler, savunma, uzmanlık ve görev bitirme
- `/casusluk ...` — operasyon, karşı casusluk, uzmanlık ve casus listeleri

Doktrinler, uzmanlıklar ve Komutandan Amirale dönüşüm **kalıcı seçimlerdir**. Onay vermeden önce etkileri dikkatle okuyun.

# ⚔️ SAVAŞ TANRILARI ROLE PLAY — SAVAŞ SİSTEMİ

> Bu metin güncel resmî savaş ve muharebe kurallarını esas alır. Her “MESAJ” bölümü Discord’a ayrı gönderilebilir. Aksi belirtilmedikçe sonuçlar bot tarafından en yakın tam sayıya yuvarlanır.

## MESAJ 1/20 — 📜 RESMÎ SAVAŞ İLANI VE CEPHELER

Bir muharebenin açılabilmesi için devletler arasında resmî savaş bulunmalıdır. Savaş ilanı gizli form üzerinden hazırlanır; tamamlandığında savaş hedefi, gerekçesi, resmî ilan metni, liderler ve taraflar **Savaşlar kanalında herkese açık** duyurulur.

• Bir devlet başka bir devlete savaş ilan edebilir.
• Bir pakt, başka bir pakta veya devlete savaş ilan edebilir.
• Birden fazla devletin bulunduğu taraf **cephe** sayılır.
• Normal savaşta ilanı yapan devlet saldıran cephe lideridir; hedef devlet savunan cephe lideridir.
• Pakt savaşında ilgili paktın lider devleti cephe lideri olur ve aktif pakt üyeleri o cepheye katılır.
• Bağımsız müttefikler otomatik katılmaz. Cephe lideri savaş sürerken bir devleti kendi tarafına çağırabilir; çağrıyı yalnız hedef ülkenin oyuncusu kabul veya reddedebilir.
• Savaşa çağrı ve verilen yanıt herkese açık yayımlanır.
• Aynı devlet aynı savaşta iki karşı cephede bulunamaz.

Savaş ilan edildiği oyun turunda yalnız diplomatik ve askerî hazırlık yapılabilir. **Fiilî saldırı en erken takip eden oyun turunda** başlatılır. Örneğin Tur 5’te ilan edilen savaşta ilk saldırı Tur 6’da yapılabilir. Bu bekleme süresi DM tarafından takip edilir.

Oyuncu komutları: `/savas-ilani`, `/pakt-savasi`, `/savas-cagrisi`, `/aktif-savaslar`.

## MESAJ 2/20 — 🕊️ SAVAŞ LİDERLİĞİ, BARIŞ VE TAZMİNAT

Savaşa katılan her devlet ayrı ayrı savaş veya barış ilan etmez. Bütün cephe adına diplomatik yetki **savaş liderindedir**.

• Barış teklifini yalnız iki karşı cephe liderinden biri gönderebilir ve teklif karşı cephenin liderine gider.
• Aynı savaşta yalnız bir adet yanıt bekleyen barış teklifi bulunabilir.
• Teklife 2–2.000 karakterlik barış şartları ve isteğe bağlı tam sayı Altın tazminatı eklenebilir.
• Tazminatı teklif eden veya hedef cephe lideri ödeyebilir; ödeme yapacak devlet teklifte açıkça belirtilir.
• Teklif kabul edildiğinde bot, tazminatı ödeyen devletin yerleşke hazinelerinden mevcut hazine payları oranında keser. Altın, alan devletin yerleşkelerine nüfusları oranında dağıtılır.
• Ödeyen tarafın toplam yerel hazinesi yetersizse teklif kabul edilemez.
• Kabul, savaşın bütün cepheleri için savaşı bitirir ve sonucu herkese açık duyurur. Ret hâlinde savaş devam eder.
• Yerleşke devri ve benzeri büyük barış hükümleri bot tarafından otomatik uygulanmaz; DM tarafından yürütülür.
• DM, devam eden bir savaşı kazanan taraf veya beyaz barış seçerek bitiş açıklamasıyla doğrudan sonlandırabilir.

Oyuncu komutu: `/baris-teklifi`. DM komutları: `/savas-yapilandir`, `/savas-sonlandir`.

## MESAJ 3/20 — ⚔️ SAVAŞIN TEMEL AKIŞI

Savaşlar sabit bir tur sayısında bitmez. Taraflardan biri dağılana, geri çekilene veya savaş türüne özel zafer şartı oluşana kadar **savaş turları** devam eder.

1. DM; ana ülkeleri, araziyi, tarafların oyuncu/NPC kontrolünü ve savaş anlatımını seçerek taslak oluşturur.
2. Gerekirse iki tarafa da başka ülkeler ve etkin paralı asker şirketleri eklenir.
3. Her ülkenin kara ordusu veya filosu sisteme gizli olarak girilir.
4. Taslak bir kez yayımlanır ve bot ilk zar tarafını belirler. Pusuda ilk taraf daima A’dır; diğer savaşlarda başlangıç tarafı rastgele seçilir.
5. Yetkili oyuncu düğmeyle zar atar. NPC adına DM zar atar; gerektiğinde oyuncu tarafına da vekâlet edebilir.
6. Her taraf için **Çarpışma** ve **Hasar** havuzu oluşur.
7. İki tarafın zarı tamamlanınca DM turu çözer. Bot üstünlüğü, kayıpları, baskıyı ve düzeni hesaplar.
8. Savaş bitmediyse tur yükselir ve ilk zar hakkı diğer tarafa geçer.

**Kavramlar:**
• Çarpışma, turun üstün tarafını belirler.
• Hasar, kayıp hesabının temelidir; doğrudan ölü sayısı değildir.
• Baskı yüzde değil, biriken puandır.
• Savaş turu ile genel oyun/rol turu farklıdır.

## MESAJ 4/20 — 🤝 ÇOK ÜLKELİ TARAFLAR VE KADRO KAYDI

Bir savaşın A ve B tarafında birden fazla ülke bulunabilir. Savaşı başlatırken seçilen ülke tarafın ana ülkesidir; eklenen ülkeler koalisyon katılımcısıdır.

• Her katılımcı ülkenin kadrosu ayrı girilir, fakat taraf tek birleşik zar havuzu üretir.
• Oyuncu kontrollü tarafta, o taraftaki katılımcı ülkelerden herhangi birinin oyuncusu zar atabilir.
• Kayıplar önce devlet birlikleri ile atanmış paralı askerler, ardından katılımcı ülkeler arasında başlangıç katkıları oranında paylaştırılır.
• Yalnız etkin ve bakımı ödenmiş paralı asker şirketleri savaşa katılabilir.
• Savaşa atanmış bir paralı asker şirketi aynı anda başka etkin savaşta kullanılamaz.
• Atanmış şirket sonradan bakımsız veya etkisiz hâle gelirse ödeme düzeltilene kadar o taraf zar atamaz.

Kara kadrosunda **kaynak yerleşke** seçmek isteğe bağlıdır. Seçilirse bot kadronun o yerleşkede bulunduğunu doğrular ve savaş sonu devlet kayıplarını yalnız oradan düşer. Seçilmezse kayıp, ülkenin savaşa uygun ordu kayıtlarına mevcutları oranında dağıtılır.

Garnizonlar normal savaş kadrosuna katılamaz. Kuşatmada yalnız savunulan yerleşkenin garnizonu, ana savunucu ülkenin kadrosuna dâhil edilebilir.

## MESAJ 5/20 — 📐 CEPHEYE GİREN ASKER VE ZAR ÜRETİMİ

Her kara arazisi bir **cephe kapasitesi** belirler. Toplam kuvvet kapasiteyi aşmıyorsa herkes; aşıyorsa birlik türleri ordudaki oranları korunarak cepheye girer. Deniz savaşında cephe kapasitesi yoktur; savaşabilir bütün gemiler aynı turda zar üretir.

**Cephe oranı = Cephe kapasitesi ÷ Toplam mevcut kuvvet**

**Bir türün cephedeki sayısı = Türün mevcut sayısı × Cephe oranı**

İlk değerler aşağı yuvarlanır. Boş kalan birkaç kişilik kapasite, botun sabit birim sırasına göre doldurulur. Cephe dışındaki askerler yedektir; o tur zar üretmez. Kayıplarla yer açıldıkça sonraki turlarda cepheye girer.

**Örnek:** 20.000 Hafif ve 20.000 Ağır Piyadeden oluşan 40.000 kişilik ordu, 30.000 kişilik ovada 15.000 Hafif + 15.000 Ağır Piyade ile savaşır.

Kara savaşında her tam **1.000 asker**, türünün zarlarını bir kez üretir. Eksik birlik de zar atar ve sonuç asker oranına göre küçültülür.

**Örnek:** 500 Okçu 1d8 Çarpışmadan 6 atarsa 6 × 500/1.000 = **3 Çarpışma** üretir. Eksik birliğin orantılı sonucu en az 1’dir.

## MESAJ 6/20 — 🎲 STANDART BİRLİK ZARLARI

**Birim — Çarpışma / Hasar — Dayanıklılık**

• Hafif Piyade/Ciritçi: **1d4 / 1d6 — Düşük**
• Milis: **1d4 / 1d4 — Düşük**
• Sapancı: **1d6 / 1d8 — Düşük**
• Mızraklı Piyade: **1d8 / 1d6 — Orta**
• Okçu: **1d8 / 1d12 — Düşük**
• Ağır Piyade: **2d8 / 2d8 — Yüksek**
• Hafif Süvari: **2d6 / 1d8 — Orta**
• Ağır Süvari: **2d10 / 2d10 — Yüksek**

**Dayanıklılık katsayıları:**
• Düşük: **1,00**
• Orta: **0,85**
• Yüksek: **0,70**

Dayanıklılık zar toplamını değiştirmez. Rakibin ham hasarı birlik türlerine dağıtılırken ve kayba çevrilirken kullanılır. Yüksek dayanıklılığa sahip birlikler aynı hasardan daha az kayıp verir.

## MESAJ 7/20 — 🏛️ ÖZEL BİRLİK ZARLARI

**Birim — Çarpışma / Hasar — Dayanıklılık**

• Lejyoner: **2d10 / 2d8 — Yüksek**
• Hoplit: **2d8 / 1d12 — Yüksek**
• Atlı Okçu: **2d8 / 2d8 — Orta**
• Deve Süvarisi: **2d8 / 1d10 — Orta**
• Briton Uzun Yaycıları: **1d12 / 2d12 — Düşük**
• Pers Ölümsüzleri: **2d8 / 2d10 — Yüksek**
• Kartaca Savaş Filleri: **3d10 / 2d10 — Yüksek**
• İber Caetratileri: **2d6 / 2d8 — Düşük**
• Cermen Şok Savaşçıları: **2d10 / 2d8 — Düşük**
• Anadolu Kalkanlıları (Thureophoroi): **2d6 / 1d10 — Orta**; kompozisyonda %70 Hat, %30 Mızraklı sayılır.
• Triarii Gazileri: **2d6 / 1d8 — Orta**
• Pön Gazileri: **3d6 / 2d8 — Yüksek**
• Gaesatae: **2d10 / 2d8 — Orta**
• Peltastlar: **1d8 / 1d8 — Düşük**; kompozisyonda %80 Hat, %20 Menzilli sayılır.
• Gümüş Kalkanlılar: **2d8 / 1d10 — Yüksek**
• Machimoi Phalangitai: **2d8 / 1d10 — Yüksek**
• Maurya Savaş Filleri: **3d12 / 2d12 — Yüksek**
• Çöl Akıncıları: **2d8 / 2d8 — Orta**
• Chariot: **2d12 / 2d12 — Orta**; kompozisyonda %50 Hareketli, %50 Menzilli sayılır.

Özel birliklerin savaş zarları standart birliklerle aynı hesap akışına girer. Bir ülke, yalnız DM tarafından kendisine açılmış özel birlikleri satın alabilir; fakat savaş kadrosuna kayıtlı mevcudunun tamamını koyabilir.

**Chariot özel etkisi:** Yalnız ilk değerlendirmede, Açık Ova veya Çöl arazisinde çalışır. Chariot bulunan taraf ham Çarpışma üstünlüğünü kazanır ve düşmanın hareketli birlik karşılama oranı %50'nin altındaysa rakibe ayrıca **+1 Baskı** uygular.

## MESAJ 8/20 — 🧩 ORDU KOMPOZİSYONU

Kompozisyon, ordunun tamamından değil **o tur cepheye giren birliklerden** hesaplanır. Yedekler cepheye girene kadar değerlendirmeyi etkilemez.

**Roller:**
• Hat: Hafif Piyade, Milis, Ağır Piyade, Lejyoner, Pers Ölümsüzleri, İber Caetratileri, Cermen Şok Savaşçıları, Pön Gazileri ve Gaesatae; Anadolu Kalkanlılarının %70'i, Peltastların %80'i
• Mızrak: Mızraklı, Triarii Gazileri, Gümüş Kalkanlılar ve Machimoi Phalangitai %100; Hoplit %50 Mızrak + %50 Hat; Anadolu Kalkanlıları %30 Mızrak + %70 Hat
• Menzilli: Sapancı, Okçu, Briton Uzun Yaycıları; Atlı Okçu %50 Menzilli + %50 Hareketli
• Hareketli: Hafif/Ağır/Deve Süvarisi, Kartaca/Maurya Savaş Filleri ve Çöl Akıncıları; Atlı Okçu %50 Hareketli; Chariot %50 Hareketli + %50 Menzilli

**Tekdüze Ordu:** Tek tür en az %80 → Çarpışma ×0,85; Hasar ×0,90

**Sınırlı Kompozisyon:** Üst seviyeleri karşılamayan ordu → Çarpışma ×0,90; Hasar ×0,95

**Standart Kompozisyon:** En büyük tür en fazla %60; en az üç türün her biri en az %20; en az üç askerî rolün payı %10+ → ×1,00 / ×1,00

**Dengeli Karma:** Hat %40–65; Menzilli %10+; Hareketli %10+; Mızrak %10+; tek tür en fazla %60 → ×1,10 / ×1,05

**Mükemmel:** Hat %40–55; Menzilli %15–25; Hareketli %15–25; Mızrak %10–20 → ×1,15 / ×1,08

**Geçiş kuralı:** Kompozisyon çarpanları, sunucuya tanımlanmış etkinleşme oyun turuna kadar ×1,00 tutulur. Bot sınıfı yine hesaplar. Etkinleşme turu geldiğinde otomatik çalışır. Mızrak–Süvari kuralı bu geçişten etkilenmez ve aktif kalır.

## MESAJ 9/20 — 🏰 KUŞATMA KOMPOZİSYONU

Sur ve kapı birlikte sağlamken kuşatma cephesinde hareketli birlik rolü zorunlu değildir.

**Dengeli Kuşatma:**
• Hat %45–75
• Menzilli en az %10
• Mızrak en az %10
• Tek bir tür en fazla %60
• Çarpışma ×1,10; Hasar ×1,05

**Mükemmel Kuşatma:**
• Hat %50–65
• Menzilli %20–35
• Mızrak %15–25
• Çarpışma ×1,15; Hasar ×1,08

Sur veya kapı kırıldığı anda değerlendirme normal meydan kompozisyonuna döner. Kompozisyon sistemi geçici olarak pasifse kuşatma sınıfı gösterilse bile çarpanlar etkinleşme turuna kadar ×1,00 uygulanır.

## MESAJ 10/20 — 🔱 MIZRAKLI–SÜVARİ KARŞILAŞMASI

Bu kural yalnız **kuşatma dışındaki kara savaşlarında** uygulanır.

**Mızrak Gücü:**
• 1 Mızraklı = 1
• 1 Hoplit = 0,5
• 1 Anadolu Kalkanlısı = 0,3
• 1 Triarii Gazisi = 1
• 1 Gümüş Kalkanlı = 1
• 1 Machimoi Phalangitai = 1

**Süvari Gücü:**
• 1 Hafif, Ağır veya Deve Süvarisi = 1
• 1 Kartaca Savaş Fili = 1
• 1 Maurya Savaş Fili = 1
• 1 Çöl Akıncısı = 1
• 1 Chariot = 1
• 1 Atlı Okçu = 0,5

Bot iki tarafın cephedeki kuvvetlerini karşılaştırır. Mızrak Gücü ile düşman Süvari Gücünden düşük olan değer **eşleşen kuvvettir**. Yalnız eşleşen mızrak payı bonus kazanır:

• Eşleşen mızrak zarlarına **%30 Çarpışma**
• Eşleşen mızrak zarlarına **%15 Hasar**

%15 ek hasar yalnız düşmanın süvari türlerine dağıtılır. Düşmanda 1.000 süvari, sizde 5.000 mızraklı varsa yalnız mızraklıların beşte biri bonus alır. Düşmanda süvari yoksa bonus oluşmaz.

## MESAJ 11/20 — 📊 ÇARPIŞMA ÜSTÜNLÜĞÜ

İki tarafın nihai Çarpışma toplamları karşılaştırılır:

**Üstünlük = (Yüksek − Düşük) ÷ Düşük × 100**

• Eşit veya %0–9,99 fark: **Dengeli**
• %10–24,99: **Hafif Üstünlük**
• %25–49,99: **Belirgin Üstünlük**
• %50+: **Ezici Üstünlük**
• Düşük sonuç 0: **Ezici Üstünlük**

**Hasar çarpanları:**
• Dengeli: iki taraf ×0,80
• Hafif: kazanan ×1,00 / kaybeden ×0,70
• Belirgin: kazanan ×1,15 / kaybeden ×0,50
• Ezici: kazanan ×1,30 / kaybeden ×0,30

Kaybeden çarpanı, kaybedenin rakibine vereceği hasarı azaltır; alacağı hasarı doğrudan azaltmaz veya artırmaz. Çarpışma sonucu Hasar zarını yeniden attırmaz.

## MESAJ 12/20 — 💥 HASAR VE KAYIP HESABI

**Kara Ham Hasarı = Hasar toplamı × 20 × Üstünlük çarpanı × Özel savaş çarpanı**

Deniz savaşında asker kaybı formülü kullanılmaz. Üstünlük ve filo emri çarpanlarından geçen Hasar, gemilerin ayrı HP havuzlarına dağıtılır; gövde katsayısı ve Zırh uygulandıktan sonra tekil gemi canlarından düşülür.

Ham hasar hedef birliklere dayanıklılık ağırlığıyla dağıtılır:

1. Tür ağırlığı = Mevcut × Dayanıklılık katsayısı
2. Türe ayrılan hasar = Ham hasar × Tür ağırlığı ÷ Toplam ağırlık
3. Tür kaybı = Türe ayrılan hasar × Dayanıklılık katsayısı
4. Sonuç yuvarlanır ve mevcut sayıyı aşamaz.

**Örnek:** 1.000 Hafif + 1.000 Ağır Piyadeye 800 ham hasar gelirse ağırlıklar 1.000 ve 700 olur. Yaklaşık 471 Hafif, 231 Ağır Piyade kaybedilir; toplam kayıp 702’dir.

Mızrak karşılaşmasının hedefli ek hasarı genel hasardan ayrılır ve yalnız uygun süvari birliklerinden düşülür.

## MESAJ 13/20 — 🧠 MEYDAN BASKISI, KAYIP YÜZDESİ VE OTOMATİK GERİ ÇEKİLME

Normal meydan ve pusu savaşlarında:

• Dengeli tur: Baskı değişmez
• Hafif üstünlük: Kaybeden +1
• Belirgin üstünlük: Kaybeden +2
• Ezici üstünlük: Kaybeden +3
• Tur galibi: Kendi baskısından −1; 0’ın altına inmez

**Kayıp yüzdesi = (Başlangıç − Mevcut) ÷ Başlangıç × 100**

Meydan baskısı **0–10** arasında tutulur. Bir tarafın otomatik geri çekilmesi için iki şartın birlikte gerçekleşmesi gerekir:

• Baskı **10** olmalı.
• Başlangıç kuvvetinin en az **%50'si kaybedilmiş** olmalı.

Yalnızca şartlardan birinin gerçekleşmesi savaşı bitirmez. Kuvvetin tamamen sıfırlanması doğrudan yenilgidir. İki taraf aynı değerlendirmede savaş dışı kalırsa daha fazla kuvveti kalan kazanır; eşitse galip çıkmaz.

**Düzen göstergesi:** Baskı 0–1 ve kayıp <%10: Düzenli; Baskı 2+ veya kayıp ≥%10: Yıpranmış; Baskı 6+ veya kayıp ≥%40: Sarsılmış; Baskı 10 veya kayıp ≥%50: Kritik Hat. Baskı 10 ile kayıp ≥%50 birlikte gerçekleştiğinde Dağılmış olur.

Deniz savaşlarında baskı kullanılmaz; filo durumu, tekil gemi HP'leri, Manevra Puanları ve filo emirleri kullanılır.

## MESAJ 14/20 — 🗺️ ARAZİ, CEPHE, PUSU VE KOMUTAN

**Cephe kapasiteleri:**
• Açık Ova: 30.000 / 30.000
• Çöl: 35.000 / 35.000
• Orman: 15.000 / 15.000
• Bataklık: 10.000 / 10.000
• Dağlık: 12.000 / 12.000
• Dağ Geçidi: 6.000 / 6.000
• Nehir Geçişi: Saldıran 10.000 / Savunan 20.000
• Pusu: Pusu Kuran 15.000 / Pusuya Düşen 8.000
• Kuşatma: Saldıran 15.000 piyade + 5.000 menzilli / Savunan 18.000
• Deniz: Cephe sınırı yok; savaşabilir bütün gemiler katılır

Kara cephe kapasitesi tek başına güç bonusu vermez; yalnız zar üretecek kara kuvvetini sınırlar.

**Pusu:** A tarafı ilk zarı atar. Yalnız ilk savaş turunda A Çarpışması ×1,25 ve A Hasarı ×1,10 olur. Sonraki turlarda bu bonus kalkar; pusu cephesi ve geri çekilme cezası sürer.

**Komutan:** Curia’ya atanmış Komutanın özellik puanı, tarafın Çarpışma sonucuna düz bonus verir. Birleşik tarafta en yüksek Komutan kullanılır; bonuslar toplanmaz. Komutan bonusu en fazla **+3 Çarpışma**dır ve deniz savaşlarında uygulanmaz.

## MESAJ 15/20 — 🏰 KUŞATMA AŞAMALARI VE TAHKİMAT

Kuşatmada A saldıran, B savunandır. Sur **30.000 HP**, kapı **1.000 HP** ile başlar.

**Bombardıman:** Ordular temas etmez; asker kaybı, baskı ve savaş turu ilerlemesi oluşmaz. Yalnız sur hedefli Katapultlar çalışır. Bir kuşatma aynı oyun turunda en fazla **4 kez** bombalanabilir; haklar yeni oyun turunda yenilenir. Hücuma geçildikten sonra bombardımana dönülemez.

**Tahkimat ve kuşatma yorgunluğu:**
• 1–3. değerlendirme: B Çarpışma ×1,50; B Hasar ×1,30; B'nin aldığı Hasar ×0,70
• 4–6. değerlendirme: B Çarpışma ×1,40; B Hasar ×1,20; B'nin aldığı Hasar ×0,80
• 7–9. değerlendirme: B Çarpışma ×1,30; B Hasar ×1,10; B'nin aldığı Hasar ×0,90
• 10. ve sonraki değerlendirmeler: B Çarpışma ×1,00; B Hasar ×1,00; B'nin aldığı Hasar ×1,00

Tahkimat etkisi kuşatma uzadıkça azalır. Aynı değerlendirmede kırılan sur veya kapı hücum erişimini hemen değiştirebilir. Kuşatma baskısı, tahkimatla büyütülmüş sonuçtan değil tarafların **ham Çarpışma zarlarından** hesaplanır.

Bot savunucunun **Ham Zar** ve **Tahkimat Sonrası Zar** sonuçlarını ayrı gösterir. Kayıp üstünlüğü çarpanlı sonuçtan, kuşatma baskısı ise tarafların ham Çarpışma sonuçlarından hesaplanır.

## MESAJ 16/20 — 🪜 HÜCUM ERİŞİMİ VE KUŞATMA BİRLİKLERİ

Sur ve kapı birlikte sağlamken bütün saldıran ordu doğrudan savaşamaz:

• 1 Merdiven Grubu, en fazla **1.000 Hücum Birliğine** erişim sağlar.
• 1 Kuşatma Kulesi, en fazla **3.000 Hücum Birliğine** erişim sağlar.
• Toplam hücum erişimi saldıranın 15.000 kişilik cephesini aşamaz.
• Kuleler kapasite hesabında önce, merdivenler kalan alanda değerlendirilir.
• Sur yıkılırsa merdiven/kule erişim şartı kalkar ve normal 15.000 piyade cephesi açılır.
• Kapı kırılırsa piyade cephesi **+3.000** artarak 18.000'e çıkar.
• Kapı kırıldığında 5.000 menzilli destekle toplam hücum kapasitesi **23.000** olur.
• Sur ve kapı birlikte yıkılsa da kapı bonusu birikmez; piyade cephesi 18.000'de kalır.

**Hücum Birlikleri:** Hafif Piyade, Milis, Mızraklı, Ağır Piyade, Lejyoner, Hoplit, Pers Ölümsüzleri, İber Caetratileri, Cermen Şok Savaşçıları, Anadolu Kalkanlıları, Triarii Gazileri, Pön Gazileri, Gaesatae, Peltastlar, Gümüş Kalkanlılar ve Machimoi Phalangitai'dir.

Sadece menzilli veya atlı birliklerden oluşan ordu şehir alamaz. Hücum Birliği kalmazsa kuşatan taraf otomatik geri çekilir. Saldıran atlı birlikler kuşatmanın hiçbir aşamasında cepheye veya kayıp havuzuna otomatik girmez; yalnız aşağıdaki yaya hücum emriyle seçilenler piyade karşılığıyla savaşa katılır.

Saldıranın aldığı kayıpların **%70'i cephedeki piyade havuzuna**, **%30'u menzilli destek havuzuna** dağıtılır. Havuzlardan biri boşsa karşılayamadığı kayıp diğer havuza aktarılır.

Savunucu süvariler kuşatma boyunca attan inerek savaşır:
• Hafif Süvari → Hafif Piyade zarları
• Ağır Süvari → Ağır Piyade zarları
• Atlı Okçu → Okçu zarları
• Deve Süvarisi → Mızraklı Piyade zarları

Kayıplar belgede özgün birlik adından düşülür.

Kuşatan taraf `/savas suvari-indir` ile kendi Hafif Süvari, Ağır Süvari, Atlı Okçu veya Deve Süvarilerinin istediği kısmını aynı yaya karşılıklarıyla hücuma hazırlayabilir. Emir her değerlendirmede zarlar başlamadan değiştirilebilir ve **0** girilerek kaldırılır. İndirilen birlikler yaya birimin savaş ve dayanıklılık değerlerini kullanır; kayıp yine özgün süvari kaydından düşer. Emir, sur veya kapı kırıldıktan sonra da geçerliliğini korur. Kartaca Savaş Filleri ve diğer indirilemeyen hareketli özel birlikler hücum cephesine girmez.

## MESAJ 17/20 — 🚨 KUŞATMA BASKISI, AÇLIK VE ŞEHRİN DÜŞMESİ

Kuşatma baskısı **0–12** arasındadır. Tahkimat çarpanları kayıp hesabını etkiler; baskı hesabı ise ham Çarpışma sonuçları üzerinden yürür.

**Düzen göstergesi:** 0–3 Düzenli; 4–7 Baskı Altında; 8–11 Sarsılmış; 12 Kritik Hat.

Tur kaybından sonra kullanılabilir yedek baskıyı azaltır:
• En az yarım cephe yedeği: −1
• En az tam cephe yedeği: −2

Savunucudaki Panteon Sv3, kuşatma boyunca ilk olumlu baskı artışını 1 puan azaltır.

**Kuşatan tarafın otomatik geri çekilmesi için:** Baskı 12 olmalı ve başlangıç kuvvetinin en az %50'si kaybedilmiş olmalıdır. Hücum Birliğinin tamamen tükenmesi ayrıca doğrudan geri çekilme sebebidir; geride yalnız menzilli veya atlı birlik kalması şehri almaya yetmez.

**Savunan taraf baskı veya kayıp yüzdesi nedeniyle otomatik geri çekilmez.** Şehrin savaşla düşmesi için savunan ordunun ve kuşatmaya dâhil garnizonun toplam mevcudu tamamen **0** olmalıdır.

**Açlık:** Temel erzak dayanıklılığı **6 oyun turudur**. Çiftlik Sv2 +1, Sv3 +3; Su Kemeri Sv2+ +2; Garnizon Güçlendirme +1 ve ülke bonusları eklenir. Toplam ek bina/politika/ülke bonusu en fazla +8’dir. Erzak 0 olduğunda bot otomatik teslim vermez; sonucu DM belirler.

## MESAJ 18/20 — 🛠️ KUŞATMA ALETLERİ

• **Merdiven Grubu:** Çarpışma veya Hasar üretmez; 1.000 Hücum Birliğine erişim sağlar.
• **Koçbaşı:** Her kuşatmada en fazla 1; birikmez. 1d8×35 Kapı Hasarı.
• **Mantlet:** Çarpışma veya Hasar üretmez; savunanın saldırana Hasarını adet başına %2 azaltır, üst sınır %20.
• **Balista — Sur/Kapı:** Adet başına 1d10×5 Sur veya Kapı Hasarı.
• **Balista — Ordu:** Adet başına 1d10 saldıran Hasarı.
• **Katapult — Sur:** Adet başına 2d20×20 Sur Hasarı.
• **Katapult — Ordu:** Adet başına 1d20 saldıran Hasarı.
• **Kuşatma Kulesi:** Adet başına 1d10 Çarpışma + 1d6 Hasar; 3.000 Hücum Birliğine erişim.
• **Hafif Sur Balistası:** Savunmaya özgü; adet başına 2d8 savunma Hasarı.

Kapı kırıldığında saldıranın piyade hücum cephesi **+3.000** artarak 18.000'e çıkar. Menzilli destek cephesi 5.000 olarak kalır; toplam hücum kapasitesi 23.000 olur. Yalnız surun yıkılması bu ek kapasiteyi vermez. Sur ve kapı birlikte yıkılsa da bonus birikmez.

Bir alet türünden aynı savaş turunda en fazla 25 adet etkindir; Koçbaşı 1 ile, kule ve merdivenler ayrıca 15.000 erişim cephesiyle sınırlıdır.

Yapı Hasarı asker kaybına dönüşmez. Ordu hedefli aletler normal üstünlük, tahkimat, mantlet ve dayanıklılık hesaplarından geçer. Bombardımanda yalnız sur hedefli Katapult çalışır.

Mühendislik Atölyesi Sv3’te geliştirilmiş olarak üretilen kayıtlı Balista ve Katapultların ilgili hasar zarlarına +1 uygulanır. Merdiven ve Koçbaşı kuşatma başladıktan sonra, zarlar başlamadan önce anlık satın alınabilir; saha aleti alımı yeni bir savaş formu yayımlamaz.

## MESAJ 19/20 — 🚢 DENİZ SAVAŞI, GEMİ CANI VE FİLO EMİRLERİ

**Gemi — Fiyat / Bakım — Çarpışma / Hasar — Can / Zırh — İş Göremezlik — Mürettebat / Taşıma**

• Kerkouros: 750 / 75 — **1d6 / 1d12** — 40 HP / 1 Zırh — 10 HP — 50 / 200
• Trireme: 1.500 / 150 — **2d8 / 2d12** — 75 HP / 3 Zırh — 20 HP — 100 / 500
• Quinquereme: 3.000 / 300 — **3d10 / 3d12** — 120 HP / 6 Zırh — 30 HP — 150 / 800

Kerkouros gelen gövde hasarını ×1,15; Trireme ×1,00; Quinquereme ×0,85 oranında alır. Ardından Zırh düşülür; geçerli vuruş en az 1 HP verir. İllirya'nın taşıma kapasitesi %10 fazladır.

Deniz savaşında cephe sınırı yoktur. **Savaşabilir bütün gemiler** aynı değerlendirmede zar üretir. İş göremez ve batmış gemiler katılmaz. Paralı asker şirketlerine ait savaşabilir gemiler de aynı tekil HP ve hasar sistemine dâhildir.

Her gemi ayrı izlenir:
• **Hasarlı:** HP kaybetmiştir fakat iş göremezlik sınırının üzerindedir; savaşmaya devam eder.
• **İş Göremez:** Eşik HP veya altındadır; sonraki değerlendirmelerde zar üretmez fakat tamir edilebilir.
• **Batmış:** Kalıcı olarak silinir ve tamir edilemez.

Bir gemi savaşabilir durumdayken aldığı ilk ağır darbede doğrudan batmaz; önce iş göremez olur. Daha önceki bir değerlendirmede iş göremez olmuş gemi sonraki değerlendirmelerde yeniden hasar alırsa batabilir.

Deniz savaşlarında **baskı ve ayrı Geri Çekil düğmesi kullanılmaz**. Her değerlendirmede iki taraf da gizli filo emrini seçip kilitler:

• **Dengeli Muharebe:** Çarpışma ve Hasar değişmez.
• **Koçbaşı Hücumu:** Verilen Hasar +%20; alınan Hasar +%10.
• **Savunma Hattı:** Alınan Hasar −%20; verilen Hasar −%15.
• **Kanat Manevrası:** Çarpışma +%15; verilen Hasar −%10.
• **Temas Kesme:** Zar atılmadan savaştan çekilme emridir.
• **Kontrollü Temas Kesme:** 3 Manevra Puanı harcar ve takip kaybını yarıya indirir.

İki emir de kilitlenmeden zar açılamaz. Taraflardan biri temas kesmeyi seçerse zar yerine yönetici emirleri sonuçlandırır. İki taraf da temas keserse filolar savaşmadan ayrılır.

Her değerlendirmede Çarpışma üstünlüğünü kazanan taraf **+1 Manevra Puanı** kazanır; azami 5 puan tutulabilir.

Filo şu iki şart birlikte gerçekleştiğinde zorunlu geri çekilir:
• Savaşabilir gemilerin toplam HP havuzu başlangıcın **%40'ı veya altına** düşmüş olmalı.
• Başlangıç gemilerinin en az **%50'si batmış veya iş göremez** olmalı.

`Filo Durumu` yalnız oyuncunun kendi ülkesine ait gemilerin tekil HP ve durumlarını gizli gösterir. `Yönetici: İki Taraf` düğmesi oyun yöneticisine iki tarafın bütün gemilerini gizli gösterir.

Savaş sonrasında gemi hasarları korunur. `/filo tamir` komutunda **yalnız iş göremezler** veya **bütün hasarlı ve iş göremezler** seçilebilir. Tamirde olup artık iş göremez olmayan gemiler `/filo tamirden-cikar` ile erken alınabilir; tamamlanan tamir filosu `/filo tamirden-ekle` ile normal filoya aktarılır. Tersane tamir kapasitesi Sv1/Sv2/Sv3 için tur başına sırasıyla **150 / 300 / 500 HP**'dir.

## MESAJ 20/20 — 📜 AÇIK BİLGİ, KAYIP KAYDI VE KOMUTLAR

**Açık bilgiler:** Anlatı, arazi, zar sırası, açık zar sonuçları, üstünlük, tur ve toplam kayıplar, baskı, düzen, meydan/deniz toplam kuvvetleri, kuşatan toplamı, sur/kapı HP ve erzak.

**Gizli bilgiler:** Tam birlik/filo kompozisyonları, gemilerin tekil HP durumları, kuşatma savunucusunun toplam kuvveti, yedekleri, kuşatma aleti dökümü ve hedefleri. Savunucunun gerçekleşmiş kayıpları açık kalır. Deniz savaşında oyuncu `Filo Durumu` ile yalnız kendi gemilerini; oyun yöneticisi `Yönetici: İki Taraf` ile A ve B tarafındaki bütün gemileri gizli olarak görebilir.

Bot savaş sonu kayıplarını belgelere yalnız bir kez işler:
• Devlet asker kayıpları bağlı özgür nüfustan da düşer.
• Kayıplar katılımcı ülkeler ve uygun kayıtlar arasında başlangıç katkısı/mevcut oranıyla dağıtılır.
• Kaynak yerleşke seçilmişse o ülkenin kaybı yalnız seçilen yerleşkeden düşer.
• Savunulan şehrin garnizon kaybı yalnız o garnizondan düşer ve zorunlu yenileme süreci başlar.
• Paralı asker kaybı şirket mevcudundan düşer, devlet nüfusunu azaltmaz. Kara ve gemi mevcudu tamamen biten şirket yok olmuş sayılır.
• Devlet gemisi kaybında bağlı yerleşke nüfusundan Kerkouros için 50, Trireme için 100, Quinquereme için 150 mürettebat düşer.
• Kayıt yetersizliği varsa DM raporu hesaplanan, uygulanan ve eksik kalan miktarı gösterir.

**Temel DM komutları:**
• `/savas baslat`, `/savas taraf-ulke`
• `/savas kadro-ayarla`, `/savas filo-ayarla`
• `/savas parali-asker-ayarla`
• `/savas kusatma-aleti-ayarla`, `/savas saha-aleti-al`, `/savas kusatma-asamasi`, `/savas bombardiman`
• `/savas suvari-indir` — kuşatan oyuncu kendi ülkesinde, DM ise istediği saldırgan ülkede kullanabilir
• `/savas yayinla`, `/savas tur-oynat`
• `/savas ordu-detay`, `/savas kayip-raporu`
• `/savas bitir`, `/savas iptal`

Tekil düzeltmeler için `/savas birlik-ayarla` ve `/savas gemi-ayarla` kullanılabilir. Formülleri bot uygular; oyuncular veya DM savaş çarpanlarını elle giremez.

---

## EK — 🗺️ KARA VE DENİZ KARŞILAŞMA KURALLARI

**Kara Pususu:** Pusuya düşen ordunun sahibi 1d3 atar. Sonuç, ordunun Temas Kesme/Geri Çekilme kullanabilmesi için tamamlaması gereken asgari değerlendirme sayısıdır. Süre dolmadan geri çekilemez.

**Meydan Savaşı:** İki düşman ordusu aynı Hex'te karşılaştığında taraflardan biri savaş başlamadan geri çekilebilir. Savaş başladıktan sonra normal geri çekilme ve takip kuralları uygulanır. Taraflardan biri savaş Hex'ini doğru tahmin ederek bölgeye iki farklı yönden ordu sokmuşsa karşı taraf 1d3 atar; sonuç savaşın asgari değerlendirme sayısını belirler.

**Kuşatma Karşılaşması:** Savunanın takviyesi kuşatma ordusunu iki taraftan sıkıştırırsa mevcut kuşatma formu kapatılır ve katılan kuvvetlerle meydan savaşı açılır. Kuşatma ordusu geri çekilmek isterse 1d3 sonucu kadar değerlendirmeyi tamamlamalıdır.

**Açık Deniz Karşılaşması:** Düşman filolarının aynı deniz Hex'ine girmesi, karşılıklı geçmeye çalışması veya bir filonun düşman filosunun Hex'i üzerinden ilerlemesi deniz savaşı doğurur. Savaş formu açıldıktan sonra ayrı bir Geri Çekil düğmesi kullanılmaz; çekilme, gizli **Temas Kesme** veya **Kontrollü Temas Kesme** filo emriyle seçilir.

**Deniz Pususu:** Yalnız GM tarafından belirlenen gizli bekleme, istihbarat üstünlüğü veya kıyı saklanması durumlarında uygulanır. Aynı Hex'te karşılaşmak tek başına pusu değildir. Pusuya düşen taraf 1d3 atar; sonuç kadar değerlendirme bitmeden temas kesme emri sonuçlandırılamaz.

## EK — ⚓ ABLUKA KIRMA VE ÇIKARMA SAVAŞI

Abluka altındaki kıyı yerleşkesine gelen dost veya müttefik filo doğrudan limana giremez; önce ablukacı filoyla savaşır.

• Yalnız yardım filosu geldiyse normal deniz savaşı açılır.
• Ablukacı geri çekilir veya yenilirse abluka kalkar.
• Yardım filosu geri çekilir veya yenilirse limana ulaşamaz ve abluka sürer.
• Limandaki filo çıkış yaparsa dışarıdaki yardım filosuyla birlikte ablukacıya saldırabilir; bu, denizde iki taraftan sıkıştırma sayılır.
• Ablukacı taraf 1d3 atar ve sonuç kadar değerlendirme tamamlanmadan temas kesemez.
• Limandaki filo savaşa çıkmak zorunda değildir; fakat abluka kalkmadan denize açılamaz.
• Abluka kalktığında Abluka Uzmanı Sv3 nedeniyle eksilen bir turluk erzak dayanıklılığı, kuşatma devam ediyorsa geri verilir.

**Çıkarma:** Çıkarma bir tam tur sürer ve tamamlanana kadar ordu gemide sayılır. Düşman filosu çıkarma Hex'ine ulaşırsa deniz savaşı kara birlikleri inmeden başlar. Çıkarma filosu ilk değerlendirme tamamlanmadan temas kesemez. Kara birlikleri deniz savaşına katılmaz. Filo çekilirse çıkarma iptal edilir; kazanırsa çıkarma sonraki çözümlemede tamamlanır. Çıkarma sürerken gemideki orduyla kara savaşı açılamaz.

## EK — 🏛️ LİMANA SIĞINMA VE LİMAN BASKINI

KIYI etiketi tek başına güvenli liman sağlamaz. Aktif Limanı olmayan kıyı yerleşkesindeki filo kıyıda demirlemiş sayılır ve normal deniz savaşına hedef olabilir. Aktif Limana giren filo normal açık deniz saldırısından korunur; düşman filoyu içeride tutmak için abluka kurabilir veya Liman Baskını düzenleyebilir.

Liman Baskını için saldıran filo hedef kıyı Hex'inde bulunmalı, yerleşke saldıran tarafından abluka altında tutulmalı, hedef limanda en az bir filo/gemi bulunmalı ve işlem yönetici tarafından başlatılmalıdır. Aynı limana her 6 turda yalnız bir baskın yapılabilir.

**Saldıran:** 1d20 + Amiral ve filo baskın bonusları

**Savunan:** 1d20 + Liman seviyesi + Tersane seviyesi + Amiral bonusları

• Fark 0 veya altı: Baskın püskürtülür.
• Fark 1–4: Kısmi sızma; limandaki gemiler hakkında sınırlı bilgi alınır.
• Fark 5–9: Limandaki filo dışarı çekilir; 1d3 asgari değerlendirmeli deniz savaşı başlar.
• Fark 10+: Üstün baskın; 1d6+1 asgari değerlendirmeli deniz savaşı başlar.

Limana sığınmak filoyu abluka, Liman Baskını veya yerleşkenin karadan fethedilmesine karşı dokunulmaz yapmaz.

## EK — ⚓ DENİZ ABLUKASININ ETKİLERİ

Abluka yalnız KIYI yerleşkesine, yönetici tarafından ülke ve filo bağlanarak uygulanır. Aynı yerleşkede bir etkin abluka; aynı filoda bir etkin deniz operasyonu bulunabilir.

• Standart abluka: hedef yerleşkenin deniz ticareti geliri −%10.
• Abluka Uzmanı Sv1: −%15.
• Abluka Uzmanı Sv2: −%30.
• Abluka Uzmanı Sv3: −%60; devam eden kuşatmanın erzak dayanıklılığını bir defaya mahsus 1 tur azaltır.

Ekonomik kayıp alım turunda hedef yerleşkeye eksik gelir olarak yansır. Etkin abluka filosu hareket edemez, gemi veya Amiral değiştiremez, başka savaşa/operasyona katılamaz ve tamire gönderilemez. Abluka `/abluka kaldir` ile sona erdiğinde filo yeniden kullanılabilir.

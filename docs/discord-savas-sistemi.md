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

Her arazi bir **cephe kapasitesi** belirler. Toplam kuvvet kapasiteyi aşmıyorsa herkes; aşıyorsa birlik türleri ordudaki oranları korunarak cepheye girer.

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
• Okçu: **1d8 / 1d10 — Düşük**
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
• Hoplit: **2d8 / 1d10 — Yüksek**
• Atlı Okçu: **2d8 / 2d8 — Orta**
• Deve Süvarisi: **2d8 / 1d10 — Orta**
• Briton Uzun Yaycıları: **1d10 / 2d10 — Düşük**
• Pers Ölümsüzleri: **2d8 / 2d10 — Yüksek**
• Kartaca Savaş Filleri: **3d8 / 2d10 — Yüksek**
• İber Caetratileri: **2d6 / 2d8 — Düşük**
• Cermen Şok Savaşçıları: **2d10 / 2d8 — Düşük**

Özel birliklerin savaş zarları standart birliklerle aynı hesap akışına girer. Bir ülke, yalnız DM tarafından kendisine açılmış özel birlikleri satın alabilir; fakat savaş kadrosuna kayıtlı mevcudunun tamamını koyabilir.

## MESAJ 8/20 — 🧩 ORDU KOMPOZİSYONU

Kompozisyon, ordunun tamamından değil **o tur cepheye giren birliklerden** hesaplanır. Yedekler cepheye girene kadar değerlendirmeyi etkilemez.

**Roller:**
• Hat: Hafif Piyade, Milis, Ağır Piyade, Lejyoner, Pers Ölümsüzleri, İber Caetratileri, Cermen Şok Savaşçıları
• Mızrak: Mızraklı %100; Hoplit %50 Mızrak + %50 Hat
• Menzilli: Sapancı, Okçu, Briton Uzun Yaycıları; Atlı Okçu %50 Menzilli + %50 Hareketli
• Hareketli: Hafif/Ağır/Deve Süvarisi ve Kartaca Savaş Filleri; Atlı Okçu %50 Hareketli

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

**Süvari Gücü:**
• 1 Hafif, Ağır veya Deve Süvarisi = 1
• 1 Kartaca Savaş Fili = 1
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

**Deniz Ham Hasarı = Hasar toplamı × 0,012 × Üstünlük çarpanı × Özel savaş çarpanı**

Ham hasar hedef birliklere dayanıklılık ağırlığıyla dağıtılır:

1. Tür ağırlığı = Mevcut × Dayanıklılık katsayısı
2. Türe ayrılan hasar = Ham hasar × Tür ağırlığı ÷ Toplam ağırlık
3. Tür kaybı = Türe ayrılan hasar × Dayanıklılık katsayısı
4. Sonuç yuvarlanır ve mevcut sayıyı aşamaz.

**Örnek:** 1.000 Hafif + 1.000 Ağır Piyadeye 800 ham hasar gelirse ağırlıklar 1.000 ve 700 olur. Yaklaşık 471 Hafif, 231 Ağır Piyade kaybedilir; toplam kayıp 702’dir.

Mızrak karşılaşmasının hedefli ek hasarı genel hasardan ayrılır ve yalnız uygun süvari birliklerinden düşülür.

## MESAJ 13/20 — 🧠 BASKI, KAYIP YÜZDESİ VE DÜZEN

Normal meydan, pusu ve deniz savaşlarında:

• Dengeli tur: Baskı değişmez
• Hafif üstünlük: Kaybeden +1
• Belirgin üstünlük: Kaybeden +2
• Ezici üstünlük: Kaybeden +3
• Tur galibi: Kendi baskısından −1; 0’ın altına inmez

**Kayıp yüzdesi = (Başlangıç − Mevcut) ÷ Başlangıç × 100**

Bot gerçekleşen en ağır eşiği uygular:
• Düzenli: Baskı 0–1 ve kayıp %10’dan az
• Yıpranmış: Baskı 2–3 veya kayıp %10+
• Sarsılmış: Baskı 4–5 veya kayıp %30+
• Dağılmış: Baskı 6+, kayıp %40+ veya kuvvet 0

Bu savaş türlerinde bir taraf Dağılmış olduğunda savaş biter. İki taraf aynı turda dağılırsa daha fazla kuvveti kalan kazanır; eşitse galip çıkmaz.

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
• Kuşatma: Saldıran 15.000 / Savunan 18.000
• Deniz: Taraf başına 30 gemi

Cephe kapasitesi tek başına güç bonusu vermez; yalnız zar üretecek kuvveti sınırlar.

**Pusu:** A tarafı ilk zarı atar. Yalnız ilk savaş turunda A Çarpışması ×1,25 ve A Hasarı ×1,10 olur. Sonraki turlarda bu bonus kalkar; pusu cephesi ve geri çekilme cezası sürer.

**Komutan:** Curia’ya atanmış Komutanın özellik puanı, tarafın Çarpışma sonucuna düz bonus verir. Birleşik tarafta en yüksek Komutan kullanılır; bonuslar toplanmaz. Komutan bonusu en fazla **+3 Çarpışma**dır ve deniz savaşlarında uygulanmaz.

## MESAJ 15/20 — 🏰 KUŞATMA AŞAMALARI VE TAHKİMAT

Kuşatmada A saldıran, B savunandır. Sur **30.000 HP**, kapı **1.000 HP** ile başlar.

**Bombardıman:** Ordular temas etmez; asker kaybı, baskı ve savaş turu ilerlemesi oluşmaz. Yalnız sur hedefli Katapultlar çalışır. Bir kuşatma aynı oyun turunda en fazla **4 kez** bombalanabilir; haklar yeni oyun turunda yenilenir. Hücuma geçildikten sonra bombardımana dönülemez.

**Tahkimat çarpanları:**
• Sur ve kapı sağlam: B Çarpışma ×1,50; B Hasar ×1,35; A Hasar ×0,50
• Yalnız biri sağlam: B Çarpışma ×1,25; B Hasar ×1,15; A Hasar ×0,75
• İkisi de yıkılmış: B Çarpışma ×1,10; diğer Hasarlar ×1,00

Tahkimat kademesi turun başındaki HP’ye göre belirlenir. Aynı tur kırılan sur veya kapı hücum erişimini hemen açabilir; fakat düşük tahkimat çarpanı sonraki savaş turunda uygulanır.

Bot savunucunun **Ham Zar** ve **Tahkimat Sonrası Zar** sonuçlarını ayrı gösterir. Kayıp üstünlüğü çarpanlı sonuçtan, kuşatma baskısı ise tarafların ham Çarpışma sonuçlarından hesaplanır.

## MESAJ 16/20 — 🪜 HÜCUM ERİŞİMİ VE KUŞATMA BİRLİKLERİ

Sur ve kapı birlikte sağlamken bütün saldıran ordu doğrudan savaşamaz:

• 1 Merdiven Grubu, en fazla **1.000 Hücum Birliğine** erişim sağlar.
• 1 Kuşatma Kulesi, en fazla **3.000 Hücum Birliğine** erişim sağlar.
• Toplam hücum erişimi saldıranın 15.000 kişilik cephesini aşamaz.
• Kuleler kapasite hesabında önce, merdivenler kalan alanda değerlendirilir.
• Sur veya kapı kırılırsa saldıranın normal 15.000 kişilik cephesi açılır.

**Hücum Birlikleri:** Hafif Piyade, Milis, Mızraklı, Ağır Piyade, Lejyoner, Hoplit, Pers Ölümsüzleri, İber Caetratileri ve Cermen Şok Savaşçılarıdır.

Sadece menzilli veya atlı birliklerden oluşan ordu şehir alamaz. Hücum Birliği kalmazsa kuşatan taraf otomatik geri çekilir. Sur ve kapı sağlamken saldıran süvariler cepheye ve kayıp havuzuna girmez; Atlı Okçular menzilli destek verebilir. Sur veya kapı kırılınca normal cepheye geçilir.

Savunucu süvariler kuşatma boyunca attan inerek savaşır:
• Hafif Süvari → Hafif Piyade zarları
• Ağır Süvari → Ağır Piyade zarları
• Atlı Okçu → Okçu zarları
• Deve Süvarisi → Mızraklı Piyade zarları

Kayıplar belgede özgün birlik adından düşülür.

## MESAJ 17/20 — 🚨 KUŞATMA BASKISI, AÇLIK VE ŞEHRİN DÜŞMESİ

Kuşatma baskısı 0–8 arasındadır:
• 0–2 Düzenli
• 3–4 Baskı Altında
• 5–6 Sarsılmış
• 7–8 Kritik Hat

Tur kaybından sonra kullanılabilir yedek baskıyı azaltır:
• En az yarım cephe yedeği: −1
• En az tam cephe yedeği: −2

Savunucudaki Panteon Sv3, kuşatma boyunca ilk olumlu baskı artışını 1 puan azaltır.

**Saldıranın baskıyla çekilmesi için:** Önceki turdan beri 8 baskıda olmalı, yeni ham baskı turunu kaybetmeli ve en az yarım cephe kullanılabilir yedeği kalmamalıdır. Hücum Birliğinin tamamen tükenmesi ayrıca doğrudan geri çekilme sebebidir.

**Savunucunun baskıyla şehri kaybetmesi için şartların tamamı gerekir:**
• Sur=0, Kapı=0 veya etkin merdiven/kule erişimi bulunmalı
• Önceki turdan beri 8 baskıda olmalı
• Yeni ham baskı turunu kaybetmeli
• Kalan kuvvet başlangıcın en fazla %30’u olmalı
• Kalan kuvvet en fazla 9.000 olmalı

Savunucu kuvvet 0 ve erişim açık ise şehir doğrudan düşer.

**Açlık:** Temel erzak dayanıklılığı **6 oyun turudur**. Çiftlik Sv2 +1, Sv3 +3; Su Kemeri Sv2+ +2; Garnizon Güçlendirme +1 ve ülke bonusları eklenir. Toplam ek bina/politika/ülke bonusu en fazla +8’dir. Erzak 0 olduğunda bot otomatik teslim vermez; sonucu DM belirler.

## MESAJ 18/20 — 🛠️ KUŞATMA ALETLERİ

• **Merdiven Grubu:** Çarpışma veya Hasar üretmez; 1.000 Hücum Birliğine erişim sağlar.
• **Koçbaşı:** Her kuşatmada en fazla 1; birikmez. 1d8×35 Kapı Hasarı.
• **Mantlet:** Adet başına 1d4 Çarpışma; savunanın saldırana Hasarını adet başına %5 azaltır, üst sınır %50.
• **Balista — Sur:** Adet başına 1d10×5 Sur Hasarı.
• **Balista — Ordu:** Adet başına 1d10 saldıran Hasarı.
• **Katapult — Sur:** Adet başına 2d20×20 Sur Hasarı.
• **Katapult — Ordu:** Adet başına 1d20 saldıran Hasarı.
• **Kuşatma Kulesi:** Adet başına 2d20 Çarpışma + 1d6 Hasar; 3.000 Hücum Birliğine erişim.
• **Hafif Sur Balistası:** Savunmaya özgü; adet başına 2d8 savunma Hasarı.

Bir alet türünden aynı savaş turunda en fazla 25 adet etkindir; Koçbaşı 1 ile, kule ve merdivenler ayrıca 15.000 erişim cephesiyle sınırlıdır.

Yapı Hasarı asker kaybına dönüşmez. Ordu hedefli aletler normal üstünlük, tahkimat, mantlet ve dayanıklılık hesaplarından geçer. Bombardımanda yalnız sur hedefli Katapult çalışır.

Mühendislik Atölyesi Sv3’te geliştirilmiş olarak üretilen kayıtlı Balista ve Katapultların ilgili hasar zarlarına +1 uygulanır. Merdiven ve Koçbaşı kuşatma başladıktan sonra, zarlar başlamadan önce anlık satın alınabilir; saha aleti alımı yeni bir savaş formu yayımlamaz.

## MESAJ 19/20 — 🚢 DENİZ SAVAŞI VE GERİ ÇEKİLME

**Gemi — Fiyat / Bakım — Çarpışma / Hasar — Dayanıklılık — Mürettebat / Taşıma**
• Kerkouros: 750 / 75 — 1d6 / 1d6 — Düşük — 50 / 200
• Trireme: 1.500 / 150 — 2d8 / 2d8 — Orta — 100 / 500
• Quinquereme: 3.000 / 300 — 3d10 / 3d10 — Yüksek — 150 / 800

Her gemi bir zar bloğudur. En fazla 30 gemi cepheye girer. Filo 30’u aşarsa türlerin etkin adedi filo oranıyla aşağı yuvarlanır; boş kalan yuvalar tekrar doldurulmaz. İllirya’nın toplam taşıma kapasitesi %10 fazladır.

**Geri çekilme temel kaybı:** 1. tur %0; 2. tur %5; 3. tur %8; 4. tur %11; 5+ tur %14.

İkinci turdan itibaren takip ekleri:
• Kara: Rakibin Hafif+Ağır Süvari oranı ×%20; Orman, Bataklık ve Dağlıkta yarısı
• Deniz: Rakibin Kerkouros oranı ×%15
• Pusu veya Dağ Geçidi: +5 yüzde puanı
• Kuşatma savunucusu: +5 yüzde puanı

Toplam geri çekilme kaybı mevcut kuvvetin en fazla %25’i olabilir. İlk turda hiçbir ek takip cezası uygulanmaz. Bombardıman savaş turu sayılmaz. Geri çekilen taraf savaşı kaybeder.

## MESAJ 20/20 — 📜 AÇIK BİLGİ, KAYIP KAYDI VE KOMUTLAR

**Açık bilgiler:** Anlatı, arazi, zar sırası, açık zar sonuçları, üstünlük, tur ve toplam kayıplar, baskı, düzen, meydan/deniz toplam kuvvetleri, kuşatan toplamı, sur/kapı HP ve erzak.

**Gizli bilgiler:** Tam birlik/filo kompozisyonları, kuşatma savunucusunun toplam kuvveti, yedekleri, kuşatma aleti dökümü ve hedefleri. Savunucunun gerçekleşmiş kayıpları açık kalır.

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
• `/savas yayinla`, `/savas tur-oynat`
• `/savas ordu-detay`, `/savas kayip-raporu`
• `/savas bitir`, `/savas iptal`

Tekil düzeltmeler için `/savas birlik-ayarla` ve `/savas gemi-ayarla` kullanılabilir. Formülleri bot uygular; oyuncular veya DM savaş çarpanlarını elle giremez.

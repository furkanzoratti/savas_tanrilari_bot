# ⚔️ SAVAŞ TANRILARI ROLE PLAY — SAVAŞ SİSTEMİ

> Aşağıdaki blokların her biri Discord'a ayrı mesaj olarak gönderilebilir. Formüllerdeki bütün küsuratlar, aksi belirtilmedikçe bot tarafından en yakın tam sayıya yuvarlanır.

## MESAJ 1/12 — SAVAŞIN TEMEL AKIŞI

Savaşlar sabit üç turda bitmez. Taraflardan biri dağılana, geri çekilene veya savaş türüne özel zafer şartı oluşana kadar **savaş turları** tekrar eder.

1. DM; tarafları, araziyi, açıklamayı ve tarafların oyuncu/NPC kontrolünü seçerek savaşı açar.
2. Kara ordusu veya filo bileşimleri sisteme gizli girilir.
3. Bot ilk zar tarafını belirler. Yetkili oyuncu düğmeyle; NPC adına DM açık zar atar. DM gerektiğinde oyuncu adına da vekâleten atabilir.
4. Her taraf için iki havuz oluşur: **Çarpışma** ve **Hasar**.
5. İki açık zar kaydedilince DM turu çözer. Bot üstünlüğü, kayıpları, baskıyı ve düzen seviyesini hesaplar.
6. Savaş bitmediyse tur numarası artar ve ilk zar sırası diğer tarafa geçer.

**Kavramlar:**
• Çarpışma, o turun üstün tarafını belirler.
• Hasar, rakibe uygulanacak kaybın temelidir; doğrudan ölü sayısı değildir.
• Baskı yüzde değil, biriken **puan** değeridir.
• Kayıp yüzdesi, başlangıç kuvvetine göre ayrıca hesaplanır.

## MESAJ 2/12 — CEPHEYE GİREN ASKER VE ZAR ÜRETİMİ

Arazi bir **cephe kapasitesi** belirler. Toplam kuvvet kapasiteyi aşmıyorsa herkes; aşıyorsa birlik türleri ordudaki oranları korunarak cepheye girer.

**Cephe oranı = Cephe kapasitesi ÷ Toplam mevcut kuvvet**
**Bir türün cephedeki sayısı = Türün mevcut sayısı × Cephe oranı**

İlk sonuçlar aşağı yuvarlanır. Yuvarlamadan kalan birkaç kişilik kapasite, mevcut birim sırasına göre doldurulur. Cephe dışındaki askerler yedektir; o tur zar üretmez. Kayıplarla yer açıldıkça sonraki turlarda cepheye girer.

**Örnek:** 20.000 Hafif Piyade ve 20.000 Ağır Piyadeden oluşan 40.000 kişilik ordu, 30.000 kişilik ovada %75 oranla savaşır: 15.000 Hafif + 15.000 Ağır cepheye girer.

Kara savaşında her tam **1.000 asker**, türünün Çarpışma ve Hasar zarlarını bir kez üretir. Eksik birlik de zar atar; sonuç mevcuduna oranlanır.

**Örnek:** 500 Okçu 1d8 Çarpışma atıp 6 bulursa 6 × 500/1.000 = **3** Çarpışma üretir. Orantılı sonuç en az 1'dir.

Denizde blok büyüklüğü 1 gemidir. Filo 30 gemiyi aşarsa her türün etkin adedi = tür adedi × 30/toplam filo olur ve aşağı yuvarlanır; yuvarlamayla boş kalan filo yuvası yeniden doldurulmaz. Etkin her gemi kendi zarlarını üretir.

## MESAJ 3/12 — BİRİM ZARLARI VE DAYANIKLILIK

**Birim — Çarpışma / Hasar — Dayanıklılık**
• Hafif Piyade/Ciritçi: 1d6 / 1d6 — Düşük
• Sapancı: 1d6 / 1d8 — Düşük
• Mızraklı Piyade: 1d8 / 1d6 — Orta
• Okçu: 1d8 / 1d10 — Düşük
• Ağır Piyade: 2d8 / 2d8 — Yüksek
• Hafif Süvari: 2d6 / 1d8 — Orta
• Ağır Süvari: 2d10 / 2d10 — Yüksek

**Dayanıklılık katsayısı:**
• Düşük: **1,00**
• Orta: **0,85**
• Yüksek: **0,70**

Pahalı birliklerin iki avantajı vardır: daha güçlü zar havuzu ve aynı ham hasar karşısında daha düşük kayıp. Dayanıklılık, zar toplamını değiştirmez; hasarın birlik türlerine dağıtılması ve ölü sayısına çevrilmesi sırasında uygulanır.

Her birim türünün zarları ayrı atılır ve toplanır:
**Taraf Çarpışması = Cephedeki bütün türlerin Çarpışma sonuçları toplamı**
**Taraf Hasarı = Cephedeki bütün türlerin Hasar sonuçları toplamı**

Kuşatma aleti desteği varsa ilgili Çarpışma veya ordu Hasarı daha sonra bu toplamlara eklenir.

## MESAJ 4/12 — ÇARPIŞMA ÜSTÜNLÜĞÜ NASIL BULUNUR?

İki tarafın Çarpışma toplamları karşılaştırılır. Fark, yüksek sonuca değil **düşük sonuca** bölünür:

**Üstünlük yüzdesi = (Yüksek Çarpışma − Düşük Çarpışma) ÷ Düşük Çarpışma × 100**

• Eşit sonuç veya %0–9,99 fark: **Dengeli** — kazanan yok
• %10–24,99: **Hafif Üstünlük**
• %25–49,99: **Belirgin Üstünlük**
• %50 ve üzeri: **Ezici Üstünlük**
• Düşük taraf 0 ise: **Ezici Üstünlük**

**Örnek 1:** A=120, B=100 → (120−100)/100 = **%20** → A Hafif Üstün.
**Örnek 2:** A=108, B=100 → **%8** → Dengeli; A daha yüksek atsa da tur galibi sayılmaz.
**Örnek 3:** A=150, B=100 → **%50** → A Ezici Üstün.

Bu sınıf iki şeyi belirler:
1. Her tarafın Hasar çarpanı.
2. Kaybeden tarafın kazanacağı baskı puanı.

Çarpışma sonucu, Hasar zarını yeniden attırmaz. İki taraf da kendi önceden attığı Hasar toplamını, turun üstünlük sınıfına ait çarpanla kullanır.

## MESAJ 5/12 — HASARIN KAYBA ÇEVRİLMESİ

Önce her tarafın rakibe uyguladığı **ham hasar** bulunur:

**Kara Ham Hasarı = Hasar zarı toplamı × 20 × Üstünlük çarpanı × Özel savaş çarpanı**
**Deniz Ham Hasarı = Hasar zarı toplamı × 0,012 × Üstünlük çarpanı × Özel savaş çarpanı**

**Üstünlük çarpanları:**
• Dengeli: iki taraf **0,80**
• Hafif: kazanan **1,00** / kaybeden **0,70**
• Belirgin: kazanan **1,15** / kaybeden **0,50**
• Ezici: kazanan **1,30** / kaybeden **0,30**

“Kaybeden çarpanı”, kaybeden tarafın rakibine vereceği hasarı azaltır. Alacağı hasarı doğrudan çarpmaz.

**Örnek:** A Çarpışma 120, B 100 olduğundan A Hafif Üstündür. A Hasar 40, B Hasar 30 attıysa:
• A'nın B'ye ham hasarı: 40 × 20 × 1,00 = **800**
• B'nin A'ya ham hasarı: 30 × 20 × 0,70 = **420**

Bunlar henüz kesin ölü sayıları değildir. Sonraki adımda hedef ordunun birim dağılımı ve dayanıklılığı uygulanır. Kuşatma ve pusu gibi özel çarpanlar da ham hasar formülündeki son çarpana girer.

## MESAJ 6/12 — HASARIN BİRİMLERE DAĞITILMASI

Ham hasar, hedef ordunun o anki bütün birim türlerine dayanıklılık ağırlığıyla dağıtılır.

1. **Tür ağırlığı = Mevcut asker × Dayanıklılık katsayısı**
2. **Türe ayrılan hasar = Ham hasar × Tür ağırlığı ÷ Bütün tür ağırlıkları toplamı**
3. **Tür kaybı = Türe ayrılan hasar × Dayanıklılık katsayısı**
4. Sonuç en yakın tam sayıya yuvarlanır ve o türün mevcut sayısını aşamaz.

**Örnek:** Hedefte 1.000 Hafif ve 1.000 Ağır Piyade; gelen ham hasar 800 olsun.
• Hafif ağırlık: 1.000×1,00=1.000
• Ağır ağırlık: 1.000×0,70=700
• Toplam ağırlık: 1.700
• Hafife ayrılan: 800×1.000/1.700≈471 → **471 kayıp**
• Ağıra ayrılan: 800×700/1.700≈329,41; 329,41×0,70≈230,59 → **231 kayıp**

Toplam **702 kayıp** oluşur. Böylece yüksek dayanıklılık, ağır birliğin hem hasardan daha küçük pay almasını hem de ayrılan hasarı daha düşük kayba çevirmesini sağlar.

Bir turun toplam kaybı, bütün birim türlerinin hesaplanan kayıplarının toplamıdır.

## MESAJ 7/12 — BASKI, KAYIP YÜZDESİ VE DÜZEN

**Normal savaşlarda baskı:** Baskı yüzde değil, 0'dan başlayan bir puandır.

• Dengeli: değişiklik yok
• Hafif üstünlük: kaybeden +1
• Belirgin üstünlük: kaybeden +2
• Ezici üstünlük: kaybeden +3
• Tur galibi: mevcut baskısından −1

Meydan, pusu ve deniz savaşlarında kayıp yüzdesi de düzene katılır:

• **Düzenli:** Baskı 0–1 ve kayıp %10'dan az
• **Yıpranmış:** Baskı 2–3 veya kayıp en az %10
• **Sarsılmış:** Baskı 4–5 veya kayıp en az %30
• **Dağılmış:** Baskı 6+, kayıp en az %40 veya kuvvet 0

Normal meydan, pusu ve deniz savaşında bir taraf Dağılmış olunca savaş biter.

**Kuşatmada özel baskı:** Tahkimat çarpanları baskıya eklenmez. Baskı, saldıran ve savunan tarafın ham Çarpışma zarları karşılaştırılarak hesaplanır.

• 0–2: Düzenli
• 3–4: Baskı Altında
• 5–6: Sarsılmış
• 7–8: Kritik Hat

Kuşatma baskısı en fazla 8 olur. Bir tarafın ilk kez 8 baskıya ulaşması savaşı bitirmez.

Tur kayıplarından sonra cephe dışında kalan yedekler baskıyı azaltır:

• En az yarım cephe büyüklüğünde yedek: −1 baskı
• En az bir tam cephe büyüklüğünde yedek: −2 baskı

Yedek = mevcut toplam kuvvet − cephe kapasitesi. Savunucunun toplamı ve yedek sayısı açık edilmez; bot hesabı gizli yürütür.

## MESAJ 8/12 — ARAZİ, CEPHE VE PUSU

**Aynı turda etkin savaşabilecek azami kuvvet:**
• Açık Ova: 30.000 / 30.000
• Çöl: 35.000 / 35.000
• Orman: 15.000 / 15.000
• Bataklık: 10.000 / 10.000
• Dağlık: 12.000 / 12.000
• Dağ Geçidi: 6.000 / 6.000
• Nehir Geçişi: saldıran 10.000 / savunan 20.000
• Pusu: pusu kuran 15.000 / pusuya düşen 8.000
• Kuşatma: saldıran 15.000 / savunan 18.000
• Deniz: taraf başına 30 gemi

İlk değer A, ikinci değer B tarafıdır. Cephe kapasitesi doğrudan saldırı/hasar bonusu vermez; yalnızca o tur zar üretecek asker veya gemi miktarını sınırlar.

**Pusu:** A tarafı pusuyu kurar ve ilk zarı atar. Yalnız 1. savaş turunda:
• A'nın nihai Çarpışma toplamı × **1,25**
• A'nın nihai Hasar toplamı × **1,10**

Sonuçlar yukarı yuvarlanır. İkinci turdan itibaren bu çarpanlar kalkar; ancak savaş Pusu arazisi olarak sürdüğü için 15.000/8.000 cephe sınırı ve geri çekilme cezası devam eder.

## MESAJ 9/12 — KUŞATMA, SAVUNMA VE ŞEHİR DÜŞMESİ

Kuşatmada A saldıran, B savunandır. Saldıran cephesi **15.000**, savunan cephesi **18.000** askerdir. Sur **30.000 HP**, kapı **1.000 HP** ile başlar.

**Bombardıman:** Ordular temas etmez; asker kaybı ve baskı oluşmaz, savaş turu ilerlemez. Yalnız Sur hedefli Katapultlar atış yapar. En fazla 25 Katapult etkindir. Her kuşatma bir oyun turunda en fazla **4 kez** bombalanabilir. Yeni oyun turunda dört hak otomatik yenilenir. Hücuma geçildikten sonra bombardımana dönülemez.

**Savunucunun savaş kartındaki zarları iki satırdır:**

• **Ham Zar:** Oyuncunun veya DM'in attığı gerçek Çarpışma ve Hasar.
• **Tahkimat Sonrası:** Kayıp hesabında kullanılan çarpanlı Çarpışma ve Hasar.

**Tahkimat çarpanları:**

• Sur ve kapı >0: B Çarpışma ×1,50; B Hasar ×1,35; A Hasar ×0,50
• Yalnız biri >0: B Çarpışma ×1,25; B Hasar ×1,15; A Hasar ×0,75
• İkisi de 0: B Çarpışma ×1,10; diğer Hasarlar ×1,00

Tahkimat sonrası Çarpışma, **kayıp hesabındaki üstünlüğü** belirler. Kuşatma baskısı ise iki tarafın **ham Çarpışma** zarlarından belirlenir. Bu yüzden bot bu iki üstünlüğü savaş kartında ayrı gösterir.

**Saldıranın zorunlu geri çekilmesi için:**

• Önceki turdan beri 8 baskıda olması,
• Yeni turu da baskı hesabında kaybetmesi,
• En az yarım cephe büyüklüğünde kullanılabilir yedeğinin kalmaması

şartlarının tamamı gerekir. İlk kez 8 baskıya ulaşmak geri çekilme oluşturmaz.

**Savunucunun şehri baskı yüzünden kaybetmesi için önce erişim gerekir:** Sur=0, Kapı=0 veya saldıranda etkin Merdiven/Kuşatma Kulesi bulunmalıdır.

Erişimle birlikte şu şartların tamamı aranır:

• Savunucu önceki turdan beri 8 baskıda olmalı,
• Yeni turu da baskı hesabında kaybetmeli,
• Kalan kuvvet başlangıcın %30'u veya altında olmalı,
• Kalan kuvvet 9.000 veya altında olmalıdır.

Şehirde 10.000 asker veya kullanılabilir büyük bir yedek kuvvet varken yalnızca baskı nedeniyle otomatik teslim yaşanmaz. Savunucu kuvveti 0'a düşmüş ve şehre erişim sağlanmışsa şehir doğrudan düşer. Açlık ve gönüllü teslim ayrı kurallardır.

## MESAJ 10/12 — KUŞATMA ALETLERİNİN HESABI

Bir alet türünün aynı turda en fazla **25** adedi etkindir. Alet eklenirken hedef seçilir.

• **Merdiven — Hücum:** Adet başına 1d2 Çarpışma; erişim sağlar.
• **Koçbaşı — Kapı:** Her kuşatmada en fazla 1 adet alınabilir; üst üste birikmez ve 1d8×35 Kapı Hasarı verir.
• **Mantlet — Hücum:** Adet başına 1d4 Çarpışma; her biri B'nin A'ya Hasarını %5 azaltır, üst sınır %50.
• **Balista — Sur:** Adet başına 1d10×5 Sur Hasarı.
• **Balista — Ordu:** Adet başına 1d10, A Hasar toplamına eklenir.
• **Katapult — Sur:** Adet başına 2d20×20 Sur Hasarı.
• **Katapult — Ordu:** Adet başına 1d20, A Hasar toplamına eklenir.
• **Kuşatma Kulesi — Hücum:** Adet başına 2d20 Çarpışma + 1d6 Ordu Hasarı; erişim sağlar.
• **Hafif Sur Balistası — Ordu:** B'ye özeldir; adet başına 2d8, B Hasarına eklenir.

Yapı Hasarı ordu kaybına dönüşmez. Ordu hedefli alet zarları tarafın Hasar havuzuna girer ve normal üstünlük, kuşatma, mantlet ve dayanıklılık hesaplarından geçer.

Koçbaşı yalnız kapıya; Sur hedefli Balista/Katapult yalnız sura vurur. Bombardıman aşamasında Balista ve diğer aletler çalışmaz; yalnız Sur hedefli Katapult kullanılır.

## MESAJ 11/12 — DENİZ SAVAŞI VE GERİ ÇEKİLME

**Gemi — Çarpışma / Hasar — Dayanıklılık**
• Kerkouros: 1d6 / 1d6 — Düşük
• Trireme: 2d8 / 2d8 — Orta
• Quinquereme: 3d10 / 3d10 — Yüksek

Her gemi bir bloktur; taraf başına en fazla 30 gemi zar üretir. Üstünlük eşikleri kara savaşıyla aynıdır. Ham Hasar ölçeği **0,012** olup sonuç gemi dayanıklılığıyla dağıtılır.

**Geri çekilme temel oranı:**
• 1. savaş turu: %0
• 2. tur: %5
• 3. tur: %8
• 4. tur: %11
• 5. ve sonrası: %14

2. turdan sonra ek takip:
• Kara: rakip süvari oranı ×%20; Orman/Bataklık/Dağda bu ek yarıya iner.
• Deniz: rakip Kerkouros oranı ×%15.
• Pusu veya Dağ Geçidi: +5 yüzde puan.
• Kuşatma savunucusu: +5 yüzde puan.

**Geri çekilme kaybı = Mevcut kuvvet × Toplam oran**, en yakın tam sayıya yuvarlanır. Toplam oran en fazla %25'tir. 1. turdaki %0 kuralında hiçbir ek ceza uygulanmaz. Bombardıman savaş turu sayılmadığından geri çekilme basamağını yükseltmez. Çekilen taraf savaşı kaybeder.

## MESAJ 12/12 — AÇIK/GİZLİ BİLGİLER, KAYIT VE KOMUTLAR

**Açık:** anlatı, arazi, zar sırası ve sonuçları, üstünlük, tur kayıpları, toplam kayıplar, baskı, düzen, meydan/denizde toplam kuvvet, kuşatmada saldıran toplamı, sur/kapı HP.

**Gizli:** tam birlik/filo kompozisyonu, kuşatma savunucusunun toplamı, kuşatma aleti dökümü ve hedefleri. Kuşatmada yalnız savunucunun toplamı gizlenir; kayıpları açık kalır.

Savaş sonunda bot kayıpları ülke belgelerine yalnız **bir kez** işler. Kara kayıpları birlik kayıtlarından ve bağlı yerleşke nüfusundan düşer. Gemi mürettebat katsayısı tanımlı olmadığından gemi kaybı nüfusu azaltmaz. DM raporu; hesaplanan, uygulanan ve kayıt yetersizliği yüzünden uygulanamayan miktarı gösterir.

**DM komutları:**
• `/savas taraf-ulke` — taslakta A veya B tarafına ek ülke ekler/çıkarır; kara ve filo kadrolarındaki isteğe bağlı `ulke` alanı katkıyı seçilen ülkeye yazar.
• `/savas kadro-ayarla` — bütün kara ordusu
• `/savas filo-ayarla` — bütün filo
• `/savas kusatma-aleti-ayarla` — alet/adet/hedef
• `/savas kusatma-asamasi` — Bombardıman/Hücum
• `/savas bombardiman` — DM yedek bombardımanı
• `/savas ordu-detay` — gizli tam döküm
• `/savas kayip-raporu` — özel mutabakat raporu

Tekil düzeltmelerde `/savas birlik-ayarla` ve `/savas gemi-ayarla` kullanılabilir. Formüllerin uygulanması bot tarafından otomatik yapılır; oyuncu veya DM elle çarpan giremez.
# ⚔️ SAVAŞ TANRILARI ROLE PLAY — SAVAŞ SİSTEMİ

> Aşağıdaki blokların her biri Discord'a ayrı mesaj olarak gönderilebilir.

## MESAJ 1/7 — TEMEL AKIŞ

Savaşlar sabit üç fazda bitmez. Her savaş, taraflardan biri dağılana, geri çekilene veya savaşın özel zafer şartı gerçekleşene kadar devam eden **savaş turlarından** oluşur.

1. DM savaş kanalında tarafları, araziyi, savaş açıklamasını ve tarafların oyuncu/NPC kontrolünü seçerek savaşı açar.
2. Ordular gizli olarak sisteme girilir. Bot açık kartta meydan ve deniz savaşlarında yalnızca toplam kuvveti gösterir; kuşatmada savunucu toplamını da gizler.
3. Bot ilk zar atacak tarafı belirler. Yetkili oyuncu açık düğmeyle zarını atar. NPC zarını DM atar; DM gerektiğinde oyuncu ülkesi adına da vekâleten zar atabilir.
4. İki tarafın Çarpışma ve Hasar zarları kanalda açıkça yayımlanır.
5. DM turu sonuçlandırır. Bot kayıpları, baskıyı ve savaşın sürüp sürmediğini hesaplar; bitmediyse yeni tur başlar.

Her 1.000 asker kendi birim zarlarını üretir. Cephe kapasitesini aşan askerler yedekte kalır ve kayıplar nedeniyle cephede yer açıldıkça sonraki turlarda çarpışmaya katılır. Eksik 1.000 kişilik birlikler orantılı zar üretir.

## MESAJ 2/7 — BİRİMLER VE ZARLAR

**Birim — Çarpışma / Hasar — Dayanıklılık**
• Hafif Piyade/Ciritçi: 1d6 / 1d6 — Düşük
• Sapancı: 1d6 / 1d8 — Düşük
• Mızraklı Piyade: 1d8 / 1d6 — Orta
• Okçu: 1d8 / 1d10 — Düşük
• Ağır Piyade: 2d8 / 2d8 — Yüksek
• Hafif Süvari: 2d6 / 1d8 — Orta
• Ağır Süvari: 2d10 / 2d10 — Yüksek

Çarpışma toplamı turun üstün tarafını belirler. İki toplam arasındaki fark:
• %0–9: Dengeli
• %10–24: Küçük Üstünlük
• %25–49: Açık Üstünlük
• %50+: Ezici Üstünlük

Hasar toplamı doğrudan ölü sayısı değildir. Bot; üstünlük derecesini, birim dayanıklılığını, kuşatma korumasını ve özel savaş şartlarını uygulayarak kaybı hesaplar. Bu nedenle ağır birlikler hem daha güçlü zar üretir hem de aynı hasar karşısında daha az kayıp verir.

Kaybedilen turlar orduya 1/2/3 baskı verir; kazanmak mevcut baskıyı 1 azaltır. Normal savaşta 6 baskıya ulaşmak, başlangıç kuvvetinin %40'ını kaybetmek veya askersiz kalmak düzenin dağılması anlamına gelir.

## MESAJ 3/7 — ARAZİ VE CEPHE

Arazi, aynı turda fiilen savaşabilecek kuvveti sınırlar:
• Açık Ova: 30.000 / 30.000
• Çöl: 35.000 / 35.000
• Orman: 15.000 / 15.000
• Bataklık: 10.000 / 10.000
• Dağlık: 12.000 / 12.000
• Dağ Geçidi: 6.000 / 6.000
• Nehir Geçişi: saldıran 10.000 / savunan 20.000
• Pusu: pusu kuran 15.000 / pusuya düşen 8.000
• Kuşatma: saldıran 12.000 / savunan 18.000
• Deniz: taraf başına 30 gemi

Böylece haritadaki konum önemlidir: kalabalık ordular açık arazide sayılarını daha iyi kullanırken dar geçit, nehir, bataklık ve surlar küçük savunma kuvvetlerine zaman kazandırır.

**Pusu:** A tarafı pusu kurandır ve ilk zarı atar. İlk turda A'nın Çarpışma toplamı %25, Hasar toplamı %10 artar. Pusuya düşen tarafın dar cephede yalnızca 8.000 askeri aynı anda karşılık verebilir.

## MESAJ 4/7 — KUŞATMA VE TAHKİMAT

Kuşatmada A saldıran, B savunandır.

• Sur Canı: **30.000**
• Kapı Canı: **15.000**

**Savunma avantajı:**
• Sur ve kapı sağlam: savunucu Çarpışma +%50, Hasar +%35; saldıran birlik Hasarı %50 etkinlikte.
• Sur veya kapıdan biri düşmüş: savunucu Çarpışma +%25, Hasar +%15; saldıran birlik Hasarı %75 etkinlikte.
• İkisi de düşmüş: savunucu Çarpışma +%10; hasarlar normal etkinlikte.

Şehir yalnız merdiven konuldu diye düşmez. Şehrin alınması için önce **erişim** gerekir: Surun yıkılması, kapının kırılması veya saldıranda merdiven/kuşatma kulesi bulunması. Erişim sağlandıktan sonra ayrıca şu şartlardan biri gerçekleşmelidir:
• Savunucu başlangıç kuvvetinin %30'una veya altına düşer.
• Savunucu kuşatma baskısı 8'e ulaşır.
• Savunucu asker kalmaz.

Bu nedenle 12.000 kişilik savunmadan 8.000 asker hâlâ savaşırken şehir iki turda ele geçirilemez.

## MESAJ 5/7 — KUŞATMA ALETLERİ

Her araç eklenirken hedefi seçilir. Bir araç türünün aynı turda en fazla 25 adedi etkin çalışabilir.

• **Merdiven Grubu — Hücum:** 1d4 Çarpışma desteği ve sur üstüne erişim.
• **Koçbaşı — Kapı:** Her biri 1d8 × 35 Kapı Hasarı. Orduya veya sura vuramaz.
• **Mantlet — Hücum:** 1d4 Çarpışma desteği; her biri saldırana gelen Hasarı %5 azaltır, toplam sınır %50.
• **Balista — Sur:** 1d6 × 5 Sur Hasarı.
• **Balista — Ordu:** Savunucu orduya 1d8 Hasar.
• **Katapult — Sur:** 2d10 × 20 Sur Hasarı.
• **Katapult — Ordu:** Savunucu orduya 1d10 Hasar.
• **Kuşatma Kulesi — Hücum:** 1d10 Çarpışma + 1d6 ordu Hasarı ve sur üstüne erişim.
• **Hafif Sur Balistası — Ordu:** Savunucuya özeldir; saldıran orduya 2d8 Hasar.

Koçbaşı yalnız kapıyı; Katapult ve Balista seçime göre suru veya orduyu hedefler. Böylece yapı hasarı ile asker kaybı birbirine karışmaz. En yüksek zarlarla dahi 10 Katapult ve 10 Balista suru iki savaş turunda yıkamaz.

## MESAJ 6/7 — DENİZ SAVAŞI VE GERİ ÇEKİLME

**Gemi — Çarpışma / Hasar — Dayanıklılık**
• Kerkouros: 1d6 / 1d6 — Düşük
• Trireme: 2d8 / 2d8 — Orta
• Quinquereme: 3d10 / 3d10 — Yüksek

Her gemi ayrı zar birimidir. Bir turda taraf başına en fazla 30 gemi aktif çatışır; kalan gemiler yedekte kalır.

**Geri çekilme:**
• 1. savaş turunda geri çekilme ek kayıp doğurmaz.
• 2. turdan itibaren temel takip kaybı %5'tir; savaş uzadıkça yükselir.
• Rakibin süvari oranı kara savaşındaki, Kerkouros oranı deniz savaşındaki takip kaybını artırır.
• Orman, bataklık ve dağ süvari takibini yarı yarıya azaltır.
• Pusu ve dağ geçidi geri çekilmeye +%5 ceza verir.
• Kuşatma savunucusunun şehirden çekilmesi +%5 ceza verir.
• Toplam geri çekilme kaybı ordunun %25'ini aşamaz.

Geri çekilme savaşı derhâl bitirir; rakip taraf galip sayılır.

## MESAJ 7/7 — GİZLİLİK, KAYIPLAR VE KOMUTLAR

**Açık bilgiler:** savaş anlatısı, arazi, zar sırası, zar sonuçları, tur sonucu, meydan/deniz savaşında toplam kuvvet, kuşatmada saldıran toplamı, sur ve kapı canı.

**Gizli bilgiler:** tam birlik kompozisyonları, kuşatma savunucusunun toplam asker sayısı ve tur kaybı, kuşatma aleti dökümü/hedefleri. DM bunları özel yönetici ekranından görür. Her gizli kadro, sonradan değişiklik yapılmadığını kanıtlayan bir mühür taşır.

Savaş bittiğinde bot birim ve gemi kayıplarını ülke belgelerine **bir kez ve otomatik** işler. Ardından yalnız DM'in görebildiği raporda hesaplanan kayıp, belgeden düşülen miktar ve varsa eksik kayıt gösterilir. Belge yetersizse fark sessizce kaybolmaz; yönetici raporunda açıkça işaretlenir.

**DM komutları:**
• `/savas kadro-ayarla`: Bir kara ordusunun bütün birimlerini tek komutta girer.
• `/savas filo-ayarla`: Bütün filoyu tek komutta girer.
• `/savas kusatma-aleti-ayarla`: Alet, adet ve hedef belirler.
• `/savas ordu-detay`: İki tarafın gizli tam dökümünü açar.
• `/savas kayip-raporu`: Son savaşın özel kayıp aktarım raporunu açar.

Tekil düzeltmeler için `/savas birlik-ayarla` ve `/savas gemi-ayarla` kullanılmaya devam edebilir.

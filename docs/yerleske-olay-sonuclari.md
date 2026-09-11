# 🗺️ Savaş Tanrıları Role Play: Yerleşke Olayı Sonuçları

Bu sonuçlar bot tarafından otomatik uygulanmaz. Olayın şiddetini ve sayısal sonuçlarını oyun yöneticisi belirler; bot yalnız olayın seçimini, aktif durumunu ve yapılan yönetici işlemlerini saklar.

## ⚖️ Genel uygulama kuralları

- Olay başladıktan sonra DM **Hafif, Orta, Ağır veya Özel** sonuç seçer ve oyunculara açıklar.
- Nüfus kaybı `/yonetim nufus-sil`, nüfus kazanımı `/nufus-ekle`, yerel hazine değişimi `/yonetim yerleske-hazinesi`, süreli gelir kaybı `/gelir-cezasi uygula` ve gönüllü Milis `/milis-ekle` ile elle işlenir.
- Olay başlatmak tek başına gelir, hazine, nüfus veya birlik değiştirmez.
- Gelir cezası bütün gelir kalemlerine aynı oranda uygulanır; bakım giderlerini azaltmaz.
- Bir yerleşkedeki yeni gelir cezası mevcut cezayı değiştirir. Birden fazla olay varsa DM birleşik nihai yüzdeyi tek komutla girmelidir.
- Olay `/olay sonlandir` ile kaldırılana kadar belgede aktif görünür.
- Aynı olay, aynı yerleşkede tetiklendikten sonra botun mevcut kuralı gereği 3 oyun turu boyunca yeniden başlatılamaz.

## 🕶️ Karaborsa

### Hafif

- Yerleşke geliri **-%10 / 1 Alım Turu**.

### Orta

- Yerleşke geliri **-%20 / 2 Alım Turu**.
- Yerel hazineden, yerleşkenin son Alım Turu gelirinin **%25'i** tek seferlik kaybedilir.

### Ağır

- Yerleşke geliri **-%35 / 3 Alım Turu**.
- Yerel hazineden, yerleşkenin son Alım Turu gelirinin **%50'si** tek seferlik kaybedilir.
- Yerleşkede Huzursuzluk yoksa DM ayrıca Huzursuzluk başlatır.

### Özel

DM; kaçakçılık ağı, siyasi yolsuzluk veya ticari çöküşe uygun özgün hazine ve gelir sonucunu açıkça ilan eder.

## 🦠 Salgın

Nüfus yüzdeleri özgür ve köle nüfusuna ayrı ayrı uygulanır.

### Hafif

- Nüfus **-%1**.
- Yerleşke geliri **-%10 / 1 Alım Turu**.

### Orta

- Nüfus **-%3**.
- Yerleşke geliri **-%20 / 2 Alım Turu**.

### Ağır

- Nüfus **-%6**.
- Yerleşke geliri **-%35 / 3 Alım Turu**.
- Yerleşkede Huzursuzluk yoksa DM ayrıca Huzursuzluk başlatır.

### Özel

DM; hastalığın türüne göre nüfus kaybını, gelir cezasını, süresini ve ek olayları ilan eder.

## ⚠️ Huzursuzluk

### Hafif

- Yerleşke geliri **-%10 / 1 Alım Turu**.

### Orta

- Yerleşke geliri **-%20 / 2 Alım Turu**.
- Arka arkaya iki başarısız kontrol sonucunda olay Ağır seviyeye yükselir.

### Ağır

- Yerleşke geliri **-%35 / 3 Alım Turu**.
- Özgür nüfusun **%1'i** göç, çatışma ve düzensizlik nedeniyle silinir.
- Başarısız kontrol sonucunda yerleşke isyana uygunsa DM ayrıca İsyan başlatır.

### Özel

DM; grev, mezhep çatışması, hanedan krizi veya vergi ayaklanmasına uygun özgün sonucu ilan eder.

## 🔥 İsyan

### Hafif

- Özgür nüfus **-%1**.
- Yerleşke geliri **-%15 / 1 Alım Turu**.

### Orta

- Özgür nüfus **-%3**.
- Yerleşke geliri **-%25 / 2 Alım Turu**.
- Yerel hazineden son Alım Turu gelirinin **%25'i** tek seferlik kaybedilir.

### Ağır

- Özgür nüfus **-%6**.
- Yerleşke geliri **-%40 / 3 Alım Turu**.
- Yerel hazineden son Alım Turu gelirinin **%50'si** tek seferlik kaybedilir.
- DM uygun görürse yerleşkeyi Harap duruma getirir.

### Özel

DM; ayrılıkçı hareket, taht iddiası veya dış destekli isyana uygun nüfus, hazine, gelir ve haraplık sonuçlarını ilan eder.

## 🏜️ Kuraklık

Kuraklık; özellikle Çiftlik, Su Kemeri/Sarnıç ve Tahıl erişimi bulunmayan yerleşkelerde daha yüksek ağırlıkla seçilir. Kuşatma ve haraplık riski artırır. DM olayın şiddetine göre gelir, hazine veya nüfus sonucunu elle uygular. Kuraklık kendi başına otomatik olarak Kıtlık başlatmaz.

## 🥣 Kıtlık

Kıtlık ayrı bir kötü olaydır. Aktif Kuraklık, kuşatma, haraplık ve gıda altyapısının zayıflığı seçim ağırlığını yükseltir. Çiftlik, Su Kemeri/Sarnıç ve Tahıl erişimi riski düşürür. DM gelir, hazine ve nüfus kayıplarını elle uygular.

## 🌾 Bereketli Hasat

Çiftlik, Su Kemeri/Sarnıç ve Tahıl erişimi seçim ağırlığını artırır. DM uygun gördüğü gelir, yerel hazine veya nüfus kazanımını elle uygular.

## 🪙 Ticari Canlanma

Agora, Liman, Ticaret Loncası ve görevli Tüccar seçim ağırlığını artırır. DM gelir veya yerel hazine kazanımını elle uygular. Aktif Karaborsa ve Huzursuzluk olayın ağırlığını azaltır.

## 🧳 Göç Dalgası

İstikrarlı ve gelişmeye açık yerleşkelere yeni nüfus gelmesini temsil eder. Fethedilmiş, kuşatma altında, salgınlı veya açık isyanlı yerleşkeler bu olayın havuzuna girmez. Kazanılan özgür veya köle nüfusu DM `/nufus-ekle` ile işler.

## 🛠️ Usta Zanaatkârların Gelişi

Mühendislik Atölyesi, Agora, Ticaret Loncası ile Kereste, Demir veya Mermer erişimi seçim ağırlığını artırır. İnşaat süresi, maliyet iadesi veya başka bir ekonomik sonuç DM tarafından elle uygulanır; olay hiçbir binayı otomatik tamamlamaz.

## 🛡️ Yerel Gönüllüler

Savaş Hazırlığı, Garnizon Güçlendirme, Curia ve kuşatma tehdidi seçim ağırlığını artırır. Verilecek Milis miktarını DM belirler ve `/milis-ekle` ile ücretsiz, anında ekler. Bu manuel komut nüfus veya hazine düşürmez.

## 🎲 Olay kontrolü

Aktif kötü olay için her oyun turunun sonunda DM açık şekilde **1d20** atar. Olumlu olaylar açıklanan ödül elle uygulandıktan sonra `/olay sonlandir` ile kapatılır:

- **Hafif:** Kontrol hedefi **8**.
- **Orta:** Kontrol hedefi **12**.
- **Ağır:** Kontrol hedefi **16**.
- **Özel:** Kontrol hedefini DM olay başlarken açıklar.

### Kontrol sonucu

- Zar toplamı hedefe eşit veya yüksekse olay bir kademe düşer. Hafif olay sona erer.
- Zar toplamı hedefin 1–4 altında kalırsa olay aynı şiddette devam eder.
- Zar toplamı hedefin en az 5 altında kalırsa olay devam eder ve uygun bir komşu yerleşkeye yayılır.
- Bir kaynak olay, bir oyun turunda en fazla bir yeni yerleşkeye yayılabilir.
- Yayılan olay bir kademe düşük başlar; Hafif olay yine Hafif yayılır.

### Kontrol bonusları

- **Karaborsa:** Agora'ya atanmış Tüccar **+3**. Agora Sv3 Tüccarı olayın kontrolünü otomatik başarılı kılar.
- **Salgın:** Her Şifacı Evi seviyesi **+1**, her Su Kemeri seviyesi **+1**, Zeytin **+2**, Panteon Sv2+ **+3**.
- **Huzursuzluk ve İsyan:** Her Curia seviyesi **+1**, Panteon **+2**, Şarap **+2**, Kehribar **+2**.
- Kuşatma altındaki veya yeni fethedilmiş yerleşkelerde Huzursuzluk ve İsyan kontrolü **-2** alır.

## 🗺️ Yayılma

- DM haritadan doğrudan komşu yerleşkelerden birini seçer.
- Karaborsa ve Salgın kara komşuluğundan yayılabilir. İki yerleşkede de Liman varsa deniz üzerinden de yayılabilir.
- Huzursuzluk yalnız kara komşuluğundan yayılır.
- İsyan, uygun koşulları taşıyan komşuya İsyan olarak; taşımayan komşuya Huzursuzluk olarak yayılır.
- Yayılma `/olay uygula tur:<olay> ulke:<ülke> yerleske:<yerleşke>` ile DM tarafından elle başlatılır.
- Olayın sona ermesi `/olay sonlandir` ile ayrıca işlenir.

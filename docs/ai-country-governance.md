# Yapay Zekâ Devlet Yönetimi

Bu paket, oyuncusuz devletler için güvenli karar üretme altyapısını hazırlar. İlk sürüm bilinçli olarak yalnız **taslak** üretir; oyun emri yürütmez.

## Güvenlik sınırı

- Global AI yönetimi, otomatik planlama ve otomatik yürütme veritabanında varsayılan olarak kapalıdır.
- Uygulamada zamanlayıcı veya AI planlarını oyun emrine dönüştüren bir yürütücü bulunmaz.
- Model yalnız yönettiği devletin kendi ekonomisini, yerleşkelerini, ordularını, filolarını ve karakterlerini görür.
- Diğer devletlerden yalnız kamuya açık adlar, resmî diplomasi, ortak savaş formundaki bilgiler ve ilgili devlete teslim edilmiş istihbarat raporları aktarılır.
- Discord kullanıcı kimlikleri, GM denetim kayıtları, gizli zarlar, düşman emirleri ve ham veritabanı erişimi model girdisinde yasaktır.
- Üretilen plan katı JSON şemasından ve görünür kimlik denetiminden geçer. Planın gözlemle birlikte SHA-256 özeti saklanır.

## Operasyon Masası

`YZ Devletleri` ekranından:

1. Genel `AI test modu` açılıp kapatılabilir. Bu düğme yalnız manuel taslak üretimini açar.
2. Oyuncusuz bir devlet ülke satırından açılıp kapatılabilir; doktrin ve kişilik profili hazırlanabilir.
3. Modelin göreceği ülkeye özel veri özeti denetlenebilir.
4. Test modu ve ilgili ülke açıkken, `OPENAI_API_KEY` tanımlıysa manuel bir tam strateji taslağı üretilebilir.
5. Taslak; kesin bütçe, bina yatırımı, birim türü ve asker adedi, gemi üretimi, ordu/filo hedef Hex'i, sunucuda doğrulanmış rota, savaş harekât safhaları, saldırı/vazgeçme şartları ve aktif savaş kararlarını Türkçe bir raporda gösterir.
6. GM taslağı yalnız `Manuel uygulamaya uygun` veya `Reddedildi` olarak işaretleyebilir ve inceleme notu ekleyebilir.

`Manuel uygulamaya uygun` kararı bir onay kaydıdır; oyun komutu üretmez, hazineden harcama yapmaz, birlik hareket ettirmez ve hiçbir oyun tablosunu değiştirmez. GM makul bulduğu önerileri mevcut panel veya Discord araçlarıyla kendisi uygular.

Profildeki “planlamaya hazır” seçimi yürütme yetkisi vermez. Panel her durumda sistemin, otomatik planlamanın ve emir yürütmenin kapalı olduğunu gösterir.

## Test akışı

1. AI test modu açılır.
2. Oyuncusuz devlet açılır ve profili hazırlanır.
3. `Görünür veri` ile modele gidecek kapsam denetlenir.
4. GM açıkça `Taslak üret` düğmesine basar.
5. `Planı incele` ekranında AI'ın hamleleri ve açıklamaları okunur.
6. Taslak uygun veya reddedildi olarak kaydedilir.
7. Uygun bulunan hamleler istenirse GM tarafından manuel uygulanır.

Bu aşamada zamanlayıcı, otomatik tetikleyici, oyun emrine çevirici ve yürütme API'si yoktur.

## Planlama verisi ve doğrulama

- Model ülkenin gerçek hazine, yerel hazine, gelir, bakım, asker limiti, eğitim kapasitesi, bina slotu, aktif bina ve birlik kayıtlarını görür.
- Birim fiyatları ve savaş zarları, izinli özel birlikler, bina maliyet/etkileri, gemi ve kuşatma aleti katalogları karar desteğine eklenir.
- Kamuya açık yerleşke konumları, ülke sınır Hex'leri, resmî savaşlar ve ilgili ülkeye verilmiş istihbarat kullanılır. Düşmanların gizli birlik veya emirleri aktarılmaz.
- Model hareket için yalnız birlik ve hedef Hex seçer. Rota model tarafından uydurulmaz; sunucu mevcut Hex haritası ve geçiş kurallarıyla rotayı hesaplar. Geçersiz rota planı otomatik reddedilir.
- Satın alma kalemleri Alım Turu, yerel hazine, eğitim kapasitesi, asker limiti, inşaat kapasitesi ve profil rezerviyle doğrulanır.
- Doğrulama hatalıysa plan `Reddedildi` durumunda saklanır ve hata nedenleri raporda gösterilir.

## Railway değişkenleri

AI taslak üretimini daha sonra denemek için yalnız Operasyon Masası servisine şu değişkenler eklenir:

```env
OPENAI_API_KEY=
AI_COUNTRY_MODEL=gpt-6-sol
```

Anahtar verilmezse panel ve bütün profil/veri denetimi çalışır; yalnız `Taslak üret` düğmesi pasif kalır.

## Kapsam dışında bırakılan sonraki aşama

Gerçek otonom yönetim ayrıca geliştirilmelidir: taslak emirlerini mevcut oyun servislerine çeviren allowlist yürütücüsü, tur başına idempotency, otomatik mühürleme, savaş karar zamanlayıcısı ve hata anında deterministik yedek doktrin. Bunlar eklenip ayrıca açılmadıkça AI hiçbir oyun durumunu değiştiremez.

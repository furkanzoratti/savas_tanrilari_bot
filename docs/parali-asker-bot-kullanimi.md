# 🪙 Paralı Asker Bot Kullanımı

## ⏱️ Tur ve bakım düzeni

- Paralı asker sözleşmesi herhangi bir rol turunda yapılabilir.
- Şirket, kiralandığı turun bir sonraki rol turunda seçilen yerleşkeye ulaşır.
- İlk bakım, şirketin ulaştığı turda tahsil edilir. Örneğin **Tur 2'de kiralanan şirket Tur 3'te ulaşır ve Tur 3 bakımı aynı tur ilerletmesinde ödenir.**
- Sonraki bakımlar, sözleşme sürdüğü müddetçe her rol turunda tahsil edilir.
- Hazinede yeterli altın yoksa şirket `Bakımı Ödenmedi` durumuna geçer; hareket edemez ve savaş zarı atamaz.
- Ödenmeyen bakım aynı tur içinde yönetici komutuyla kapatılabilir. Bir sonraki tur başlayana kadar ödenmezse sözleşme sona erer.

## 🗂️ Yönetici komutları

- `/parali-asker kirala`: Şirketi ülkeye bağlar, kiralama bedelini keser ve teslimat turunu oluşturur.
- `/parali-asker ucretsiz-ekle`: Manuel sistemde ücreti önceden alınmış şirketi hemen etkin ekler. Kiralama bedeli kesilmez; ilk otomatik bakım sonraki rol turunda başlar.
- `/parali-asker listele`: Ülkenin yoldaki, etkin ve ödemesi gecikmiş sözleşmelerini gösterir.
- `/parali-asker uzat`: Sözleşmeyi üç rol turu uzatır.
- `/parali-asker bakim-ode`: O tur ödenememiş bakımı kapatır.
- `/parali-asker feshet`: Sözleşmeyi bitirir; erken fesih varsa bir bakım bedeli keser.
- `/parali-asker tasi`: Etkin şirketin bağlı olduğu dost yerleşkeyi değiştirir.
- `/parali-asker mevcut-duzelt`: Yönetici kararıyla birlik, gemi veya kuşatma aleti mevcudunu düzeltir.
- `/parali-asker kayip-ekle`: Seçilen kampanyanın belirtilen kara birliğinden girilen kayıp miktarını düşer; kalan mevcudu bildirir.
- `/savas parali-asker-ayarla`: Etkin şirketi savaş taslağındaki A veya B tarafına ekler ya da çıkarır.

## ⚔️ Belge ve savaş bağlantısı

- Şirketler yerleşke belgesinde normal ordu ve garnizondan ayrı gösterilir.
- Paralı asker personeli şimdilik devlet ve yerleşke askerî personel sınırlarına dâhil değildir; yerleşke eğitim kapasitesini de kullanmaz.
- Savaş kayıpları başlangıçtaki devlet/paralı asker oranına göre kaynaklara dağıtılır.
- Paralı asker kaybı şirket mevcudundan düşer; yerleşke nüfusundan ve devlet garnizonundan düşmez.
- Devlet askerlerinin kaybı normal biçimde birlik belgesine ve yerleşke nüfusuna uygulanır.
- Şirketin bütün kara birlikleri ve gemileri yok olursa sözleşme `Yok Edildi` durumuna geçer.
- Şirketlere ait özel savaş özellikleri uygulanmaz. Birlik, gemi ve kuşatma aletleri yalnızca standart katalog değerleriyle savaşır.

# ⚔️ SAVAŞ TANRILARI ROLE PLAY — KALICI ORDU SİSTEMİ

## 🏛️ Ordu Kurulması

Her devlet, askerlerini yerleşkelerden bağımsız adlar altında kalıcı ordular hâlinde düzenleyebilir. Bir ordu kurulduğunda kendisine ad verilir; Akademide yetişmiş bir **Komutan** isteğe bağlı olarak ordunun başına atanabilir.

• `/ordu olustur` — Yeni bir ordu kurar.  
• `/ordu komutan-ata` — Akademide yetişmiş bir Komutanı ordunun başına getirir.  
• `/ordu komutan-kaldir` — Komutanın ordu görevini kaldırır.  
• Aynı Komutan aynı anda yalnızca bir ordunun başında bulunabilir.  
• Etkin bir savaşa bağlı ordunun kadrosu ve komutanı savaş bitene kadar değiştirilemez.

## 🪖 Orduya Asker Tahsisi

Oyuncu `/ordu asker-ekle` komutunda sırasıyla **orduyu, kaynak yerleşkeyi, birlik türünü ve asker miktarını** seçer.

• Askerler kaynak yerleşkenin nüfusundan veya asker kaydından yeniden düşülmez; mevcut askerler orduya **tahsis edilir**.  
• Başka bir orduya tahsis edilmiş asker yeniden kullanılamaz.  
• Orduya ayrılmış askerler terhis edilemez veya manuel savaş kadrosuna ikinci kez yazılamaz.  
• `/ordu asker-cikar` ile askerlerin ordu tahsisi kaldırılabilir. Askerler kaynak yerleşkede kalır.  
• `/ordu dagit` ordunun kaydını kaldırır; hayatta kalan askerleri silmez ve kaynak yerleşkelerine bırakır.

Her kadro değişikliğinden sonra oyuncuya yalnızca kendisinin görebileceği güncel bir **Ordu Belgesi** gösterilir.

## 🧭 Kompozisyon Bilgisi

Ordu Belgesinde aşağıdaki bilgiler canlı olarak hesaplanır:

• Toplam asker sayısı  
• Birlik türleri ve mevcutları  
• Hat, mızraklı, menzilli ve hareketli birlik oranları  
• Baskın birlik oranı  
• Kompozisyon sınıfı  
• Geçerli çarpışma ve hasar katsayıları  
• Askerlerin bağlı olduğu kaynak yerleşkeler  
• Ordu Komutanı ve yetenek bonusu

Kompozisyon kuralları geçici olarak pasifse sınıflandırma yine gösterilir; savaş katsayıları etkinleşme turuna kadar uygulanmaz.

## 📜 Devlet Belgesinde Ordular

`/belge` komutuyla açılan Devlet Belgesinin en altında devletin bütün orduları ayrı kutular hâlinde gösterilir. Her kutuda ordunun güncel kadrosu, kompozisyonu, Komutanı ve kaynak yerleşkeleri bulunur.

## ⚔️ Savaşa Ordu Ekleme

Oyun yöneticisi `/savas ordu-ekle` komutuyla savaş tarafındaki bir devlete ait kalıcı orduyu doğrudan savaş taslağına ekleyebilir veya taslaktan çıkarabilir.

• Mevcut `/savas kadro-ayarla` sistemi kaldırılmamıştır.  
• Aynı devlet aynı savaşta kalıcı ordu sistemiyle manuel kadro sistemini birlikte kullanamaz.  
• Bir ordu aynı anda yalnızca bir etkin savaşa bağlanabilir.  
• Savaşa eklenen ordunun o andaki kadrosu başlangıç kaydı olarak saklanır.

## 💀 Savaş Kayıpları

Kalıcı bir ordunun savaş kayıpları önce birlik türüne, sonra ordulara, ardından kaynak yerleşkelere **mevcut katkıları oranında** dağıtılır.

Örnek: Aynı orduya Roma'dan 1.000 ve Neapolis'ten 1.000 Hafif Piyade katılmışsa, ordunun 1.000 Hafif Piyade kaybında iki yerleşke de **500'er asker** kaybeder.

• Kayıp hem Ordu Belgesindeki kadrodan hem kaynak yerleşkenin asker kaydından düşer.  
• Asker kayıpları ilgili kaynak yerleşkenin özgür nüfusuna da uygulanır.  
• Küsuratlar toplam kaybı değiştirmeyecek biçimde paylaştırılır.  
• Savaş sona erdiğinde savaş formundaki **Ordularımın Son Durumunu Gör** düğmesiyle yalnızca savaşa katılan kendi ordularınızın güncel hâlini görebilirsiniz.  
• Sonraki `/belge` kullanımında bütün ordu kutuları güncel kayıplarla gösterilir.

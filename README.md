# Savaş Tanrıları Discord Botu

Railway üzerinde sürekli çalışan, Discord komutlarıyla yönetilen ve PostgreSQL kullanan oyun yönetim botu. Yapay zekâ veya harici ücretli API kullanmaz.

## Neleri otomatikleştirir?

- Oyuncunun yalnızca kendi ülkesine ait güncel belgeyi gösterir; ülkeye atanmış oyuncuları Discord etiketi olarak listeler ve şehir kartlarını antik tapınak görseliyle sunar.
- Yerleşke, nüfus, köle nüfusu, hazine, bina, asker, gemi, kuşatma aleti ve bakım giderlerini açıklamalı bir devlet belgesinde toplar.
- Geliri yerleşke, vergi, kara ticareti ve deniz ticareti olarak ayırır; şehir bazında ve ülke toplamında gösterir.
- Bina alımını yerleşke ve bina seçmeli bir akışla yürütür; seviye ön şartını, slotu, maliyeti ve tamamlanma turunu denetler. Her yerleşkede aynı anda en fazla iki inşaat sürer.
- Her turda tamamlanan binaları etkinleştirir. Gelir etkileri veritabanına üst üste eklenmez; aktif binalardan yeniden hesaplandığı için aynı bonusun iki kez uygulanması engellenir.
- Seferberlik seviyesine göre toplam asker sınırını ve yerleşke eğitim kapasitesini hesaplar.
- Askere alınan birlikleri seferberlik kademesinin dalgalarına böler; gelecekte katılacak askerleri belgede gösterir ve zamanı gelince garnizona ekler.
- Birlik ve donanma bakımını konumlarına ve seferberlik durumuna göre hesaplar; mevcut birlikleri iadesiz ve kalıcı olarak terhis eder.
- Tersane seviyesi, maliyet ve yapım süresi denetimli gemi siparişi alır; tamamlanan gemileri rezerv filoya ekler.
- Harap yerleşkeyi ilk alım turunda `%0`, ikinci alım turunda `%50`, üçüncü alım turunda `%100` gelir ve nüfus üretimine geçirir.
- Yalnızca yönetimin seçtiği rol kanallarında kelime sayar; son 24 saat/7 gün sıralaması ve seçilen rapor kanalında otomatik günlük rapor üretir.
- Yerleşkelere 15 hammaddeden birini atar; üretim ve ticaret kaynaklarının gelir, nüfus, bakım, inşa ve alım etkilerini otomatik hesaplar.
- Yerleşkeden yerleşkeye kaynak ticareti kurar; hedef oyuncuları etiketleyen teklif kartı tek tıklamalı kabul/red düğmeleri sunar. Ticaret doğrudan altın üretmez.
- Genel zar komutu sağlar.
- Bütün kritik işlemleri denetim kaydına yazar ve aynı turun yanlışlıkla iki kez işlenmesini engeller.
- Yönetici olmayan oyuncuların slash komutlarını başarı/başarısızlık durumuyla saklar; yönetici geçmişi görebilir veya canlı log kanalı ayarlayabilir.
- Tur açma, atlama, durdurma ve kapatma işlemlerini hazır metinli, markalı ve herkese açık Discord duyuruları olarak yayımlar.

## Yetki modeli

- Oyuncu komutları varsayılan olarak komutu kullanan kişinin ülkesini bulur.
- Başka bir ülke adı vermek yalnızca oyun yöneticilerine açıktır.
- Discord `Administrator` yetkisi olanlar ve `ADMIN_ROLE_IDS` içinde tanımlanan roller oyun yöneticisidir.
- Oyun yöneticisi oyuncu atayabilir, ülke ve yerleşke oluşturabilir, her ülke adına alım/seferberlik işlemi yapabilir, hazine ve haraplık durumunu değiştirebilir ve turu yönetebilir.

## Komutlar

### Oyuncu ve yönetici

- `/belge [ulke]`
- `/alim [ulke]`
- `/asker-alimi [ulke]`
- `/asker-terhis yerleske birim durum miktar [ulke]`
- `/gemi-alimi [ulke]`
- `/seferberlik seviye [ulke]`
- `/ticaret teklif|liste|feshet`
- `/zar adet yuz [bonus] [gizli]`
- `/rol-siralama donem`

Köşeli parantezli `ulke` alanı yalnızca oyun yöneticisinin başka bir ülke adına işlem yapması içindir.

### Herkesin görebildiği, yalnızca yöneticinin çalıştırabildiği

- `/tur atla`
- `/tur ac`
- `/tur durdur`
- `/tur kapat`

Bu komutların sonuçları gizli değildir; markalı resmî tur duyurusu olarak kullanıldıkları kanala gönderilir.

### Yalnızca yönetici

- `/yonetim ulke-olustur`
- `/yonetim oyuncu-ata`
- `/yonetim oyuncu-cikar ulke oyuncu`
- `/yonetim yerleske-ekle` (hammadde seçimi dâhil)
- `/yonetim hammadde-ayarla`
- `/yonetim tur-ilerlet`
- `/yonetim tur-durumu`
- `/yonetim hazine`
- `/yonetim harap`
- `/yonetim oyunu-sifirla onay:SIFIRLA`
- `/yonetim komut-log-kanali islem [kanal]`
- `/yonetim komut-gecmisi [adet]`
- `/yonetim rol-kanali islem kanal`
- `/yonetim rol-rapor-kanali islem [kanal]`

`oyunu-sifirla` yalnızca yetkili GM tarafından ve tam `SIFIRLA` onayıyla çalışır. Komut, o Discord sunucusundaki ülkeleri ve bunlara bağlı bütün oyun kayıtlarını siler; turu 0/Kapalı durumuna döndürür. Rol kanalları ile kelime istatistikleri korunur.

Tur ilerletme otomatik saate bağlanmamıştır. Savaş veya olay çözümü iki güne uzayabildiği için GM önce durumu `Kapalı`/`Olaylar çözülüyor` yapar, bütün olaylar bittikten sonra bir kez `tur-ilerlet` kullanır.

## Discord kurulumu

1. [Discord Developer Portal](https://discord.com/developers/applications) üzerinden bir uygulama ve bot oluşturun.
2. Bot sayfasında `Message Content Intent` seçeneğini açın. Bu izin rol kanallarındaki kelime sayımı için gereklidir.
3. Botu sunucuya `bot` ve `applications.commands` kapsamlarıyla davet edin.
4. En azından mesaj görüntüleme, mesaj geçmişini okuma, mesaj gönderme ve embed/link kullanma izinlerini verin.
5. Token'ı hiçbir dosyaya veya Discord mesajına yazmayın; yalnızca Railway değişkeni olarak saklayın.

## Railway kurulumu

1. Bu klasörü bir GitHub deposuna gönderin ve Railway'de `Deploy from GitHub repo` seçin.
2. Aynı Railway projesine bir PostgreSQL servisi ekleyin.
3. Bot servisinde şu değişkenleri tanımlayın:

```env
DISCORD_TOKEN=Discord bot tokenı
DISCORD_CLIENT_ID=Discord uygulama kimliği
DATABASE_URL=${{Postgres.DATABASE_URL}}
ADMIN_ROLE_IDS=rol_kimligi_1,rol_kimligi_2
PORT=3000
LOG_LEVEL=info
```

İlk kurulumda komutları kaydetmek için yerel `.env` dosyanıza ayrıca test sunucusunun kimliğini yazıp şunu çalıştırın:

```powershell
pnpm register
```

`DISCORD_GUILD_ID` girilmişse komutlar yalnızca o sunucuya ve hemen kaydolur. Boş bırakılırsa global kayıt yapılır; Discord tarafında görünmesi daha uzun sürebilir.

Railway `railway.json` dosyasını kullanarak Docker imajını kurar. Uygulama açılırken veritabanı göçleri otomatik uygulanır. `/health` adresi veritabanı ve Discord bağlantı durumunu döndürür.

## Yerel geliştirme

Node.js 20+ ve PostgreSQL gereklidir.

```powershell
Copy-Item .env.example .env
pnpm install
pnpm build
pnpm test
pnpm register
pnpm dev
```

## Veri güvenliği ve genişletme

- Para ve tur işlemleri PostgreSQL transaction'ı içinde yapılır.
- Her tur için tekil işleme anahtarı bulunur; Discord'da iki kez tıklama aynı turun gelirini iki kez yazmaz.
- Kritik değişikliklerde oyuncu, hedef ve işlem bilgisi `audit_logs` tablosuna kaydedilir.
- Oyun kuralları `src/domain/catalog.ts`, saf hesaplamalar `src/domain` ve Discord arayüzü `src/discord` altında ayrılmıştır. Yeni kaynak, ticaret, politika veya savaş modülleri mevcut çekirdeği dağıtmadan eklenebilir.
- Veritabanı Railway volume yerine PostgreSQL'dedir; bot yeniden dağıtıldığında kayıtlar korunur. Yine de düzenli PostgreSQL yedeği önerilir.

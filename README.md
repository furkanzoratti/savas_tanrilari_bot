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
- `/yonetim ulkeleri-listele`
- `/yonetim devlet-belgeleri`
- `/yonetim ulke-sil ulke onay:SIL`
- `/yonetim yerleske-sil ulke yerleske onay:SIL`
- `/yonetim nufus-sil ulke yerleske nufus-turu miktar`
- `/yonetim yerleske-devret kaynak-ulke yerleske hedef-ulke`
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

`yerleske-devret`, yerleşkeyi hedef devlete geçirip Fethedilmiş olarak işaretler; aktif asker alım emirlerini iptal eder, kullanılmamış dalgaları kaldırır ve yerleşkeye bağlı bekleyen/aktif ticaretleri sona erdirir. Mevcut bina, birlik ve filolar yerleşkeyle birlikte yeni devlete geçer. Ordu ve filolara eşzamanlı savaş kullanım kilidi uygulanmaz.

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

## Savaş sistemi

Savaşlar kanal bazında ve PostgreSQL üzerinde kalıcıdır. Aynı kanalda aynı anda yalnızca bir etkin savaş bulunabilir.

1. DM `/savas baslat` ile ülkeleri, savaş alanını ve iki tarafın zar yetkisini seçer.
2. DM `/savas kadro-ayarla` veya `/savas filo-ayarla` ile bütün gizli kadroyu tek komutta oluşturur. Tekil düzeltmeler için `/savas birlik-ayarla` ve `/savas gemi-ayarla` kullanılabilir. Komut yanıtı yalnızca DM'e görünür.
3. DM `/savas yayinla` ile açık savaş kartını gönderir. Kart toplam asker, toplam kayıp, düzen ve zar yetkisini gösterir; tam birlik kompozisyonu gizli kalır.
4. Botun belirlediği sıradaki ülke oyuncusu veya NPC için DM, `Savaş Zarlarını At` düğmesini kullanır. Çarpışma ve hasar toplamları kanalda açık yayımlanır.
5. İki zar tamamlanınca DM `/savas tur-oynat` kullanır. Ana çarpışma ordulardan biri dağılana, geri çekilene veya DM savaşı bitirene kadar tekrar eder.
6. DM tam birim bileşimi ve gizli kalan birlikleri `/savas ordu-detay`, otomatik belge aktarımını `/savas kayip-raporu` ile özel olarak görebilir.

Oyuncu geri çekilmesi kart düğmesiyle yapılır. İlk savaş turu kayıpsızdır; sonraki turlarda savaşın uzaması, rakibin süvari/hafif gemi oranı ve arazi takip kaybı doğurur. DM oyuncu ülkesinin zarını vekâleten atabilir; sonuç açıkça `DM vekili` olarak işaretlenir. NPC taraflar yalnızca DM tarafından oynatılır. On hazır görsel `assets/battlefields` altında bulunur ve Docker imajına otomatik kopyalanır.
### Pusu, kuşatma ve deniz savaşı

- **Pusu:** `/savas baslat` sırasında `Pusu` seçilir. A tarafı pusuyu kurandır ve ilk zarı atar. İlk tur A tarafının çarpışma toplamı %25, hasar toplamı %10 artar. Dar cephe nedeniyle A en fazla 15.000, B en fazla 8.000 askerini aynı anda kullanır.
- **Kuşatma:** A kuşatan, B savunandır. Sur 30.000, kapı 1.000 canla başlar. Kuşatma Bombardıman durumunda açılır; bu sırada yalnız Katapultlar sura ateş eder, ordular temas etmez ve asker kaybı/baskı oluşmaz. Her kuşatma oyun turu başına en fazla 3 kez bombalanabilir; yeni oyun turunda hak otomatik yenilenir ve aktif savaşın bütün durumu korunur. DM `/savas kusatma-asamasi` ile Hücuma geçer. Koçbaşı yalnız kapıyı; Katapult ve Balista seçilen hedefe göre suru veya savunan orduyu vurur. Merdiven, mantlet ve kuşatma kulesi hücumu destekler. Tahkimat sağlamken savunucu Çarpışma +%50 ve Hasar +%35 alır; saldıranın birlik Hasarı %50 etkinliktedir. Şehir için sur/kapı gediği veya merdiven/kule erişimi ve ayrıca savunucunun %30'a düşmesi, 8 baskıya ulaşması ya da tükenmesi gerekir. Her mantlet saldırana gelen Hasarı %5 azaltır; toplam sınır %50'dir. B yalnızca Hafif Sur Balistası kullanabilir.
- **Deniz savaşı:** Kara birliği yerine `/savas gemi-ayarla` kullanılır. Kerkouros 1d6/1d6, Trireme 2d8/2d8, Quinquereme 3d10/3d10 çarpışma/hasar zarı üretir. Her gemi ayrı zar birimidir; filo cephesi taraf başına 30 gemidir. Kayıplar gemi adedi olarak hesaplanır ve ağır gemiler daha dayanıklıdır.

Kuşatmada saldıran toplamı açık, savunan toplamı gizli; iki tarafın kayıpları açıktır. Tam kadro ile kuşatma aleti türleri `/savas ordu-detay` içinde kalır. Savaş sonunda kayıplar ülke belgelerine tek sefer otomatik işlenir; kara askeri kayıpları bağlı yerleşkelerin nüfusundan da düşülür ve yöneticiye hesaplanan/uygulanan/fark dökümü verilir. Oyunculara dağıtılacak eksiksiz metin `docs/discord-savas-sistemi.md` içindedir.
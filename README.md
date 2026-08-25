# Savaş Tanrıları Discord Botu

Railway üzerinde sürekli çalışan, Discord komutlarıyla yönetilen ve PostgreSQL kullanan oyun yönetim botu. Yapay zekâ veya harici ücretli API kullanmaz.

## Neleri otomatikleştirir?

- Oyuncunun yalnızca kendi ülkesine ait güncel belgeyi gösterir; ülkeye atanmış oyuncuları Discord etiketi olarak listeler ve şehir kartlarını antik tapınak görseliyle sunar.
- Yerleşke, nüfus, köle nüfusu, hazine, bina, asker, gemi, kuşatma aleti ve bakım giderlerini açıklamalı bir devlet belgesinde toplar.
- Geliri Binalar, Halk Vergisi, Kara Ticareti ve Deniz Ticareti olarak ayırır. Halk vergisi nüfusun `%3`üdür; deniz ticareti aktif Liman ile açılır.
- Bina alımını kategoriye özel fiyatlarla yürütür; nüfusa bağlı en fazla 6 bina slotunu, kıyı/Liman koşullarını ve seviye ön şartlarını denetler. Aynı anda 2 inşaat sürer; Usta Mimarlık Programı bu sınırı 3'e çıkarır.
- Curia şehir politikalarını bir tur gecikmeyle etkinleştirir; inşaat, asker alımı, huzursuzluk, vergi, şehir geliri, kuşatma erzağı ve kalıcı/geçici milis etkilerini otomatik uygular.
- Akademi karakterlerini etkileşimli zar ve isimlendirme ile Casus, Tüccar veya Komutan olarak yetiştirir; devlet belgesine ekler ve Curia/Agora görevlerine atar. Curia'ya yapılan ilk atama yerleşke garnizonuna bir defaya mahsus 200 Ağır Piyade kazandırır.
- Panteon savaş kredisi ile karaborsa, salgın, huzursuzluk ve isyan olaylarını yönetir; bütün sunucudaki yerleşkeler için binalar, tüccarlar, kaynak ticareti, kuşatma ve fetih durumuna göre ağırlıklı seçim yapar.
- Her turda tamamlanan binaları etkinleştirir. Gelir etkileri veritabanına üst üste eklenmez; aktif binalardan yeniden hesaplandığı için aynı bonusun iki kez uygulanması engellenir.
- Seferberlik yüzdesini ülkenin toplam nüfusuna uygular; aynı sınırı şehir nüfuslarına oranlayarak her yerleşkenin asker alım payını hesaplar.
- Askere alınan birlikleri seferberlik kademesinin dalgalarına böler; gelecekte katılacak askerleri belgede gösterir ve zamanı gelince **Ordu** olarak ekler. Nüfusa bağlı sabit şehir garnizonu ayrı tutulur.
- Birlik ve donanma bakımını konumlarına ve seferberlik durumuna göre hesaplar; mevcut birlikleri iadesiz ve kalıcı olarak terhis eder.
- Tersane seviyesi, maliyet ve yapım süresi denetimli gemi siparişi alır; tamamlanan gemileri rezerv filoya ekler.
- Harap yerleşkeyi ilk alım turunda `%0`, ikinci alım turunda `%50`, üçüncü alım turunda `%100` gelir ve nüfus üretimine geçirir.
- Yalnızca yönetimin seçtiği rol kanallarında kelime sayar; son 24 saat/7 gün sıralaması ve seçilen rapor kanalında otomatik günlük rapor üretir.
- Yerleşkelere 15 hammaddeden birini atar; üretim ve ticaret kaynaklarının gelir, nüfus, bakım, inşa ve alım etkilerini otomatik hesaplar.
- Yerleşkeden yerleşkeye kaynak ticareti kurar; hedef oyuncuları etiketleyen teklif kartı tek tıklamalı kabul/red düğmeleri sunar. Ticaret doğrudan altın üretmez.
- Yönetimin seçtiği özel diplomasi kanalında iki taraflı ittifak ve çok üyeli pakt davetleri oluşturur; hedef ülkenin bütün oyuncularını etiketleyen kabul/red kartları gönderirken komut yanıtlarını kişiye özel tutar. Özel mesaj kullanılmaz.
- Müttefikleri ve üye olunan paktları özel devlet belgesine ekler; herkesin görüntüleyebildiği ayrı devlet profilinde yalnızca yerleşkeleri, hammaddeleri, müttefikleri ve paktları gösterir.
- Genel zar komutu sağlar.
- Bütün kritik işlemleri denetim kaydına yazar ve aynı turun yanlışlıkla iki kez işlenmesini engeller.
- Yönetici olmayan oyuncuların slash komutlarını başarı/başarısızlık durumuyla saklar; yönetici geçmişi görebilir veya canlı log kanalı ayarlayabilir.
- Tur açma, atlama, durdurma ve kapatma işlemlerini hazır metinli, markalı ve herkese açık Discord duyuruları olarak yayımlar.

## Yetki modeli

- Oyuncu komutları varsayılan olarak komutu kullanan kişinin ülkesini bulur.
- Başka bir ülke adı vermek yalnızca oyun yöneticilerine açıktır.
- Discord `Administrator` yetkisi olanlar ve `ADMIN_ROLE_IDS` içinde tanımlanan roller oyun yöneticisidir.
- Oyun yöneticisi oyuncu atayabilir, ülke ve kültürlü yerleşke oluşturabilir, her ülke adına alım/seferberlik işlemi yapabilir, devlet ve yerleşke hazinelerini değiştirebilir ve turu yönetebilir.

## Komutlar

### Oyuncu ve yönetici

- `/belge [ulke]`
- `/devlet-bilgisi ulke` — herkese açık, ekonomik/askerî bilgi içermeyen devlet profili
- `/ittifak teklif hedef-ulke [ulke]`
- `/ittifak liste [ulke]`
- `/ittifak feshet hedef-ulke [ulke]`
- `/pakt olustur ad amac aciklama [ulke]`
- `/pakt davet pakt hedef-ulke [ulke]`
- `/pakt davetlerim [ulke]`
- `/pakt bilgi pakt` — herkese açık pakt bilgisi
- `/pakt liste` — herkese açık pakt listesi
- `/pakt ayril pakt [ulke]`
- `/pakt uye-cikar pakt hedef-ulke [ulke]`
- `/pakt lider-devret pakt hedef-ulke [ulke]`
- `/pakt dagit pakt onay:DAGIT [ulke]`
- `/alim [ulke]`
- `/asker-alimi [ulke]`
- `/asker-terhis yerleske birim durum miktar [ulke]`
- `/gemi-alimi [ulke]`
- `/seferberlik seviye [ulke]`
- `/ticaret teklif|liste|feshet`
- `/politika uygula yerleske politika yuva [ulke]`
- `/politika kaldir yerleske yuva [ulke]`
- `/politika liste [ulke]`
- `/akademi egit yerleske [elenen-gorev] [secilen-gorev] [ulke]`
- `/akademi karakterler [ulke]`
- `/akademi ata karakter yerleske gorev-yeri [ulke]`
- `/akademi gorevden-al karakter [ulke]`
- `/panteon kredi-al yerleske miktar [ulke]`
- `/panteon kredi-ode miktar [ulke]`
- `/zar adet yuz [bonus] [gizli]`
- `/rol-siralama donem`

Köşeli parantezli `ulke` alanı yalnızca oyun yöneticisinin başka bir ülke adına işlem yapması içindir.

İttifak ve pakt yönetim komutları yalnızca `/diplomasi-kanali` ile seçilen metin kanalında çalışır; işlem sonuçları yalnızca komutu kullanan oyuncuya görünür. Davetler aynı kanalda hedef devletin bütün oyuncularını etiketleyen herkese açık kartlar olarak yayımlanır; yeşil kabul ve kırmızı red düğmesini yalnızca hedef devletin oyuncuları veya oyun yöneticisi kullanabilir. Bot hiçbir oyuncuya özel mesaj göndermez.

`/devlet-bilgisi`, `/pakt bilgi` ve `/pakt liste` diğer kanallarda herkese açıktır; diplomasi kanalında kullanılırlarsa yalnızca komutu kullanan kişiye gösterilir. Devletin açık profili hazine, nüfus, ordu, bina ve gelir verilerini asla içermez. Pakt üyeliği tek başına ikili müttefiklik oluşturmaz. Bir devlet birden fazla pakta katılabilir; pakt lideri üye davet edebilir, üye çıkarabilir, liderliği devredebilir veya `DAGIT` onayıyla paktı dağıtabilir.

### Herkesin görebildiği, yalnızca yöneticinin çalıştırabildiği

- `/tur atla`
- `/tur ac`
- `/tur durdur`
- `/tur kapat`

Bu komutların sonuçları gizli değildir; markalı resmî tur duyurusu olarak kullanıldıkları kanala gönderilir.

### Yalnızca yönetici

- `/diplomasi-kanali islem:Ayarla kanal:#pakt-ittifak`
- `/diplomasi-kanali islem:Kapat`
- `/yonetim ulke-olustur`
- `/yonetim ulkeleri-listele`
- `/yonetim devlet-belgeleri`
- `/yonetim ulke-sil ulke onay:SIL`
- `/yonetim yerleske-sil ulke yerleske onay:SIL`
- `/yonetim nufus-sil ulke yerleske nufus-turu miktar`
- `/yonetim yerleske-devret kaynak-ulke yerleske hedef-ulke`
- `/yonetim oyuncu-ata`
- `/yonetim oyuncu-cikar ulke oyuncu`
- `/yonetim yerleske-ekle` (toplam başlangıç geliri, hammadde, kültür ve isteğe bağlı kıyı seçimi dâhil)
- `/yonetim kiyi-ayarla ulke yerleske kiyi`
- `/yonetim kultur-ayarla`
- `/yonetim hammadde-ayarla`
- `/yonetim tur-ilerlet`
- `/yonetim tur-durumu`
- `/yonetim yerleske-hazinesi`
- `/yonetim hazine`
- `/yonetim harap`
- `/yonetim oyunu-sifirla onay:SIFIRLA`
- `/yonetim komut-log-kanali islem [kanal]`
- `/yonetim komut-gecmisi [adet]`
- `/yonetim mesaj-sil miktar`
- `/yonetim rol-kanali islem kanal`
- `/yonetim rol-rapor-kanali islem [kanal]`

- `/olay riskler tur [ulke]`
- `/olay sec tur [ulke]`
- `/olay uygula tur [ulke] [yerleske]`
- `/olay sonlandir tur ulke yerleske`
- `/olay salgin ulke yerleske baz-risk`
- `/olay salgin-iyilesme ulke yerleske`
- `/olay karaborsa ulke yerleske`

`yerleske-devret`, yerleşkeyi hedef devlete geçirip Fethedilmiş olarak işaretler; aktif asker/gemi/kuşatma üretim emirlerini, şehir politikalarını, Akademi eğitimlerini ve yerleşkeye bağlı bekleyen/aktif ticaretleri sona erdirir. Eski devletin karakter görevlendirmeleri kaldırılır; mevcut bina, birlik ve filolar yerleşkeyle birlikte yeni devlete geçer. Ordu ve filolara eşzamanlı savaş kullanım kilidi uygulanmaz.

Akademi eğitimi Alım Turunda başlatılır. Sv1 görev türünü `1d30` ile belirler; Sv2 bir görev türünü eleyip `1d20` atar; Sv3 görev türünü oyuncuya seçtirir. Zar düğmesinden sonra açılan formda karaktere isim verilir ve karakter otomatik olarak devlet belgesine eklenir. Tüccarlar Agora/Forum Sv2+ görevine atanabilir; Agora Sv3 görevlisi karaborsa olayını engeller.

`/olay` komutları yalnızca oyun yöneticisi tarafından kullanılabilir. `/olay riskler` ve `/olay sec` varsayılan olarak Discord sunucusundaki bütün devletlerin yerleşkelerini tarar; isteğe bağlı `ulke` seçeneği kapsamı daraltır. Bot; karaborsa, salgın, huzursuzluk veya isyan için aktif binaları, Agora tüccarını, yerel/ticaret kaynaklarını, kuşatmayı, fetih durumunu ve önceki olayları değerlendirir. Agora Sv3 tüccarı karaborsayı tamamen engeller; Zeytin salgın riskini 10 puan azaltır, Panteon Sv2+ kalan salgın riskini yarıya düşürür. Aynı yerleşkede aynı olay 3 oyun turu içinde yeniden seçilmez; aktif olaylar yeni seçimden çıkarılır.

Ağırlıklı seçim yalnızca yöneticiye gösterilir ve olayı kendiliğinden başlatmaz. Yönetici sonucu yeşil onay düğmesiyle veya `/olay uygula tur` komutuyla herkese açık biçimde uygular; `ulke` ile `yerleske` birlikte belirtilirse belirli bir şehre doğrudan uygulayabilir. Aktif olay yerleşke belgesinde görünür ve `/olay sonlandir` ile kaldırılır. Tur ilerletme hiçbir olayı kendiliğinden tetiklemez. Eski doğrudan salgın, iyileşme ve karaborsa komutları kullanılmaya devam eder; Su Kemeri iyileşme zarına +1 ekler.

`oyunu-sifirla` yalnızca yetkili GM tarafından ve tam `SIFIRLA` onayıyla çalışır. Komut, o Discord sunucusundaki ülkeleri ve bunlara bağlı bütün oyun kayıtlarını siler; turu 0/Kapalı durumuna döndürür. Rol kanalları ile kelime istatistikleri korunur.

Tur ilerletme otomatik saate bağlanmamıştır. Savaş veya olay çözümü iki güne uzayabildiği için GM önce durumu `Kapalı`/`Olaylar çözülüyor` yapar, bütün olaylar bittikten sonra bir kez `tur-ilerlet` kullanır. Sonuç kartı tamamlanan binaları, katılan birlikleri, gemileri, kuşatma aletlerini, etkinleşen şehir politikalarını, kuşatma erzaklarını ve Panteon kredi ödemelerini yerleşke bazında listeler. Karaborsa, salgın, huzursuzluk ve isyan yalnızca oyun yöneticisinin olay komutlarıyla başlar.

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
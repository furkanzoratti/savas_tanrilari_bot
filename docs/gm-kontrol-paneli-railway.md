# GM Operasyon Masası — Railway Kurulumu

Panel yalnızca izin verilen Discord yöneticilerine açıktır. Oyuncular paneli göremez ve panele giriş bağlantısı üretemez.

## 1. Discord üzerinden tek kullanımlık giriş

Yönetici Discord'da `/operasyon-masasi` komutunu kullanır. Bot yalnız yöneticiye görünen, beş dakika geçerli ve tek kullanımlık bir bağlantı üretir. Discord Developer Portal OAuth ayarı veya Client Secret gerekmez.

## 2. Railway panel servisi

Mevcut GitHub deposundan ikinci bir Railway servisi oluşturulur. Bot ve panel ayrı servis olarak çalışır fakat aynı PostgreSQL veritabanını kullanır.

Panel servisinin **Config File Path** ayarı aşağıdaki dosyaya çevrilir:

```text
/railway.admin.json
```

Servisin başlangıç komutu:

```text
pnpm start:admin
```

Healthcheck yolu:

```text
/health
```

## 3. Ortam değişkenleri

```env
DATABASE_URL=${{Postgres.DATABASE_URL}}
ADMIN_PANEL_BASE_URL=https://PANEL-DOMAININIZ.up.railway.app
ADMIN_DISCORD_USER_IDS=YETKILI_DISCORD_KULLANICI_IDSI
ADMIN_GUILD_ID=OYUN_DISCORD_SUNUCU_IDSI
ADMIN_SESSION_SECRET=EN_AZ_32_KARAKTERLIK_RASTGELE_GIZLI_DEGER
PORT=3000
LOG_LEVEL=info
```

Birden fazla yönetici gerekiyorsa `ADMIN_DISCORD_USER_IDS` virgülle ayrılır. `ADMIN_PANEL_BASE_URL` ve `ADMIN_SESSION_SECRET` normal bot servisine de aynı değerlerle eklenir.

## 4. İlk deploy sırası

1. Önce normal bot servisi deploy edilir. Böylece panelin işlem ve idempotency tablosunu oluşturan veritabanı migration'ı uygulanır.
2. Ardından panel servisi deploy edilir.
3. Slash komutları yeniden kaydedildikten sonra `/operasyon-masasi` ile giriş bağlantısı alınır.
4. `/health` yanıtı `{"ok":true,"service":"gm-panel"}` olduğunda panel hazırdır.

## Güvenlik davranışı

- Komutu yalnız oyun yöneticisi kullanabilir; kullanıcı kimliği panel izin listesiyle de karşılaştırılır.
- Giriş anahtarı veritabanında yalnız SHA-256 özetiyle tutulur, beş dakikada sona erer ve ilk kullanımda tüketilir.
- Oturum çerezi `HttpOnly`, `SameSite=Lax` ve HTTPS üzerinde `Secure` olarak oluşturulur.
- Veri değiştiren her istek Origin ve CSRF doğrulamasından geçer.
- Ordu oluşturma işlemi önce önizlenir; imzalı önizleme on dakika geçerlidir.
- Aynı işlem ikinci kez gönderilse bile idempotency anahtarı nedeniyle iki kez uygulanmaz.
- Her değişiklik `audit_logs` ve `admin_panel_operations` tablolarına yazılır.

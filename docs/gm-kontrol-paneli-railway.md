# GM Operasyon Masası — Railway Kurulumu

Panel yalnızca izin verilen Discord kullanıcılarına açıktır. Oyuncular paneli göremez ve panele giriş yapamaz.

## 1. Discord OAuth uygulaması

Discord Developer Portal'da botla aynı uygulama veya ayrı bir yönetici uygulaması kullanılabilir.

OAuth2 yönlendirme adresine aşağıdaki adres eklenir:

```text
https://PANEL-DOMAININIZ.up.railway.app/auth/callback
```

Client ID ve Client Secret Railway değişkenlerine girilir. Client Secret hiçbir zaman tarayıcıya gönderilmez.

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
ADMIN_DISCORD_CLIENT_ID=DISCORD_OAUTH_CLIENT_ID
ADMIN_DISCORD_CLIENT_SECRET=DISCORD_OAUTH_CLIENT_SECRET
ADMIN_DISCORD_USER_IDS=YETKILI_DISCORD_KULLANICI_IDSI
ADMIN_GUILD_ID=OYUN_DISCORD_SUNUCU_IDSI
ADMIN_SESSION_SECRET=EN_AZ_32_KARAKTERLIK_RASTGELE_GIZLI_DEGER
PORT=3000
LOG_LEVEL=info
```

Birden fazla yönetici gerekiyorsa `ADMIN_DISCORD_USER_IDS` virgülle ayrılır. Mevcut kullanımda yalnız GM hesabının kimliği yazılmalıdır.

## 4. İlk deploy sırası

1. Önce normal bot servisi deploy edilir. Böylece panelin işlem ve idempotency tablosunu oluşturan veritabanı migration'ı uygulanır.
2. Ardından panel servisi deploy edilir.
3. Panel domaini Discord OAuth yönlendirme adresiyle birebir aynı olmalıdır.
4. `/health` yanıtı `{"ok":true,"service":"gm-panel"}` olduğunda panel hazırdır.

## Güvenlik davranışı

- Discord OAuth yalnız `identify` yetkisini ister.
- Kullanıcı kimliği sunucudaki izin listesiyle karşılaştırılır.
- Oturum çerezi `HttpOnly`, `SameSite=Lax` ve HTTPS üzerinde `Secure` olarak oluşturulur.
- Veri değiştiren her istek Origin ve CSRF doğrulamasından geçer.
- Ordu oluşturma işlemi önce önizlenir; imzalı önizleme on dakika geçerlidir.
- Aynı işlem ikinci kez gönderilse bile idempotency anahtarı nedeniyle iki kez uygulanmaz.
- Her değişiklik `audit_logs` ve `admin_panel_operations` tablolarına yazılır.

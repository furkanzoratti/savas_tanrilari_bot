# AMRP R56 harita kaynağı

`qgis/amrp-harita.qgz` düzenlenebilir QGIS projesidir. Gridin başlangıcı, yönü ve R56 yarıçapı sabittir. Genişletmede mevcut `hex_uid`/`hex_code` değerleri değiştirilmez; yalnızca yeni hücreler eklenir.

- `NEWHEXMAP.png`: Oyuncunun gönderdiği görselle birebir aynı koordinatlı çıktı.
- `assets/hex-map-r56.json`: Botun kullanacağı sürümlü veri (depo köküne göre yol).
- `source/`: Bölge geometrisi, yerleşke ve arazi kaynakları.
- `build-r56-map.cjs`: Kaynaklardan JSON ve sınıflandırma önizlemesi üretir. Node için `sharp` paketi gerekir.
- `qgis/sync_r56_production.py`: JSON'daki sınıflandırmayı QGIS GeoPackage katmanına yazar.
- `hex-map-report.json`: Sayısal kalite kontrolü ve sınırda kalan Hex'ler.
- `route-topology-report.json`: Kara/deniz bileşenleri ve ayrık su Hex'leri.

Depo kökünden yeniden üretim:

```powershell
node maps/r56-india-v6/build-india-hex-map.cjs
node maps/r56-india-v6/validate-india-hex-map.cjs
Copy-Item maps/r56-india-v6/output/hex-map-r56-india-v6.json assets/hex-map-r56.json -Force
Copy-Item maps/r56-india-v6/output/NEWHEXMAP-INDIA-v6.png maps/r56/NEWHEXMAP.png -Force
pnpm exec vitest run src/domain/hex-map-data.test.ts
node maps/r56/audit-topology.cjs
```

R56 Hindistan v6: 2.304 Hex; 876 kara, 483 deniz, 945 geçilemez. 209 yerleşkenin tamamı tekil kara Hex'ine bağlıdır. Mevcut batı haritası ve sabit Hex kimlikleri korunmuş, Hindistan uzantısı Q48–BL36 aralığında eklenmiştir. Himalaya Dağları üzerindeki 18 hücre (`BA20`, `BA21`, `BB20`, `BC20`, `BC21`, `BD20`, `BD21`, `BE20`, `BF21`, `BG22`, `BH21`, `BI22`, `BJ21`, `BJ22`, `BK22`, `BK23`, `BL22`, `BL23`) geçilemezdir; hareket komşuluğu taşımaz ve oyuncu görselinde üzerlerine Hex ızgarası çizilmez. J23, N06, T25, X15 ve AD13 için mevcut sınır onayı korunur.

Kaynak haritadaki `owner` alanı bilerek boş tutulur. Güncel devlet sahibi, aktarım sırasında aynı bölgedeki bot yerleşkesinin `country_id` değerinden türetilir. Tarihî kaynak renkleri canlı sahiplik olarak kullanılmaz.

Deniz üzerindeki dar geçitler grid çözünürlüğünde kopabilir. Filolar açılmadan önce Cebelitarık, Türk boğazları, Adriyatik ve diğer ayrık su kümeleri için açık `map_hex_edges` kuralları doğrulanmalıdır; kara hücreleri sırf bağlantı için denize dönüştürülmemelidir.

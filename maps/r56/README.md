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
node maps/r56/build-r56-map.cjs
& 'C:\Program Files\QGIS 4.2.2\bin\python-qgis.bat' maps/r56/qgis/sync_r56_production.py
pnpm exec vitest run src/domain/hex-map-data.test.ts
node maps/r56/audit-topology.cjs
```

R56 v2: 1.800 Hex; 749 kara, 400 deniz, 651 kapalı. 173 yerleşkenin tamamı tekil kara Hex'ine bağlı. 33 kara Hex'inin bölgesi merkez noktada boştu; poligon örneklemesiyle dolduruldu. J23, N06, T25, X15 ve AD13 iki bölgenin sınırında yakın sonuç verdiği için `regionAssignment.needsReview` taşır. Bu beş eşleşme QGIS'te elle değiştirilebilir; değişiklikten sonra JSON ve testler tekrar üretilmelidir.

Kaynak haritadaki `owner` alanı bilerek boş tutulur. Güncel devlet sahibi, aktarım sırasında aynı bölgedeki bot yerleşkesinin `country_id` değerinden türetilir. Tarihî kaynak renkleri canlı sahiplik olarak kullanılmaz.

Deniz üzerindeki dar geçitler grid çözünürlüğünde kopabilir. Filolar açılmadan önce Cebelitarık, Türk boğazları, Adriyatik ve diğer ayrık su kümeleri için açık `map_hex_edges` kuralları doğrulanmalıdır; kara hücreleri sırf bağlantı için denize dönüştürülmemelidir.

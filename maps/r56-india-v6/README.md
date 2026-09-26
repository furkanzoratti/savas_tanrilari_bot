# AMRP R56 Hindistan Hex genişlemesi — v6

Bu sürüm, 26 Eylül 2026 tarihinde gönderilen güncel siyasi haritayı doğrudan kaynak alır.

- Çalışma alanı: **5376×3328**
- Grid: **R56**, flat-top, 64 sütun × 36 satır
- Eski haritanın `q < 47` hücreleri veri düzeyinde korunur.
- Hindistan uzantısı güncel siyasi haritanın gerçek piksellerinden sınıflandırılır.
- Himalaya Dağları `IMPASSABLE` olarak tutulur; bu hücrelerin poligon ve koordinatları görselde çizilmez.
- Kaynak haritanın sınırları veya şehir etiketleri yeniden üretilmez.

```powershell
node maps/r56-india-v6/build-india-hex-map.cjs
node maps/r56-india-v6/validate-india-hex-map.cjs
```

Ana çıktılar:

- `output/NEWHEXMAP-INDIA-v6.png`
- `output/hex-map-r56-india-v6.json`
- `output/india-v6-report.json`


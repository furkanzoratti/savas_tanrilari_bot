# AMRP R56 Hindistan genişlemesi — v3 taslağı

Bu sürüm mevcut R56 haritasını Gedrosya/Balûcistan ve Baktriya'nın doğusundan Hint alt kıtasına doğru genişletir. Üretim, mevcut haritanın üzerine yazmaz.

## Dağılım

- Orta: Maurya İmparatorluğu — Takşila, Pataliputra, Ujjayini
- Orta-küçük: Kalinga — Tosali, Dantapura
- Orta-küçük: Satavahanalar — Pratişthana, Amaravati
- Küçük: Yaudheya — Rohitaka
- Küçük: Kuninda — Srughna
- Küçük: Kamarupa — Pragjyotişa
- Küçük: Çola — Uraiyur
- Küçük: Pandya — Madurai
- Küçük: Çera — Muziris

Toplam: 9 devlet, 13 bölge/yerleşke.

## Güvenlik ve koordinatlar

- Eski üretim tuvali: 4064×3328, 50×36 R56 hücresi.
- v3 tuvali: 5376×3456, 64×36 R56 hücresi.
- Eski A–AW alanındaki 1.764 hücrenin kimliği, kodu ve axial koordinatı korunur.
- Eski haritanın daha önce tuval dışında kalan AX sınır sütunu yeni coğrafyaya göre yeniden sınıflandırılabilir.
- Üretim dosyaları output dizini altında kalır; botun aktif assets/hex-map-r56.json dosyası otomatik değiştirilmez.

## Üretim ve doğrulama

    node maps/r56-india-v3/build-india-extension.cjs
    node maps/r56-india-v3/validate-india-extension.cjs

Kıyı geometrisi Natural Earth 1:10m Admin 0 kamu malı verisinden gelir. Siyasi iç sınırlar ve yerleşke bağları source/india-regions.json üzerinden tekrar üretilebilir.

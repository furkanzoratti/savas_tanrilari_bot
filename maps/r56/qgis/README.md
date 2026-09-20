# AMRP QGIS Harita Altyapisi

Bu klasor, AMRP hareket haritasinin genislemeye dayanikli QGIS ana projesini tutar.

## Degismez kurallar

- Ana raster duzlemi `4064 x 3328` birimdir ve sol ust piksel `(0, 3328)` olarak sabitlenmistir.
- Hex geometrisi, yonu ve global baslangic noktasi veri girilmeye baslandiktan sonra degistirilmez.
- Harita genislemesi eski hucreleri yeniden numaralandirmaz; yalnizca yeni hucreler ekler.
- Bot konumlari piksel koordinatiyla degil `hex_uid`, `q` ve `r` ile saklar.
- `hex_code` oyuncuya gosterilen etikettir; `hex_uid` kalici veritabani anahtaridir.

## Aday gridler

- `R48`: Mevcut haritadaki taktiksel yogunlugu korur.
- `R56`: Daha okunaklidir ve haritadaki uzun mesafeleri yaklasik yuzde 14 kisaltir.

Iki grid de test amaclidir. Bir grid secildikten sonra digeri uretim verisine alinmaz.

## Dosyalar

- `kaynak/amrp-toprak.png`: Kullanici tarafindan saglanan degistirilmemis kaynak.
- `kaynak/amrp-toprak-georef.tif`: EPSG:3857 icinde piksel tabanli sabit duzleme yerlestirilmis ana raster.
- `veri/hex-grid-r48.gpkg`: R48 deneme poligonlari ve bot alanlari.
- `veri/hex-grid-r56.gpkg`: R56 deneme poligonlari ve bot alanlari.
- `amrp-harita.qgz`: QGIS 4.2.2 proje dosyasi.
- `qgis-hazirlama-raporu.json`: Olusturulan dosyalarin ve hucre sayilarinin raporu.

## Yeniden uretme

QGIS 4.2.2 kurulu bir Windows makinede:

```powershell
& 'C:\Program Files\QGIS 4.2.2\bin\python-qgis.bat' '.\hex-harita\qgis\prepare_qgis_project.py'
```

Betik var olan tanim alanlarini korur ve temel kimlik/koordinat alanlarini yeniden hesaplar.

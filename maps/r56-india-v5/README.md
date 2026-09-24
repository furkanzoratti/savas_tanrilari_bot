# AMRP Hindistan vektör genişlemesi — v5

Bu sürüm, son gönderilen `toprak.png` dosyasını değiştirmeden temel alır ve Hindistan uzantısını gerçek kıyı geometrisiyle üretir.

- Çalışma alanı: **5376×3328**
- Vektör çıktı: `india-extension-overlay-v5.svg`
- QGIS uyumlu bölge geometrisi: `india-regions-v5.geojson`
- Normal 4K+ çıktı: `amrp-toprak-india-vector-v5.png`
- R56 çıktı: `NEWHEXMAP-INDIA-VECTOR-v5.png`
- Sınırlar ham piksel üzerinde 9 px basılır; kenar yumuşatma uygulanmaz.
- Eski haritadaki dolu bölgeler korunur. Yeni vektör yalnızca doğudaki boş arka plana yerleşir.

```powershell
node maps/r56-india-v5/build-vector-india.cjs
node maps/r56-india-v5/validate-vector-india.cjs
```

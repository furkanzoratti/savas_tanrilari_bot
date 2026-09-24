# R56 Hindistan genişlemesi — v4

Bu sürüm doğrudan kullanıcının son gönderdiği `C:/Users/Frank/Desktop/toprak.png` dosyasını temel alır. Kaynak SHA-256 değeri build sırasında doğrulanır; önceki Hindistan taslağı görsel kaynak olarak kullanılmaz.

Önemli görsel kararlar:

- Yeni kara, Balucistan-Baktriya'nın doğu sınırına geniş ve açık bir kara geçidiyle bağlanır; arada deniz ya da gri tuval şeridi yoktur.
- İç sınırlar düz Voronoi çizgileri değildir. Yumuşak, kontrollü dalgalı alan ayrımıyla organik üretilir.
- Yeni sınırlar 8–9 piksel görsel ağırlıktadır ve ana haritadaki siyah sınırlarla uyumludur.
- Sol taraftaki özgün 4064×3328 piksel harita korunur; yalnızca doğu ucundaki birkaç piksellik geçit yeni karaya açılır.
- Normal harita ve R56 Hex haritası birlikte üretilir. Bu klasördeki çıktı henüz canlı oyun varlığının üzerine yazılmaz.

Üretim:

```powershell
node maps/r56-india-v4/build-india-extension.cjs
node maps/r56-india-v4/validate-india-extension.cjs
```

# Bağlama Akort

Tarayıcıda çalışan, kurulum gerektirmeyen bağlama akort programı. Mikrofondan sesi dinler,
çalınan teli bulur ve ibreyle ne kadar pes ya da tiz olduğunu gösterir. İnternet bağlantısı
gerekmez; ses yalnızca kendi tarayıcınızda işlenir, hiçbir yere gönderilmez.

## Nasıl açılır?

**Yol 1: baslat.bat (Windows, önerilen)**
Klasördeki `baslat.bat` dosyasına çift tıklayın. Bilgisayarda Python kuruluysa program
`http://localhost:8000` adresinde açılır. Açılan siyah pencere açık kaldıkça program çalışır;
işiniz bitince pencereyi kapatın.

**Yol 2: index.html**
`index.html` dosyasına çift tıklayın. Chrome ve Edge'de mikrofon genellikle bu şekilde de çalışır.
Mikrofon açılmazsa ya da izin penceresi hiç çıkmazsa Yol 1'i kullanın.

**Telefonda:** Dosyaları bir web sunucusuna (https) koyup telefonun tarayıcısından açın.
Mikrofon yalnızca `https://` veya `localhost` adreslerinde çalışır.

## Kullanım

1. Üstten **enstrümanı** (Kısa Sap, Uzun Sap, Divan, Cura…) ve **düzeni** (Bağlama düzeni, Kara düzen…) seçin.
   Düzenin açıklaması seçicinin altında yazar.
2. **🎤 Mikrofonu Aç**'a basın ve tarayıcı sorunca mikrofona izin verin.
   (Klavyede **Boşluk** tuşu da mikrofonu açıp kapatır.)
3. Bir tele vurun. Ekranda:
   - büyük harflerle çalınan nota ve oktavı,
   - frekans (Hz), hedeften sapma (cent) ve isteğe bağlı koma değeri,
   - ibre: ortadaki yeşil bölge (±5 cent) **AKORTTA** demektir.
4. Yönlendirmeye göre kulağı çevirin:
   - **Pes ↓ — teli sıkın**: ses düşük, teli gerin.
   - **Tiz ↑ — teli gevşetin**: ses yüksek, teli gevşetin.

### Tel seçimi: Otomatik / Manuel
- **Otomatik:** Program çalınan teli kendisi bulur ve alttaki tel düğmesini vurgular.
- **Manuel:** Bir tel düğmesine dokunun; o tel hedef olur. Tel çok bozuksa (örneğin bir tam ses
  uzaktaysa) manuel mod daha güvenilirdir. Seçili tele tekrar dokunmak referans sesi çalar.
- Her telin yanındaki **🔊** düğmesi o telin doğru sesini çalar (kulakla akort için).
  Referans ses çalarken program mikrofonu dinlemeyi kısa süre bırakır.

### Ayarlar (katlanabilir panel)
- **Transpoze (−7…+7 yarım ses):** Bütün telleri birlikte kaydırır. Sapın boyuna ve kendi
  "karar" perdenize göre ayarlayın.
- **Referans La4 (A4):** 415–466 Hz arası, varsayılan 440 Hz.
- **Nota adları:** Türkçe (Do Re Mi) veya ABC (C D E).
- **Koma:** Sapmayı Holder koması cinsinden de gösterir (1 koma ≈ 22,6 cent).
- Sağ üstteki ☀/☾ düğmesi koyu ve açık tema arasında geçiş yapar.

Ayarlarınız tarayıcıda saklanır; programı tekrar açtığınızda kaldığınız yerden devam eder.

## Sorun giderme

| Sorun | Çözüm |
|---|---|
| "Mikrofon izni verilmedi" | Adres çubuğundaki kilit/mikrofon simgesinden bu sayfaya izin verin, sayfayı yenileyin. |
| "Mikrofon bulunamadı" | Mikrofonun takılı olduğundan emin olun. Windows: Ayarlar › Gizlilik ve güvenlik › Mikrofon › tarayıcıya izin verin. |
| "Mikrofon kullanılamıyor" | Zoom, Teams, Discord gibi mikrofonu kullanan programları kapatın. |
| "Tarayıcı burada mikrofona izin vermiyor" | `baslat.bat` ile açın (http://localhost:8000). |
| İbre kararsız oynuyor | Mikrofona yakın çalın, ortam gürültüsünü azaltın, teli tek tek ve net vurun. |
| Yanlış tel algılanıyor | Manuel moda geçip akort ettiğiniz teli seçin. |

## Dosyalar

```
index.html               ana sayfa
baslat.bat               Windows için yerel sunucu başlatıcı
css/style.css            görünüm
js/notes.js              nota/frekans hesapları
js/tunings.js            enstrümanlar ve düzenler
js/pitch-detector.js     perde (frekans) algılama
js/audio-engine.js       mikrofon ve ses işleme
js/reference-tone.js     referans ses
js/ui.js, js/app.js      arayüz ve uygulama
tests/                   tarayıcıda açılan test ve demo sayfaları (ui-demo.html: mikrofonsuz arayüz demosu)
docs/DUZENLER.md         düzenler ve kaynaklar
```

## Hakkında

Bu program, Anthropic'in yapay zekâ asistanı [Claude](https://claude.ai) (Claude Code) ile oluşturulmuştur.

Canlı sürüm: https://farukduzenli61.github.io/baglama-tuner/

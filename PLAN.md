# Bağlama Tuner — Plan ve Modül Sözleşmesi

## Hedef
Tarayıcıda çalışan, kurulum gerektirmeyen bağlama akort programı. Mikrofondan sesi dinler,
çalınan teli/notayı bulur, ibre ile ne kadar pes/tiz olduğunu gösterir; seçilen düzene
(akort sistemi) göre her tel için hedef sesi verir ve referans ses çalabilir.

## Teknik kararlar
- **Saf HTML + CSS + JavaScript**, derleme yok, framework yok, dış bağımlılık yok.
- **ES module KULLANMA** (`file://` üzerinden CORS hatası verir). Her dosya klasik `<script>`
  olarak yüklenir ve tek bir global ad alanına yazar: `window.Baglama = window.Baglama || {}`.
  Her dosya IIFE içinde: `(function (B) { ... })(window.Baglama = window.Baglama || {});`
- AudioWorklet KULLANMA (file:// altında modül yükleyemez). `AnalyserNode.getFloatTimeDomainData`
  + `requestAnimationFrame` döngüsü kullan.
- Hedef: masaüstü Chrome/Edge/Firefox ve mobil Chrome/Safari. `index.html` çift tıklayınca
  çalışmalı; ayrıca `baslat.bat` (Windows'ta varsa python ile `http://localhost:8000` açar).
- Arayüz dili: **Türkçe**.

## Dosya yapısı ve sahiplik
```
index.html                 -> Ajan C
css/style.css              -> Ajan C
js/notes.js                -> Ajan B
js/tunings.js              -> Ajan B
js/reference-tone.js       -> Ajan B
js/pitch-detector.js       -> Ajan A
js/audio-engine.js         -> Ajan A
js/ui.js                   -> Ajan C
js/app.js                  -> Ajan C
tests/pitch-tests.html     -> Ajan A  (tarayıcıda açılınca sentetik sinyallerle test)
tests/notes-tests.html     -> Ajan B
docs/DUZENLER.md           -> Ajan B  (düzenler + kaynaklar)
baslat.bat, README.md      -> Ajan C
```
Script yükleme sırası (index.html): notes.js, tunings.js, pitch-detector.js, audio-engine.js,
reference-tone.js, ui.js, app.js.

**Kimse başkasının dosyasını düzenlemez.** Sözleşmede eksik görürsen kendi dosyanda geriye
uyumlu ek yap ve son raporunda belirt.

---

## Sözleşme (API)

### js/notes.js — `Baglama.Notes` (Ajan B)
```js
Baglama.Notes = {
  NAMES_TR: ['Do','Do#','Re','Re#','Mi','Fa','Fa#','Sol','Sol#','La','La#','Si'],
  NAMES_EN: ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'],
  KOMA_CENTS: 1200/53,              // Holder koması ≈ 22.64 cent
  getA4(): number,                  // varsayılan 440
  setA4(hz: number): void,          // 415–466 arası kısıtla
  freqToMidi(hz): number,           // ondalıklı (ör. 69.12)
  midiToFreq(midi): number,
  noteName(midi:int, system:'tr'|'en' = 'tr'): string,   // 'La4' / 'A4'
  analyze(hz): { hz, midi:int, name:string, nameEn:string, octave:int,
                 cents:number /* -50..+50 en yakın nota göre */, koma:number /* cents/KOMA_CENTS */ },
  centsBetween(hz, targetHz): number   // 1200*log2(hz/targetHz)
};
```

### js/tunings.js — `Baglama.Tunings` (Ajan B)
Tel grupları sözleşmede **pesten tize** sıralı dizi olarak tutulur; her elemanın Türkçe adı var.
```js
// Tel nesnesi
{ id:'ust'|'orta'|'alt', label:'Üst tel', midi:int, hz:number, noteName:'Re3',
  courses:[{ midi, hz, noteName, isBam:boolean }]  // gruptaki teller (bam teli dahil)
}
Baglama.Tunings = {
  INSTRUMENTS: [ { id:'kisa-sap', label:'Kısa Sap Bağlama', ... }, { id:'uzun-sap', ...}, { id:'divan', ...}, { id:'cura', ...} ],
  DUZENLER:    [ { id:'baglama', label:'Bağlama Düzeni', description, ... }, ... ],  // min. 6 düzen
  getStrings(instrumentId, duzenId, transposeSemitones = 0): Tel[],  // pesten tize
  findClosestString(hz, strings): { string:Tel, cents:number },      // oktav farkını da yakala
  // Kullanıcı özel düzen:
  makeCustom(label, midiList /* pesten tize 3 sayı */): duzen,
};
```
Transpoze: kullanıcı "karar"ı/genel perdeyi yarım ses kaydırabilmeli (−7..+7), çünkü
bağlamalar enstrüman boyuna göre farklı perdeden akort edilir.

### js/reference-tone.js — `Baglama.ReferenceTone` (Ajan B)
```js
Baglama.ReferenceTone = {
  play(hz, { durationSec = 2.5, mode = 'pluck' /* 'pluck'|'sine' */ } = {}): void,
  stop(): void,
  isPlaying(): boolean
};
// Kendi AudioContext'ini tembel oluşturur (veya Baglama.AudioEngine.getContext() varsa onu kullanır).
// 'pluck' = Karplus-Strong ile tel benzeri ses.
```

### js/pitch-detector.js — `Baglama.PitchDetector` (Ajan A)
DOM/Web Audio bağımsız, saf fonksiyon:
```js
Baglama.PitchDetector = {
  // buffer: Float32Array (zaman düzlemi), sampleRate: number
  detect(buffer, sampleRate, opts = { minHz: 60, maxHz: 1400, threshold: 0.12 }):
     null | { hz:number, clarity:number /*0..1*/, rms:number }
};
```
YIN veya MPM (McLeod) + parabolik interpolasyon. Bağlama telleri çok harmonikli ve bam teli
bir oktav pes çalar → **oktav hatalarına** karşı dayanıklı olmalı. Sessizlikte (rms eşiği altında) null.
Hedef doğruluk: temiz sinyalde ±1 cent, gürültülü/harmonikli tel sinyalinde ±3 cent.

### js/audio-engine.js — `Baglama.AudioEngine` (Ajan A)
```js
Baglama.AudioEngine = {
  async start(): void,          // getUserMedia (echoCancellation/noiseSuppression/autoGainControl: false)
  stop(): void,
  isRunning(): boolean,
  getContext(): AudioContext|null,
  onPitch(callback),            // callback({ hz, clarity, rms, cents?, stable:boolean } | null) — her karede
  onLevel(callback),            // callback(rms 0..1) — VU göstergesi için
  onError(callback),            // callback({ code:'denied'|'nodevice'|'insecure'|'unknown', message:string })
  setSmoothing(0..1)            // medyan + üstel yumuşatma; ani sıçramalarda sıfırla
};
```
`stable` = son ~150 ms boyunca nota sabit kaldı. Yumuşatmayı burada yap ki ibre titremesin.

### js/ui.js + js/app.js (Ajan C)
- `app.js`: ayarları `localStorage` (try/catch) içinde tutar: `{ instrumentId, duzenId, transpose,
  a4, notation:'tr'|'en', mode:'auto'|'manual', selectedStringId, showKoma }`.
- AudioEngine.onPitch → Tunings.findClosestString (auto modda) veya seçili tel (manuel) →
  Notes.centsBetween → UI.
- `ui.js`: ibre/gösterge (SVG, ±50 cent, ±5 cent içinde yeşil "AKORTTA"), büyük nota adı,
  Hz, cent ve (isteğe bağlı) koma değeri, tel butonları (her tele basınca referans ses çalar),
  düzen / enstrüman / transpoze / A4 seçicileri, mikrofon başlat butonu, hata mesajları
  (izin reddedildi vb.), seviye göstergesi. Mobil uyumlu, koyu/açık tema.
- Ajan C diğer modüller henüz yokken çalışabilmek için **geçici stub yazmaz**; sözleşmeye göre kodlar.
  Test için `tests/ui-demo.html` içinde sahte (mock) Baglama.* nesneleriyle UI'yi gösterebilir.

## Doğrulama
Node yok; Python 3 var. Ajanlar mantığı doğrulamak için Python ile eşdeğer hesap/sinyal testi
yazabilir veya `conda create -n node -c conda-forge nodejs` ile ayrı ortamda Node kurup
`node` ile JS dosyalarını (vm ile `window` taklidi) çalıştırabilir. Test betikleri `tests/` altında kalır.

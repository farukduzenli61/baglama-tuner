# Bağlama Düzenleri: Kaynaklar ve Veri Kararları

Bu belge `js/tunings.js` içindeki verinin dayanağıdır. Her değerin yanında bir kaynak ya da
"doğrulanmadı / çıkarım" notu var. Kaynakta bulamadığımız hiçbir şeyi doğrulanmış gibi sunmadık.

Kısaltmalar:
- **[E]** Emnalar, A. (1998). *Tüm Yönleriyle Türk Halk Müziği ve Nazariyatı*, s. 62. Kitabı biz görmedik; Tablo 1'i
  Dursun 2024 aktarıyor. → **[D]** Dursun, D. (2024). "Yenilikçi uzun sap bağlamada (bozuk düzende) transpoze icraya
  ilişkin bulgular". *İnönü Üni. Kültür ve Sanat Dergisi* 10(1):189–196, Tablo 1.
  https://dergipark.org.tr/en/download/article-file/4051404
- **[K]** Kaya, İ. (2021). "Halk Müziği İcrasında Ezgi Yapılarının Akort Değişimine Etkisi ve Kuramsal Yansımaları".
  *Fine Arts (NWSA)* 16(2):98–112, Tablo 3 "Akort düzenleri". https://dergipark.org.tr/en/download/article-file/1525631
- **[KD]** Karahan, C. & Doğan, M. (2025). "Permütasyon ve simetri bakımından bağlama düzenleri: Bozuk, Bağlama ve Şûr".
  *Online Journal of Music Sciences* 10(3):678–702. https://dergipark.org.tr/en/pub/ojomus/article/1700531
  (tam metin: https://dergipark.org.tr/en/download/article-file/4875685)
- **[W]** Wikipedia, "Bağlama", ayarlar (tunings) bölümü ve saz ailesi tablosu. https://en.wikipedia.org/wiki/Ba%C4%9Flama
  (ansiklopedi özeti; oktav örnekleri "e.g." ya da "most likely" diye verilmiş).
- **[KA]** Kure Ansiklopedi, "Cura". https://kureansiklopedi.com/en/detay/cura-5c153
- **[TK]** "Bağlama…" (2023). *Türk Kültürü ve Hacı Bektaş Velî Araştırma Dergisi* sayı 106.
  https://dergipark.org.tr/en/download/article-file/2723796
- **[DU]** Durul, K. M. (2018). *Bağlamada Bozuk Düzeni*, İTÜ TMDK Yayınları 13.
  https://Tmdk.itu.edu.tr/docs/librariesprovider4/kitap-icerik/baglamada-bozuk-duzeni.pdf. Erişilebilen PDF yalnızca
  kapak ve içindekiler bölümü ("Tel Grupları, Alt Teller, Orta Teller, Üst Teller, Tel Çapları", s. 18). Tel
  notalarını bu kaynaktan doğrulayamadık.

---

## 1. Alt / orta / üst: adlandırma kararı

**Karar: "alt", "orta", "üst" FİZİKSEL konumu anlatır, ses yüksekliğini anlatmaz.**
Saz çalım konumunda tutulduğunda **üst tel**, yere en uzak gruptur (çalıcının yüzüne yakın, sapın "üstü").
**Alt tel** yere en yakın gruptur. Wikipedia [W] de aynı sırayı kullanır: "Bottom, Middle, Top" = alt, orta, üst.

Gerekçe:
1. Üç akademik tablo [E/D], [K] ve [KD] bütün düzenlerde **alt teli "La"** alır: "Tespit edilen düzenlerin hepsinde
   alt tel La sesi kabul edilip, diğer teller buna göre belirlenmektedir" [D, Emnalar'dan]. Değişen gruplar orta ve
   üst tellerdir. [K]'ye göre düzenler "alt açık telin sabit kalması ile orta ya da üst telin … farklı seslere akort
   edilmesi ile elde edilir".
2. [KD]'nin Bozuk düzen perde analizi oktav ilişkisini veriyor. Alt telde 7. perde (dörtlü), orta telin bir oktav
   tizidir; buna göre orta tel, alt telin **beşli pesidir**. Alt telde 14. perde (küçük yedili) ise üst telin bir oktav
   tizidir; buna göre üst tel, alt telin **bir tam ses pesidir**. Bozuk düzende sesler pesten tize şöyle sıralanır:
   **orta (Re) < üst (Sol) < alt (La)**. Grupların fiziksel sırası ile ses sırası aynı değildir. Bu yüzden "alt"
   sözcüğü "pes" anlamına gelemez.
3. Kaynaklar adlandırmayı ters de kullanabiliyor. Bazı web kaynakları uzun sap bozuk düzeni "alt Sol, üst La" diye
   veriyor, yani adları ters kullanıyor. Biz akademik tabloların ve [W]'nin kullanımını esas aldık.

**Bam teli.** Kalın, sargılı ve gruptaki çelik telden **bir oktav pes** akort edilen teldir. Kaynaklar bam telinin
yerinde ayrışıyor:
- Uzun sap / divan: bam teli **alt grupta**. [KD], Talip Özkan'ın düzeni için "alt tel öbeğini oluşturan iki çelik bir
  sargı tel" der. [TK] de "alt teldeki çelik ve bam birlikte çalınmaktadır" der. → `uzun-sap`, `divan`, `meydan`:
  alt grupta 1 bam.
- Kısa sap: yaygın tel dizilişi şöyle: alt grupta 2 × 0,18 çelik + 0,42 "ince bam", üst grupta 0,18 çelik + 0,52
  "kalın bam". Kaynağı Yandex Soru-Cevap sayfaları ve tel satıcıları; **akademik olarak doğrulanmadı**.
- Tanbura: "Her grupta tel oktavlı akort edilir. Alt ve üst tellerin yanına bir sırma, orta telin yanına cim (cin)
  teli takılır" [D]. Sırma ve cim tellerini bir oktav pes kabul ettik; **bu oktav yönü doğrulanmadı**.
- Bam teli değişkendir ve kullanıcıya göre farklılık gösterir. Kodda ana tel, gruptaki çelik teldir (`Tel.midi`).
  Bam teli `courses[].isBam` alanıyla (midi − 12) verilir. `findClosestString` frekansı ±1 oktav kaydırarak dener,
  böylece bam teli hangi grupta olursa olsun yakalanır.

## 2. "La karar" yazımı ve gerçek ses

Halk müziği notasında bağlama genelde **La karar** ile yazılır. Yazılan La, gerçek A4 = 440 Hz değildir. Sazın
boyuna ve icracının sesine göre farklı bir perdeden tınlar [KD]: "bu nota adları sembolik olarak kullanılmaktadır…
standart frekans değerlerinin dikkate alınmayabileceği anlamında". Bu yüzden veri iki katmanlıdır:
1. **Düzen**, alt tele göre yarım ses farkı olarak tutulur (alt = La = 0). Kaynak tabloları da böyle yazılıdır.
2. **Enstrüman**, alt telin gerçek sesini (`altMidi`) verir. Kullanıcı **transpoze** (−7..+7; kod −12..+12 kabul eder)
   ile bütün perdeyi kaydırır. "Re akordu", "Sol akordu" gibi pratikler bu kaydırmayla elde edilir.

Aynı düzen başka bir perdeden de yazılabilir. Bağlama düzeni [E/K]'de alt La · orta Re · üst Mi (karar Mi) diye
geçer. Kısa sap için yaygın tarif ise "alt Re · orta Sol · üst La" şeklindedir. Bu ikincisi aynı aralıkların bir
dörtlü tiz yazılışıdır ([KD] Şekil 5 de "alt tel D, orta tel G" der). Kodda kısa sap için `altMidi = Re4` aldık. Bu
değer o tarifi birebir verir: alt Re4, orta Sol3, üst La3 (üstteki kalın bam La2).

## 3. Düzenler tablosu

Notalar alt tel = La olacak şekilde normalleştirilmiştir. Gerçek ses enstrümana göre değişir (§4).
Örnek oktavlar uzun sap içindir (alt = La3 = 220 Hz).

"Nota doğrulama" sütunu, alt/orta/üst nota adlarının birbirinden bağımsız iki tabloda ([E/D] ve [K]) aynı olup
olmadığını gösterir; [KD] ve [W] ayrıca karşılaştırıldı. "Oktav" sütunu, orta ve üst telin hangi oktavda olduğunun
kaynağını verir. **W**: [W]'deki örnek perdeler kullanıldı. **Çıkarım**: hiçbir kaynakta oktav yok; grubu Bozuk
düzendeki perdesine (orta Re3, üst Sol3) en yakın oktava koyduk. Gerekçemiz şu: bir grubun tel kalınlığı sabittir,
düzen değiştirmek tel değiştirmeden birkaç yarım ses germe ya da gevşetmedir.

| Kod id | Düzen | Alt | Orta | Üst | Karar | Örnek (alt · orta · üst) | Nota doğrulama | Oktav |
|---|---|---|---|---|---|---|---|---|
| `baglama` | Bağlama düzeni | La | Re | Mi | Mi | La3 · Re3 · Mi3 | ✔ [E/D][K][KD][W] | W |
| `bozuk` | Bozuk (Kara) düzen | La | Re | Sol | La | La3 · Re3 · Sol3 | ✔ [E/D][K][KD][W] | W + [KD] perde analizi |
| `misket` | Misket düzeni | La | Re | Fa# | Fa# | La3 · Re3 · Fa#3 | ✔ [E/D][K][KD][W] | W |
| `mustezat` | Müstezat (Fa) düzeni | La | Re | Fa | Fa | La3 · Re3 · Fa3 | ✔ [E/D][K][KD][W] | W |
| `abdal` | Abdal düzeni | La | La | Sol | La | La3 · La3 · Sol3 | ✔ [E/D][K][W] | W (orta La2 varyantı da var) |
| `kutahya` | Kütahya düzeni | La | Re | Re | Re | La3 · Re3 · Re3 | ✔ [E/D][K][W] | W |
| `umi` | Ümmi düzeni | La | La | Re | La | La3 · La3 · Re4 | ✔ [E/D][K][W] | W |
| `huseyni` | Hüseyni düzeni | La | La | Mi | La | La3 · La3 · Mi3 | ✔ [E/D][K][W] | W ("most likely") |
| `acemasiran` | Acemaşiran düzeni | La | La | Fa | Fa | La3 · La3 · Fa3 | ✔ [E/D][K][W] | W ("most likely") |
| `huzzam` | Hüzzam düzeni | La | La | Fa# | Fa# | La3 · La3 · Fa#3 | ✔ [E/D][K][W] | W ("most likely") |
| `kayseri` | Kayseri (Tar) düzeni | La | Mi | La | La | La3 · Mi3 · La3 | ✔ [E/D][K][W] | W |
| `rast` | Rast düzeni | La | Do | Sol | Do | La3 · Do3 · Sol3 | ✔ [E/D][K][KD][W] | **Çıkarım** ([W]: oktav yok; "Do müstezat" için Do4 ve Do3 iki varyant) |
| `evic` | Eviç düzeni | La | Si | Sol | Si | La3 · Si3 · Sol3 | ✔ [E/D][K][KD][W] | W (Si2 varyantı da var) |
| `sabahi` | Sabahi düzeni | La | Do | La | La | La3 · Do4 · La3 | ✔ [E/D][K][W] | W |
| `yeksani` | Yeksani (Irızva) düzeni | La | Re | La | La | La3 · Re3 · La3 | ✔ [E/D][K][W] | W (Re4 varyantı da var) |
| `zirgule` | Zirgüle düzeni | La | Fa | Sol | Sol | La3 · Fa3 · Sol3 | ✔ [E/D][K][KD][W] | W |
| `cargah` | Çargâh düzeni | La | Re | Sol | Si | La3 · Re3 · Sol3 | ✔ [E/D][K][KD][W] | W (açık teller Bozuk ile aynı, karar farklı) |
| `segah` | Segâh düzeni | La | Re | Si | Si | La3 · Re3 · Si3 | ✔ [E/D][K][KD][W] | **Çıkarım** |
| `sur` | Şûr (Kürdi) düzeni | La | Mi | Si | La | La3 · Mi3 · Si3 | ✔ [E/D][K][KD][W] | **Çıkarım** |

Ek notlar:
- **Çöğür / Saz düzeni.** Neşet Ertaş'ın aktarımına göre "alt ve orta tel la, üst tel sol" [K]. Bu açık teller Abdal
  düzeniyle aynıdır. Ayrı bir kayıt açmadık; `abdal` kaydına `aliases` olarak ekledik.
- **Köroğlu düzeni** (Arsunar 1947, [KD]'nin aktarımı). Gruplar içinde farklı seslere akort edilir: alt D-D, orta
  D-G, üst D-A. Tek perdeli tel modeline sığmadığı için eklemedik. İstenirse `makeCustom` ile yaklaşık hâli kurulabilir.
- [W]'de Rast için "A, C, G", Segâh için ayrıca "A, B, G" (Eviç ile aynı) ve Yeksani için ayrıca "A, D, E" varyantları
  da geçiyor. Biz [E/D] ve [K] tablolarını esas aldık.

### Doğrulanamayanlar (veriye EKLENMEDİ)
| İstenen | Durum |
|---|---|
| **Zeybek düzeni** | **Doğrulanmadı.** İncelediğimiz akademik düzen tablolarında ([E/D], [K], [KD]) ve [W]'de "Zeybek düzeni" adlı bir düzen yok. "Zeybek" kaynaklarda bir tezene / tavır biçimi olarak geçiyor ([DU] içindekiler: "Zeybek Tavrı"). Ege zeybekleri genelde Bozuk düzende çalınır, ama bunu da birincil kaynakla doğrulamadık. |
| **Şah düzeni** | **Doğrulanmadı.** Hiçbir kaynakta bulunamadı. "Şah sazı" bir enstrüman boyu adı olabilir, ama bunu da doğrulamadık. |
| **Kalan düzeni** | **Doğrulanmadı.** Kaynaklarda bulunamadı. Aramalarda "Kalan" yalnızca bir yayınevi adı olarak çıktı. |
| **Fa düzeni** | [W] Müstezat düzenini "Müstezat (Fa)" diye adlandırıyor (karar Fa). `mustezat` kaydına "Fa düzeni" takma adı olarak eklendi. Başka bir "Fa düzeni" bulunamadı. |

## 4. Enstrümanlar: varsayılan gerçek perdeler

`altMidi`, alt telin (yazılı "La"nın) o sazdaki gerçek sesidir. Kullanıcı transpoze ile kaydırabilir.

| Kod id | Enstrüman | altMidi (alt tel) | Hz | Dayanak | Doğrulama |
|---|---|---|---|---|---|
| `kisa-sap` | Kısa sap bağlama | 62 = Re4 | 293,66 | Yaygın tarif "alt re, orta sol, üst la" (bağlama düzeni) ile [W]'nin bağlama için verdiği 220 Hz La'nın (üst tel La3) birleşimi | **Oktav doğrulanmadı** (nota adları doğrulandı) |
| `uzun-sap` | Uzun sap bağlama | 57 = La3 | 220 | [W] saz ailesi tablosu: "Bağlama — 220 Hz A — tel boyu 88 cm" | Ansiklopedi düzeyinde |
| `divan` | Divan sazı | 50 = Re3 | 146,83 | [W]: "Divan sazı — 146 Hz D — 104 cm"; [D]: 9 tel, üçerli | Ansiklopedi düzeyinde |
| `cura` | Cura | 69 = La4 | 440 | [D]: "Akordu bağlama düzeninin bir oktav tizidir"; [KA]: "bağlamadan bir oktav tiz ya da tamburadan beş ses tiz" | İki kaynak uyumlu. **[W] ise Re5 ≈ 586 Hz veriyor** (transpoze +5) |
| `tanbura` | Tanbura | 62 = Re4 | 293,66 | [W]: "Tambura — 293 Hz D — 80 cm"; [D]: 3×2 tel, oktavlı | Ansiklopedi düzeyinde |
| `meydan` | Meydan sazı (ek) | 45 = La2 | 110 | [W]: "Meydan sazı — 110 Hz A — 112 cm"; [D]: 12 tel, 30–32 perde | Ansiklopedi düzeyinde; tel dizilişi doğrulanmadı |

Örnek gerçek perdeler (transpoze 0):

| Enstrüman / düzen | Üst | Orta | Alt | Bam |
|---|---|---|---|---|
| Kısa sap / Bağlama düzeni | La3 (220) | Sol3 (196) | Re4 (293,7) | üstte La2, altta Re3 |
| Kısa sap / Bozuk | Do4 | Sol3 | Re4 | üstte Do3, altta Re3 |
| Uzun sap / Bozuk | Sol3 (196) | Re3 (146,8) | La3 (220) | altta La2 (110) |
| Uzun sap / Bağlama düzeni | Mi3 | Re3 | La3 | altta La2 |
| Divan / Bozuk | Do3 | Sol2 | Re3 | altta Re2 |
| Cura / Bağlama düzeni | Mi4 | Re4 | La4 | yok |

Doğrulamak için bağımsız bir veri noktası daha: ragajunglism.org bağlama sayfası bozuk düzen için
G 98 Hz · D 147 Hz · A 220 Hz veriyor (https://ragajunglism.org/tunings/menu/baglama/). Bu bizim uzun sap / bozuk
modelimizle uyumlu: alt La3 = 220, orta Re3 = 147 ve üst grupta Sol, 98 Hz değeriyle de Sol2'de (bir oktav pes).

## 5. Kod ile ilişki (özet)
- Gerçek MIDI = `altMidi + düzen.offsets[grup] + transpose`. `getStrings()` sözleşme gereği **pesten tize**
  sıralar. Bozukta bu sıra orta, üst, alt olur. Fiziksel sıra için `getStringsPhysical()` ya da `Tel.position`
  (0 = üst, 1 = orta, 2 = alt) kullanılır.
- `makeCustom(label, [üst, orta, alt])` mutlak MIDI alır (fiziksel sıra; `{alt, orta, ust}` nesnesi de olur). Düzeni
  `DUZENLER`'e ekler.
- Her düzende `verified` (nota adları) ve `octaveSource` (`'wikipedia'` | `'cikarim'` | `'kullanici'`) alanı var.

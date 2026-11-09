# Model card — AI domain lokal Gempur

Kandidat 0.3, 9 November 2026. Model ini adalah eksperimen **nama domain saja** dengan inferensi lokal, tanpa API AI, biaya pemakaian API, atau pengiriman target/konten ke penyedia AI. **Generalisasi pada holdout Indonesia belum memadai: simulasi kebijakan runtime menandai 7 dari 443 keluarga positif proxy (1,58%). Model tetap bantuan peninjauan, bukan detektor judol yang telah terbukti sangat akurat.**

## Tujuan dan penggunaan

Model menghasilkan sinyal untuk **peninjauan manusia** pada domain yang belum diputuskan oleh aturan yang lebih dahulu berlaku. Hasil AI memakai `reason=ml_model`, `verdict=suspected`, `action=flagged`. DNS diteruskan; sinyal model tidak otomatis memblokir. Aturan domain dikenal, aturan pribadi, diagnostik dan pengecualian tepat target tetap memiliki prioritas sendiri.

AI domain hanya tersedia pada APK privat, memerlukan pilihan AI lokal tersendiri, dan default mati termasuk setelah upgrade. Layanan deteksi lokal serta notifikasi yang terlihat juga harus aktif. Build biasa memakai stub dan tidak menyertakan aset model. Model domain tidak dipakai untuk mengklaim akurasi nama/paket aplikasi; pemeriksaan aplikasi tetap memakai heuristik terpisah.

## Metode

- Regresi logistik yang dilatih dari data, bukan daftar kata yang seluruh bobotnya ditulis manual.
- Input dinormalisasi menjadi hostname ASCII/IDNA, dengan penanda batas `^` dan `$`.
- Fitur adalah keberadaan unik potongan karakter berukuran 3–5; setiap fitur dihitung sekali per input.
- Vocabulary dipelajari dari train saja, maksimum 24.000 fitur. File model dibatasi 2 MiB, memakai koefisien finite, dan parser menolak fitur duplikat/format yang tidak valid.
- Skor 0–1 adalah skor model yang **belum dikalibrasi sebagai peluang**. Skor 0,99 tidak berarti situs 99% pasti judol atau model akurat 99%.
- Model abstain jika input/model tidak valid atau dukungan fitur terlalu sedikit: minimal 10 fitur vocabulary cocok dan rasio kecocokan minimal 0,30. Ukuran ini hanya memeriksa dukungan fitur; ia bukan pendeteksi universal data di luar distribusi.
- Ambang peninjauan dipilih memakai validation saja. Ambang 1 menonaktifkan flag model jika tidak ada operating point yang memenuhi syarat pengembangan.

Nama domain tidak mengungkap isi halaman. Model dapat gagal pada nama acak, merek baru, halaman judi pada domain institusi normal, IDN/penyamaran, dan perubahan pola. Skor rendah atau abstain tidak menetapkan target aman.

## Data dan lisensi

Sumber dipin pada commit dan SHA-256 dalam [sources.lock.json](../ml/sources.lock.json), dengan [atribusi dan lisensi](../ml/ATTRIBUTION.md). Delapan kategori UT1 menjadi pool pengembangan: gambling sebagai proxy positif; bank, press, liste_bu, sports, games, shopping dan financial sebagai proxy negatif. Sinfonietta dan 480 kandidat Indonesia arfshl dicadangkan sebagai positive source holdout.

Label kategori sumber belum merupakan penilaian independen terhadap konten situs terkini. Daftar dapat salah, usang, berisi afiliasi/game, domain yang berganti pemilik, atau situs yang diretas. Kategori negatif juga tidak menjamin setiap situs normal. Tidak ada situs dalam daftar yang dikunjungi untuk menghasilkan eksperimen ini. Contoh training tidak otomatis menjadi daftar blokir aktif; 480 kandidat Indonesia tetap kandidat review.

Data/model didistribusikan secara konservatif dengan CC BY-SA 4.0 dan atribusi terpisah dari lisensi kode aplikasi. Notice UT1, MIT Sinfonietta, BSD-3-Clause arfshl dan MPL 2.0 PSL dipertahankan; paket model menyertakan notice dan teks lisensi sumber.

## Protokol evaluasi

1. Verifikasi bytes/hash sumber dan Public Suffix List yang dipin, termasuk private suffix, wildcard dan exception.
2. Normalisasi dan kelompokkan registrable domain serta keluarga merek yang dinormalisasi lintas TLD/varian angka. Hapus konflik label; satu wakil canonical per keluarga. Ini mengurangi kebocoran, tidak membuktikan seluruh kemiripan semantik sudah hilang.
3. Cadangkan keluarga source holdout sebelum membangun train/validation/test. Bekukan split deterministik 70/15/15 sebelum fit; vocabulary hanya memakai train.
4. Pilih regularisasi dari kandidat yang telah ditetapkan dan ambang memakai validation. Bekukan selection dan hash model sebelum sekali mengevaluasi final test. Hasil final test tidak dipakai untuk retuning.
5. Laporkan model mentah, keputusan operasional pada ambang, guard runtime, baseline heuristik dan gabungan secara terpisah. Abstained positive dihitung sebagai miss untuk recall operasional.
6. Laporkan confusion matrix, precision, recall, FPR, accuracy, average precision/PR-AUC, cakupan/abstention serta confidence interval. Source holdout positif hanya mengukur recall terhadap label sumber; tidak menghasilkan precision atau FPR.

Kontrol penting dan contoh sintetis dilaporkan terpisah dari sampel empiris. Lolos domain contoh bank/pendidikan tidak membuktikan nol salah blok pada seluruh layanan penting. Split ini cross-sectional dan tidak menggantikan temporal holdout masa depan, data Indonesia yang representatif, atau uji dua HP.

## Hasil benchmark

Eksperimen `domain-ml-2026-11-09-v1` selesai pada 9 November 2026. Model dan ambang dipilih menggunakan validation, lalu final test dievaluasi setelah selection dibekukan. Reviewer menghitung ulang skor, confusion matrix dan average precision dari TSV ekspor dengan implementasi independen; metrik cocok sampai toleransi 1e-12. Lihat [laporan lengkap](../ml/evaluation.json), [selection beku](../ml/frozen_selection.json), [split manifest](../ml/split_manifest.json), dan [protokol eksperimen](../ml/experiment.json).

| Bagian | Keluarga/wakil domain | Proxy positif | Proxy negatif |
| --- | ---: | ---: | ---: |
| Train | 74.920 | 18.660 | 56.260 |
| Validation | 15.954 | 4.015 | 11.939 |
| Final test | 16.006 | 4.003 | 12.003 |
| Source holdout Indonesia | 443 | 443 | 0 |
| Source holdout Sinfonietta | 1.225 | 1.225 | 0 |

Model memakai 24.000 fitur, regularisasi `C=0.25`, dan ambang peninjauan `0.9948492012769712`; ukuran TSV 627.278 byte. SHA-256 model: `4ba29fe63c1111c7f60e50a24af72e9f9692950fe0b6b4c85f4acc45eb7dc53a`. Hash sumber/protokol/split/selection dan runtime versi tersedia pada laporan/manifest. Tersedia 69 vektor parity untuk pengujian parser/preprocessing/skor yang terpisah dari accuracy benchmark.

Grouping melaporkan nol overlap keluarga antarsplit dan antara pool dengan source holdout. Sebanyak 605 keluarga konflik label/4.888 baris dikeluarkan; 1.051 baris pool dicadangkan karena keluarga source holdout. Kedua feed holdout masih berbagi satu keluarga; total union 1.667 keluarga, bukan dua sumber yang sepenuhnya independen. Kemiripan merek dengan stem berbeda, provenance bersama dan temporal leakage belum seluruhnya diselesaikan.

Hasil berikut mengukur **kesesuaian dengan label kategori sumber pada final test**, bukan verifikasi isi situs. Baris guard runtime/gabungan memakai kebijakan acuan dalam evaluator; ini simulasi keputusan, bukan pengukuran layanan Android, notifikasi atau perangkat nyata:

| Keputusan | Flag positif | Precision | Recall | FPR | Accuracy |
| --- | ---: | ---: | ---: | ---: | ---: |
| Heuristik lama | 3 | 100,00% | 0,0749% | 0,0000% | 75,01% |
| Model ambang 0,5, dengan abstention | 3.874 | 95,22% | 92,16% | 1,5413% | 96,88% |
| Model pada ambang peninjauan terpilih | 2.563 | 99,57% | 63,75% | 0,0916% | 90,87% |
| Simulasi sinyal AI setelah guard runtime | 2.563 | 99,57% | 63,75% | 0,0916% | 90,87% |
| Gabungan heuristik dan sinyal tinjauan AI | 2.563 | 99,57% | 63,75% | 0,0916% | 90,87% |

Pada ambang terpilih: **TP 2.552, FP 11, TN 11.992, FN 1.451**. Sebanyak 270 input abstain karena dukungan fitur, sehingga coverage keputusan model 98,31%; abstained positive tetap dihitung sebagai miss. Average precision skor mentah adalah 97,88% (implementasi average precision, bukan luas PR trapezoidal atau ukuran kalibrasi). Gabungan memberi 2.560 sinyal tambahan terhadap tiga flag heuristik, tetapi sinyal tambahan tersebut tidak semuanya benar. Hanya heuristik lama dapat memblokir; flag model/gabungan tidak sama dengan blokir AI.

Precision 99,57% berarti 2.552 dari 2.563 flag cocok dengan **label proxy test ini**. Ia bukan accuracy 99,57%; accuracy-nya 90,87%, dan 1.451 dari 4.003 positif terlewat. Precision 100% heuristik lama juga tidak berarti efektif: hanya tiga positif terdeteksi dan batas bawah precision satu sisi 95%-nya 36,84%.

| Batas statistik satu sisi 95%, ambang terpilih | Hasil | Target numerik gate |
| --- | ---: | ---: |
| Precision lower bound | 99,29% | ≥99% |
| Recall lower bound | 62,48% | Dilaporkan, bukan disembunyikan |
| FPR upper bound | **0,1516%** | ≤0,1% — **belum terpenuhi** |

Interval menggunakan Clopper–Pearson. Interpretasinya dibatasi label proxy dan ketergantungan sumber/keluarga yang mungkin tersisa; interval ini bukan jaminan performa deployment.

### Source holdout dan kegagalan generalisasi

| Holdout positif-only | Support | Flag model terpilih | Recall model | Flag kebijakan acuan | Recall kebijakan acuan | Recall diagnostik ambang 0,5 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Indonesia arfshl | 443 | 8 | 1,81% | 7 | **1,58%** | 32,73% |
| Sinfonietta | 1.225 | 104 | 8,49% | 104 | **8,49%** | 61,71% |

Ada 15 abstention pada holdout Indonesia dan 29 pada Sinfonietta. Recall rendah ini material: ambang yang konservatif pada UT1 tidak berpindah dengan baik ke sumber/merek lain. Menurunkan ambang menaikkan recall, tetapi menaikkan false positive pada final test; angka ambang 0,5 hanya diagnostik, tidak dipilih setelah melihat holdout. Karena tidak memiliki negatif, kedua holdout tidak menghasilkan accuracy, precision atau FPR. Tidak ada retuning berdasarkan hasil tersebut untuk kandidat ini. Angka kebijakan acuan belum membuktikan deteksi/latency/baterai pada HP Android.

### Challenge dan prevalensi

Challenge terpisah memuat 12 domain penting pilihan pengembang, enam kontrol negatif sintetis dan enam contoh positif sintetis. Model mentah pada ambang peninjauan memberi satu false flag dari 18 negatif (`research-casino-jackpot.example`); guard runtime menekan flag fixture tersebut. Nol blok AI adalah konsekuensi mode advisory. Guard juga menekan fixture positif `.example`, sehingga hasil challenge bukan bukti cakupan judol nyata atau nol FPR populasi.

Dengan asumsi TPR/FPR titik yang sama tetap berlaku, ilustrasi precision berubah menjadi sekitar 41,05% jika prevalensi positif hanya 0,1%, 87,54% pada prevalensi 1%, dan 98,72% pada prevalensi 10%. Ini perhitungan hipotetis dari dua rate proxy, bukan estimasi prevalensi pengguna atau jaminan precision dunia nyata.

Bukti 100 tes versi 0.2 tetap pengujian perilaku program, bukan pengukuran akurasi AI. Gate source final **0.3.0-alpha.1** lulus **120 eksekusi tes** (80 Node, 24 engine, 8 client biasa dan 8 client privat), lint kedua varian 0 issue, verifikasi 69 vektor Python–Java parity, serta 13 tes protokol Python yang dilaporkan terpisah. [Evidence build AI](evidence/2026-11-09-local-ai-build.json) mengikat source/model/report/artifact. Keberhasilan gate software ini tidak memenuhi gate ilmiah pemblokiran otomatis; tidak ada uji akurasi/performa pada HP nyata yang diklaim oleh benchmark ini.

## Gate pemblokiran otomatis

`autoQuarantineEligible=false`. Data berlabel independen yang telah diadjudikasi: **0** pada protokol awal. Angka tinggi terhadap proxy feed tidak membuka gate ini.

Syarat gate mencakup label real-world independen, batas bawah precision satu sisi 95% minimal 99%, batas atas FPR maksimal 0,1%, nol false block pada critical challenge, dan source/family holdout yang relevan. Cakupan/recall harus tetap dilaporkan agar model yang hampir selalu diam tidak dipasarkan sebagai detektor efektif.

Precision bergantung pada prevalensi: hasil pada test set campuran tertentu tidak otomatis berlaku pada aktivitas sehari-hari yang sebagian besar normal. Confidence interval dan ilustrasi prevalensi diperlukan; nol false positive pada sampel kecil bukan bukti FPR populasi nol.

## Runtime, privasi dan operasi

Model dan manifest immutable ikut APK; tidak ada download model atau inference cloud. Manifest memeriksa hash/ukuran/versi/jumlah fitur. Model hilang atau rusak menyebabkan abstain, bukan keputusan aman atau penghapusan data pengguna. Python–Java parity menguji preprocessing, skor dan keputusan, terpisah dari pengukuran akurasi.

Peserta dapat meninjau nama domain secara lokal tanpa membuka situs atau membuat laporan deteksi. Dalam jalur DNS nyata, metadata temuan AI hanya mengikuti grant domain yang telah disetujui. Skor/model version tetap lokal; payload tidak menambahkan isi halaman, URL lengkap atau inventaris.

Backend pendamping harus versi 0.3 dan menyatakan `localDomainAiSignals:true` sebelum sinyal AI dibagikan. AI lokal dapat dipakai tanpa backend bila berbagi otomatis mati. Mematikan **analisis AI baru** tidak menarik kembali temuan lama dalam antrean; hentikan berbagi otomatis dan sinkronkan pencabutannya untuk menghentikan pengiriman.

Batas DNS-only, DoH/DoT/IP langsung/TCP DNS/VPN lain, lifecycle Android/OEM, baterai, throughput DNS, notifikasi dua HP serta hosting HTTPS tetap mengikuti [release readiness](RELEASE_READINESS.md) dan [panduan privat](PRIVATE_TEST_GUIDE.md). Penambahan AI tidak membuktikan gap tersebut selesai.

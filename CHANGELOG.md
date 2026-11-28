# Changelog

## 0.3.13-alpha.1 — 28 November 2026

- Conditional401 stop mengikat akun, epoch dan generasi consent; fence pemilik menahan aktivasi sampai cleanup dan efek stop selesai. Rejected instance tidak memiliki cleanup consent. Tidak mengklaim crash atomicity atau QA lifecycle HP.

## 0.3.12-alpha.1 — 27 November 2026

- Recheck konteks akun untuk hasil/error client, serta epoch/account/instance sebelum401 menghentikan sesi privat. Tidak mengklaim atomic isolation; generic state/backoff dan QA heldrequest masih perlu ditinjau.

## Tooling — 26 November 2026

- Audit offline catatan review domain berbasis hash; validasi metadata/duplikasi/split dan ringkasan kesepakatan yang masih berupa assertion. Tidak ada data regional baru, training atau perubahan APK runtime.

## 0.3.11-alpha.1 — 25 November 2026

- Tolak status HTTP non-final/tidak valid dan UTF-8 rusak sebelum parsing body sukses; pertahankan status error,401, batas ukuran dan proof pencabutan. Tiga tes transport JVM baru per varian; bukan bukti live HTTP atau QA HP.

## 0.3.10-alpha.1 — kandidat 24 November 2026

- HTTP401 mengakhiri request sebelum body error dibuka/diurai. HTTP error lain mempertahankan status ketika body diagnostik rusak, tidak terbaca atau terlalu besar; respons sukses tetap ketat terhadap error I/O dan batas262144byte. Tidak mengubah protokol consent atau data pengguna.

## Tooling — 23 November 2026

- Diagnostik waktu offline untuk parser DNS, lookup aturan dan inferensi model mentah pada JVM host. Fixture sintetis, batas workload, hash source/model dan laporan JSON. Bukan bukti latensi DNS Android, baterai atau akurasi. Versi aplikasi tetap0.3.9-alpha.1/code12.

## 0.3.9-alpha.1 — kandidat 22 November 2026

- Retry inbox temuan dipisahkan dari dashboard bantuan/koreksi. Inbox gagal memakai backoff tersendiri; HTTP401 tetap mengakhiri sesi. Ini tidak menjamin interval/performa notifikasi pada HP.

## 0.3.8-alpha.1 — kandidat 21 November 2026

- Pemulihan consent lokal setelah proses mati memutus grant berbagi lama secara durable sebelum deteksi lokal dapat diaktifkan. Riwayat tetap disimpan, binding unggah dibersihkan, dan penanda server-off harus disinkronkan sebelum consent berbagi baru.

## 0.3.7-alpha.1 — kandidat 20 November 2026

- Validasi laporan pola nama hanya menerima tindakan ditandai untuk tinjauan. Riwayat server lama tetap terbaca.
- [Laporan pengujian](docs/development/2026-11-19.md).

## Tooling lab privat — 18 November 2026

- Tambah preflight yang membaca status ADB reverse untuk kedua HP dan capability backend loopback tanpa menggunakan proxy.
- [Laporan pengujian](docs/development/2026-11-18.md).

## Tooling upgrade privat — 17 November 2026

- Tambah tool signing lokal untuk APK privat dari evidence penuh. Output dibuat hanya jika sertifikat cocok dengan APK lama dan versionCode naik.
- [Laporan pengujian](docs/development/2026-11-17.md).

## 0.3.6-alpha.1 — kandidat 16 November 2026

- Prioritaskan polling bantuan dan koreksi sebelum inbox temuan. Lewati inbox saat grant berbagi nonaktif atau cooldown ringkasan masih berjalan.
- Sediakan tombol terpisah untuk memuat bantuan dan koreksi di aplikasi. Waktu tunggu retry memakai jam monoton Android.
- [Laporan pengujian](docs/development/2026-11-16.md).

## 0.3.5-alpha.1 — kandidat 15 November 2026

- Pertahankan penanda penghentian berbagi saat konfirmasi server kosong, masih aktif, atau membawa versi izin lama. Cocokkan penanda yang tersimpan sebelum menampilkan penghentian diterima.
- [Laporan pengujian](docs/development/2026-11-15.md#validasi-konfirmasi-pencabutan-di-android).

## Pengujian backend · 15 November 2026

- Tambah tes integrasi SQLite untuk memastikan pencabutan berbagi bertahan setelah backend dibuka kembali dan laporan dengan versi izin lama tetap ditolak.
- [Laporan pengujian](docs/development/2026-11-15.md).

## Perangkat uji · 14 November 2026

- Tambah launcher lab USB yang mengikat backend privat ke loopback dan menyediakan database uji terpisah.
- [Laporan pengujian](docs/development/2026-11-14.md).


## Perangkat uji · 13 November 2026

- Tambah pemeriksaan offline untuk membandingkan signature, application ID privat dan versionCode sebelum upgrade.
- [Laporan pengujian](docs/development/2026-11-13.md).


## 0.3.4-alpha.1 — kandidat 12 November 2026

- Ringkas temuan pendamping dengan jeda 60 detik. Tampilkan permintaan bantuan dan koreksi pada kartu terpisah.
- [Laporan pengujian](docs/development/2026-11-12.md).


## 0.3.3-alpha.1 — kandidat 11 November 2026

- Pindahkan penulisan temuan privat dari jalur respons DNS ke antrean terbatas. Periksa kembali persetujuan sebelum menyimpan temuan tertunda.
- [Laporan pengujian](docs/development/2026-11-11.md).


## 0.3.2-alpha.1 — kandidat 10 November 2026

- Dugaan nama domain/aplikasi ditandai untuk ditinjau, tanpa blokir koneksi atau HOME.
- Konteks berita, edukasi, bantuan dan pemulihan menekan dugaan heuristik; aturan eksplisit tetap berlaku.
- Validasi/release gate: [laporan harian](docs/development/2026-11-10.md). Model V1 tetap beku.


## 0.3.0-alpha.1 — eksperimen AI domain lokal, 2026-11-09

- Model char-ngram regresi logistik yang dilatih dari kategori domain publik dan berjalan offline di APK privat, dengan pilihan AI terpisah yang default mati.
- Sinyal model advisory-only: suspected/flagged, tidak otomatis memblokir. Aturan blokir yang ada tetap berlaku; aplikasi tetap memakai heuristik terpisah.
- Parser bounded, integritas hash manifest, dukungan fitur/abstention dan Python–Java parity; kegagalan model tidak menjadi safe verdict atau reset data.
- Dataset/pin/lisensi, split family/source holdout, selection validation-only, evaluasi final terpisah, serta model card yang memisahkan proxy accuracy dari klaim real-world.
- Backend menerima ml_model hanya untuk domain+suspected+flagged dan mengiklankan localDomainAiSignals; UI menahan sharing pada backend lama. Payload tidak menambahkan skor, isi halaman atau inventaris.
- Preview domain lokal tidak membuka situs atau membuat laporan. Mematikan analisis baru tidak menghapus antrean yang telah disetujui; penghentian sharing tetap terpisah.

Benchmark beku dan perhitungan ulang independen tersedia: test 16.006, precision 99,57%, recall 63,75%, accuracy 90,87%, FPR 0,0916%; source holdout Indonesia pada simulasi kebijakan acuan 7/443 (1,58%), bukan pengukuran HP. Batas atas FPR95 0,1516% dan ketiadaan label independen membuat auto-quarantine tetap ineligible. [Model card](docs/LOCAL_AI_MODEL_CARD.md) menjelaskan kegagalan generalisasi serta tradeoff. [Gate source AI](docs/evidence/2026-11-09-local-ai-build.json) lulus 120 eksekusi tes, kedua lint 0 issue, 69 vektor parity dan 13 tes protokol Python terpisah. Tidak ada klaim AI sangat akurat pada seluruh judol, aplikasi, semua browser, atau HP nyata.

Verifikasi kandidat 0.2 pada 9 November 2026: 100 tes PASS, lint biasa/privat 0 issue, kedua APK terverifikasi, AAB biasa unsigned, instrumentation dikompilasi. Source dan evidence cocok; uji emulator/HP/dua perangkat/baterai belum dilakukan. Lihat [bukti](docs/evidence/2026-11-09-private-build.json).

## 0.2.0-alpha.1 — kandidat uji privat, 2026-11-09

- Varian `privateDebug` dan identitas aplikasi terpisah; debug/release biasa tetap tanpa monitoring dewasa otomatis.
- Pilihan deteksi tambahan lokal dan persetujuan berbagi temuan otomatis yang terpisah, terikat pasangan serta cakupan domain/aplikasi.
- Deteksi berbasis aturan/nama dengan status dugaan yang jelas, antrean terenkripsi terbatas, penggabungan temuan, expiry dan penolakan domain diagnostik.
- Penjaga aplikasi opsional berbasis nama paket Accessibility; aksi HOME, tanpa pembacaan teks layar, suspend aplikasi atau uninstall blocking.
- Pemindaian aplikasi dibatasi query MAIN/LAUNCHER; tidak meminta QUERY_ALL_PACKAGES pada varian mana pun dan tidak mengklaim cakupan headless/seluruh inventaris.
- Kotak temuan dan tinjauan koreksi native pendamping; polling foreground sekitar 30 detik dengan notifikasi umum, bukan FCM/Web Push.
- Koreksi salah blok tepat domain/paket, satu kali izin, cooldown 10 menit dan TTL maksimum 30 menit; peserta menerapkan lokal.
- Server privat default mati, versi grant/scope terpisah, deduplikasi, retensi dan pembersihan pada revoke/logout/delete.
- Hapus riwayat deteksi lokal mempertahankan catatan check-in dan penanda penghentian server tertunda; penghentian lokal tidak disajikan sebagai bukti revokasi server.

Verifikasi penuh 0.2 tercatat pada bukti historis di atas. Tidak ada klaim uji HP, operasi 24/7, seluruh website/aplikasi terdeteksi, hosting siap, atau persetujuan Play. Daftar 10 seed domain dan 480 kandidat Indonesia pending review belum diperluas oleh fitur ini.

## 0.1.0-alpha.1 — 2026-11-09

### Implementasi awal

- Aplikasi Android Java native dengan proteksi DNS lokal yang terlihat.
- Catatan check-in terenkripsi dan rencana pengalihan lokal.
- Pairing sukarela, snapshot manual, permintaan dukungan, koreksi domain terarah, revokasi.
- Backend Node.js 24/SQLite dan dashboard pendamping responsif, tanpa SDK analytics.
- Parser DNS/IPv4/UDP defensif dan aturan domain berlisensi/provenance.
- Verifikasi paket aturan RSA; distribusi pembaruan belum aktif sampai release public key diprovisikan.
- Verifier mandiri untuk tes, lint, APK debug, AAB unsigned dan kompilasi instrumentation APK; workflow Actions awal dihentikan atas pilihan pemilik.
- Dokumen rilis, privasi, deklarasi Play dan rencana pengembangan.

### Penggantian jalur build

- Full gate dengan evidence source/report/artifact, hash, freshness dan penolakan PARTIAL/FAIL.
- Pengemas ZIP yang hanya menerima evidence penuh yang cocok dengan source saat ini.
- 14 tes verifier ditambahkan; run penuh 55 tes PASS dan lint 0 issue.
- Environment build membatasi credential yang diteruskan; log menyamarkan secret termasuk JVM options.
- Fixture reset instrumentasi memerlukan emulator terisolasi dan opt-in eksplisit; tidak ada tes perangkat otomatis.

### Batas rilis

Ini alpha pengembangan. Coverage DNS tidak mencakup semua browser/jalur, daftar Indonesia belum dipromosikan, tidak ada hosting bawaan atau persetujuan Play. Lihat matriks readiness untuk hasil aktual tiap gate.


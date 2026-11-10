# Changelog

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


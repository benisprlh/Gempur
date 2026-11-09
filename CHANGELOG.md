# Changelog

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

Verifikasi penuh kandidat ini masih perlu dicatat setelah source final. Tidak ada klaim uji HP, operasi 24/7, seluruh website/aplikasi terdeteksi, hosting siap, atau persetujuan Play. Daftar 10 seed domain dan 480 kandidat Indonesia pending review belum diperluas oleh fitur ini.

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


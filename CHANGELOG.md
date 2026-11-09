# Changelog

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


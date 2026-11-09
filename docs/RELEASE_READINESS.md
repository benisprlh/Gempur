# Release Readiness

Terakhir diperbarui: 9 November 2026. **Tabel ini bukan sertifikasi bahwa seluruh fitur sudah selesai.** Implementasi dan hasil aktual harus ditambahkan bersama commit/source fingerprint serta evidence run oleh pengembang setelah pengujian.

Status: `PENDING` belum dibuktikan; `CODE` kode tersedia tetapi belum memenuhi seluruh bukti; `PASS` bukti penerimaan tersedia; `BLOCKED` dependency menghalangi; `DEFERRED` di luar alpha dengan batas jelas.

## Requirement MVP

| Requirement PRD | Kemampuan | Status awal | Bukti yang wajib dicatat |
| --- | --- | --- | --- |
| FR-01 | Proteksi dan berbagi memiliki persetujuan terpisah | CODE | Uji menolak berbagi tetapi proteksi lokal tetap dipakai |
| FR-02/03 | Domain filtering lokal tanpa dependency backend | CODE | Tes mesin dan uji DNS di HP nyata; batas jaringan dicatat |
| FR-04 | Pembaruan aturan terverifikasi dan pemulihan | CODE | Tanda tangan salah, paket rusak, downgrade, restart saat update |
| FR-05 | Aturan domain lokal | CODE | IDN, subdomain, batas domain, input keliru, persistensi |
| FR-06 | Status lokal akurat | CODE | Restart, VPN lain, revokasi izin, proses mati |
| FR-07 | Pairing satu kali dengan konfirmasi peserta | CODE | Replay, expiry, identitas, akses lintas pengguna |
| FR-08/09 | Snapshot dipilih peserta dan dibaca pendamping | CODE | Tidak upload otomatis; cap waktu; tidak dianggap status langsung |
| FR-10 | Permintaan dukungan | CODE | Offline, kedaluwarsa, server menerima, read acknowledgement |
| FR-11/17 | Check-in dan rencana dukungan lokal | CODE | Pilihan skip, simpan/hapus, aksi pengguna sebelum berbagi |
| FR-12/13 | Koreksi salah blok terbatas | CODE | Target-bound, masa tunggu, TTL, no global unlock, replay |
| FR-14 | Revokasi | CODE | Pengiriman berhenti lokal, queued payload dibuang, server grant dicabut |
| FR-15 | Ekspor/hapus akun | CODE | Hapus data terkait, sesi/grant, konfirmasi; URL eksternal nyata |
| FR-16 | Laporan domain terlewat | CODE | Usulan tidak otomatis menjadi daftar global; pratinjau tanpa path/query |
| FR-18/19 | Blok jaringan/interupsi aplikasi | DEFERRED | Bukan klaim DNS-only alpha; butuh mekanisme dan review tambahan |
| FR-20 | Telemetri otomatis aktivitas dewasa | DEFERRED | Tidak diaktifkan; penggunaan dewasa memerlukan validasi produk/distribusi |

## Build dan kualitas

- [x] Verifier penuh `node tools/verify.mjs` menghasilkan PASS dan `mergeEligible=true` pada source kandidat 9 November 2026; quick/PARTIAL tidak cukup. Perubahan source berikutnya wajib verifikasi baru.
- [x] Evidence mencatat tes server/tooling/verifier, engine dan client Android, lint, exit code serta source fingerprint yang cocok.
- [x] Verifier menghasilkan APK/AAB baru yang cocok dengan checksum evidence; status signing dicatat.
- [x] Review independen selesai; main tidak memiliki branch protection pada pemeriksaan kandidat ini. Jangan mengubah atau melewati proteksi jika konfigurasi berikutnya berbeda.
- [ ] APK dipasang dan diuji pada HP nyata; emulator saja tidak cukup.
- [ ] Android 10+ yang diklaim didukung memiliki bukti versi/OEM yang jelas.
- [ ] Uji Wi-Fi, data seluler, IPv4/IPv6, browser utama, dan resolver yang relevan.
- [ ] Batas DoH/DoT/direct IP/TCP DNS/VPN lain ditampilkan sebelum mengaktifkan proteksi.
- [ ] Tidak mengklaim always-on/lockdown pada DNS-only alpha.
- [ ] Uji 24 jam, baterai, restart, jaringan berpindah, dan proses dihentikan.
- [ ] Telepon, autentikator, komunikasi, bank, akses bantuan, dan aplikasi penting tetap berfungsi.
- [ ] Tidak ada bug kritis privasi, credential leak, atau akses lintas peserta.
- [ ] Daftar domain produksi memiliki sumber/lisensi dan proses false-positive yang layak.
- [ ] Pemulihan data, migrasi, backup, dan rollback diuji sebelum pengguna nyata bergantung pada layanan.

## Play Console dan operasional

| Item | Status awal | Penanggung jawab/hasil yang diperlukan |
| --- | --- | --- |
| Akun developer dan verifikasi identitas | BLOCKED | Pemilik menyediakan akun yang sudah dapat digunakan; jangan menebak tipe/umur akun |
| Application ID final | PENDING | Tetapkan sebelum signed testing; jangan ganti setelah pengguna mengandalkannya |
| Upload key dan Play App Signing | BLOCKED | Pemilik menetapkan identitas signing dan penyimpanan aman |
| Target SDK 36 | PENDING | Periksa hasil manifest artifact final |
| VPN declaration dan demo disclosure | PENDING | Video perilaku aktual dan alasan API; penerimaan belum dijamin |
| Foreground-service declaration | PENDING | Cocokkan manifest dan penggunaan nyata; specialUse perlu penjelasan use case |
| Data safety | PENDING | Audit data aktual termasuk backend, DNS upstream, SDK, dan sharing |
| Health apps declaration | PENDING | Nilai fitur check-in/dukungan perilaku; jangan otomatis memilih “tidak ada fitur kesehatan” |
| Privacy policy publik | BLOCKED | URL HTTPS publik, pengelola dan kontak privasi yang nyata |
| Penghapusan akun dari luar app | BLOCKED | URL berfungsi dan mekanisme verifikasi/penghapusan, bila app menyediakan akun |
| Backend pendamping publik dengan HTTPS | BLOCKED | Hosting, domain, backup, enkripsi volume, pemantauan, dan pemilik layanan |
| Store icon/screenshot/content rating | PENDING | Aset aktual dari build, target usia akurat, tanpa klaim palsu |
| Tester dan bukti closed testing | BLOCKED | Jika syarat akun personal baru berlaku: ≥12 tester, ≥14 hari opt-in terus-menerus |
| Production access dan app review | BLOCKED | Keputusan Google yang benar-benar diterima |

## Rekam keputusan rilis

Setiap kandidat harus menambahkan: versi, commit/source fingerprint, tanggal, daftar tes dan hasil, perangkat, lokasi evidence run, checksum artifact, known issues, status signing, keputusan go/no-go, serta alasan penundaan. Jangan mengubah kotak menjadi selesai hanya karena kode terlihat benar.


## Riwayat Actions dan penggantian jalur build — 9 November 2026

[Run awal](https://github.com/benisprlh/Gempur/actions/runs/42550373915) tidak memulai job karena anotasi GitHub: “The job was not started because your account is locked due to a billing issue.” Kegagalan historis ini tidak dinyatakan sebagai tes yang lulus.

Pemilik kemudian memilih build tanpa GitHub Actions. Kedua workflow Actions dihentikan dan jalur aktif diganti secara eksplisit dengan verifier mandiri. Pemulihan billing bukan dependency build atau merge rutin. Merge sekarang mensyaratkan verifikasi penuh PASS, `mergeEligible=true`, source sesuai bukti, review independen, dan kepatuhan pada proteksi branch yang benar-benar berlaku. Ini tidak menghapus gate produk/Play atau mengizinkan melewati tes aktif yang gagal.

Lihat [LOCAL_BUILD.md](LOCAL_BUILD.md) untuk menjalankan jalur yang baru. Run penuh `20261109T033847522Z-6382b1` telah lulus 55 tes dengan lint 0 issue dan source fingerprint sebelum/sesudah yang sama. [Bukti build mandiri](evidence/2026-11-09-standalone-build.json) mencatat hasil aktual; pemeriksaan ulang evidence juga PASS. Review independen mencakup jalur FAIL nyata, penolakan PARTIAL, checksum, serta pengamanan data instrumentasi. Hasil ini bukan attestation CI independen atau kelulusan perangkat/Play.

FR-04 masih memerlukan release public key dan jalur distribusi aturan produksi. FR-10 belum memiliki push notification; permintaan terlihat ketika dashboard diperbarui. Browser visual E2E belum lulus karena lingkungan lokal menolak socket Chromium dan cloud browser tidak dapat membuka server loopback.

## Bukti build lokal final — 9 November 2026

- `:engine:test`: 8 tes PASS.
- `:app:testDebugUnitTest`: 3 tes PASS.
- `:app:lintDebug`: PASS, 0 issue pada laporan lint.
- `:app:assembleDebug`, `:app:bundleRelease`, `:app:assembleDebugAndroidTest`: PASS.
- APK diverifikasi menggunakan apksigner; application ID `id.gempur.app.debug`, min SDK29, target SDK36.
- Release AAB unsigned. Tidak ada identitas produksi yang diklaim.
- Instrumentation APK dikompilasi, tetapi emulator dan HP nyata BELUM dijalankan.
- [Manifest bukti dan checksum](evidence/2026-11-09-local-build.json).
- [Panduan signing lokal terpisah](SIGNING.md); konfigurasi belum dieksekusi dengan kunci produksi.

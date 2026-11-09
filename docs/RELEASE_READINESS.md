# Release Readiness

Terakhir disiapkan: 9 November 2026. **Tabel ini bukan sertifikasi bahwa seluruh fitur sudah selesai.** Implementasi dan hasil aktual harus ditambahkan bersama commit SHA/tautan CI oleh pengembang setelah pengujian.

Status: `PENDING` belum dibuktikan; `CODE` kode tersedia tetapi belum memenuhi seluruh bukti; `PASS` bukti penerimaan tersedia; `BLOCKED` dependency menghalangi; `DEFERRED` di luar alpha dengan batas jelas.

## Requirement MVP

| Requirement PRD | Kemampuan | Status awal | Bukti yang wajib dicatat |
| --- | --- | --- | --- |
| FR-01 | Proteksi dan berbagi memiliki persetujuan terpisah | PENDING | Uji menolak berbagi tetapi proteksi lokal tetap dipakai |
| FR-02/03 | Domain filtering lokal tanpa dependency backend | PENDING | Tes mesin dan uji DNS di HP nyata; batas jaringan dicatat |
| FR-04 | Pembaruan aturan terverifikasi dan pemulihan | PENDING | Tanda tangan salah, paket rusak, downgrade, restart saat update |
| FR-05 | Aturan domain lokal | PENDING | IDN, subdomain, batas domain, input keliru, persistensi |
| FR-06 | Status lokal akurat | PENDING | Restart, VPN lain, revokasi izin, proses mati |
| FR-07 | Pairing satu kali dengan konfirmasi peserta | PENDING | Replay, expiry, identitas, akses lintas pengguna |
| FR-08/09 | Snapshot dipilih peserta dan dibaca pendamping | PENDING | Tidak upload otomatis; cap waktu; tidak dianggap status langsung |
| FR-10 | Permintaan dukungan | PENDING | Offline, kedaluwarsa, server menerima, read acknowledgement |
| FR-11/17 | Check-in dan rencana dukungan lokal | PENDING | Pilihan skip, simpan/hapus, aksi pengguna sebelum berbagi |
| FR-12/13 | Koreksi salah blok terbatas | PENDING | Target-bound, masa tunggu, TTL, no global unlock, replay |
| FR-14 | Revokasi | PENDING | Pengiriman berhenti lokal, queued payload dibuang, server grant dicabut |
| FR-15 | Ekspor/hapus akun | PENDING | Hapus data terkait, sesi/grant, konfirmasi; URL eksternal nyata |
| FR-16 | Laporan domain terlewat | PENDING | Usulan tidak otomatis menjadi daftar global; pratinjau tanpa path/query |
| FR-18/19 | Blok jaringan/interupsi aplikasi | DEFERRED | Bukan klaim DNS-only alpha; butuh mekanisme dan review tambahan |
| FR-20 | Telemetri otomatis aktivitas dewasa | DEFERRED | Tidak diaktifkan; penggunaan dewasa memerlukan validasi produk/distribusi |

## Build dan kualitas

- [ ] CI server tests lulus pada commit kandidat.
- [ ] CI engine tests, Android unit tests, lint dan assembleDebug lulus.
- [ ] CI bundleRelease menghasilkan AAB, dengan status signing dicatat.
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

Setiap kandidat harus menambahkan: versi, commit SHA, tanggal, daftar tes dan hasil, perangkat, URL workflow, checksum artifact, known issues, status signing, keputusan go/no-go, serta alasan penundaan. Jangan mengubah kotak menjadi selesai hanya karena kode terlihat benar.


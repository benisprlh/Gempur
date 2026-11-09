# Development Log

## 9 November 2026 — kandidat privat 0.2

Pemilik memilih APK uji privat untuk deteksi tambahan, pemblokiran dan laporan otomatis kepada pendamping. Build biasa tetap manual; privateDebug terpisah menggunakan consent lokal dan sharing terpisah, cakupan domain/aplikasi, grant/version/epoch terikat pasangan, serta antrean terenkripsi berbatas waktu. Domain dikenal/pribadi dan dugaan nama dipisahkan. App guard hanya memproses paket aplikasi launcher yang terlihat, dengan Accessibility opsional dan HOME; bukan pembacaan layar atau firewall aplikasi.

Native companion dapat mengambil temuan dan permintaan koreksi sekitar 30 detik lewat layanan yang terlihat; dashboard web memperbarui saat terbuka. Status diterima server, diminta ke OS dan dibaca dibedakan. Izin satu target domain/paket ditinjau pendamping, menunggu 10 menit, berlaku maksimal 30 menit setelah cooldown, dan diterapkan peserta. Stop lokal menyimpan pending pencabutan server secara durable; tidak mengklaim server sudah mencabut ketika offline.

Review menemukan dan memperbaiki race origin/token, callback Activity lama, vault lintas instance, pengaktifan terlambat setelah revoke, notifikasi setelah izin berubah, pending server-off dan salah ack pada profil berbeda. Tidak ada QUERY_ALL_PACKAGES, penonaktifan lint, anti-uninstall atau upload seluruh histori/inventaris. Source scanner/resource privat dipisahkan dari stub build biasa.

Run final `20261109T044031466Z-7b1096`: full PASS, 70 Node + 16 engine + 7 client biasa + 7 client privat = 100 tes; lint keduanya 0 issue. APK biasa/privat, AAB biasa unsigned dan instrumentation APK berhasil dibuat; kedua APK diverifikasi. Evidence diperiksa ulang dan pengemas ZIP berhasil. [Bukti kandidat](evidence/2026-11-09-private-build.json), [panduan dua HP](PRIVATE_TEST_GUIDE.md). Uji emulator/HP, notifikasi dua HP, aksesibilitas nyata, baterai dan latency DNS tetap belum terbukti. Tidak ada hosting publik, signing produksi atau pengajuan Play.

## 2026-11-09 — Bootstrap alpha

### Tujuan

Menyiapkan implementasi Android, companion API/dashboard, fondasi pengujian, dan rencana rilis dengan klaim yang sesuai kemampuan nyata.

### Riset yang memengaruhi keputusan

- Target app baru Google Play saat ini adalah API 36. Build direncanakan memakai AGP 8.10.1, Gradle 8.11.1, dan JDK 17; kompatibilitas AGP 8.10 dengan API 36 dikonfirmasi dari dokumentasi Android.
- Akun personal baru tertentu memerlukan closed testing 12 tester selama 14 hari berturut-turut. Tanggal produksi harus mengikuti opt-in aktual dan review Google.
- DNS-only VPN memiliki cakupan terbatas. Always-on/lockdown tidak dijanjikan untuk mesin awal karena non-DNS traffic tidak dirutekan penuh ke tunnel.
- Consent dewasa tidak otomatis mengesahkan remote activity monitoring di Google Play. Baseline produk tetap proteksi lokal dan tindakan berbagi yang dipicu peserta.
- Check-in perilaku dan dukungan terkait kecanduan perlu dievaluasi pada Health apps declaration; tidak cukup menganggap aplikasi hanya utility tanpa melihat fungsi aktual.

### Perubahan

- Workflow CI server + Android ditambahkan, termasuk artifact debug APK, unsigned release AAB, checksum dan laporan.
- Rencana rilis bersyarat, requirement traceability, panduan privasi/deklarasi Play, template bug/PR, dan aturan pengembangan berkelanjutan ditambahkan.
- Implementasi, integrasi, dan hasil pengujian kode dicatat oleh pengembang pada bagian berikut setelah benar-benar dijalankan.

### Validasi aktual

Belum ada hasil build/perangkat yang dicatat oleh dokumen bootstrap ini. Isi bagian ini dengan command, exit status, jumlah tes, commit, dan link CI; jangan menganggap status ini sebagai hasil gagal atau sukses.

### Blocker yang diketahui

- Belum ada bukti uji HP nyata, verifikasi Play Console, signing produksi, URL privasi/penghapusan publik, atau hosting backend produksi.
- Daftar domain dan cakupan browser memerlukan perluasan berdasarkan sumber yang sah dan hasil uji.
- Checklist lengkap berada di [Release readiness](RELEASE_READINESS.md).


## 9 November 2026 — hasil akhir fondasi

Lihat [laporan harian](development/2026-11-09.md) dan [bukti build](evidence/2026-11-09-local-build.json). Android source dan build lokal lulus; APK debug serta AAB unsigned tersedia. GitHub Actions belum dapat memulai job karena billing lock. PR #1 tetap terbuka. Tidak ada klaim emulator/HP/Play approval.

## 9 November 2026 — penggantian Actions atas pilihan pemilik

Pemilik memilih build mandiri karena verifikasi pembayaran GitHub gagal. Kedua workflow Actions dihentikan; status gagal historis tetap dipertahankan. `tools/verify.mjs` sekarang menjalankan gate penuh, mencatat source fingerprint, log/report hash, freshness dan checksum artifact. Quick menghasilkan PARTIAL, bukan gate merge. `tools/package-build.py` hanya mengemas bukti full PASS yang masih valid.

Run penuh `20261109T033847522Z-6382b1` PASS: 44 tes Node, 8 engine, 3 client Android, lint 0 issue, APK debug terverifikasi, AAB unsigned serta instrumentation APK terkompilasi. Source sebelum/sesudah sama dan `--check-evidence` PASS. Review independen selesai; redaksi secret pada JVM options diperbaiki beserta regresinya. Tes reset mensyaratkan emulator terisolasi dan opt-in disposable-data sebelum mengakses data sintetis. [Bukti kandidat](evidence/2026-11-09-standalone-build.json).

Tidak ada uji emulator/HP atau signing produksi pada run ini. Semua gate perangkat dan Play tetap berlaku. Pengembangan harian memakai jalur mandiri; pemulihan billing bukan dependency build.

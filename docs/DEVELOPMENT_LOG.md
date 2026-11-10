# Development Log

## 10 November 2026 — mengurangi salah intervensi

Kandidat0.3.2 mengubah nama-only suspected menjadi advisory tanpa HOME/NXDOMAIN, mempertahankan aturan eksplisit dan consent. Model V1 tetap beku; bukan peningkatan akurasi. [Laporan dan gate aktual](development/2026-11-10.md).


## 9 November 2026 — AI lokal domain 0.3 dan evaluasi yang dibekukan

AI lokal ditambahkan sebagai classifier karakter n-gram/logistic regression dengan 24.000 fitur dan bobot 627.278 byte, hanya di privateDebug dan default mati. Inferensi tidak memakai API/cloud. Sinyal hanya domain/ml_model/suspected/flagged; tidak memblokir otomatis atau mengklaim menilai isi website/aplikasi. UI menjelaskan skor belum dikalibrasi, pilihan AI terpisah, preview lokal tidak membuka situs, dan backend 0.3 perlu mendukung sinyal AI sebelum sharing domain AI.

Sumber kategori publik, lisensi, commit dan SHA dipin. Data dikelompokkan berdasarkan PSL/domain/family, source holdout disisihkan, vocabulary hanya train, pemilihan C/threshold hanya validation. Bobot/hash dan pilihan dibekukan sebelum final test; tidak ada retuning menggunakan hasil test. Reviewer independen menghitung ulang hasil dengan scorer terpisah.

Final proxy test 16.006: TP 2.552, FP 11, TN 11.992, FN 1.451; precision 99,57%, recall 63,75%, accuracy 90,87%, FPR 0,09164%. Batas atas FPR satu sisi 95% 0,15165% melewati target 0,1%. Holdout Indonesia positif saja: 8/443 ditandai model, atau 7/443 (1,58%) pada simulasi kebijakan acuan. Label independen 0. **Target akurasi tinggi Indonesia belum terpenuhi; auto-quarantine AI NO-GO.** Integritas kode/model lulus; fitur tetap advisory dan opt-in, proteksi aturan sebelumnya terpisah.

Run penuh `20261109T071213341Z-2f647f` PASS: 80 Node + 24 engine + 8 client biasa + 8 client privat = 120 tes software; kedua lint 0 issue, kedua APK terverifikasi, model hanya ada di APK privat dan checksum sesuai. Tambahan: 13 tes protokol Python dan 69 parity vectors Python/Java; bukan angka akurasi. [Bukti build](evidence/2026-11-09-local-ai-build.json), [model card](LOCAL_AI_MODEL_CARD.md), [roadmap data regional](LOCAL_AI_DATA_ROADMAP.md). Tidak ada QA HP/emulator/baterai atau pengajuan Play/hosting publik/API key yang dilakukan.

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

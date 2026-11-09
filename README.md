# Gempur

**Lawan Judol. Lindungi Keluarga.**

Gempur adalah aplikasi Android untuk membantu orang dewasa membatasi akses judol di perangkatnya sendiri dan meminta dukungan orang tepercaya. Penggunaan sukarela, proteksi lokal, dan berbagi yang dipicu peserta menjadi dasar.

## Status saat ini

Versi **0.1.0-alpha.1** sedang dikembangkan dan diuji. **Belum merupakan rilis stabil atau aplikasi yang disetujui Play Store.**

- Native Android: filter DNS lokal melalui VPN, aturan tambahan, tes domain sintetis, check-in terenkripsi, rencana dukungan, ekspor/hapus catatan.
- Pendamping: pairing dengan konfirmasi, snapshot yang dikirim peserta sendiri, permintaan dukungan, koreksi salah blok terbatas, pencabutan akses, ekspor/hapus akun.
- Mesin aturan: pencocokan domain/IDN/subdomain, parser defensif, pengecualian berjangka, verifikasi paket bertanda tangan.
- Pengembangan: unit/integration tests, Android lint/build, serta APK debug dan AAB unsigned melalui verifier mandiri tanpa GitHub Actions.

**Cakupan filter awal terbatas:** DNS biasa pada jalur yang didukung dan domain dalam daftar. DoH/DoT, IP langsung, TCP DNS, VPN lain, serta perangkat lain belum teratasi. Always-on dan lockdown tidak didukung versi DNS-only ini. Daftar awal bukan seluruh judol Indonesia; 480 kandidat dari sumber terbuka disimpan untuk review, bukan otomatis diaktifkan.

Tidak ada pembacaan layar, chat, SMS, OTP, lokasi atau transaksi. Tidak ada klaim menyembuhkan kecanduan atau memastikan seseorang tidak berjudi.

## Mencoba aplikasi Android

Gunakan paket uji development yang disertai bukti verifikasi, atau hasilkan sendiri dengan proses berikut. Paket pengujian tidak diklaim sebagai rilis stabil.

1. Ikuti [persiapan build mandiri](docs/LOCAL_BUILD.md): Node.js 24, JDK 17, Android SDK 36, build-tools 35.0.0, dan platform-tools.
2. Dari root repository jalankan:

```sh
node tools/verify.mjs
```

3. Periksa hasil `PASS` dan `mergeEligible=true` pada `out/verify/<run>/evidence.json`, beserta source fingerprint dan checksum artifact. Lokasi run ditampilkan oleh verifier.
4. Ambil APK debug dari path artifact yang tercatat. Pasang hanya pada HP uji yang pemiliknya setuju. Baca disclosure serta keterbatasan sebelum mengaktifkan VPN.
5. Jalankan tes proteksi aman di aplikasi, lalu ikuti [matriks QA](docs/RELEASE_READINESS.md).

Artifact debug adalah build pengembangan; jangan menjadikannya satu-satunya perlindungan keluarga. Hasil HP nyata, pengujian baterai dan coverage jaringan tetap diperlukan.

Pada 9 November 2026, verifier mandiri penuh menghasilkan **PASS**, `mergeEligible=true`, **55 tes lulus** (44 Node, 8 engine, 3 client Android), lint 0 issue, APK debug, AAB unsigned, dan instrumentation APK. Source sebelum/sesudah cocok, tanda tangan APK diperiksa, dan review independen selesai. Lihat [bukti build mandiri](docs/evidence/2026-11-09-standalone-build.json); [bukti build awal](docs/evidence/2026-11-09-local-build.json) tetap disimpan sebagai riwayat. APK belum diuji pada HP nyata atau emulator.

GitHub tetap menjadi tempat source code dan PR. Workflow GitHub Actions dihentikan atas pilihan pemilik setelah layanan tersebut terblokir billing. Proses build aktif tidak memerlukan kartu pembayaran atau akun CI baru.

## Build Android sendiri

Gunakan verifier penuh di atas untuk bukti gabungan server, aturan, Android, lint, dan artifact. Perintah Android langsung tetap tersedia untuk diagnosis:

```sh
cd android
./gradlew :engine:test :app:testDebugUnitTest :app:lintDebug :app:assembleDebug :app:bundleRelease :app:assembleDebugAndroidTest
```

Gradle wrapper 8.11.1 disertai checksum distribusi. Build development menghasilkan release AAB unsigned; [signing produksi](docs/SIGNING.md) merupakan langkah terpisah dengan kunci milik pemilik aplikasi. Jangan commit keystore atau private key.

Untuk pemeriksaan Node saja, `node tools/verify.mjs --quick` menghasilkan status `PARTIAL`, bukan persetujuan merge/rilis. Tidak ada emulator atau pengujian HP yang dijalankan otomatis oleh verifier.

## Menjalankan dashboard pendamping

Butuh Node.js 24. Tidak perlu dependency npm tambahan.

```sh
cd server
npm test
npm start
```

Buka `http://127.0.0.1:8080`. Server default hanya mendengarkan localhost. Data runtime berada di folder `data` yang tidak masuk git.

Untuk dua HP berbeda, sediakan server HTTPS sendiri, atur `PUBLIC_ORIGIN` sesuai domain milik operator dan gunakan reverse proxy TLS. Lihat [petunjuk server](server/README.md). Tidak ada backend publik bawaan yang telah dihosting.

Pada APK debug, `http://10.0.2.2:8080` hanya untuk mengakses localhost host dari emulator Android. Untuk perangkat nyata gunakan HTTPS. Proteksi lokal tidak memerlukan akun/server.

## Dokumen kerja

- [PRD](docs/PRD.md)
- [Build dan verifikasi mandiri](docs/LOCAL_BUILD.md)
- [Rencana rilis dan jadwal bersyarat](docs/RELEASE_PLAN.md)
- [Release readiness dan bukti pengujian](docs/RELEASE_READINESS.md)
- [Catatan pengembangan](docs/DEVELOPMENT_LOG.md)
- [Proses pengembangan harian](docs/DAILY_DEVELOPMENT.md)
- [Daftar blok dan lisensi sumber](rules/README.md)
- [Bahan Play Console](store/play-console-worksheet.md)
- [Changelog](CHANGELOG.md)

Rilis publik menunggu build, validasi perangkat, coverage yang layak, penyiapan signing/hosting/privacy, syarat akun/testing, dan keputusan Google. Source code tersedia tidak berarti semua gate tersebut selesai.


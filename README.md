# Gempur

**Lawan Judol. Lindungi Keluarga.**

Gempur adalah aplikasi Android untuk membantu orang dewasa membatasi akses judol di perangkatnya sendiri dan meminta dukungan orang tepercaya. Versi dasar memakai proteksi lokal dan berbagi yang dipicu peserta. Pemilik memilih **uji APK privat** untuk mencoba deteksi tambahan dan berbagi otomatis dengan persetujuan terpisah.

## Status saat ini

Kandidat **0.2.0-alpha.1** tersedia untuk uji privat. **Belum merupakan rilis stabil atau aplikasi yang disetujui Play Store.** Verifikasi penuh menjalankan 100 tes yang lulus serta lint biasa/privat 0 issue; uji HP nyata belum dilakukan. Lihat [bukti kandidat privat](docs/evidence/2026-11-09-private-build.json).

- Native Android: filter DNS lokal melalui VPN, aturan tambahan, tes domain sintetis, check-in terenkripsi, rencana dukungan, ekspor/hapus catatan.
- Pendamping: pairing dengan konfirmasi, snapshot yang dikirim peserta sendiri, permintaan dukungan, koreksi salah blok terbatas, pencabutan akses, ekspor/hapus akun.
- Mesin aturan: pencocokan domain/IDN/subdomain, parser defensif, pengecualian berjangka, verifikasi paket bertanda tangan.
- Pengembangan: unit/integration tests, Android lint/build, serta APK debug dan AAB unsigned melalui verifier mandiri tanpa GitHub Actions.

### Uji privat yang dipilih pemilik

Build `privateDebug` berlabel **Gempur Privat**, dengan application ID `id.gempur.app.private.debug`, terpisah dari debug/release biasa. Build biasa tidak dapat mengaktifkan monitoring dewasa otomatis hanya karena server mengizinkannya.

- Deteksi lokal opsional membedakan aturan dikenal, aturan pribadi, dugaan pola nama, dan target yang belum diketahui. Ini bukan AI atau pemeriksaan isi website/aplikasi.
- Karantina nama hanya menyasar kombinasi indikasi kuat yang masih dapat salah. Pemindaian memakai query MAIN/LAUNCHER untuk subset aplikasi launcher yang terlihat, bukan seluruh/headless apps; tidak ada QUERY_ALL_PACKAGES pada varian mana pun. Penjaga aplikasi opsional memakai event nama paket Accessibility untuk kembali ke Beranda Android; bukan suspend aplikasi atau firewall seluruh koneksi.
- Berbagi otomatis harus diaktifkan terpisah oleh peserta untuk pasangan terkonfirmasi dan cakupan domain/aplikasi yang dipilih. Hanya metadata temuan dikirim, bukan seluruh histori atau inventaris aplikasi.
- HP pendamping Android dapat memeriksa server sekitar setiap 30 detik lewat layanan dengan notifikasi terlihat. Ini polling, bukan FCM/Web Push, pengiriman instan, atau jaminan 24/7.
- Koreksi salah blok memerlukan tinjauan pendamping, masa tunggu 10 menit dan penerapan lokal peserta; izin tepat satu domain/paket berakhir maksimal 30 menit setelah masa tunggu.

Ikuti [panduan dua HP privat](docs/PRIVATE_TEST_GUIDE.md), termasuk opsi lab USB/ADB yang belum diklaim lulus. Dua HP jarak jauh memerlukan backend HTTPS milik operator; belum ada server bawaan yang telah dihosting. Peserta tetap dapat berhenti, mencabut berbagi, dan menghapus riwayat deteksi lokal. Penghentian lokal tidak membuktikan izin server dicabut; penanda sinkronisasi tetap disimpan. Tidak ada operasi tersembunyi atau pencegahan uninstall.

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

**Bukti historis baseline 0.1:** pada 9 November 2026 verifier mandiri penuh menghasilkan PASS, 55 tes lulus, lint 0 issue, APK debug, AAB unsigned dan instrumentation APK. Lihat [bukti build baseline](docs/evidence/2026-11-09-standalone-build.json). Kandidat privat 0.2 telah diverifikasi terpisah: 70 tes Node, 16 engine, 7 client biasa dan 7 client privat lulus; source sebelum/sesudah sama, kedua lint 0 issue dan tanda tangan kedua APK diperiksa. APK belum diuji pada HP nyata atau emulator.

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

Pada APK debug, `http://10.0.2.2:8080` hanya untuk mengakses localhost host dari emulator Android. Akses dua HP melalui jaringan memakai HTTPS; lab USB/ADB privat memiliki pengecualian loopback yang dijelaskan pada panduan. Proteksi lokal tidak memerlukan akun/server.

## Dokumen kerja

- [PRD](docs/PRD.md)
- [Build dan verifikasi mandiri](docs/LOCAL_BUILD.md)
- [Panduan uji dua HP privat](docs/PRIVATE_TEST_GUIDE.md)
- [Rencana rilis dan jadwal bersyarat](docs/RELEASE_PLAN.md)
- [Release readiness dan bukti pengujian](docs/RELEASE_READINESS.md)
- [Catatan pengembangan](docs/DEVELOPMENT_LOG.md)
- [Proses pengembangan harian](docs/DAILY_DEVELOPMENT.md)
- [Daftar blok dan lisensi sumber](rules/README.md)
- [Bahan Play Console](store/play-console-worksheet.md)
- [Changelog](CHANGELOG.md)

Rilis publik menunggu build, validasi perangkat, coverage yang layak, penyiapan signing/hosting/privacy, syarat akun/testing, dan keputusan Google. Source code tersedia tidak berarti semua gate tersebut selesai.


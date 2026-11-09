# Gempur

**Lawan Judol. Lindungi Keluarga.**

Gempur adalah aplikasi Android untuk membantu orang dewasa membatasi akses judol di perangkatnya sendiri dan meminta dukungan orang tepercaya. Penggunaan sukarela, proteksi lokal, dan berbagi yang dipicu peserta menjadi dasar.

## Status saat ini

Versi **0.1.0-alpha.1** sedang dikembangkan dan diuji. **Belum merupakan rilis stabil atau aplikasi yang disetujui Play Store.**

- Native Android: filter DNS lokal melalui VPN, aturan tambahan, tes domain sintetis, check-in terenkripsi, rencana dukungan, ekspor/hapus catatan.
- Pendamping: pairing dengan konfirmasi, snapshot yang dikirim peserta sendiri, permintaan dukungan, koreksi salah blok terbatas, pencabutan akses, ekspor/hapus akun.
- Mesin aturan: pencocokan domain/IDN/subdomain, parser defensif, pengecualian berjangka, verifikasi paket bertanda tangan.
- Pengembangan: unit/integration tests, Android lint/build, artifact APK debug dan AAB unsigned melalui GitHub Actions.

**Cakupan filter awal terbatas:** DNS biasa pada jalur yang didukung dan domain dalam daftar. DoH/DoT, IP langsung, TCP DNS, VPN lain, serta perangkat lain belum teratasi. Always-on dan lockdown tidak didukung versi DNS-only ini. Daftar awal bukan seluruh judol Indonesia; 480 kandidat dari sumber terbuka disimpan untuk review, bukan otomatis diaktifkan.

Tidak ada pembacaan layar, chat, SMS, OTP, lokasi atau transaksi. Tidak ada klaim menyembuhkan kecanduan atau memastikan seseorang tidak berjudi.

## Mencoba aplikasi Android

1. Buka tab [Actions](https://github.com/benisprlh/Gempur/actions).
2. Pilih run **Build and test Gempur** yang benar-benar sukses pada commit yang hendak diuji.
3. Unduh artifact development dan ambil APK debug.
4. Pasang hanya pada HP uji yang pemiliknya setuju. Baca disclosure dan keterbatasan sebelum mengaktifkan VPN.
5. Jalankan tes proteksi aman di aplikasi, lalu ikuti [matriks QA](docs/RELEASE_READINESS.md).

Artifact debug adalah build pengembangan; jangan menjadikannya satu-satunya perlindungan keluarga. Hasil HP nyata, pengujian baterai dan coverage jaringan tetap diperlukan.

## Build Android sendiri

Butuh JDK 17, Android SDK platform 36 dan build-tools 35.0.0. Buka direktori `android` di Android Studio, atau:

```sh
cd android
./gradlew :engine:test :app:testDebugUnitTest :app:lintDebug :app:assembleDebug :app:bundleRelease
```

Gradle wrapper 8.11.1 disertai checksum distribusi. Release AAB belum ditandatangani dengan identitas upload produksi. Jangan commit keystore atau private key.

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
- [Rencana rilis dan jadwal bersyarat](docs/RELEASE_PLAN.md)
- [Release readiness dan bukti pengujian](docs/RELEASE_READINESS.md)
- [Catatan pengembangan](docs/DEVELOPMENT_LOG.md)
- [Proses pengembangan harian](docs/DAILY_DEVELOPMENT.md)
- [Daftar blok dan lisensi sumber](rules/README.md)
- [Bahan Play Console](store/play-console-worksheet.md)
- [Changelog](CHANGELOG.md)

Rilis publik menunggu build, validasi perangkat, coverage yang layak, penyiapan signing/hosting/privacy, syarat akun/testing, dan keputusan Google. Source code tersedia tidak berarti semua gate tersebut selesai.


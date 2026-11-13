# Signing release candidate

APK debug memiliki identitas development terpisah (`id.gempur.app.debug`). Identitas ini bukan upload key produksi. Kunci debug lokal tidak disertakan dalam deliverable dan tidak dipakai untuk produksi.

APK uji privat `privateDebug` memakai identitas **`id.gempur.app.private.debug`** serta debug signing development. Varian ini mengompilasi fitur privat yang berbeda dan tidak dipakai untuk AAB release biasa. Jangan menyamakan keberadaan APK privat dengan persetujuan Google Play atau mengubah application ID biasa untuk menghindari review. Verifier memeriksa flag/manifest hasil build kedua distribusi dan signature kedua APK.

Query aplikasi pada varian privat dibatasi pada intent `MAIN/LAUNCHER`; tidak ada permintaan `QUERY_ALL_PACKAGES` pada varian mana pun. Signing tidak memperluas cakupan deteksi: aplikasi headless, profil lain dan inventory lengkap tetap di luar klaim.

Build development tanpa konfigurasi signing menghasilkan AAB unsigned. Agar kandidat dapat diunggah ke Play, pemilik harus menetapkan upload key yang disimpan aman dan mengatur Play App Signing. Jangan membuat kunci produksi sementara yang hilang pada akhir sesi.

## Pemeriksaan sebelum upgrade privat

Simpan salinan APK yang benar-benar dipasang pada HP uji. Siapkan JDK 17 dan Android SDK Build Tools 35.0.0, lalu gunakan pemeriksaan offline berikut dengan kandidat yang tercatat di evidence build.

```sh
node tools/check-private-upgrade.mjs ./private-lama.apk ./private-kandidat.apk
```

Perintah memverifikasi signature kedua APK, memeriksa application ID privat, dan mencatat SHA-256 APK serta sertifikat publik. Exit `0` berarti kedua APK memiliki satu sertifikat yang sama dan versionCode kandidat lebih tinggi. Exit `1` melaporkan perbedaan sertifikat atau versionCode yang kurang. Exit `2` berarti APK atau toolchain gagal diperiksa. Pemeriksaan ini tidak menjalankan ADB atau memasang APK. Rotasi kunci dan migrasi data perlu validasi terpisah.

Jika sertifikat berbeda, buat kandidat upgrade menggunakan identitas signing privat asli di lingkungan pemilik kunci, lalu jalankan ulang pemeriksaan. Pertahankan instalasi dan data di HP. Setelah hasil cocok, validasi upgrade pada perangkat uji dan periksa catatan, aturan pribadi, serta status consent.

## Signing lokal terpisah

Verifier `node tools/verify.mjs` sengaja membangun artifact development tanpa menggunakan variable signing produksi. Jalankan signing hanya setelah verifikasi penuh dan review selesai, dengan environment yang diprovisikan secara terotorisasi melalui secret manager atau proses pemilik kunci.

Konfigurasi Gradle menerima empat environment variable:

| Variable | Isi |
| --- | --- |
| `GEMPUR_UPLOAD_STORE_FILE` | Path absolut ke keystore di luar repository |
| `GEMPUR_UPLOAD_STORE_PASSWORD` | Password keystore |
| `GEMPUR_UPLOAD_KEY_ALIAS` | Alias upload key |
| `GEMPUR_UPLOAD_KEY_PASSWORD` | Password key |

Jika hanya sebagian konfigurasi tersedia, build gagal. Jangan menulis nilai ke dokumen, chat publik, git, command-line argument Gradle, atau log. Hindari merekam secret ke shell history. Pastikan file keystore dapat dibaca hanya oleh pemilik yang berwenang dan tidak masuk direktori artifact.

Setelah keempat variable disediakan oleh environment yang berwenang:

```sh
cd android
./gradlew :engine:test :app:testDebugUnitTest :app:lintRelease :app:bundleRelease
```

Pada Windows gunakan `gradlew.bat`. Tidak ada workflow GitHub Actions yang diperlukan. Langkah ini hanya menyiapkan AAB bertanda tangan; tidak melakukan upload atau publish ke Play.

## Verifikasi kandidat signed

- Pastikan source sama dengan kandidat yang lulus verifier penuh; jangan mengandalkan artifact dari run lama.
- Periksa adanya signature AAB, verifikasi integritasnya menggunakan `jarsigner`, lalu cocokkan fingerprint sertifikat dengan identitas upload milik pemilik. Nama task `signReleaseBundle` saja tidak membuktikan signing telah terjadi.
- Catat checksum AAB signed, sertifikat publik yang dipakai, `versionCode`, commit/source fingerprint dan hasil tes. Jangan menyertakan private key/password.
- Gunakan `versionCode` yang meningkat untuk upload berikutnya dan pertahankan application ID serta jalur upgrade.
- Pastikan privacy/deletion URL, data safety, deklarasi, hasil pengujian perangkat dan persyaratan akun sudah dipenuhi sebelum upload yang diotorisasi.

Workflow kandidat Actions sebelumnya dihentikan atas pilihan pemilik pada 9 November 2026. Konfigurasi signing lokal menggantikannya tanpa membutuhkan akun CI baru atau pemulihan billing GitHub.

Kunci update daftar domain merupakan identitas terpisah dari upload key APK/AAB; prosesnya dijelaskan pada [rules/README.md](../rules/README.md). Produksi tetap ditahan sampai kunci dan proses operasionalnya ditetapkan dengan benar.

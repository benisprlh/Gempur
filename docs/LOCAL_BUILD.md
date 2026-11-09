# Build dan verifikasi mandiri

Jalur ini menjalankan pengujian serta build di environment yang dipakai pengembang atau tugas harian. GitHub menyimpan source code dan PR; GitHub Actions, kartu pembayaran GitHub, dan akun layanan CI baru tidak diperlukan untuk menjalankan build ini.

## Persiapan

| Komponen | Versi/kebutuhan |
| --- | --- |
| Node.js | 24.x; backend memakai SQLite bawaan Node |
| JDK | 17; tetapkan `JAVA_HOME` ke instalasi JDK penuh |
| Android SDK | Platform android-36, build-tools 35.0.0, platform-tools |
| Gradle | Wrapper 8.11.1 di `android/gradlew`; checksum distribusi dipin |
| Jaringan | Dibutuhkan untuk mengunduh SDK/dependency pada build pertama; cache dapat dipakai berikutnya |
| Disk | Cukup untuk SDK, cache Gradle, build output dan evidence |
| Pengemasan opsional | Python 3 dengan standard library untuk membuat ZIP paket uji |

Pasang SDK melalui Android Studio SDK Manager atau SDK command-line tools resmi. Dengan `sdkmanager` yang sudah tersedia:

```sh
sdkmanager 'platforms;android-36' 'build-tools;35.0.0' 'platform-tools'
```

Tetapkan environment milik mesin, tanpa memasukkan path khusus pengembang ke repository:

```sh
export JAVA_HOME='/path/to/jdk-17'
export ANDROID_HOME='/path/to/android-sdk'
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$PATH"
```

Verifier juga menerima `ANDROID_SDK_ROOT` sebagai lokasi SDK. Environment referensi adalah Linux; macOS dan Windows belum diuji. Pada Windows, tetapkan environment yang sama melalui PowerShell atau pengaturan environment, lalu gunakan Node dari terminal. Dukungan pemanggilan `.bat` tersedia di runner, tetapi belum membuktikan seluruh build Windows berhasil. Jika menjalankan Gradle langsung, gunakan `gradlew.bat`.

Untuk environment yang sudah memiliki Gradle 8.11.1 terverifikasi, `GEMPUR_GRADLE` dapat menunjuk executable tersebut. Jika tidak diset, verifier memakai wrapper repository. Jangan mengganti versi tool secara diam-diam hanya agar build lolos. Gunakan proxy/trust store yang disetujui environment jika diperlukan; jangan menonaktifkan verifikasi TLS.

## Jalur penuh

Dari root repository:

```sh
node tools/verify.mjs
```

Jalur penuh menjalankan tes server, tooling aturan dan verifier, lalu tugas Android:

```text
:engine:test
:app:testDebugUnitTest
:app:testPrivateDebugUnitTest
:app:lintDebug
:app:lintPrivateDebug
:app:assembleDebug
:app:assemblePrivateDebug
:app:bundleRelease
:app:assembleDebugAndroidTest
```

Verifier tidak menjalankan emulator atau HP secara otomatis. Instrumentation APK yang berhasil dikompilasi bukan hasil tes perangkat. Build development juga menghapus variable upload-signing dari proses anak agar tidak memakai kunci produksi secara tidak sengaja. Signing merupakan langkah manual terpisah pada [SIGNING.md](SIGNING.md).

## Dua distribusi terpisah

Sejak `0.2.0-alpha.1`, build biasa (`debug`/`release`) mengompilasi `BuildConfig.PRIVATE_BUILD=false`. Manifest biasa tidak mendeklarasikan layanan pemantauan privat, Accessibility guard, atau `QUERY_ALL_PACKAGES`.

`privateDebug` mengompilasi flag privat `true` dengan application ID **`id.gempur.app.private.debug`**, label **Gempur Privat**, query terbatas aplikasi yang memiliki intent `MAIN/LAUNCHER` serta dua layanan privat. Tidak ada varian yang meminta `QUERY_ALL_PACKAGES`. Pemindaian hanya menjangkau subset aplikasi launchable yang terlihat; aplikasi headless, profil lain atau seluruh inventory tidak diklaim tercakup. File APK berada di `android/app/build/outputs/apk/privateDebug/app-privateDebug.apk`. Pengguna harus memilih consent lokal dan berbagi secara terpisah; tidak ada migrasi akun/data otomatis dari build biasa. Distribusi privat bukan bukti kelayakan Google Play/Play Protect. Baca [kontrak uji privat](PRIVATE_AUTOMATION_CONTRACT.md).

Gate penuh memeriksa hasil tes/lint dan tanda tangan APK **kedua** varian. Evidence schema3 mengikat checksum manifest hasil merge serta BuildConfig yang dihasilkan Gradle; pemeriksaan menolak private flag/layanan di build biasa, `QUERY_ALL_PACKAGES` di semua varian, query launchable privat yang hilang, atau application ID yang tidak terpisah. Schema3 juga mengikat model AI lokal, protokol/split/evaluasi dan sumber berlisensi; byte asset model/parity/manifest/atribusi di APK privat harus sama dengan source yang diuji. APK biasa dan AAB biasa tidak boleh memuat `assets/ml/`. Hasil schema1/schema2 sebelumnya tetap riwayat dan tidak memenuhi gate aktif. AAB release tetap varian biasa tanpa otomatisasi pemantauan dewasa atau asset model privat.

## Verifikasi model AI lokal

Jalur penuh tetap offline terhadap sumber dataset: ia memakai model yang telah dilatih dan dibundel. Node memeriksa hash source lock, lisensi, eksperimen, split, pemilihan model yang dibekukan, report evaluasi, weights, parity dan atribusi. Pemeriksaan juga menghitung ulang konsistensi confusion matrix/rasio dan parity numerik ASCII; tes Java menguji seluruh vektor parity termasuk normalisasi IDN. Model atau laporan yang tidak lengkap menyebabkan FAIL, bukan diabaikan. Angka tes program bukan ukuran akurasi judol.

Model domain masih advisory: skor belum dikalibrasi menjadi probabilitas, kategori sumber merupakan proxy label dan tidak ada label lapangan yang ditinjau independen. Karena itu `autoQuarantineEligible=false`; bukti konsistensi build tidak boleh diubah menjadi klaim deteksi judol yang pasti atau klasifikasi aplikasi yang telah tervalidasi.

Untuk merekonstruksi evaluasi model yang sudah dibekukan, gunakan Python dan dependency training yang dipin:

```sh
python3 -m pip install -r tools/ml/requirements.txt
python3 tools/ml/download_sources.py
python3 tools/ml/train_model.py --evaluate-frozen
python3 -m unittest discover -s tools/ml -p 'test_*.py'
```

Downloader hanya mengambil snapshot sumber/PSL pada URL dan hash yang dipin; ia tidak membuka domain judi. Raw cache berada di `out/ml-data/`, tidak masuk source control. Dengan cache yang sudah ada, `python3 tools/ml/download_sources.py --check-only` memeriksa byte yang sama tanpa unduhan. Evaluasi beku menghitung ulang hasil/parity tanpa melatih atau memilih threshold lagi.

Jangan menghapus hasil beku agar dapat melatih ulang setelah melihat final test. Eksperimen baru harus memiliki protokol/versi dan rencana holdout baru; pilihan model/threshold hanya memakai training/validation. Laporan `ml/evaluation.json` memisahkan test kategori sumber, holdout sumber positif, challenge sintetis dan batas interpretasinya. Tidak ada cloud API key atau biaya API yang diperlukan untuk inferensi ini.

## Hasil dan arti status

Lokasi run ditampilkan di terminal: `out/verify/<UTC timestamp-random>/`. Direktori itu berisi `evidence.json` dan `logs/*.log`. Path artifact yang benar tercatat di evidence; jangan mengambil APK lama hanya karena file masih ada.

| Status | Makna | Boleh menjadi gate merge? |
| --- | --- | --- |
| PASS | Seluruh pemeriksaan penuh berhasil, bukti valid dan source tidak berubah selama run | Ya, jika `mergeEligible=true`, source masih sama, review selesai, dan proteksi branch dipenuhi |
| PARTIAL | Hanya sebagian jalur dijalankan, misalnya quick tanpa Android | Tidak |
| FAIL | Ada command, bukti, artifact, lint, atau pemeriksaan source yang gagal | Tidak |

Exit 0 pada quick yang sukses tetap PARTIAL. Command gagal keluar dengan exit 1; flag yang tidak dikenal keluar dengan exit 2. Jangan memperlakukan exit code saja sebagai bukti full verification.

Evidence mencatat source fingerprint sebelum/sesudah, command beserta exit code, ringkasan tes, lint, checksum/signing APK/AAB, metadata model dan bukti pemisahan asset. Fingerprint mencakup kode, tes, konfigurasi dan eksperimen/model metadata dalam `android/`, `server/`, `web/`, `tools/`, `rules/`, dan `ml/`, dengan output runtime/build dan raw cache dikecualikan. Perubahan dokumentasi, aturan kerja, atau konfigurasi root di luar cakupan tersebut tetap perlu review terpisah. Source yang berubah selama run menyebabkan FAIL. Hasil ini adalah verifikasi mandiri, bukan badge dari runner independen yang dihosting GitHub.

Untuk pemeriksaan Node saja:

```sh
node tools/verify.mjs --quick
```

Quick berguna saat mengerjakan server/tooling, tetapi bukan bukti Android berhasil dibangun dan bukan persetujuan rilis.

## Perintah diagnosis manual

Jika perlu mengisolasi kegagalan, jalankan pemeriksaan yang sama secara langsung dari root repository:

```sh
node --test server/test/api.test.mjs server/test/private-monitoring.test.mjs tools/rules.test.mjs tools/verification.test.mjs tools/ml-artifact.test.mjs
```

Lalu dari direktori Android:

```sh
cd android
./gradlew :engine:test :app:testDebugUnitTest :app:testPrivateDebugUnitTest :app:lintDebug :app:lintPrivateDebug :app:assembleDebug :app:assemblePrivateDebug :app:bundleRelease :app:assembleDebugAndroidTest
```

Perintah manual membantu diagnosis, tetapi tidak membuat `evidence.json` gabungan. Jalankan ulang verifier penuh setelah masalah diperbaiki untuk memenuhi gate aktif. Pastikan variable `GEMPUR_UPLOAD_*` tidak tersedia saat melakukan build development manual, karena konfigurasi Gradle langsung dapat memakainya untuk signing.

## Pemakaian artifact

- APK debug digunakan untuk pengujian development, dengan application ID terpisah `id.gempur.app.debug`.
- APK privateDebug digunakan hanya untuk uji privat, dengan application ID lain `id.gempur.app.private.debug`; jangan tertukar saat memasang pada dua HP uji.
- AAB dari jalur development unsigned; belum dapat menjadi upload produksi Play.
- Sebelum membagikan paket, cocokkan checksum dengan `evidence.json` dari run yang berhasil dan pastikan source-nya sama dengan kandidat.
- Log dan evidence berada di `out/verify/`; paket tetap pada path build output yang tercatat dalam evidence. Kedua lokasi diabaikan git. Bukti ringkas yang masuk `docs/evidence/` harus disanitasi dan bebas data pribadi, secret, token, database runtime, serta informasi environment yang tidak perlu.
- Ekspor data pribadi yang sudah ada sebelum melakukan pengujian manual yang berpotensi merusak. Tugas build normal tidak perlu menghapus data aplikasi.

Periksa kembali evidence sebelum memakai paket atau membuat keputusan merge:

```sh
node tools/verify.mjs --check-evidence out/verify/<run>/evidence.json
```

Pemeriksaan ulang mencocokkan source dan artifact saat ini, status full PASS, serta umur evidence maksimal 24 jam. Jika source berubah atau evidence kedaluwarsa, jalankan verifier penuh kembali.

Untuk membuat satu ZIP uji yang dapat dibagikan, gunakan Python 3 dari root repository:

```sh
python3 tools/package-build.py out/verify/<run>/evidence.json --output out/packages/Gempur_Standalone_Test_Build.zip
```

Pengemas menjalankan `--check-evidence` sebelum membuat ZIP dan menolak evidence/source/artifact yang tidak cocok. ZIP berisi APK biasa, APK privat terpisah, AAB biasa unsigned, evidence serta checksum. ZIP tetap merupakan paket development; AAB unsigned bukan upload produksi.

## Pengujian perangkat

Gunakan emulator terisolasi untuk fixture instrumentasi yang mereset data sintetis. Tes reset mensyaratkan emulator yang dikenali dan opt-in eksplisit `-Pandroid.testInstrumentationRunnerArguments.gempurDisposableTestData=true`. Jangan menjalankan `connectedDebugAndroidTest` terhadap HP keluarga yang memiliki catatan atau akun nyata. Pemeriksaan manual HP harus mengikuti matriks QA, mempertahankan data, dan mencatat versi OS/OEM/jaringan yang benar-benar diuji.

Lulus build tidak menggantikan pengujian baterai, lifecycle, browser/DoH/IPv6, akses fungsi penting, atau proses review Play. Gate tersebut tetap berada pada [RELEASE_READINESS.md](RELEASE_READINESS.md).

## Bila environment tidak tersedia

Laporkan komponen yang tepat: Node/JDK/SDK tidak tersedia, dependency tidak dapat diunduh, ruang disk, atau tes yang benar-benar gagal. Pertahankan hasil PARTIAL/FAIL dan kerjakan bagian independen yang masih dapat diuji. Tidak perlu memulihkan billing GitHub untuk melanjutkan jalur build ini.

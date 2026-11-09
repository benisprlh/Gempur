# Rencana Rilis Gempur

Tanggal dasar: **9 November 2026, WIB**. Status: **kandidat alpha untuk uji APK privat**, bukan rilis publik Play Store. Pemilik memilih pilot privat sebelum mengevaluasi distribusi publik berikutnya. Status aktual ada di [Release readiness](RELEASE_READINESS.md) dan [Development log](DEVELOPMENT_LOG.md).

## Tujuan rilis pertama

Gempur membantu pemilik Android membatasi akses ke domain judi yang dikenali melalui filtering DNS lokal, mencatat check-in secara sukarela, dan meminta dukungan orang tepercaya. Baseline debug/release tetap tanpa monitoring dewasa otomatis. Kandidat `privateDebug` terpisah menguji dugaan nama lokal, interupsi paket opsional, serta metadata temuan yang dibagikan otomatis setelah consent terpisah. Tidak ada klaim seluruh judol terdeteksi, transaksi diketahui, isi aplikasi dibaca, atau kecanduan disembuhkan.

Mesin awal merupakan **DNS-only VPN**, bukan full-tunnel firewall. Jalur DoH/Secure DNS, DoT, direct IP, TCP DNS tertentu, aplikasi dengan resolver sendiri, VPN lain, dan perangkat lain dapat berada di luar cakupan. Always-on/lockdown tidak didukung pada mesin awal; jangan mengaktifkannya sebagai cara meningkatkan proteksi tanpa pengembangan dan pengujian baru.

## Tahap aktif: pilot privat dahulu

| Tahap | Waktu bersyarat | Hasil yang dituju | Syarat sebelum lanjut |
| --- | --- | --- | --- |
| Kandidat privat 0.2 | Setelah source final diverifikasi | APK biasa dan privat terpisah, unit/integration tests, lint, checksum, review | Full PASS pada kandidat; release manifest tidak memuat fitur/izin privat |
| Lab dua HP | Setelah APK dan dua HP uji tersedia | Pairing, dua consent, scope, notifikasi polling, salah blok, off/revoke/delete | Peserta/pendamping memahami uji; gunakan USB/ADB lokal atau backend HTTPS sendiri; lihat panduan |
| Pilot penggunaan terbatas | Usulan 14 hari sejak lab lulus | Catatan false positive/negative, fungsi penting, jaringan, baterai dan lifecycle OEM | Tidak ada bug kritis consent/akses bantuan; server/operator dan retensi siap |
| Evaluasi distribusi publik | Setelah bukti pilot cukup | Tetapkan fitur mana yang layak dipertahankan pada produk publik | Review produk/kebijakan; tidak menganggap privat sama dengan memenuhi Play |
| Internal/closed test Play | Belum dijadwalkan ulang | Signed AAB yang sesuai jalur Play, tester dan disclosure akurat | Akun, signing, URL dan fitur yang diizinkan siap; bila berlaku ≥12 tester ≥14 hari terus opt-in |
| Production access/soft launch | Sesudah seluruh gate dan approval | Pengajuan dan rollout bertahap | Keputusan Google yang nyata; tidak ada blocker teknis/operasional |

Riwayat perencanaan awal menetapkan alpha 9–12 November, QA 12–19 November, closed test mulai 20 November, evaluasi/review paling awal 4 Desember dan soft launch 11–18 Desember 2026. **Tanggal publik tersebut tidak menjadi komitmen aktif setelah pilihan pilot privat**; jadwalkan ulang berdasarkan bukti dan keputusan distribusi. Jangan mempersingkat kewajiban tester atau menjanjikan approval Google. Untuk akun yang tidak tercakup syarat personal baru, pengujian kualitas tetap diperlukan.

Langkah dua HP, termasuk lab USB/ADB yang belum dieksekusi sebagai bukti, ada di [PRIVATE_TEST_GUIDE.md](PRIVATE_TEST_GUIDE.md). Polling sekitar 30 detik bukan notifikasi push terjamin; app guard hanya HOME berbasis paket, bukan suspend atau firewall. Daftar domain aktif belum diperluas oleh pilot ini.

## Kebijakan rilis

- Versi `0.x` digunakan untuk pengembangan/pilot. `1.0.0` baru ketika gate rilis terpenuhi.
- `versionCode` selalu meningkat pada setiap upload Play.
- Paket/aplikasi, sertifikat signing, dan jalur upgrade dipertahankan. Debug signing tidak menjadi signing produksi.
- Verifier mandiri menghasilkan debug APK dan release AAB **tanpa signing produksi**. Signing upload merupakan langkah lokal terpisah melalui konfigurasi terotorisasi; kunci disimpan di secret manager/Play sesuai prosedur pemilik akun. Lihat [SIGNING.md](SIGNING.md).
- PR rutin digabung setelah pemeriksaan lulus. Tidak mempublikasikan ke Play otomatis dari daily automation.
- Simpan changelog, commit SHA, checksum, hasil tes, known issues, dan keputusan go/no-go setiap kandidat.
- Data peserta tidak direset saat pembaruan. Perubahan format data memerlukan tes migrasi serta pemulihan.
- Jangan membawa privateDebug atau mengaktifkan adult telemetry melalui remote flag pada jalur biasa. APK privat tetap memerlukan evaluasi keamanan/Play Protect; tidak ada deklarasi atau approval publik yang diasumsikan.

## Pekerjaan harian

1. Periksa hasil verifikasi mandiri, bug, kualitas daftar domain, serta perubahan resmi Android/Google Play.
2. Pilih perbaikan yang dapat dibuktikan: keamanan consent, ketepatan aturan, konektivitas, konsumsi baterai, atau kegunaan.
3. Implementasi dan jalankan pemeriksaan yang relevan; jangan mencatat uji yang tidak dilakukan.
4. Perbarui log harian, status requirement, known issues, dan tanggal target bila dependency berubah.
5. Gunakan PR dan merge ketika verifikasi penuh PASS, `mergeEligible=true`, source sesuai bukti, dan review independen selesai. Tetap patuhi proteksi branch yang benar-benar berlaku; jangan mengabaikan kegagalan pada checks aktif.

## Jalur build aktif

Pemilik memilih beralih dari GitHub Actions ke build mandiri pada 9 November 2026. Jalur aktif adalah `node tools/verify.mjs`, dengan bukti mesin dan log di `out/verify/<run>/`. GitHub tetap menyimpan source code dan review PR; pemulihan billing Actions tidak menjadi dependency build.

Riwayat kegagalan Actions tetap dicatat sebagai kegagalan layanan yang tidak memulai job, bukan hasil tes kode. Mengganti jalur build tidak mengubah status uji perangkat atau kelayakan Play. Tanggal rilis tetap bersyarat pada gate produk yang sama.

## Go/no-go produksi

Produksi ditahan apabila masih ada salah satu kondisi berikut: build gagal, akses data lintas pengguna, pengiriman setelah revokasi, fungsi bantuan terhalang, klaim cakupan melampaui bukti, kunci signing tidak terkelola, URL privasi/penghapusan tidak tersedia, deklarasi kebijakan belum akurat, atau akun Play belum memenuhi syarat.

Setelah approval, usulan rollout awal adalah 5%, lalu 20%, 50%, dan 100% hanya setelah setiap tahap menunjukkan tidak ada regresi kritis. Persentase ini rencana operasional, bukan rollout yang sudah dibuat. Bila ukuran audience terlalu kecil untuk staged rollout, lakukan internal/closed verification dan evaluasi sebelum memperluas distribusi.

## Sumber resmi

Diperiksa pada 9 November 2026:

- [Target API requirements](https://support.google.com/googleplay/android-developer/answer/11926878?hl=en): app baru/update ponsel memerlukan target API 36 sejak 31 Agustus 2026.
- [Testing requirements for new personal accounts](https://support.google.com/googleplay/android-developer/answer/14151465?hl=en): akun personal yang dibuat setelah 13 November 2023 memiliki syarat closed testing dan proses permohonan production access.
- [Android app signing](https://developer.android.com/studio/publish/app-signing): bundle upload perlu ditandatangani; Play App Signing dan upload key harus dikonfigurasi dengan benar.
- [VPN policy](https://support.google.com/googleplay/android-developer/answer/12564964?hl=en): penggunaan API serta disclosure perlu sesuai implementasi dan ditinjau.


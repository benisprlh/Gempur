# Rencana Rilis Gempur

Tanggal dasar: **9 November 2026, WIB**. Status: **pengembangan alpha**, bukan rilis publik Play Store. Semua tanggal berikut merupakan target bersyarat; status aktual ada di [Release readiness](RELEASE_READINESS.md) dan [Development log](DEVELOPMENT_LOG.md).

## Tujuan rilis pertama

Gempur membantu pemilik Android membatasi akses ke domain judi yang dikenali melalui filtering DNS lokal, mencatat check-in secara sukarela, dan meminta dukungan orang tepercaya. Rilis pertama tidak mengklaim dapat mencegah semua judol, mendeteksi transaksi, memantau orang dewasa secara otomatis, atau menyembuhkan kecanduan.

Mesin awal merupakan **DNS-only VPN**, bukan full-tunnel firewall. Jalur DoH/Secure DNS, DoT, direct IP, TCP DNS tertentu, aplikasi dengan resolver sendiri, VPN lain, dan perangkat lain dapat berada di luar cakupan. Always-on/lockdown tidak didukung pada mesin awal; jangan mengaktifkannya sebagai cara meningkatkan proteksi tanpa pengembangan dan pengujian baru.

## Kalender target

| Tahap | Target awal | Hasil yang dituju | Syarat sebelum lanjut |
| --- | --- | --- | --- |
| Alpha kode dan build | 9–12 November 2026 | APK debug dan AAB dari verifier mandiri, tes otomatis, dokumentasi menjalankan layanan | Build nyata lulus; hasil tidak diklaim sebagai uji HP |
| Validasi HP dan internal testing | 12–19 November 2026 | Uji HP peserta, OEM pembanding, jaringan, restart, izin, fungsi penting, serta alur pendamping | APK dapat dipasang; masalah privasi/akses bantuan kritis diselesaikan |
| Closed test | Target mulai 20 November 2026 | Kelompok tester terpilih, catatan penggunaan dan perbaikan harian | Akun Play siap, signed AAB, setup app/disclosure/URL lengkap; durasi dimulai dari opt-in aktual |
| Evaluasi closed test | Target 4 Desember 2026 atau sesudahnya | Bukti pengujian minimal dan kandidat release | Bila aturan akun personal baru berlaku: ≥12 tester terus opted-in ≥14 hari; engagement dan kelayakan tetap diperiksa Google |
| Permohonan production access dan review | Target paling awal 4 Desember 2026 | Pengajuan yang lengkap dengan bukti pengujian | Gate teknis dan kebijakan lulus; akun memenuhi syarat; hasil review belum dijamin |
| Soft launch | Target perencanaan 11–18 Desember 2026 | Rollout terbatas setelah persetujuan Google | Production access dan app review disetujui; tidak ada blocker rilis |
| Perluasan bertahap | Sesudah soft launch stabil | Tambah cakupan perangkat dan daftar blok dengan bukti | Pantau Android vitals/feedback nyata; hentikan rollout jika regresi kritis |

Tanggal dapat maju untuk internal testing atau mundur untuk produksi sesuai kondisi nyata. Jangan mempersingkat kewajiban tester atau menyebut Google pasti menyetujui pada tanggal tertentu. Untuk akun organisasi atau akun yang tidak terkena kewajiban personal baru, tetap lakukan pengujian kualitas yang relevan; jangan menganggap seluruh langkah otomatis hilang.

## Kebijakan rilis

- Versi `0.x` digunakan untuk pengembangan/pilot. `1.0.0` baru ketika gate rilis terpenuhi.
- `versionCode` selalu meningkat pada setiap upload Play.
- Paket/aplikasi, sertifikat signing, dan jalur upgrade dipertahankan. Debug signing tidak menjadi signing produksi.
- Verifier mandiri menghasilkan debug APK dan release AAB **tanpa signing produksi**. Signing upload merupakan langkah lokal terpisah melalui konfigurasi terotorisasi; kunci disimpan di secret manager/Play sesuai prosedur pemilik akun. Lihat [SIGNING.md](SIGNING.md).
- PR rutin digabung setelah pemeriksaan lulus. Tidak mempublikasikan ke Play otomatis dari daily automation.
- Simpan changelog, commit SHA, checksum, hasil tes, known issues, dan keputusan go/no-go setiap kandidat.
- Data peserta tidak direset saat pembaruan. Perubahan format data memerlukan tes migrasi serta pemulihan.

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


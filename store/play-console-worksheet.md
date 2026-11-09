# Play Console Worksheet

Tanggal pemeriksaan sumber: 9 November 2026. Ini lembar kerja pengisian, **bukan deklarasi yang sudah disubmit atau pasti disetujui**.

## Jalur privat dan jalur Play

Pemilik memilih pilot `privateDebug` terpisah, berlabel Gempur Privat (`id.gempur.app.private.debug`). Kandidat tersebut bukan artifact upload Play. Baseline debug/release tetap tanpa monitoring dewasa otomatis; jangan menyatakan isolasi hanya dari UI—periksa manifest, BuildConfig dan perilaku binary.

PrivateDebug memakai query terbatas MAIN/LAUNCHER, Accessibility package-event/HOME, serta foreground service untuk sharing/polling. Pemindaian hanya mencakup subset aplikasi launcher yang terlihat, bukan headless/seluruh inventaris. Tidak ada QUERY_ALL_PACKAGES pada varian mana pun. Jangan menyalin service privat ke release biasa. Pilot privat tidak membuktikan kelayakan Play atau pengecualian Play Protect; [panduan privat](../docs/PRIVATE_TEST_GUIDE.md) menjelaskan batas aktual. Prioritaskan QA pilot sebelum menjadwalkan ulang rilis publik.

## Identitas dan artifact

- Tetapkan pemilik akun, tipe akun, identitas developer, negara, kontak publik, dan aplikasi ID final.
- Target app baru/update ponsel saat ini: API 36. Periksa manifest di artifact, bukan hanya file Gradle.
- Gunakan signed Android App Bundle untuk upload. Konfigurasikan Play App Signing dan upload key; debug keystore tidak menjadi identitas produksi.
- Berikan akses reviewer yang benar-benar berfungsi bila fitur pendamping membutuhkan autentikasi/pairing.

## Data safety

Audit Android, dashboard, backend, resolver DNS, log reverse proxy, backup, dan library sebelum menjawab. Pemrosesan lokal, pemrosesan sementara, pengiriman ke penyedia layanan, dan tindakan berbagi peserta memiliki aturan deklarasi yang berbeda; jangan memilih “tidak mengumpulkan data” hanya karena tidak ada iklan.

| Kandidat data | Kondisi alpha | Hal yang perlu dipastikan untuk deklarasi |
| --- | --- | --- |
| Nama tampilan dan akun | Opsional untuk layanan pendamping | Kategori informasi pribadi/pengenal akun sesuai data yang benar-benar disimpan |
| Check-in dorongan/perilaku | Lokal atau dikirim peserta | Evaluasi data kesehatan/perilaku dan konten buatan pengguna; sensitif walau sukarela |
| Permintaan bantuan/koreksi | Dikirim ketika peserta memilih | Tujuan fungsi aplikasi, penerima, retensi, penghapusan |
| Domain DNS | Filtering lokal; domain diizinkan diteruskan ke resolver | Nilai pemrosesan resolver serta sifat sementara; jangan mengklaim “tidak pernah keluar perangkat” |
| Metadata teknis/IP/log | Tergantung operator/proxy | Minimalkan; dokumentasikan penyedia layanan dan retensi yang sebenarnya |
| Token/session identifier | Autentikasi | Perlindungan, expiry, penghapusan; jangan mempublikasikan nilainya |
| SMS, chat, layar, lokasi, rekening | Tidak diminta desain alpha | Verifikasi manifest, kode, SDK, dan network capture untuk membuktikan |

Data sharing yang dipicu peserta mungkin diperlakukan berbeda pada form Data safety menurut pengecualian yang tersedia; itu **tidak otomatis menghapus kewajiban disclosure, keamanan, atau kebijakan monitoring**.

## VPN dan foreground service

- Jelaskan filtering DNS dan batasannya pada listing serta disclosure dalam aplikasi.
- Nyatakan penggunaan VpnService dengan alasan yang sesuai fungsi nyata. Memilih kategori yang tidak cocok bukan cara memperoleh persetujuan.
- Rekam demo singkat alur membuka app, membaca disclosure, mengizinkan VPN, melihat status/notifikasi, menguji domain aman, dan menghentikan proteksi.
- Cocokkan foreground-service type dan permission manifest; untuk specialUse, isi alasan penggunaan yang spesifik dan benar.
- Jangan mengklaim remote VPN terenkripsi atau seluruh trafik terlindungi bila yang dibangun DNS-only lokal.
- Seluruh varian tidak meminta QUERY_ALL_PACKAGES. Release dasar juga tidak meminta Accessibility; privateDebug memakai service package-event/HOME yang terlihat dan dapat dimatikan. Device admin/anti-uninstall tetap tidak digunakan.

## Monitoring orang dewasa

Google Play membatasi monitoring orang lain pada parental/enterprise yang memenuhi ketentuan; consent dewasa bukan pengecualian umum. Nilai isMonitoringTool `other` memerlukan penilaian pengecualian, bukan persetujuan otomatis. Jangan memakai kategori anak untuk kerabat dewasa, atau listing Play untuk mengakses APK dengan fungsi yang melanggar. Jalur privat dan fitur berbagi sukarela tetap dinilai berdasarkan implementasi serta distribusi sebenarnya.

Jika kelak mengajukan fungsi Accessibility, jelaskan aturan deterministik serta data minimum; jangan mengklaim disability tool tanpa dasar. Untuk inventory aplikasi, nilai alternatif query yang lebih sempit dan deklarasi izin yang diperlukan. Dalam pilot, temuan paket/domain merupakan data aktivitas sensitif meski tidak memuat URL lengkap. Polling lokal dan consent tidak menjadikannya anonim atau riwayat yang terverifikasi.

## Health apps declaration

Form ini perlu diisi secara akurat. Fitur check-in dorongan dan dukungan terkait kecanduan perlu dinilai terhadap kategori Mental and Behavioral Health; jangan secara otomatis menyatakan tidak ada health feature. Gempur tidak mengklaim diagnosis, terapi, clinical decision support, atau medical device. Hindari memasukkan klaim medis baru ke listing tanpa bukti dan evaluasi.

## Privasi dan penghapusan

- Publikasikan kebijakan di URL HTTPS yang dapat dibaca tanpa login, dengan nama Gempur/developer dan kontak privat yang nyata.
- Apabila akun ditawarkan, sediakan cara menginisiasi penghapusan di aplikasi dan dari URL eksternal yang mudah ditemukan. Data terkait akun juga harus ditangani, bukan hanya menonaktifkan login.
- Sesuaikan retensi backup, proses autentikasi penghapusan, dan SLA dengan kemampuan operator.
- GitHub Issues publik bukan kanal permintaan penghapusan yang meminta data pribadi.

## Pengujian dan review

Untuk akun personal yang tercakup kebijakan akun baru, minimum tester/masa opt-in dan permohonan production access harus dipenuhi berdasarkan catatan Play aktual. Internal testing tidak menggantikan closed testing yang diwajibkan. Hasil production-access review dan app review bukan sesuatu yang dapat dibuat oleh verifier build. Build mandiri menghilangkan dependency GitHub Actions, tetapi tidak menggantikan bukti pengujian perangkat, testing Play, atau keputusan Google.

## Sumber primer

- [Target API level](https://support.google.com/googleplay/android-developer/answer/11926878?hl=en)
- [Testing personal accounts](https://support.google.com/googleplay/android-developer/answer/14151465?hl=en)
- [VPN declaration](https://support.google.com/googleplay/android-developer/answer/12564964?hl=en)
- [Foreground-service types](https://developer.android.com/develop/background-work/services/fgs/service-types)
- [Data safety](https://support.google.com/googleplay/android-developer/answer/10787469?hl=en)
- [Health declaration](https://support.google.com/googleplay/android-developer/answer/14738291?hl=en)
- [Account deletion](https://support.google.com/googleplay/android-developer/answer/13327111?hl=en)
- [Monitoring/Stalkerware](https://support.google.com/googleplay/android-developer/answer/9888380?hl=en)
- [isMonitoringTool](https://support.google.com/googleplay/android-developer/answer/12955211?hl=en)
- [Accessibility API](https://support.google.com/googleplay/android-developer/answer/10964491?hl=en)
- [Broad package visibility](https://support.google.com/googleplay/android-developer/answer/10158779?hl=en)
- [Signing](https://developer.android.com/studio/publish/app-signing)
- [AGP compatibility](https://developer.android.com/build/releases/agp-8-10-0-release-notes)


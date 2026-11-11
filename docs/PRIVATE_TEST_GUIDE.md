# Uji Gempur Privat pada dua HP

Panduan kandidat 0.3, 9 November 2026. Pemilik memilih uji APK privat; panduan ini **bukan laporan bahwa uji dua HP sudah dilakukan**. Gunakan perangkat uji milik peserta dewasa yang memahami dan menyetujui setiap pilihan. AI domain lokal ditambahkan sebagai bantuan peninjauan; build privat belum layak dianggap perlindungan menyeluruh atau rilis Play.

## Pilih APK yang benar

Pasang artifact **privateDebug** yang tercatat dalam evidence build valid pada kedua HP Android 10+. Labelnya **Gempur Privat**, application ID `id.gempur.app.private.debug`. Ia dapat berdampingan dengan build biasa; akun dan pengaturan build lain tidak disalin otomatis.

Debug/release biasa tetap tanpa berbagi temuan otomatis dan tanpa aset model. Server yang mengizinkan private monitoring tidak dapat mengaktifkan fitur ini di build biasa. [Bukti kandidat AI 0.3](evidence/2026-11-09-local-ai-build.json) mencatat 120 eksekusi tes, kedua lint 0 issue, 69 vektor parity dan 13 tes protokol Python terpisah. Unit test tidak membuktikan akurasi model atau notifikasi dua HP; baca [model card](LOCAL_AI_MODEL_CARD.md) untuk benchmark serta kegagalan generalisasinya.

## Sambungkan server uji

Pilih salah satu cara berikut. Tidak ada server Gempur bawaan yang telah dihosting.

**Laboratorium USB/ADB opsional:** hanya untuk dua HP uji yang dihubungkan ke komputer pemilik. Pasang Node.js 24 dan Android platform-tools. Pemilik HP harus mengizinkan USB debugging serta mempercayai komputer tersebut secara sengaja. Dari folder repository:

```sh
cd server
GEMPUR_PRIVATE_MONITORING=true npm start
```

Di terminal lain, lihat serial kedua HP dengan `adb devices`, lalu untuk masing-masing perangkat:

```sh
adb -s DEVICE_SERIAL reverse tcp:8080 tcp:8080
```

Ganti `DEVICE_SERIAL` dengan serial yang benar. Atur endpoint pada kedua APK privat ke `http://127.0.0.1:8080`. ADB reverse meneruskan loopback masing-masing HP ke server komputer; ini pengecualian debug yang terbatas, bukan izin HTTP melalui internet. Langkah ini belum dijalankan sebagai bukti uji perangkat. Setelah selesai, hapus pemetaan pada tiap HP dengan `adb -s DEVICE_SERIAL reverse --remove tcp:8080` dan hentikan server.

**Dua HP tanpa USB/jarak jauh:** operator harus menyediakan backend HTTPS sendiri dengan sertifikat yang dipercaya HP, reverse proxy, penyimpanan privat dan `PUBLIC_ORIGIN` sesuai origin sebenarnya. Aktifkan `GEMPUR_PRIVATE_MONITORING=true` saat memulai server. Lihat [setup server](../server/README.md). Pakai origin HTTPS yang sama pada kedua HP; jangan membuka port HTTP mentah ke internet. `GET /api/health` harus menunjukkan `privateMonitoringEnabled:true`. Hosting, domain, TLS dan keberhasilan deployment belum disediakan oleh APK.

## Pasangkan peserta dan pendamping

1. Pada kedua HP, buka tab **Deteksi → Atur server** dan masukkan endpoint sesuai cara uji tadi.
2. Pada HP peserta pilih **Saya peserta: buat profil**. Pada HP pendamping pilih **Saya pendamping: buat profil**. Gunakan nama panggilan; peran akun tidak diubah diam-diam.
3. HP peserta: **Pendamping → Buat undangan pendamping**. Berikan kode hanya kepada pendamping yang dipilih; undangan berlaku 10 menit.
4. HP pendamping: **Pendamping → Terima kode undangan**. Cocokkan identitas dan kode verifikasi melalui percakapan langsung.
5. HP peserta: **Konfirmasi kode pendamping**. Setelah itu perbarui pasangan pada kedua HP. Pairing belum memberi izin berbagi temuan otomatis.

## Aktifkan hanya pilihan yang disepakati

HP peserta:

1. Izinkan notifikasi Gempur dan kedua kanalnya. **Deteksi → Pilih deteksi tambahan lokal** menampilkan consent analisis nama dan peninjauan dugaan. Pilihan ini belum mengunggah data.
2. Aktifkan proteksi DNS dari Beranda bila ingin memfilter domain. Tes proteksi aman memeriksa jalur DNS sintetis.
3. Jika ingin deteksi dugaan aplikasi, pilih **Pengaturan aksesibilitas untuk aplikasi** dan aktifkan layanan Gempur secara sengaja. Layanan hanya menerima nama paket saat jendela berganti dan mencatat dugaan tanpa menutup aplikasi. Ia tidak membaca teks layar, menangguhkan aplikasi, atau memblokir seluruh trafiknya. Pemindaian lokal terbatas pada subset aplikasi launcher yang terlihat lewat query MAIN/LAUNCHER, bukan aplikasi headless atau seluruh inventaris. Tidak ada QUERY_ALL_PACKAGES pada varian mana pun; hasil kosong bukan jaminan semua aplikasi aman.
4. **Perbarui pasangan dan izin server**, lalu **Pilih cakupan berbagi otomatis**. Pilih temuan domain dan/atau aplikasi serta persetujuan terpisah. Hanya temuan baru dalam scope tersebut yang diantrikan; bukan seluruh histori atau inventaris aplikasi.

HP pendamping: buka **Deteksi → Mulai notifikasi pendamping**, berikan izin notifikasi, dan biarkan layanan yang terlihat berjalan. Ia memeriksa server sekitar setiap 30 detik dengan backoff saat offline. Android/OEM, jaringan atau izin dapat menghentikan/menundanya. Ini bukan FCM/Web Push atau pemantauan terjamin 24/7. Notifikasi lock screen bersifat umum; buka app untuk detail. Menjalankan polling bukan tanda sudah dibaca; gunakan **Tandai saya telah membaca** bila sesuai.

## Pilihan AI domain lokal

AI default mati, termasuk setelah upgrade. Ia mempelajari pola nama domain dari data kategori publik; tidak membaca isi website, layar, aplikasi, atau mengirim target ke penyedia AI. Model domain tidak dipakai untuk menilai akurasi aplikasi.

1. HP peserta: aktifkan deteksi lokal tambahan dengan notifikasi terlihat, lalu buka kartu **AI lokal · peninjauan domain** pada tab Deteksi.
2. Pilih **Pilih AI lokal untuk peninjauan** dan baca consent. Skor 0–1 adalah skor pola yang belum dikalibrasi, bukan persentase kepastian judol.
3. Jika berbagi otomatis sudah aktif, backend harus 0.3 dan `GET /api/health` menyatakan `localDomainAiSignals:true`. Perbarui backend terlebih dahulu; UI menolak aktivasi/sharing yang tidak kompatibel. Untuk uji lokal tanpa backend, hentikan berbagi otomatis dan sinkronkan pencabutan, lalu pilih AI lokal.
4. Pilih **Periksa domain tanpa membuka situs**. Masukkan nama domain saja. Pemeriksaan ini tidak membuka situs, tidak membuat temuan baru dan tidak mengirim laporan. Hasil abstain/di bawah ambang bukan pernyataan aman.
5. Baca [model card](LOCAL_AI_MODEL_CARD.md) untuk sumber, split, metrik dan keterbatasannya. Hasil AI `ml_model/suspected/flagged` hanya meminta tinjauan; DNS diteruskan. Aturan dikenal/pribadi/heuristik lama dapat tetap membatasi target secara terpisah.
6. **Matikan analisis AI baru** menghentikan penilaian baru. Temuan yang menunggu penyimpanan diperiksa ulang dan dilepas jika pilihan AI berubah. Temuan yang sudah tersimpan dalam antrean pengiriman tetap mengikuti grant sebelumnya. Gunakan **Hentikan berbagi otomatis** dan sinkronkan penghentian untuk menghentikan pengiriman; informasi yang sudah dibaca penerima tidak dapat ditarik kembali.

Tidak ada jaminan input yang sengaja dipilih akan menghasilkan flag. Jangan menggunakan contoh sintetis atau domain bank yang lolos sebagai bukti akurasi dunia nyata. Model/data rusak membuat analisis tidak tersedia, bukan menghapus catatan atau menganggap target aman.

## Uji aman dan koreksi salah blok

Known berarti cocok aturan dikenal; personal berarti aturan peserta; suspected dapat berasal dari heuristik nama atau sinyal AI lokal dan tetap perlu ditinjau; unknown belum diketahui. AI hanya mempelajari nama domain, bukan isi website/aplikasi. Daftar aktif tetap 10 seed domain dan fixture, sedangkan 480 kandidat Indonesia belum aktif; contoh training tidak otomatis menjadi daftar blokir.

`gempur-block.test`, domain contoh `example.com/net/org`, serta fixture diagnostik lain sengaja tidak menjadi laporan aktivitas atau notifikasi pendamping. Jangan menguji notifikasi judol dengan membuka situs judi. Untuk uji metadata, gunakan domain benign nyata yang dikendalikan penguji, pastikan dapat dibuka sebelum pengujian, lalu tambahkan sebagai aturan pribadi. Pengujian aplikasi memakai fixture jinak milik pengembang, bukan pemasangan aplikasi judi. Catat browser, Secure DNS, jaringan dan cache; DNS-only dapat dilewati DoH/DoT/direct IP/TCP DNS/VPN lain.

Untuk salah blok:

1. Peserta membuka temuan lokal/server pada tab **Deteksi**, memilih **Ajukan salah blok** dan meninjau target yang dikirim.
2. Pendamping memuat **temuan dan permintaan koreksi**, meninjau target, lalu **Setujui target ini** atau **Tolak**.
3. Setelah cooldown 10 menit, peserta membuka **Aturan → Periksa permintaan koreksi** dan mengonfirmasi penerapan lokal.
4. Izin satu kali hanya untuk domain/paket tepat itu; berakhir maksimal 30 menit setelah cooldown. Target lain tetap dibatasi. Approval bukan bukti target aman dan tidak membuka seluruh proteksi.

## Berhenti dan menghapus

- **Hentikan berbagi otomatis** menghentikan antrean pengiriman lokal; selesaikan **Sinkronkan penghentian** bila offline. Deteksi lokal dapat tetap dipakai tanpa berbagi. Menghentikan layanan/notifikasi tidak membuktikan grant server sudah dicabut; banner tersimpan menunjukkan penghentian yang belum sinkron dan mencegah pengaktifan ulang sebelum sinkronisasi yang sesuai selesai.
- **Hentikan deteksi dan berbagi privat** mematikan tambahan privat di HP peserta. Proteksi DNS dasar dapat dihentikan terpisah dari Beranda. Accessibility dan notifikasi tetap dapat dimatikan melalui Android; tidak ada anti-uninstall.
- **Hapus riwayat deteksi lokal** pada tab Deteksi menghentikan layanan privat dan membersihkan inbox HP itu. Catatan check-in tetap ada; penanda pencabutan server yang belum sinkron dipertahankan. Ini tidak menggantikan penghapusan akun/server.
- **Pendamping → Berhenti berbagi/Akhiri pasangan** mencabut pairing. **Aturan → Hapus akun server** menghapus akun dan data terkait pada database aktif; catatan lokal tetap disimpan. Pengelola menangani backup/WAL sesuai kebijakan retensi. Salinan yang telah dibaca/disimpan penerima tidak dapat ditarik kembali.

Antrean lokal dibatasi 100 temuan dan 24 jam; temuan sejenis digabung per 5 menit. Server membatasi 500 temuan/pasangan, retensi 7 hari dan menolak upload saat batas penuh. Tidak ada jaminan semua alert terkirim. Jangan menyimpulkan peserta berjudi dari koneksi, atau menyimpulkan tidak berjudi ketika laporan kosong/terlambat.

## Uji antrean DNS pada perangkat uji

Gunakan domain benign yang dikendalikan penguji dan resolusi DNS yang diketahui melewati filter. Bandingkan waktu respons DNS sebelum dan selama burst permintaan dengan setelan jaringan yang sama. Catat perangkat, jaringan, jumlah kueri, p50/p95, timeout, dan jumlah temuan yang tiba. Antrean penulis hanya menampung 32 temuan menunggu, sehingga volume laporan dapat turun ketika penyimpanan lambat.

Saat ada temuan tertunda, hentikan berbagi. Sinkronkan penghentian dan konfirmasi grant baru pada pasangan uji. Periksa bahwa laporan lama tidak dikaitkan dengan grant baru dan permintaan baru mengikuti scope yang dipilih. Ulangi dengan pencabutan izin VPN dan catat bahwa pekerjaan yang masih menunggu dibuang. Gunakan emulator terisolasi untuk fixture yang mereset data.

## Sumber dan gate berikutnya

Ditinjau 9 November 2026: [kebijakan monitoring Google](https://support.google.com/googleplay/android-developer/answer/9888380?hl=en) dan [isMonitoringTool](https://support.google.com/googleplay/android-developer/answer/12955211?hl=en) membatasi monitoring orang lain; consent dewasa atau APK privat tidak otomatis membuktikan penerimaan Play/pengecualian Play Protect. [Accessibility policy](https://support.google.com/googleplay/android-developer/answer/10964491?hl=en) membedakan aturan deterministik dan agen keputusan otonom; label parental tidak boleh dipakai untuk kasus dewasa.

Batas platform: [AccessibilityService/HOME](https://developer.android.com/reference/android/accessibilityservice/AccessibilityService#performGlobalAction(int)), [izin notifikasi](https://developer.android.com/develop/ui/compose/notifications/notification-permission), [foreground service](https://developer.android.com/develop/background-work/services/fgs/launch), dan [package visibility](https://developer.android.com/training/package-visibility). Gate berikutnya adalah full build/review lalu uji dua HP, revokasi offline, false positive, fungsi penting dan baterai. Tidak ada klaim kelulusan perangkat sampai bukti aktual dicatat.

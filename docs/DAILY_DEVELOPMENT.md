# Pengembangan dan riset harian

Jadwal yang diminta pemilik: setiap hari sekitar pukul **09.00 WIB**, mulai 10 November 2026. Jadwal ini memicu satu run pekerjaan, bukan proses komputasi yang terus berjalan 24 jam.

Sumber kebenaran adalah kode terbaru, PR, hasil verifier mandiri, dan bukti QA di repository. GitHub Actions tidak lagi menjadi jalur build aktif. Baca AGENTS.md serta RELEASE_READINESS.md sebelum mengubah kode.

Setiap run harus:

1. Memeriksa regresi, hasil verifikasi mandiri, dan blocker rilis terkini.
2. Meneliti sumber primer baru yang relevan lalu memilih satu gap bernilai tinggi.
3. Mengimplementasikan perubahan konkret, lalu menjalankan `node tools/verify.mjs` penuh pada source kandidat. Simpan hasil PASS/FAIL, source fingerprint, exit code, lint, dan checksum artifact dari `out/verify/<run>/evidence.json`.
4. Memperbarui changelog, readiness, backlog dan laporan bertanggal.
5. Membuat PR dan menggabungkan perubahan yang telah lolos verifikasi penuh serta review independen. `--quick` berstatus PARTIAL dan tidak cukup untuk merge. Pertahankan proteksi branch yang benar-benar berlaku; kegagalan Actions historis tidak dipalsukan sebagai sukses.
6. Melaporkan hasil nyata, keterbatasan dan dependency pengguna.

Tidak membuat perubahan sekadar untuk memenuhi kuota commit. Tidak me-reset catatan/data pengguna. Tidak menerbitkan ke Play, deploy runtime publik, atau menghubungi tester tanpa instruksi spesifik.

## Prioritas setelah fondasi

- Prioritas pertama sekarang adalah pilot APK privat yang dipilih pemilik: uji dua HP dengan HTTPS, consent terpisah, pairing, notifikasi, revokasi, dan koreksi salah blok. Baca [PRIVATE_TEST_GUIDE.md](PRIVATE_TEST_GUIDE.md) serta [kontrak implementasi](PRIVATE_AUTOMATION_CONTRACT.md).
- Pertahankan isolasi build: `privateDebug` saja yang dapat berbagi temuan otomatis; debug/release biasa tetap manual. Server privat default mati, dan grant lama tetap mati setelah upgrade.
- Uji pemisahan known/personal/suspected/unknown dan benign controls. Dugaan nama bukan hasil AI atau bukti niat berjudi; scan dibatasi pada launcher yang terlihat melalui MAIN/LAUNCHER, tanpa QUERY_ALL_PACKAGES di seluruh varian, dan bukan inventaris yang boleh diunggah.
- Catat polling foreground sekitar 30 detik sebagai polling, bukan FCM/push instan. Prioritaskan bukti layar terkunci, izin notifikasi, Android/OEM menghentikan layanan, jaringan putus, dan baterai sebelum klaim keandalan.
- Menutup gap coverage DoH/DoT/TCP DNS/IPv6 dan menilai mekanisme filtering lebih kuat.
- Memverifikasi subset daftar Indonesia, false positives, sumber dan lisensinya.
- Memperkuat pengujian jaringan, migrasi/pemulihan data, identitas signing dan keamanan distribusi daftar.
- Validasi OEM/perangkat nyata, baterai, akses fungsi penting dan lifecycle.
- Menyiapkan privacy/deletion URL, akun Play, deklarasi, dan proses closed testing.
- Meningkatkan dukungan pengguna, accessibility dan operasi backend sebelum rilis stabil.

Validasi full berikutnya harus membangun/lint varian biasa dan privat, serta membuktikan manifest release tidak memuat service/izin khusus privat. Jangan membawa fitur privat ke jalur Play atau mengiklankan rilis publik sebelum gate produk dan kebijakan ditinjau. Pemilihan APK privat tidak menghapus kebutuhan evaluasi keamanan atau Play Protect.

Catat hasil setiap tanggal di `docs/development/YYYY-MM-DD.md`; retry pada tanggal sama menambahkan hasil tanpa menghapus riwayat.

## Ketersediaan environment

Verifier memerlukan Node.js 24, JDK 17, Android SDK 36/build-tools 35.0.0 dan akses dependency pada build pertama. Gunakan Gradle wrapper, atau `GEMPUR_GRADLE` yang menunjuk instalasi Gradle 8.11.1 yang telah diverifikasi. Jika environment tidak tersedia, hasil tetap PARTIAL/FAIL sesuai fakta; jangan mengarang build berhasil atau menyebut runner selalu aktif. Lihat [LOCAL_BUILD.md](LOCAL_BUILD.md).

Pemulihan billing GitHub bukan dependency pengembangan. Tidak ada pendaftaran layanan CI, pembayaran, atau upload Play otomatis yang dilakukan oleh jalur ini.

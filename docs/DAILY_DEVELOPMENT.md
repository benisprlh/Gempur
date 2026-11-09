# Pengembangan dan riset harian

Jadwal yang diminta pemilik: setiap hari sekitar pukul **09.00 WIB**, mulai 10 November 2026. Jadwal ini memicu satu run pekerjaan, bukan proses komputasi yang terus berjalan 24 jam.

Sumber kebenaran adalah kode terbaru, PR, CI, dan bukti QA di repository. Baca AGENTS.md serta RELEASE_READINESS.md sebelum mengubah kode.

Setiap run harus:
1. Memeriksa regresi, hasil CI, dan blocker rilis terkini.
2. Meneliti sumber primer baru yang relevan lalu memilih satu gap bernilai tinggi.
3. Mengimplementasikan perubahan konkret dan menguji hasilnya.
4. Memperbarui changelog, readiness, backlog dan laporan bertanggal.
5. Membuat PR dan menggabungkan perubahan yang telah lolos review/checks.
6. Melaporkan hasil nyata, keterbatasan dan dependency pengguna.

Tidak membuat perubahan sekadar untuk memenuhi kuota commit. Tidak me-reset catatan/data pengguna. Tidak menerbitkan ke Play, deploy runtime publik, atau menghubungi tester tanpa instruksi spesifik.

## Prioritas setelah fondasi

- Menutup gap coverage DoH/DoT/TCP DNS/IPv6 dan menilai mekanisme filtering lebih kuat.
- Memverifikasi subset daftar Indonesia, false positives, sumber dan lisensinya.
- Memperkuat pengujian jaringan, migrasi/pemulihan data, identitas signing dan keamanan distribusi daftar.
- Validasi OEM/perangkat nyata, baterai, akses fungsi penting dan lifecycle.
- Menyiapkan privacy/deletion URL, akun Play, deklarasi, dan proses closed testing.
- Meningkatkan dukungan pengguna, accessibility dan operasi backend sebelum rilis stabil.

Catat hasil setiap tanggal di `docs/development/YYYY-MM-DD.md`; retry pada tanggal sama menambahkan hasil tanpa menghapus riwayat.


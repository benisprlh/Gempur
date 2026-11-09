# Kebijakan Privasi Gempur — Draf Pra-rilis

Disiapkan: 9 November 2026.

**Belum menjadi kebijakan produksi yang dipublikasikan.** Sebelum rilis, pemilik harus menetapkan identitas pengelola layanan, kontak privasi yang dapat dihubungi secara privat, URL kebijakan dan penghapusan akun, penyedia hosting/DNS yang digunakan, serta praktik backup sebenarnya. Sesuaikan dokumen ini dengan build dan konfigurasi layanan final; jangan hanya mengganti label draf.

## Tujuan Gempur

Gempur membantu pemilik Android membatasi akses ke domain judi yang dikenali, mencatat check-in secara sukarela, dan meminta dukungan orang tepercaya. Aplikasi bukan alat pemantauan tersembunyi dan bukan layanan medis.

## Data yang diproses di perangkat

Ketika filtering DNS aktif, Gempur mencocokkan domain pada permintaan DNS yang berada di jalur yang didukung dengan daftar aturan lokal. Aplikasi dapat menyimpan aturan tambahan, pengaturan proteksi, agregat blok, rencana dukungan, dan check-in yang Anda buat. Data tersebut tidak menjadi histori browsing yang otomatis dikirim kepada pendamping.

Aplikasi tidak dirancang untuk membaca chat, SMS, OTP, isi layar, transaksi bank, lokasi, kamera, atau mikrofon. Gempur tidak membuka isi HTTPS untuk mengetahui aktivitas Anda di dalam situs.

Permintaan DNS yang diizinkan diteruskan ke resolver yang digunakan konfigurasi proteksi. Resolver jaringan dapat menerima nama domain dan informasi jaringan yang dibutuhkan untuk menjawab permintaan. Pemrosesan lokal bukan berarti seluruh komunikasi DNS berlangsung di dalam HP atau otomatis terenkripsi end-to-end. Pilihan resolver dan transport sebenarnya harus dijelaskan sesuai implementasi rilis.

## Layanan pendamping opsional

Fungsi lokal dapat digunakan tanpa membuat akun layanan pendamping. Bila Anda mengaktifkan layanan tersebut, server memproses identitas akun/perangkat yang diperlukan untuk autentikasi, nama tampilan yang dipilih, pairing, versi persetujuan, snapshot yang sengaja dikirim, permintaan bantuan, dan koreksi salah blok.

Anda meninjau informasi sebelum mengirimkannya. Pendamping hanya mendapat akses sesuai hubungan yang Anda setujui. Ringkasan menunjukkan informasi yang telah dibagikan, bukan akses langsung ke seluruh HP atau bukti transaksi perjudian.

Layanan dapat memproses metadata teknis minimum seperti waktu permintaan dan alamat jaringan untuk keamanan dan pengoperasian. Konfigurasi log produksi harus menghindari token, isi check-in, detail permintaan bantuan, domain pribadi, serta payload autentikasi. Tidak ada iklan, penjualan data, atau analitik perilaku pihak ketiga pada desain alpha.

## Keamanan

Komunikasi layanan pendamping produksi harus memakai HTTPS. Token akses disimpan dalam bentuk hash di server; penyimpanan data dan backup memerlukan pengamanan oleh operator. Enkripsi end-to-end tidak diklaim untuk layanan pendamping alpha. Jangan menafsirkan HTTPS sebagai jaminan bahwa operator tidak dapat membaca data yang diproses server.

## Retensi dan penghapusan

Pada implementasi server alpha, snapshot, permintaan dukungan, dan koreksi diberi batas akses/TTL 14 hari. Pembersihan database dijalankan saat layanan memproses permintaan; bila server tidak digunakan, penghapusan fisik dapat tertunda sampai proses pembersihan berikutnya. Sebelum produksi, tetapkan pekerjaan pembersihan terjadwal serta verifikasi praktik backup; jangan menjanjikan penghapusan fisik tepat pada hari ke-14 berdasarkan TTL saja.

Pencabutan hubungan berbagi menghilangkan akses pendamping dan menghapus data berbagi aktif yang terkait sesuai implementasi server. Anda juga dapat menghapus akun layanan; data aktif terkait dihapus dari database. Data di WAL/backup dan pemulihan cadangan harus ditangani operator dengan kebijakan yang terdokumentasi. Penghapusan dari database aktif tidak diklaim sebagai penghapusan kriptografis seluruh salinan.

Data lokal dapat dihapus melalui kontrol aplikasi yang tersedia atau pengaturan Android. Informasi yang sebelumnya dilihat atau disalin pendamping tidak dapat ditarik kembali dari ingatan atau salinan pribadi mereka.

## Kendali Anda

- Pilih fungsi lokal tanpa berbagi.
- Tinjau identitas pendamping dan isi yang dikirim.
- Cabut berbagi tanpa meminta persetujuan pendamping.
- Hapus data/akun menggunakan mekanisme yang tersedia.
- Hentikan proteksi atau cabut izin melalui kendali yang jelas di aplikasi dan Android.

Jika perangkat offline saat Anda mencabut persetujuan, pengiriman baru dihentikan secara lokal. Server baru dapat menerapkan perubahan setelah menerimanya. Aplikasi tidak dapat menjanjikan perubahan server seketika tanpa koneksi.

## Kontak dan perubahan

Kontak privasi resmi dan URL penghapusan akun belum ditetapkan; keduanya merupakan blocker rilis publik. Jangan mengirim check-in, token akun, riwayat pribadi, atau permintaan penghapusan yang berisi identitas ke GitHub Issues publik.

Perubahan pemrosesan data harus diberitahukan dan, bila relevan, memerlukan persetujuan baru sebelum berlaku. Versi kebijakan produksi harus menyebut pengelola Gempur serta tanggal efektif yang benar.


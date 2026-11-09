# Signing release candidate

APK debug memiliki identitas development terpisah (`id.gempur.app.debug`). Identitas ini bukan upload key produksi. Kunci debug lokal tidak disertakan dalam deliverable dan tidak dipakai untuk produksi.

Build release tanpa konfigurasi signing menghasilkan AAB unsigned. Agar kandidat dapat diunggah ke Play, pemilik harus menetapkan upload key yang disimpan aman dan mengatur Play App Signing. Jangan membuat kunci produksi sementara yang hilang pada akhir sesi.

Konfigurasi Gradle menerima empat environment variable saja:

| Variable | Isi |
| --- | --- |
| `GEMPUR_UPLOAD_STORE_FILE` | Path absolut ke keystore di luar repository |
| `GEMPUR_UPLOAD_STORE_PASSWORD` | Password keystore |
| `GEMPUR_UPLOAD_KEY_ALIAS` | Alias upload key |
| `GEMPUR_UPLOAD_KEY_PASSWORD` | Password key |

Jika hanya sebagian konfigurasi tersedia, build gagal. Nilai tidak dicetak atau dimasukkan ke command line Gradle. Jangan menulis nilainya ke dokumen, chat publik, git, atau log.

Workflow `Build signed release candidate` menerima keystore base64 dari secret `GEMPUR_UPLOAD_KEYSTORE_BASE64`, beserta tiga secret password/alias yang namanya sama dengan tabel. Konfigurasikan protected environment `release-signing` dan pembatasan approval sebelum dipakai. Keystore hanya ditulis ke direktori sementara runner dan dibersihkan ketika job berakhir.

Workflow tersebut hanya menyiapkan artifact. Tidak melakukan upload atau publish ke Play. Ia menolak branch selain main dan membutuhkan tindakan manual setelah checks serta review selesai. Akun GitHub harus kembali dapat menjalankan Actions.

Sebelum upload Play, verifikasi sertifikat, application ID, versionCode yang naik, data safety, URL privasi/penghapusan, hasil pengujian dan izin pemilik. Kunci update daftar domain merupakan identitas terpisah dari upload key APK/AAB; prosesnya dijelaskan pada rules/README.md.

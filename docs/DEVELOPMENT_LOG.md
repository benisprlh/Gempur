# Development Log

## 2026-11-09 — Bootstrap alpha

### Tujuan

Menyiapkan implementasi Android, companion API/dashboard, fondasi pengujian, dan rencana rilis dengan klaim yang sesuai kemampuan nyata.

### Riset yang memengaruhi keputusan

- Target app baru Google Play saat ini adalah API 36. Build direncanakan memakai AGP 8.10.1, Gradle 8.11.1, dan JDK 17; kompatibilitas AGP 8.10 dengan API 36 dikonfirmasi dari dokumentasi Android.
- Akun personal baru tertentu memerlukan closed testing 12 tester selama 14 hari berturut-turut. Tanggal produksi harus mengikuti opt-in aktual dan review Google.
- DNS-only VPN memiliki cakupan terbatas. Always-on/lockdown tidak dijanjikan untuk mesin awal karena non-DNS traffic tidak dirutekan penuh ke tunnel.
- Consent dewasa tidak otomatis mengesahkan remote activity monitoring di Google Play. Baseline produk tetap proteksi lokal dan tindakan berbagi yang dipicu peserta.
- Check-in perilaku dan dukungan terkait kecanduan perlu dievaluasi pada Health apps declaration; tidak cukup menganggap aplikasi hanya utility tanpa melihat fungsi aktual.

### Perubahan

- Workflow CI server + Android ditambahkan, termasuk artifact debug APK, unsigned release AAB, checksum dan laporan.
- Rencana rilis bersyarat, requirement traceability, panduan privasi/deklarasi Play, template bug/PR, dan aturan pengembangan berkelanjutan ditambahkan.
- Implementasi, integrasi, dan hasil pengujian kode dicatat oleh pengembang pada bagian berikut setelah benar-benar dijalankan.

### Validasi aktual

Belum ada hasil build/perangkat yang dicatat oleh dokumen bootstrap ini. Isi bagian ini dengan command, exit status, jumlah tes, commit, dan link CI; jangan menganggap status ini sebagai hasil gagal atau sukses.

### Blocker yang diketahui

- Belum ada bukti uji HP nyata, verifikasi Play Console, signing produksi, URL privasi/penghapusan publik, atau hosting backend produksi.
- Daftar domain dan cakupan browser memerlukan perluasan berdasarkan sumber yang sah dan hasil uji.
- Checklist lengkap berada di [Release readiness](RELEASE_READINESS.md).


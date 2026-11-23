# Diagnostik waktu primitive DNS pada host

Alat pengembang `node tools/benchmark-dns.mjs` mengompilasi source engine Java yang sama dengan proyek ke direktori temp baru dan menjalankan fixture sintetis secara offline. Tidak mengubah APK, model, consent, aturan produksi atau data peserta. Tidak memakai jaringan, ADB, resolver, situs judi atau input aktivitas nyata.

## Menjalankan

Pasang JDK17 penuh melalui JAVA_HOME atau PATH serta Node24. Dari root repo:

```sh
mkdir -p out/perf
node tools/benchmark-dns.mjs > out/perf/host.json
```

Default5000 sampel per tahap, warmup20000 tiap tahap. `--samples 100..100000` membatasi workload; `--help` tidak membutuhkan JDK/SDK. Flag/path input lain ditolak. Exit0 menghasilkan JSON; exit2 argumen salah; exit1 berarti hasil tidak diterima. Hasil JSON di stdout dan error di stderr; redirect dipilih operator ke out/ yang diabaikan git. Kompilasi/temp dibersihkan setelah selesai/gagal. Environment anak dibatasi agar opsi/agent JVM dan credential tidak diwariskan.

## Yang diukur

| Tahap | Lingkup |
| --- | --- |
| dnsParse | DnsCodec.parseQuery pada paket fixture yang sudah dibentuk; tidak termasuk pembuatan paket |
| ruleLookup | DomainRules.isBlocked dengan satu aturan sintetis risk.example yang sudah dibuat; bukan ukuran daftar produksi atau biaya membangun aturan |
| modelPredictUncached | LexicalDomainModel.predict mentah pada modelV1; tanpa cache/guard/adapter Android |
| modelLoadOnceNs | Satu observasi load file dan parse; input telah dibaca untuk hashing sehingga jangan sebut cold-disk load |

Corpus delapan nama sintetis berurutan siklik: unknown, rule/subdomain, suffix neighbour, konteks berita/pemulihan, IDN, DNS service label dan hostname panjang. Beberapa model input dapat abstain; corpus bukan label kebenaran judol dan bukan distribusi pengguna Indonesia. Timer/dispatch, JIT/GC serta beban host masuk hasil. Warmup tetap tidak menjamin kestabilan JIT. Checksum hasil dikonsumsi agar pekerjaan tidak sekadar dibuang; bukan bukti bahwa semua optimisasi/noise telah dieliminasi.

JSON mencatat SHA256 engine/harness/wrapper/model/manifest, hash fixture, versiJava/OS/arsitektur, samples serta p50/p95/p99 ns. Input sebelum/sesudah dicocokkan, bytes model cocok dengan manifest. Ini verifikasi source yang dipakai, bukan attestation CI independen.

## Interpretasi

`HOST_TIMING_DIAGNOSTIC` adalah snapshot single-process/run. Tidak memakai JMH, fork statistics, thermal control atau benchmark ART. Jangan menyebutnya hasil Android, end-to-end DNS/VPN, throughput jaringan, baterai, notifikasi, akurasi atau bukti rilis. Jangan menjumlahkan percentile antar tahap untuk membuat latency DNS total. Ulangi pada lingkungan terkendali sebelum menyimpulkan regresi; pengukuran baru tidak boleh menimpa riwayat. Tidak ada pass/fail threshold performa produksi dari angka ini.

Untuk QA Android, gunakan pengukuran pada dua HP yang disetujui dan skenario DNS/cache/DoH/IPv6/VPN lain, antrean/consent/lifecycle, fungsi penting serta baterai dari PRIVATE_TEST_GUIDE. Panduan Android Microbenchmark menekankan perangkat nyata dan konfigurasi non-debuggable untuk hasil representatif; debug APK hasil full build bukan bukti performa rilis.

[Snapshot23November](evidence/2026-11-23-host-timing.json) adalah contoh nyata dengan batas di atas. Full software verification dicatat terpisah pada laporan pengembangan.

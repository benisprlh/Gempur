# Roadmap data AI domain Indonesia

Riset sumber primer: **9 November 2026**. Belum ditemukan dataset baru yang siap dipakai dengan label judol/nonjudol Indonesia, lisensi dataset yang jelas, dan evaluasi independen. Tidak ada data diimpor atau model diubah dalam riset ini.

## Baseline beku

Eksperimen `domain-ml-2026-11-09-v1`, model, ambang, split dan hasil pertama tetap dibekukan; jangan retune memakai final test atau holdout yang sudah dilihat. [Model card](LOCAL_AI_MODEL_CARD.md) menjadi sumber hasil lengkap.

- Final test: 16.006 keluarga, 4.003 proxy positif dan 12.003 proxy negatif; TP 2.552, FP 11, TN 11.992, FN 1.451.
- Holdout Indonesia arfshl: 443 proxy positif, 7 flag kebijakan acuan (**recall 1,58%**), tanpa negatif. Ini bukan accuracy, precision atau pengukuran HP nyata.
- AI tetap advisory-only; label independen yang diadjudikasi belum tersedia. Hasil tinggi paper atau proxy feed tidak membuka gate pemblokiran otomatis.

## Sumber baru dan blocker

| Sumber primer | Status dan keputusan |
| --- | --- |
| [Paper Amikom, DOI 10.47065/bulletincsr.v5i4.586](https://www.hostjournals.com/bulletincsr/article/view/586), [PDF](https://hostjournals.com/bulletincsr/article/download/586/355/2314) | Atribut URL/domain/teks/`is_gambling`; isi paper menyebut 24.336 positif dan 36.529 negatif setelah pemeriksaan manusia. Abstract tidak konsisten: 34.336 positif. Artikel CC BY 4.0 **bukan bukti lisensi dataset**; landing menyatakan data unduhan belum tersedia, dan tidak ditemukan rilis dataset. Blocker: memperoleh bytes dataset, provenance, tanggal, metode anotasi dan izin dataset eksplisit. |
| [ABPindo](https://github.com/ABPindo/indonesianadblockrules/tree/1f74f25df319c2e40403d2665e2ec87fd9d99af6), [lisensi](https://github.com/ABPindo/indonesianadblockrules/blob/1f74f25df319c2e40403d2665e2ec87fd9d99af6/LICENSE) | Pool kandidat Indonesia/Malaysia; dual GPLv3+ atau CC BY-SA 3.0+, atribusi The ABPindo authors. `src/adult/adult_thirdparty.txt` mencampur judi/dewasa/iklan/pelacak dan aturan third-party/popup/path. **Bukan ground truth judol**; jangan ubah menjadi blok seluruh domain. Perlu anotasi dan pemeriksaan kompatibilitas distribusi. |
| [Just Dork and Crawl, arXiv v1](https://arxiv.org/html/2508.19368v1) | Pengumpulan Mei 2025: 453 halaman defacement, 8.837 URL pihak ketiga/5.930 domain. Artikel CC BY 4.0; kode/sebagian besar dataset dijanjikan setelah penerimaan, tanpa tautan rilis ditemukan pada versi diperiksa. Tautan pihak ketiga tidak semuanya judol; label halaman yang diretas tidak otomatis berlaku untuk seluruh domain institusi. |
| [Skiddle-ID mirror](https://github.com/Skiddle-ID/blocklist/tree/2221d05e91d3e99220c2519d8859bf146371f1a4) | Repo MIT, tetapi `situs_judi.txt` saat diperiksa berisi literal `404: Not Found`. URL upstream tersembunyi dalam Secrets; workflow `curl` tidak memakai `--fail`. File split besar tidak membuktikan kategori/freshness. **Tidak digunakan.** |

Tidak ada kontak/email kepada penulis; pengiriman belum diotorisasi. Klaim akurasi 99–100% paper Amikom bukan hasil Gempur: split 80:20/K-fold tidak membuktikan pemisahan keluarga atau waktu; confusion matrix CNN juga masih memiliki kesalahan.

## Pemeriksaan 14 November 2026

- Halaman penerbit Amikom masih menyatakan data unduhan belum tersedia. Akses ke data, lisensi dataset, serta bukti anotasi independen masih diperlukan. [Artikel](https://hostjournals.com/bulletincsr/article/view/586)
- Dataset COMNETS UNSRI menjelaskan pengukuran lalu lintas dari tiga sesi. Berkas dibatasi akses. Metadata tidak mendokumentasikan kontrol negatif dan label keluarga hostname yang dibutuhkan evaluasi Gempur. Tidak ada impor. [Rekaman dataset](https://zenodo.org/records/15233150)
- Kasus normalisasi Wikimedia Commons setelah verifikasi manual memberi kandidat kontrol historis untuk evaluasi salah blokir. Kasus tersebut perlu ditinjau pada cakupan hostname dan waktu yang relevan sebelum dimasukkan ke evaluasi. [Komdigi](https://portal.komdigi.go.id/kanal-publik/berita-kini/10095)

## Protokol kandidat berikutnya

1. Verifikasi lisensi dataset, pin bytes/commit/hash dan provenance setiap sumber. UT1, Sinfonietta dan arfshl sudah digunakan/dicadangkan; agregator seperti Hagezi yang menggabungkannya bukan holdout independen.
2. Sebelum training, cadangkan **holdout Indonesia dan waktu baru** beserta keluarga domainnya. Data yang sudah dilihat menjadi data pengembangan saja untuk kandidat berikutnya; riwayat v1 dipertahankan.
3. Anotasi independen positif dan negatif regional yang representatif, termasuk berita/edukasi judi, pemulihan, bank, gim tanpa taruhan, nama ambigu dan defacement. Direktori pemerintah/popularitas bukan bukti benign. Catat label uncertain, tanggal dan adjudikasi; jangan mengunjungi situs judi otomatis dari proses riset harian.
4. Fit preprocessing pada train; pilih model/ambang pada validation. Bekukan kandidat sebelum sekali membuka test baru. Laporkan confusion matrix, recall termasuk abstention, precision/FPR beserta interval, coverage dan batas sumber; jalankan parity serta QA perangkat terpisah.

Riset harian berikutnya memeriksa rilis sumber dan menyelesaikan blocker nyata, bukan menjanjikan data baru, akurasi 99%, atau tanggal auto-block sebelum bukti tersedia.

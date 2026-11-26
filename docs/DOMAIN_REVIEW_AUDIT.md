# Audit metadata review domain

`node tools/audit-domain-review.mjs out/ml-data/review.json`

Tool host offline untuk menyiapkan review data regional berikutnya. Ia tidak membuka hostname, mengunduh dataset, membaca model, melakukan fit, menulis file atau mengaktifkan aturan. Input manifest maksimal 1 MiB, 2.000 record, 20 review per record. CLI menolak symlink (termasuk komponen path), direktori dan non-regular file. Pemeriksaan path ditujukan untuk host development tepercaya: penolakan symlink statis bukan isolasi terhadap penyerang yang mengganti direktori secara bersamaan. Referensi Linux; path melalui `/tmp` yang berupa symlink pada OS lain dapat ditolak, belum ada validasi lintas platform. Exit0 berarti audit struktur selesai, termasuk bila seluruh record unresolved; **bukan data siap training/produksi**. Exit2 berarti input/tool error dengan pesan generik. `--help` tidak membaca berkas.

## Format schema1

Root hanya `schemaVersion:1` dan `records:[]`. Setiap record harus memiliki persis kolom berikut:

| Kolom | Nilai |
| --- | --- |
| `id`, `sourceId` | Token pseudonim: huruf kecil awal, lalu huruf/angka/underscore/hyphen, maksimal48 karakter |
| `domainSha256`, `familySha256`, `sourceSnapshotSha256` | SHA256 lowercase64hex yang disiapkan operator |
| `datasetLicense` | Assertion SPDX: CC-BY-4.0, CC-BY-SA-4.0, MIT, BSD-3-Clause atau CC0-1.0 |
| `observedAt` | UTC persis `YYYY-MM-DDTHH:mm:ss.sssZ`, tanggal kalender valid |
| `partition` | train, validation, test atau holdout |
| `reviews` | Array0..20 review; kolom persis di bawah |

Setiap review hanya `reviewerId` (token pseudonim), `method` (human_asserted/proxy/automated), `label` (gambling/non_gambling/uncertain), `evidenceSha256` (lowercase64hex), `reviewedAt` (format UTC sama, tidak sebelumobservedAt). Kolom tambahan ditolak. Jangan masukkan nama asli/kontak, URL, isi halaman atau data peserta. Token berbentuk valid belum membuktikan tidak mengandung identitas; operator tetap meninjaunya.

Setelah akuisisi berizin dan sebelumfit, operator menyimpan snapshot/evidence asli dan pemetaan hash secara privat. Tentukan normalisasi hostname dan family grouping yang konsisten terlebih dahulu; tool **tidak** menghitung PSL/brand-family dari hash. Hash bukan anonimisasi: nama domain bisa ditebak melalui dictionary, input maupun hash output tetap dapat sensitif. Jangan commit manifest nyata, pemetaan, evidence browsing atau catatan keluarga ke repo publik. Gunakan `out/ml-data/` yang diabaikan git. Simpan atribusi/lisensi sumber yang benar-benar diperoleh terpisah; allowlist SPDX hanya format yang didukung, bukan verifikasi izin atau daftar seluruh lisensi yang mungkin sah.

## Arti hasil

- ID/domain hash ganda antarrecord ditolak; reviewerID ganda dalam satu record ditolak; family hash yang sama tidak boleh lintas partition. Family yang salah dihitung atau source agregator bisa lolos; tool tidak membuktikan source/time/family independence.
- `consensusCandidateCount`: minimal dua reviewerID berbeda, **semua** review human_asserted dan sepakat pada label yang bukan uncertain. Satu review proxy/automated/uncertain atau konflik membuat record unresolved, meski dua review lain sepakat.
- Pertahankan snapshot dan riwayat disagreement secara privat; jangan menghapus review berbeda/uncertain agar hitungan consensus naik. Adjudikasi manusia berikutnya perlu bukti dan protokol baru yang dapat ditelusuri. Dua ID bukan bukti dua manusia independen. Evidence hash bukan bukti isi, anotasi atau freshness. Konsensus masih assertion, belum adjudikasi yang disertifikasi.
- Output hanya jumlah, partition counts, kandidat label dan SHA256 bytes input; tidak mencetak ID/review/hostname. `independentlyVerifiedLabelCount=0`, `autoQuarantineEligible=false`, `productionRulesChanged=false` selalu tetap.
- Tidak menghitung accuracy/precision/FPR atau gate ilmiah. Tidak mengimpor output ke training atau daftar produksi. Label independen Gempur tetap0 sampai proses eksternal dan bukti reviewer benar-benar tersedia.

## Contoh sintetis tanpa hostname

Jalankan dari root repo pada host development, menggunakan direktori `out/` yang diabaikan git:

```sh
mkdir -p out/ml-data
python3 - <<'PY'
import json
from pathlib import Path
from hashlib import sha256
h=lambda text:sha256(text.encode()).hexdigest()
review=lambda who:{'reviewerId':who,'method':'human_asserted','label':'non_gambling','evidenceSha256':h('synthetic-evidence'),'reviewedAt':'2026-11-26T01:00:00.000Z'}
row={'id':'synthetic-a','domainSha256':h('synthetic-target'),'familySha256':h('synthetic-family'),'sourceId':'synthetic-source','sourceSnapshotSha256':h('synthetic-snapshot'),'datasetLicense':'CC0-1.0','observedAt':'2026-11-26T00:00:00.000Z','partition':'holdout','reviews':[review('synthetic-r-a'),review('synthetic-r-b')]}
Path('out/ml-data/review-synthetic.json').write_text(json.dumps({'schemaVersion':1,'records':[row]}))
PY
node tools/audit-domain-review.mjs out/ml-data/review-synthetic.json
```

Hasil diharapkan:1record,1consensusCandidate,0unresolved dan **0 independentlyVerifiedLabelCount**. Fixture buatan ini bukan dataset atau anotasi manusia. Tes Node juga mencakup kegagalan schema/hash/tanggal, konflik/missing/proxy/automated, duplikasi, leakage family, CLI/symlink/size dan redaksi error. QA perangkat tidak tercakup.

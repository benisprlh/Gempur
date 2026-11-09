#!/usr/bin/env python3
"""Package only fresh artifacts from a complete standalone verification."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import sys
from zipfile import ZipFile, ZIP_DEFLATED

ROOT = Path(__file__).resolve().parent.parent


def checked_bytes(artifact):
    path = ROOT / artifact["path"]
    resolved = path.resolve()
    outputs = (ROOT / "android/app/build/outputs").resolve()
    if not resolved.is_relative_to(outputs) or path.is_symlink():
        raise ValueError("Artifact must be a regular file inside Android build outputs")
    if not path.is_file() or path.stat().st_size > 100 * 1024 * 1024:
        raise ValueError("Artifact is absent or unexpectedly large")
    raw = path.read_bytes()
    if len(raw) != artifact["bytes"] or hashlib.sha256(raw).hexdigest() != artifact["sha256"]:
        raise ValueError("Artifact changed after verification")
    return raw


def package(evidence_path, destination):
    evidence_path = evidence_path.resolve()
    validation = subprocess.run(["node", str(ROOT / "tools/verify.mjs"), "--check-evidence", str(evidence_path)],
                                cwd=ROOT, capture_output=True, text=True)
    if validation.returncode != 0:
        raise ValueError("Evidence validation failed: " + (validation.stdout or validation.stderr).strip())
    evidence = json.loads(evidence_path.read_text())
    entries = {}
    names = {"debug-apk": "Gempur-debug.apk", "private-debug-apk": "Gempur-private-debug.apk",
             "release-aab": "Gempur-release-unsigned.aab"}
    for artifact in evidence["artifacts"]:
        kind = artifact["kind"]
        if kind == "release-aab":
            if artifact.get("signing") != "unsigned":
                raise ValueError("Development package must not mislabel a signed release bundle")
        if kind in names:
            entries[names[kind]] = checked_bytes(artifact)
    if set(entries) != set(names.values()):
        raise ValueError("Ordinary APK, isolated private APK and unsigned release AAB are required")
    entries["verification.json"] = evidence_path.read_bytes()
    entries["BACA_DULU.txt"] = (
        "GEMPUR — PAKET UJI BUILD MANDIRI\n\n"
        "Source: https://github.com/benisprlh/Gempur\n"
        "Build ini tidak memerlukan GitHub Actions atau verifikasi pembayaran GitHub.\n\n"
        "Gempur-debug.apk: aplikasi pengembangan untuk HP uji Android 10+.\n"
        "Gempur-private-debug.apk: APK PRIVAT TERPISAH untuk uji deteksi/berbagi otomatis yang diizinkan peserta. "
        "Application ID id.gempur.app.private.debug; akun/data tidak otomatis dipindah dari build biasa.\n"
        "Gempur-release-unsigned.aab: bundle tanpa upload signing produksi; belum siap diunggah ke Play.\n"
        "verification.json: hasil pemeriksaan penuh dan fingerprint source yang diuji.\n\n"
        "Ekstrak paket, baca keterbatasan, lalu pasang APK hanya pada perangkat yang pemiliknya setuju. "
        "Tidak ada keystore, token, atau data pengguna dalam paket ini.\n\n"
        "Ini masih alpha. Lulus build dan tes otomatis tidak membuktikan lulus uji HP nyata, emulator, "
        "baterai, seluruh browser, atau persetujuan Play. DNS-only masih dapat dilewati DoH/DoT, IP langsung, "
        "TCP DNS, VPN lain, serta perangkat lain. Daftar awal belum mencakup seluruh judol Indonesia.\n\n"
        "APK privat tidak membuktikan kelayakan Play/Play Protect. Deteksi nama adalah dugaan yang bisa salah. "
        "Pemblokiran aplikasi adalah interupsi lewat Accessibility setelah diaktifkan peserta, bukan suspensi sistem "
        "atau pembacaan isi aplikasi. Peserta tetap dapat menghentikan fitur.\n\n"
        "Berbagi otomatis OFF setelah instalasi dan memerlukan persetujuan terpisah dengan pairing terkonfirmasi. "
        "Notifikasi pendamping memakai layanan polling yang dimulai pengguna dengan notifikasi terlihat, "
        "bukan FCM/Web Push dan tidak dijamin segera terkirim. Izin notifikasi/Accessibility diatur peserta. "
        "Backend HTTPS harus diaktifkan operator dengan GEMPUR_PRIVATE_MONITORING=true untuk uji dua HP.\n\n"
        "Fitur lokal dapat dipakai tanpa server. Pendamping jarak jauh memerlukan backend HTTPS sendiri. "
        "Aplikasi ini alat bantu pendampingan, bukan terapi atau layanan darurat.\n"
    ).encode()
    entries["SHA256SUMS.txt"] = "".join(
        f"{hashlib.sha256(raw).hexdigest()}  {name}\n" for name, raw in entries.items()
    ).encode()
    destination = destination.resolve()
    if not destination.is_relative_to((ROOT / "out").resolve()):
        raise ValueError("Write packages under the ignored out/ directory")
    destination.parent.mkdir(parents=True, exist_ok=True)
    if destination.exists():
        raise ValueError("Output already exists; choose a new name to preserve prior builds")
    temporary = destination.with_suffix(destination.suffix + ".tmp")
    try:
        with ZipFile(temporary, "w", ZIP_DEFLATED) as archive:
            for name, raw in entries.items():
                archive.writestr(name, raw)
        with ZipFile(temporary) as archive:
            if archive.testzip() is not None:
                raise ValueError("Archive integrity check failed")
        temporary.replace(destination)
    finally:
        temporary.unlink(missing_ok=True)
    return {"path": str(destination), "bytes": destination.stat().st_size,
            "sha256": hashlib.sha256(destination.read_bytes()).hexdigest(),
            "files": list(entries)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("evidence", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    try:
        print(json.dumps(package(args.evidence, args.output), indent=2))
    except (ValueError, KeyError, OSError, subprocess.CalledProcessError) as error:
        print(f"Packaging refused: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())


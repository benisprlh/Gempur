#!/usr/bin/env python3
"""Fetch only the immutable, hash-locked ML source files; never visit listed domains."""
from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import ssl
import tempfile
from urllib.parse import urlsplit
from urllib.request import HTTPRedirectHandler, HTTPSHandler, Request, build_opener

ROOT = Path(__file__).resolve().parents[2]
LOCK = ROOT / "ml/sources.lock.json"
MAX_BYTES = 2 * 1024 * 1024
REPOSITORIES = {
    ("olbat", "ut1-blacklists"), ("Sinfonietta", "hostfiles"),
    ("benisprlh", "Gempur"), ("publicsuffix", "list"),
    ("arfshl", "anti-gambling-domains"),
}
CC_LICENSE = "https://creativecommons.org/licenses/by-sa/4.0/legalcode.txt"


def checked_path(value: str, prefix: str) -> Path:
    """Confine writes to the ignored cache and reads to declared license files."""
    if not isinstance(value, str):
        raise ValueError("A relative path is required")
    relative = PurePosixPath(value)
    if relative.is_absolute() or ".." in relative.parts or "\\" in value:
        raise ValueError("Unsafe relative path")
    if not value.startswith(prefix + "/"):
        raise ValueError("Path is outside its permitted directory")
    current = ROOT
    for segment in relative.parts:
        current = current / segment
        if current.is_symlink():
            raise ValueError("Symbolic-link paths are not accepted")
    target = ROOT / relative
    if not target.resolve().is_relative_to((ROOT / prefix).resolve()):
        raise ValueError("Path escapes its permitted directory")
    return target


def checked_url(item: dict) -> str:
    url = item.get("url", "")
    if not isinstance(url, str):
        raise ValueError("A source URL is required")
    parsed = urlsplit(url)
    if parsed.scheme != "https" or parsed.username or parsed.password or parsed.port or parsed.query or parsed.fragment:
        raise ValueError("Only plain HTTPS source URLs are accepted")
    if url == CC_LICENSE and item.get("revision") is None:
        return url
    parts = parsed.path.split("/")
    if (parsed.hostname != "raw.githubusercontent.com" or len(parts) < 5
            or (parts[1], parts[2]) not in REPOSITORIES
            or not re.fullmatch(r"[a-f0-9]{40}", parts[3])
            or item.get("revision") != parts[3]):
        raise ValueError("Only allowlisted GitHub files pinned to a full commit are accepted")
    return url


def checked_descriptor(item: dict, prefix: str) -> Path:
    if not isinstance(item, dict) or not re.fullmatch(r"[a-z0-9_.-]+", item.get("id", "")):
        raise ValueError("Source ID is invalid")
    if not isinstance(item.get("bytes"), int) or isinstance(item["bytes"], bool) or not 0 < item["bytes"] <= MAX_BYTES:
        raise ValueError("Source byte count exceeds the hard limit")
    if not isinstance(item.get("sha256"), str) or not re.fullmatch(r"[a-f0-9]{64}", item["sha256"]):
        raise ValueError("A SHA-256 digest is required")
    checked_url(item)
    return checked_path(item["path"], prefix)


def verify(item: dict, prefix: str) -> bool:
    path = checked_descriptor(item, prefix)
    if not path.is_file() or path.stat().st_size != item["bytes"]:
        return False
    return hashlib.sha256(path.read_bytes()).hexdigest() == item["sha256"]


class NoRedirects(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise ValueError("Redirects are refused for immutable source URLs")


def fetch(item: dict) -> dict:
    target = checked_descriptor(item, "out/ml-data")
    if verify(item, "out/ml-data"):
        return {"id": item["id"], "status": "cached_verified", "bytes": item["bytes"]}
    request = Request(checked_url(item), headers={"User-Agent": "Gempur-local-ML-research/0.3"})
    opener = build_opener(HTTPSHandler(context=ssl.create_default_context()), NoRedirects())
    with opener.open(request, timeout=35) as response:
        if response.geturl() != item["url"]:
            raise ValueError("Source URL changed")
        raw = response.read(item["bytes"] + 1)
    if len(raw) != item["bytes"] or hashlib.sha256(raw).hexdigest() != item["sha256"]:
        raise ValueError("Downloaded bytes do not match the source lock")
    # Recheck parent paths after network I/O before creating or replacing any file.
    target = checked_path(item["path"], "out/ml-data")
    target.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    descriptor, temporary_name = tempfile.mkstemp(prefix=".gempur-source-", dir=target.parent)
    temporary = Path(temporary_name)
    try:
        with os.fdopen(descriptor, "wb") as output:
            output.write(raw)
            output.flush()
            os.fsync(output.fileno())
        checked_path(item["path"], "out/ml-data")
        temporary.replace(target)
    finally:
        temporary.unlink(missing_ok=True)
    if not verify(item, "out/ml-data"):
        raise ValueError("Saved source verification failed")
    return {"id": item["id"], "status": "downloaded_verified", "bytes": len(raw)}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check-only", action="store_true", help="Read and verify; perform no writes or network access")
    parser.add_argument("--only", nargs="+", metavar="ID", help="Select locked cache source IDs; licenses are always checked")
    args = parser.parse_args()
    try:
        if LOCK.is_symlink():
            raise ValueError("The source lock cannot be a symlink")
        lock = json.loads(LOCK.read_text())
        if lock.get("schemaVersion") != 1:
            raise ValueError("Unsupported source-lock schema")
        items = list(lock["sources"]) + [lock["psl"]] + list(lock.get("provenance", []))
        identifiers = [item["id"] for item in items]
        if len(items) > 32 or len(set(identifiers)) != len(identifiers):
            raise ValueError("Invalid or duplicate source IDs")
        for item in items:
            checked_descriptor(item, "out/ml-data")
        for license_item in lock["licenses"]:
            if not verify(license_item, "ml/licenses"):
                raise ValueError("A committed license is missing or changed")
        if args.only:
            if set(args.only) - set(identifiers):
                raise ValueError("Unknown source ID")
            items = [item for item in items if item["id"] in args.only]
        results = []
        if args.check_only:
            for item in items:
                results.append({"id": item["id"], "status": "verified" if verify(item, "out/ml-data") else "missing_or_changed"})
        else:
            with ThreadPoolExecutor(max_workers=4) as executor:
                pending = {executor.submit(fetch, item): item["id"] for item in items}
                for future in as_completed(pending):
                    try:
                        results.append(future.result())
                    except Exception as error:
                        # Type-only failure detail avoids accidentally exposing proxy credentials.
                        results.append({"id": pending[future], "status": "failed", "errorType": type(error).__name__})
        successful = all(item["status"] in {"verified", "cached_verified", "downloaded_verified"} for item in results)
        print(json.dumps({"status": "PASS" if successful else "FAIL", "sources": sorted(results, key=lambda x: x["id"]),
                          "notice": "Source hashes establish reproducibility, not correctness of category labels."}, indent=2))
        return 0 if successful else 1
    except (ValueError, KeyError, OSError, TypeError) as error:
        print(json.dumps({"status": "FAIL", "errorType": type(error).__name__,
                          "notice": "Source-lock or local-license validation failed; no labels are verified by this check."}))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())

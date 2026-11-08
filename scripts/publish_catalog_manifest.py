#!/usr/bin/env python3
"""Valida una pareja de catalogos y publica su manifiesto reproducible."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any


MOVIES_PATH = "json/movies.json"
SERIES_PATH = "json/series.json"
MANIFEST_PATH = "json/catalog-manifest.json"
MAX_BYTES = 8 * 1024 * 1024
COMMIT_RE = re.compile(r"^[0-9a-f]{40}$")


class CatalogPublicationError(RuntimeError):
    pass


@dataclass(frozen=True)
class Decision:
    action: str
    message: str
    catalog_commit: str = ""


def _git(repo: Path, *args: str, binary: bool = False) -> str | bytes:
    completed = subprocess.run(
        ["git", "-C", str(repo), *args],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )
    if completed.returncode:
        detail = completed.stderr.decode("utf-8", errors="replace").strip()
        raise CatalogPublicationError(f"git {' '.join(args)} fallo: {detail}")
    if binary:
        return completed.stdout
    return completed.stdout.decode("utf-8", errors="strict").strip()


def _read_commit_blob(repo: Path, commit: str, path: str) -> bytes:
    if not COMMIT_RE.fullmatch(commit):
        raise CatalogPublicationError("catalogCommit no es un SHA completo")
    _git(repo, "cat-file", "-e", f"{commit}^{{commit}}")
    return _git(repo, "show", f"{commit}:{path}", binary=True)  # type: ignore[return-value]


def _decode_document(payload: bytes, name: str) -> dict[str, Any]:
    if len(payload) > MAX_BYTES:
        raise CatalogPublicationError(f"{name} supera 8 MiB")
    try:
        document = json.loads(payload.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise CatalogPublicationError(f"{name} no es JSON UTF-8 valido") from exc
    if not isinstance(document, dict):
        raise CatalogPublicationError(f"{name} debe ser un objeto JSON")
    return document


def _validate_sources(links: Any, location: str) -> None:
    if not isinstance(links, list):
        raise CatalogPublicationError(f"{location} debe ser una lista")
    if len(links) > 256:
        raise CatalogPublicationError(f"{location} supera 256 fuentes")
    seen: set[str] = set()
    for source in links:
        if not isinstance(source, dict) or set(source) != {"url", "provider"}:
            raise CatalogPublicationError(f"{location} contiene un descriptor incompatible")
        url = source.get("url")
        if not isinstance(url, str) or not url.strip():
            raise CatalogPublicationError(f"{location} contiene una URL vacia")
        if source.get("provider") not in {"embed", "json"}:
            raise CatalogPublicationError(f"{location} contiene provider desconocido")
        normalized = url.strip().rstrip("/")
        if normalized in seen:
            raise CatalogPublicationError(f"{location} contiene una URL duplicada")
        seen.add(normalized)


def validate_pair(movies: dict[str, Any], series: dict[str, Any]) -> int:
    if set(movies) != {"catalogVersion", "updatedAt", "movies"}:
        raise CatalogPublicationError("movies.json no cumple el contrato v1")
    if set(series) != {"catalogVersion", "updatedAt", "series"}:
        raise CatalogPublicationError("series.json no cumple el contrato v1")
    if movies["catalogVersion"] != 1 or series["catalogVersion"] != 1:
        raise CatalogPublicationError("catalogVersion debe ser 1")
    updated_at = movies["updatedAt"]
    if not isinstance(updated_at, int) or isinstance(updated_at, bool):
        raise CatalogPublicationError("updatedAt debe ser entero")
    if not isinstance(movies["movies"], dict) or not isinstance(series["series"], dict):
        raise CatalogPublicationError("movies y series deben ser mapas")

    for tmdb_id, links in movies["movies"].items():
        _validate_sources(links, f"movies[{tmdb_id}]")
    for tmdb_id, value in series["series"].items():
        if not isinstance(value, dict) or not isinstance(value.get("seasons"), dict):
            raise CatalogPublicationError(f"series[{tmdb_id}] no tiene seasons valido")
        for season, season_value in value["seasons"].items():
            if not isinstance(season_value, dict) or not isinstance(season_value.get("episodes"), dict):
                raise CatalogPublicationError(
                    f"series[{tmdb_id}].seasons[{season}] no tiene episodes valido"
                )
            for episode, links in season_value["episodes"].items():
                _validate_sources(
                    links, f"series[{tmdb_id}].seasons[{season}].episodes[{episode}]"
                )
    return updated_at


def _descriptor(path: str, payload: bytes) -> dict[str, Any]:
    return {
        "path": path,
        "sizeBytes": len(payload),
        "sha256": hashlib.sha256(payload).hexdigest(),
    }


def _load_manifest(path: Path) -> dict[str, Any] | None:
    if not path.exists():
        return None
    manifest = _decode_document(path.read_bytes(), path.name)
    required = {"manifestSchemaVersion", "catalogCommit", "movies", "series"}
    if set(manifest) != required or manifest.get("manifestSchemaVersion") != 1:
        raise CatalogPublicationError("catalog-manifest.json no cumple schema 1")
    return manifest


def decide(repository: Path, output_path: Path) -> tuple[Decision, dict[str, Any] | None]:
    head = _git(repository, "rev-parse", "HEAD")
    if not isinstance(head, str) or not COMMIT_RE.fullmatch(head):
        raise CatalogPublicationError("HEAD no es un commit SHA completo")

    movies_payload = _read_commit_blob(repository, head, MOVIES_PATH)
    series_payload = _read_commit_blob(repository, head, SERIES_PATH)
    movies = _decode_document(movies_payload, MOVIES_PATH)
    series = _decode_document(series_payload, SERIES_PATH)

    movies_updated = movies.get("updatedAt")
    series_updated = series.get("updatedAt")
    if movies_updated != series_updated:
        return (
            Decision(
                "pending",
                "La pareja actual tiene updatedAt distintos; falta completar la segunda subida.",
            ),
            None,
        )
    validate_pair(movies, series)

    current_movies = _descriptor(MOVIES_PATH, movies_payload)
    current_series = _descriptor(SERIES_PATH, series_payload)
    previous = _load_manifest(output_path)
    if previous is not None:
        previous_commit = str(previous.get("catalogCommit") or "")
        old_movies_payload = _read_commit_blob(repository, previous_commit, MOVIES_PATH)
        old_series_payload = _read_commit_blob(repository, previous_commit, SERIES_PATH)
        expected_previous = {
            "manifestSchemaVersion": 1,
            "catalogCommit": previous_commit,
            "movies": _descriptor(MOVIES_PATH, old_movies_payload),
            "series": _descriptor(SERIES_PATH, old_series_payload),
        }
        if previous != expected_previous:
            raise CatalogPublicationError(
                "el manifiesto anterior no coincide con los bytes de su catalogCommit"
            )
        if movies_payload == old_movies_payload and series_payload == old_series_payload:
            return Decision("noop", "El manifiesto ya describe exactamente la pareja publicada."), None

        movies_changed = movies_payload != old_movies_payload
        series_changed = series_payload != old_series_payload
        if not (movies_changed and series_changed):
            missing = SERIES_PATH if movies_changed else MOVIES_PATH
            return (
                Decision(
                    "pending",
                    f"Solo cambio un catalogo frente a la pareja publicada; falta {missing}.",
                ),
                None,
            )

    manifest = {
        "manifestSchemaVersion": 1,
        "catalogCommit": head,
        "movies": current_movies,
        "series": current_series,
    }
    return Decision("publish", "Pareja consistente; manifiesto listo.", head), manifest


def _write_output(path: Path, manifest: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + ".tmp")
    temporary.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
        newline="\n",
    )
    os.replace(temporary, path)


def _set_github_outputs(path: str, decision: Decision) -> None:
    if not path:
        return
    with open(path, "a", encoding="utf-8", newline="\n") as stream:
        stream.write(f"action={decision.action}\n")
        stream.write(f"catalog_commit={decision.catalog_commit}\n")
        stream.write(f"message={decision.message}\n")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repository", default=".")
    parser.add_argument("--output", default=MANIFEST_PATH)
    parser.add_argument("--github-output", default=os.environ.get("GITHUB_OUTPUT", ""))
    parser.add_argument("--expected-head", default="")
    args = parser.parse_args(argv)

    repository = Path(args.repository).resolve()
    output = (repository / args.output).resolve()
    try:
        head = _git(repository, "rev-parse", "HEAD")
        if args.expected_head and head != args.expected_head:
            raise CatalogPublicationError(
                f"HEAD {head} no coincide con el commit esperado {args.expected_head}"
            )
        decision, manifest = decide(repository, output)
        if decision.action == "publish" and manifest is not None:
            _write_output(output, manifest)
        _set_github_outputs(args.github_output, decision)
        print(f"[{decision.action}] {decision.message}")
        return 0
    except CatalogPublicationError as exc:
        print(f"[error] {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())

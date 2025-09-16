#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Конвертирует VK-ссылки в Markdown-постах в инклюды Jekyll формата post-studio:
    {% include media.html f="/assets/vk_photos/<subdir>/<file>" alt="" %}

Ищутся варианты:
  1) [текст](https://vk.com/photo<owner>_<id>)
  2) «голые» https://vk.com/photo<owner>_<id>
  3) <a href="https://vk.com/photo<owner>_<id>">...</a>

Соответствия берём из photos.json (значение может быть именем файла или полным URL).
Фактический файл ищется во всех подпапках assets/vk_photos/**.

DRY-RUN по умолчанию. Для записи: --apply (создаст .bak).
"""

import argparse
import json
import os
import re
from pathlib import Path
from urllib.parse import urlparse

# Пути по умолчанию
DEFAULT_POSTS_DIR = "_posts"
DEFAULT_ASSETS_ROOT = Path("assets") / "vk_photos"

IMG_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".gif"}

# Паттерны для ссылок на VK-фото
RE_MD_LINK = re.compile(
    r"\[([^\]]*?)\]\((https?://(?:www\.)?vk\.com/photo(-?\d+)_(\d+))\)",
    flags=re.IGNORECASE,
)
RE_BARE_URL = re.compile(
    r"(?<!\()(?<!\])\bhttps?://(?:www\.)?vk\.com/photo(-?\d+)_(\d+)\b",
    flags=re.IGNORECASE,
)
RE_A_TAG = re.compile(
    r"""<a\s+[^>]*?href="(https?://(?:www\.)?vk\.com/photo(-?\d+)_(\d+))"[^>]*>.*?</a>""",
    flags=re.IGNORECASE | re.DOTALL,
)

def load_mapping(json_path: Path) -> dict[str, str]:
    data = json.loads(json_path.read_text(encoding="utf-8"))
    return {str(k): str(v) for k, v in data.items()}

def value_to_filename(value: str) -> str:
    """
    Значение из photos.json -> имя файла:
      "OUyaq.jpg" | "3/OUyaq.jpg" | "/assets/vk_photos/3/OUyaq.jpg"
      | "https://.../assets/vk_photos/3/OUyaq.jpg"  → "OUyaq.jpg"
    """
    if value.startswith("http://") or value.startswith("https://"):
        value = urlparse(value).path
    return Path(value).name

def index_assets(assets_root: Path) -> dict[str, list[Path]]:
    """
    Индекс: имя_файла -> список полных путей (assets/vk_photos/**).
    """
    idx: dict[str, list[Path]] = {}
    for root, _, files in os.walk(assets_root):
        for fn in files:
            if Path(fn).suffix.lower() not in IMG_EXTS:
                continue
            p = Path(root) / fn
            idx.setdefault(fn, []).append(p)
    return idx

def pick_best(paths: list[Path]) -> Path | None:
    if not paths:
        return None
    try:
        return sorted(paths, key=lambda p: p.stat().st_size, reverse=True)[0]
    except FileNotFoundError:
        return paths[0]

def site_abs_from_repo(repo_root: Path, actual_file: Path) -> str:
    """
    Делает site-absolute путь вида "/assets/vk_photos/<subdir>/<file>"
    через относительный путь от корня репозитория.
    *Никогда* не вернёт "D:/...".
    """
    rel = actual_file.resolve().relative_to(repo_root.resolve())
    return "/" + rel.as_posix()

def build_include(site_path: str, alt_text: str = "") -> str:
    safe_alt = alt_text.replace('"', '&quot;')
    return '{% include media.html f="' + site_path + '" alt="' + safe_alt + '" %}'

def replace_in_text(text: str, mapping: dict[str, str], repo_root: Path, assets_root: Path,
                    assets_idx: dict[str, list[Path]], verbose=False):
    changes = 0

    def to_include(owner: str, mid: str) -> str | None:
        key = f"{owner}_{mid}"
        raw = mapping.get(key)
        if not raw:
            if verbose:
                print(f"  ! нет в photos.json: {key}")
            return None
        filename = value_to_filename(raw)
        actual = pick_best(assets_idx.get(filename, []))
        if not actual:
            if verbose:
                print(f"  ! файл не найден в {assets_root}/** : {filename}")
            return None
        site_path = site_abs_from_repo(repo_root, actual)  # ← всегда "/assets/..."
        return build_include(site_path, alt_text="")

    # 1) [текст](https://vk.com/photo…)
    def repl_md(m: re.Match) -> str:
        nonlocal changes
        owner, mid = m.group(3), m.group(4)
        inc = to_include(owner, mid)
        if inc:
            if verbose: print(f"  + {owner}_{mid} -> {inc}")
            changes += 1
            return inc
        return m.group(0)

    # 2) <a href="https://vk.com/photo…">…</a>
    def repl_a(m: re.Match) -> str:
        nonlocal changes
        owner, mid = m.group(2), m.group(3)
        inc = to_include(owner, mid)
        if inc:
            if verbose: print(f"  + (a) {owner}_{mid} -> {inc}")
            changes += 1
            return inc
        return m.group(0)

    # 3) «голые» URL
    def repl_url(m: re.Match) -> str:
        nonlocal changes
        owner, mid = m.group(1), m.group(2)
        inc = to_include(owner, mid)
        if inc:
            if verbose: print(f"  + (url) {owner}_{mid} -> {inc}")
            changes += 1
            return inc
        return m.group(0)

    text = RE_MD_LINK.sub(repl_md, text)
    text = RE_A_TAG.sub(repl_a, text)
    text = RE_BARE_URL.sub(repl_url, text)
    return text, changes

def process_file(path: Path, mapping: dict[str, str], repo_root: Path, assets_root: Path,
                 assets_idx: dict[str, list[Path]], apply=False, verbose=False) -> int:
    src = path.read_text(encoding="utf-8")
    new, n = replace_in_text(src, mapping, repo_root, assets_root, assets_idx, verbose=verbose)
    if n and apply and new != src:
        bak = path.with_suffix(path.suffix + ".bak")
        if not bak.exists():
            bak.write_text(src, encoding="utf-8")
        path.write_text(new, encoding="utf-8")
    return n

def main():
    ap = argparse.ArgumentParser(description="Convert VK links to {% include media.html f=\"...\" alt=\"\" %}")
    ap.add_argument("--posts-dir", default=DEFAULT_POSTS_DIR, help="Каталог с Markdown постами (рекурсивно)")
    ap.add_argument("--photos-json", default="photos.json", help="Файл соответствий VK → имя файла/URL")
    ap.add_argument("--assets-root", default=str(DEFAULT_ASSETS_ROOT), help="Корень ассетов (assets/vk_photos)")
    ap.add_argument("--apply", action="store_true", help="Записать изменения (по умолчанию — DRY-RUN)")
    ap.add_argument("--verbose", action="store_true", help="Подробный вывод")
    args = ap.parse_args()

    repo_root = Path(".").resolve()
    posts_dir = (repo_root / args.posts_dir).resolve()
    photos_json = (repo_root / args.photos_json).resolve()
    assets_root = (repo_root / args.assets_root).resolve()

    if not posts_dir.is_dir():
        raise SystemExit(f"Нет каталога постов: {posts_dir}")
    if not photos_json.is_file():
        raise SystemExit(f"Нет файла словаря: {photos_json}")
    if not assets_root.is_dir():
        raise SystemExit(f"Нет каталога ассетов: {assets_root}")

    mapping = load_mapping(photos_json)
    assets_idx = index_assets(assets_root)

    touched_files, total_changes = 0, 0
    for md in posts_dir.rglob("*.md"):
        n = process_file(md, mapping, repo_root, assets_root, assets_idx, apply=args.apply, verbose=args.verbose)
        if n:
            touched_files += 1
            total_changes += n

    mode = "APPLY" if args.apply else "DRY-RUN"
    print(f"[{mode}] Изменено файлов: {touched_files}, замен: {total_changes}")

if __name__ == "__main__":
    main()

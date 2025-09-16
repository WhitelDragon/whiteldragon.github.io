#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Переписывает VK-фото ссылки в Markdown-постах на локальные ссылки из /assets/vk_photos/*/*.

Ищем в тексте:
  [Вложение](https://vk.com/photo<owner>_<id>)
  https://vk.com/photo<owner>_<id>

Берём соответствие из photos.json:
  {
    "41076938_457251035": "OUyaqTfL9Ug.jpg"
    // или полная ссылка:
    // "41076938_457251035": "https://whiteldragon.github.io/assets/vk_photos/3/OUyaqTfL9Ug.jpg"
  }

Итоговая подстановка всегда site-absolute:
  [Вложение](/assets/vk_photos/3/OUyaqTfL9Ug.jpg)

По умолчанию DRY-RUN (ничего не пишет). Для записи: --apply.
Перед записью создаёт .bak.
"""

import argparse
import json
import os
import re
from pathlib import Path
from urllib.parse import urlparse

# -------- Настройки по умолчанию --------
DEFAULT_POSTS_DIR = "_posts"
DEFAULT_ASSETS_ROOT = Path("assets") / "vk_photos"

# Поддерживаемые расширения
IMG_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".gif"}

# Регексы для поиска ссылок
RE_MD = re.compile(
    r"\[Вложение\]\((https?://(?:www\.)?vk\.com/photo(-?\d+)_(\d+))\)",
    flags=re.IGNORECASE
)
RE_URL = re.compile(
    r"(?<!\()(?<!\])\bhttps?://(?:www\.)?vk\.com/photo(-?\d+)_(\d+)\b",
    flags=re.IGNORECASE
)

def load_mapping(json_path: Path) -> dict[str, str]:
    data = json.loads(json_path.read_text(encoding="utf-8"))
    # ключи/значения -> str
    return {str(k): str(v) for k, v in data.items()}

def normalize_value_to_filename_or_path(value: str) -> str:
    """
    Принимает значение из словаря:
      - "OUyaqTfL9Ug.jpg" -> оставить как есть (это имя файла)
      - "/assets/vk_photos/3/OUyaqTfL9Ug.jpg" -> вернуть только имя файла
      - "https://.../assets/vk_photos/3/OUyaqTfL9Ug.jpg" -> вернуть только имя файла
      - "3/OUyaqTfL9Ug.jpg" -> тоже допустимо, извлечём имя
    Возвращаем имя файла (с расширением).
    """
    if value.startswith("http://") or value.startswith("https://"):
        path = urlparse(value).path  # "/assets/vk_photos/3/OUyaqTfL9Ug.jpg"
        return Path(path).name
    # уберём любые ведущие каталоги
    return Path(value).name

def build_site_absolute(assets_root: Path, actual_file: Path) -> str:
    """
    Строит site-absolute путь типа "/assets/vk_photos/3/file.jpg".
    """
    rel = actual_file.relative_to(assets_root)  # "3/file.jpg"
    parts = list(assets_root.parts[-2:])  # ["assets", "vk_photos"]
    site_path = Path("/", *parts, *rel.parts)  # "/assets/vk_photos/3/file.jpg"
    return site_path.as_posix()

def index_assets(assets_root: Path) -> dict[str, list[Path]]:
    """
    Индексируем все изображения под assets_root:
      "OUyaqTfL9Ug.jpg" -> [Path('.../assets/vk_photos/3/OUyaqTfL9Ug.jpg'), ...]
    """
    idx: dict[str, list[Path]] = {}
    for root, _, files in os.walk(assets_root):
        for fn in files:
            ext = Path(fn).suffix.lower()
            if ext not in IMG_EXTS:
                continue
            p = Path(root) / fn
            idx.setdefault(fn, []).append(p)
    return idx

def pick_one(paths: list[Path]) -> Path | None:
    if not paths:
        return None
    # Если несколько — возьмём наибольший по размеру (крупнейший, вероятно оригинал)
    try:
        return sorted(paths, key=lambda p: p.stat().st_size, reverse=True)[0]
    except FileNotFoundError:
        return paths[0]

def replace_in_text(text: str, mapping: dict[str, str], assets_root: Path, assets_idx: dict[str, list[Path]], verbose=False):
    changes = 0

    def find_site_path(owner_id: str, media_id: str) -> str | None:
        key = f"{owner_id}_{media_id}"
        raw = mapping.get(key)
        if not raw:
            if verbose:
                print(f"  ! нет в photos.json: {key}")
            return None
        filename = normalize_value_to_filename_or_path(raw)
        actual = pick_one(assets_idx.get(filename, []))
        if not actual:
            if verbose:
                print(f"  ! файл не найден в {assets_root}/** : {filename}")
            return None
        return build_site_absolute(assets_root, actual)

    def repl_md(m: re.Match) -> str:
        nonlocal changes
        owner_id, media_id = m.group(2), m.group(3)
        site_path = find_site_path(owner_id, media_id)
        if not site_path:
            return m.group(0)
        if verbose:
            print(f"  + {owner_id}_{media_id} -> {site_path}")
        changes += 1
        return f"[Вложение]({site_path})"

    def repl_url(m: re.Match) -> str:
        nonlocal changes
        owner_id, media_id = m.group(1), m.group(2)
        site_path = find_site_path(owner_id, media_id)
        if not site_path:
            return m.group(0)
        if verbose:
            print(f"  + (URL) {owner_id}_{media_id} -> {site_path}")
        changes += 1
        return site_path

    text = RE_MD.sub(repl_md, text)
    text = RE_URL.sub(repl_url, text)
    return text, changes

def process_file(file_path: Path, mapping: dict[str, str], assets_root: Path, assets_idx: dict[str, list[Path]], apply=False, verbose=False) -> int:
    src = file_path.read_text(encoding="utf-8")
    new, n = replace_in_text(src, mapping, assets_root, assets_idx, verbose=verbose)
    if n and apply and new != src:
        bak = file_path.with_suffix(file_path.suffix + ".bak")
        if not bak.exists():
            bak.write_text(src, encoding="utf-8")
        file_path.write_text(new, encoding="utf-8")
    return n

def main():
    ap = argparse.ArgumentParser(description="Remap VK photo links to local /assets/vk_photos paths using photos.json")
    ap.add_argument("--posts-dir", default=DEFAULT_POSTS_DIR, help="Каталог с Markdown постами (рекурсивно)")
    ap.add_argument("--photos-json", default="photos.json", help="Файл соответствий VK → файл/URL")
    ap.add_argument("--assets-root", default=str(DEFAULT_ASSETS_ROOT), help="Корень ассетов vk_photos")
    ap.add_argument("--apply", action="store_true", help="Записать изменения (по умолчанию — DRY-RUN)")
    ap.add_argument("--verbose", action="store_true", help="Подробный вывод")
    args = ap.parse_args()

    posts_dir = Path(args.posts_dir).resolve()
    photos_json = Path(args.photos_json).resolve()
    assets_root = Path(args.assets_root).resolve()

    if not posts_dir.is_dir():
        raise SystemExit(f"Нет каталога постов: {posts_dir}")
    if not photos_json.is_file():
        raise SystemExit(f"Нет файла словаря: {photos_json}")
    if not assets_root.is_dir():
        raise SystemExit(f"Нет каталога ассетов: {assets_root}")

    mapping = load_mapping(photos_json)
    assets_idx = index_assets(assets_root)

    total_files, total_changes = 0, 0
    for md in posts_dir.rglob("*.md"):
        n = process_file(md, mapping, assets_root, assets_idx, apply=args.apply, verbose=args.verbose)
        if n:
            total_files += 1
            total_changes += n

    mode = "APPLY" if args.apply else "DRY-RUN"
    print(f"[{mode}] Изменено файлов: {total_files}, замен: {total_changes}")

if __name__ == "__main__":
    main()

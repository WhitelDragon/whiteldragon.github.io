#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import argparse
from pathlib import Path
import re

# Какие метки считаем "парными" перед голым URL
PAIR_LABELS = ("Фотография", "Видео", "Видеозапись")

# [Вложение](https://vk.com/photo123_456) или video123_456
VK_LINK_RE = re.compile(
    r"\[Вложение\]\((https?://(?:m\.)?vk\.com/(?:photo|video)\d+_\d+)\)",
    re.IGNORECASE,
)

# Блок из двух строк:
#   (любая метка из PAIR_LABELS)
#   https://vk.com/photo123_456  (или video123_456)
PAIR_RE = re.compile(
    r"(?m)^(?:%s)\s*\r?\n(https?://(?:m\.)?vk\.com/(?:photo|video)\d+_\d+)\s*$"
    % "|".join(map(re.escape, PAIR_LABELS))
)

# Схлопываем лишние пустые строки (3+ подряд -> 2)
EXTRA_BLANKS_RE = re.compile(r"(?m)^(?:\s*\r?\n){3,}")

def collect_md_files(root: Path):
    files = []
    for sub in ("_posts", "_drafts"):
        d = root / sub
        if d.is_dir():
            files += list(d.rglob("*.md"))
            files += list(d.rglob("*.markdown"))
    return sorted(files)

def process_text(text: str) -> str:
    # 1) Собираем vk-media URL из [Вложение](...)
    link_urls = set(m.group(1) for m in VK_LINK_RE.finditer(text))
    if not link_urls:
        return text  # нечего делать

    # 2) Удаляем пары "Метка\n<url>" ТОЛЬКО если <url> есть среди [Вложение](<url>)
    def repl(m: re.Match) -> str:
        url = m.group(1)
        return "" if url in link_urls else m.group(0)

    cleaned = PAIR_RE.sub(repl, text)

    if cleaned != text:
        # подчистка пустых строк и пробелов перед переводом строки
        cleaned = EXTRA_BLANKS_RE.sub("\n\n", cleaned)
        cleaned = re.sub(r"[ \t]+\r?\n", "\n", cleaned)

    return cleaned

def main():
    ap = argparse.ArgumentParser(
        description="Удаляет блоки 'Фотография|Видео|Видеозапись\\n<vk photo|video URL>' "
                    "если есть соответствующее [Вложение](<тот же URL>)"
    )
    ap.add_argument("--repo", default=".", help="корень репозитория (по умолчанию: .)")
    ap.add_argument("--apply", action="store_true", help="внести изменения (по умолчанию dry-run)")
    args = ap.parse_args()

    root = Path(args.repo).resolve()
    files = collect_md_files(root)

    changed = 0
    unchanged = 0

    for f in files:
        # читаем в UTF-8; если вдруг старые файлы в cp1251 — можно добавить попытку второй кодировки
        src = f.read_text(encoding="utf-8", errors="strict")
        out = process_text(src)

        if out != src:
            changed += 1
            print("CLEAN ", f.relative_to(root))
            if args.apply:
                bak = f.with_suffix(f.suffix + ".bak")
                if not bak.exists():
                    bak.write_text(src, encoding="utf-8")
                f.write_text(out, encoding="utf-8")
        else:
            unchanged += 1

    print("\nSummary:")
    print(f"  changed:   {changed}")
    print(f"  unchanged: {unchanged}")
    if not args.apply:
        print("\nDry-run only. Запусти с --apply чтобы записать изменения.")

if __name__ == "__main__":
    main()

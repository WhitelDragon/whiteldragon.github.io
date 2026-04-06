#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
import shutil
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Set, Tuple


IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif", ".bmp", ".svg"}
VIDEO_EXTS = {".mp4", ".webm", ".m4v", ".mov", ".mkv", ".m3u8", ".ogv"}
AUDIO_EXTS = {".mp3", ".ogg", ".wav", ".m4a", ".flac", ".oga"}

TELEGRAM_BOILERPLATE_PATTERNS = [
    "👑 Забустить канал 👑 Подписывайтесь на канал, у нас есть расчленёнка (с) участник ФурМаркета",
    "👑 Забустить канал 👑 Подписывайтесь на канал, у нас есть расчленёнка (с) участник ФурМаркета.",
    "👑 Забустить канал 👑 Подписывайтесь на канал,",
    "👑 Забустить канал 👑 Подписывайтесь на канал",
    "👑 Забустить канал 👑",
    "Подписывайтесь на канал, у нас есть расчленёнка (с) участник ФурМаркета",
    "Подписывайтесь на канал, у нас есть расчленёнка (с) участник ФурМаркета.",
    "Подписывайтесь на канал,",
    "Подписывайтесь на канал",
]


def parse_iso(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def max_post_id(posts_root: Path) -> int:
    max_id = 0
    pattern = re.compile(r"post-(\d+)\.md$")
    for p in posts_root.rglob("*.md"):
        m = pattern.search(p.name)
        if m:
            max_id = max(max_id, int(m.group(1)))
    return max_id


def existing_tg_original_ids(posts_root: Path) -> Set[int]:
    existing: Set[int] = set()
    pattern = re.compile(r"^tg_original_id:\s*(\d+)\s*$")
    for p in posts_root.rglob("*.md"):
        try:
            text = p.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            continue
        for line in text.splitlines():
            match = pattern.match(line.strip())
            if match:
                existing.add(int(match.group(1)))
                break
    return existing


def parse_post_ids(raw: str) -> List[int]:
    values = []
    for chunk in (raw or "").split(","):
        item = chunk.strip()
        if not item:
            continue
        values.append(int(item))
    return values


def media_kind(path_str: str) -> str:
    ext = Path(path_str).suffix.lower()
    if ext in IMAGE_EXTS:
        return "image"
    if ext in VIDEO_EXTS:
        return "video"
    if ext in AUDIO_EXTS:
        return "audio"
    return "file"


def safe_yaml(value: str) -> str:
    return (value or "").replace("\\", "\\\\").replace('"', '\\"')


def safe_include_attr(value: str) -> str:
    return (value or "").replace("\r", " ").replace("\n", " ").replace("'", "&#39;").strip()


def strip_telegram_boilerplate(text: str) -> str:
    cleaned = text or ""
    cleaned = cleaned.replace("\r\n", "\n").replace("\r", "\n")
    for pattern in TELEGRAM_BOILERPLATE_PATTERNS:
        cleaned = cleaned.replace(pattern, "")
    lines = []
    for line in cleaned.split("\n"):
        stripped = line.strip()
        if not stripped:
            lines.append("")
            continue
        if stripped == "👑":
            continue
        if stripped == "Забустить канал":
            continue
        if stripped in {
            "Усиленный Кусь. Подписаться.",
            "Усиленный Кусь. Думайте.",
            "Усиленный кусь. Подписаться.",
            "Усиленный кусь. Думайте.",
        }:
            continue
        if "Забустить канал" in stripped and "Подписывайтесь на канал" in stripped:
            continue
        if stripped.startswith("Усиленный Кусь") or stripped.startswith("Усиленный кусь"):
            continue
        lines.append(line)
    cleaned = "\n".join(lines)
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned)
    return cleaned.strip()


def format_telegram_text(text: str) -> str:
    cleaned = strip_telegram_boilerplate(text)
    if not cleaned:
        return ""

    paragraphs = []
    current = ""

    for raw_line in cleaned.split("\n"):
        line = raw_line.strip()
        if not line:
            if current:
                paragraphs.append(current.strip())
                current = ""
            continue

        if not current:
            current = line
            continue

        first = line[0]
        prev_last = current.rstrip()[-1]
        is_url_only = bool(re.match(r"^https?://\S+$", line))
        join_with_previous = (
            not is_url_only and (
                first.islower()
                or first in ".,;:!?)]]}"
                or prev_last in ",;:([{-"
            )
        )

        if join_with_previous:
            joiner = "" if first in ".,;:!?)]}" else " "
            current = current.rstrip() + joiner + line
        else:
            paragraphs.append(current.strip())
            current = line

    if current:
        paragraphs.append(current.strip())

    return "\n\n".join(paragraphs)


def first_title_from_text(text: str, fallback: str) -> str:
    lines = [x.strip() for x in (text or "").replace("\r", "").split("\n")]
    lines = [x for x in lines if x]
    if not lines:
        return fallback
    title = lines[0]
    title = strip_telegram_boilerplate(title)
    title = re.sub(r"\s+", " ", title).strip()
    if len(title) > 120:
        title = title[:117].rstrip() + "..."
    return title


def ensure_media_items(post_data: Dict) -> List[Dict]:
    items = post_data.get("media_items")
    if isinstance(items, list) and items:
        return items

    generated = []
    for i, p in enumerate(post_data.get("local_media", []) or [], start=1):
        kind = media_kind(p)
        entry = {"index": i, "kind": kind, "path": p}
        if kind == "image":
            entry["alt"] = f"Изображение из поста Telegram №{post_data.get('post_id')} (медиа {i})"
        elif kind in {"video", "audio"}:
            title = f"{'Видео' if kind == 'video' else 'Аудио'} из поста Telegram №{post_data.get('post_id')} (медиа {i})"
            entry["title"] = title
            entry["aria_label"] = title
        generated.append(entry)
    return generated


def copy_media(
    repo_root: Path,
    channel_slug: str,
    new_post_id: int,
    media_item: Dict,
) -> Tuple[Path, str]:
    src = Path(media_item["path"])
    if not src.is_absolute():
        src = (repo_root / src).resolve()
    if not src.exists():
        raise FileNotFoundError(f"Media file not found: {src}")

    basename = src.name
    idx = int(media_item.get("index", 1))
    kind = media_item.get("kind") or media_kind(str(src))

    if kind == "image":
        dst = repo_root / "assets" / "img" / "tg" / channel_slug / f"post-{new_post_id}" / basename
    elif kind == "video":
        dst = (
            repo_root
            / "assets"
            / "video"
            / "tg"
            / channel_slug
            / f"post-{new_post_id}"
            / f"video-{idx:02d}"
            / basename
        )
    elif kind == "audio":
        dst = (
            repo_root
            / "assets"
            / "audio"
            / "tg"
            / channel_slug
            / f"post-{new_post_id}"
            / f"audio-{idx:02d}"
            / basename
        )
    else:
        dst = repo_root / "assets" / "files" / "tg" / channel_slug / f"post-{new_post_id}" / basename

    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, dst)
    web_path = "/" + dst.relative_to(repo_root).as_posix()
    return dst, web_path


def build_media_include(web_path: str, media_item: Dict, fallback_title: str) -> str:
    kind = media_item.get("kind") or media_kind(web_path)
    if kind == "image":
        alt = strip_telegram_boilerplate(media_item.get("alt") or f"Изображение к посту: {fallback_title}")
        return "{% include media.html f='" + web_path + "' alt='" + safe_include_attr(alt) + "' %}"
    if kind == "video":
        title = strip_telegram_boilerplate(media_item.get("title") or f"Видео к посту: {fallback_title}")
        return "{% include media.html f='" + web_path + "' title='" + safe_include_attr(title) + "' %}"
    if kind == "audio":
        title = strip_telegram_boilerplate(media_item.get("title") or f"Аудио к посту: {fallback_title}")
        return "{% include media.html f='" + web_path + "' title='" + safe_include_attr(title) + "' %}"
    return f"[Файл]({web_path})"


def main() -> int:
    parser = argparse.ArgumentParser(description="Import Telegram dump posts into Jekyll _posts.")
    parser.add_argument("--dump-dir", required=True, help="Path to Telegram dump dir")
    parser.add_argument("--channel-slug", default="furrycriminal-filtred", help="Slug for assets folders")
    parser.add_argument("--post-ids", help="Comma-separated original Telegram post IDs to import")
    parser.add_argument("--use-source-date", action="store_true", help="Use scraped Telegram datetime when manual_date is absent")
    parser.add_argument("--report-name", default="import_report.json", help="Report filename inside dump dir")
    args = parser.parse_args()

    repo_root = Path.cwd()
    dump_dir = (repo_root / args.dump_dir).resolve()
    posts_src_dir = dump_dir / "posts"
    manual_dates_file = dump_dir / "manual_dates.json"
    posts_root = repo_root / "_posts"

    manual = {"posts": []}
    if manual_dates_file.exists():
        manual = json.loads(manual_dates_file.read_text(encoding="utf-8"))

    manual_map = {}
    for item in manual.get("posts", []):
        post_id = int(item["post_id"])
        if item.get("manual_date"):
            manual_map[post_id] = parse_iso(item["manual_date"])

    selected = []
    if args.post_ids:
        for post_id in parse_post_ids(args.post_ids):
            dt = manual_map.get(post_id)
            if dt is None and args.use_source_date:
                src_post_path = posts_src_dir / f"{post_id}.json"
                if not src_post_path.exists():
                    continue
                post_data = json.loads(src_post_path.read_text(encoding="utf-8"))
                if post_data.get("date"):
                    dt = parse_iso(post_data["date"])
            if dt is not None:
                selected.append((post_id, dt))
    else:
        for post_id, dt in manual_map.items():
            selected.append((post_id, dt))

    selected.sort(key=lambda x: (x[1], x[0]))

    current_max_id = max_post_id(posts_root)
    existing_original_ids = existing_tg_original_ids(posts_root)
    new_id = current_max_id + 1

    created = []
    for original_id, dt in selected:
        if original_id in existing_original_ids:
            continue

        src_post_path = posts_src_dir / f"{original_id}.json"
        if not src_post_path.exists():
            continue

        post_data = json.loads(src_post_path.read_text(encoding="utf-8"))
        text = (post_data.get("text") or "").replace("\r\n", "\n").replace("\r", "\n").strip()
        text = format_telegram_text(text)
        source_url = post_data.get("post_url") or f"https://t.me/{args.channel_slug.replace('-', '_')}/{original_id}"

        fallback_title = f"Пост из Telegram №{original_id}"
        title = first_title_from_text(text, fallback_title)
        if not title:
            title = fallback_title

        media_items = ensure_media_items(post_data)
        media_includes = []
        copied_media = []
        for m in media_items:
            dst, web_path = copy_media(repo_root, args.channel_slug, new_id, m)
            copied_media.append(str(dst))
            media_includes.append(build_media_include(web_path, m, title))

        year_dir = posts_root / f"{dt.year:04d}"
        year_dir.mkdir(parents=True, exist_ok=True)
        file_name = f"{dt:%Y-%m-%d}-post-{new_id}.md"
        out_path = year_dir / file_name

        frontmatter = [
            "---",
            f'title: "{safe_yaml(title)}"',
            f"date: {dt:%Y-%m-%d %H:%M:%S %z}",
            f"tg_source: {source_url}",
            f"tg_original_id: {original_id}",
            "---",
            "",
        ]

        body_lines = []
        if text:
            body_lines.append(text)
            body_lines.append("")
        body_lines.append(f"*Источник: {source_url}*")
        body_lines.append("")
        body_lines.extend(media_includes)
        body_lines.append("")
        body_lines.append("*Telegram канал: [https://t.me/furcriminal/](https://t.me/furcriminal/)*")
        body_lines.append("")

        out_path.write_text("\n".join(frontmatter + body_lines), encoding="utf-8")

        created.append(
            {
                "new_post_id": new_id,
                "original_post_id": original_id,
                "date": dt.isoformat(),
                "file": str(out_path.relative_to(repo_root).as_posix()),
                "media_count": len(media_includes),
                "title": title,
            }
        )
        new_id += 1

    report = {
        "imported_posts": len(created),
        "start_new_post_id": current_max_id + 1,
        "end_new_post_id": (new_id - 1) if created else current_max_id,
        "items": created,
    }
    report_path = dump_dir / args.report_name
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"imported_posts": len(created), "report": str(report_path)}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

#!/usr/bin/env python3
"""Structural comparison helper for README translation output sets.

Given two output directories (`--baseline` / `--candidate` or two positional directories)
for the same README, compares per language:
  - heading count (`#` .. `######` outside fenced code blocks)
  - paragraph count (prose/table/block chunks outside fenced code blocks and top nav bar)
  - fenced code-block count and their contents byte for byte
  - link and URL sets (markdown `[text](url)`, reference defs `[id]: url`, HTML `href=` / `src=`)
  - language nav-bar entries (`href="..."` and label pairs in the top `<p align="center">` nav bar)

Used to judge the first paid Colab rung against the local 5090 run of `registry-sync`'s README.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any

DEFAULT_LANG_FILES: dict[str, str] = {
  "en": "README.md",
  "ja": "README.ja.md",
  "zh": "README.zh.md",
  "es": "README.es.md",
  "fr": "README.fr.md",
  "hi": "README.hi.md",
  "it": "README.it.md",
  "pt": "README.pt-BR.md",
}

FENCE_OPEN_RE = re.compile(r"^(\s*)(`{3,}|~{3,})(.*)$")
HEADING_RE = re.compile(r"^#{1,6}\s+\S")
MD_LINK_RE = re.compile(r"!?\[([^\]]*)\]\(([^)\s]+)(?:\s+\"[^\"]*\")?\)")
REF_DEF_RE = re.compile(r"^\s*\[([^\]]+)\]:\s*(\S+)", re.M)
HTML_HREF_RE = re.compile(r"""\b(?:href|src)=["']([^"']+)["']""", re.I)
NAV_ANCHOR_RE = re.compile(r"""<a\s+href=["']([^"']+)["'][^>]*>(.*?)</a>""", re.I | re.S)


def extract_top_nav_bar(lines: list[str]) -> tuple[list[dict[str, str]], list[str]]:
    """Strip and parse top language nav-bar blocks from `lines`.

    Returns `(nav_entries, remaining_lines)`.
    """
    i = 0
    nav_blocks: list[str] = []
    while i < len(lines):
        if lines[i].strip() == "":
            i += 1
            continue
        if re.match(r'^<p\s+align="center">', lines[i].strip()):
            is_nav = False
            for j in range(i, min(i + 5, len(lines))):
                if re.search(r'href="README\.\w', lines[j]) or re.search(r'href="README\.md"', lines[j]):
                    is_nav = True
                    break
                if "</p>" in lines[j]:
                    break
            if is_nav:
                block: list[str] = []
                while i < len(lines):
                    block.append(lines[i])
                    if "</p>" in lines[i]:
                        i += 1
                        break
                    i += 1
                nav_blocks.append("\n".join(block))
                continue
        break

    entries: list[dict[str, str]] = []
    if nav_blocks:
        for m in NAV_ANCHOR_RE.finditer(nav_blocks[0]):
            entries.append({"href": m.group(1).strip(), "label": m.group(2).strip()})
    return entries, lines[i:]


def parse_markdown_structure(text: str) -> dict[str, Any]:
    """Extract structural metrics from a README markdown document."""
    normalized = text.replace("\r\n", "\n")
    raw_lines = normalized.split("\n")
    nav_entries, body_lines = extract_top_nav_bar(raw_lines)

    code_blocks: list[bytes] = []
    non_code_lines: list[str] = []

    in_fence = False
    fence_marker = ""
    current_block: list[str] = []

    for line in body_lines:
        if not in_fence:
            m = FENCE_OPEN_RE.match(line)
            if m:
                in_fence = True
                fence_char = m.group(2)[0]
                fence_len = len(m.group(2))
                fence_marker = fence_char * fence_len
                current_block = [line]
                non_code_lines.append("")
                continue
            non_code_lines.append(line)
        else:
            current_block.append(line)
            stripped = line.strip()
            if stripped.startswith(fence_marker) and stripped.rstrip(fence_marker[0]) == "":
                code_blocks.append("\n".join(current_block).encode("utf-8"))
                in_fence = False
                fence_marker = ""
                current_block = []

    if in_fence and current_block:
        code_blocks.append("\n".join(current_block).encode("utf-8"))

    heading_count = 0
    paragraphs: list[str] = []
    cur_para: list[str] = []

    def flush_para() -> None:
        if cur_para:
            paragraphs.append("\n".join(cur_para))
            cur_para.clear()

    for line in non_code_lines:
        stripped = line.strip()
        if stripped == "":
            flush_para()
            continue
        if HEADING_RE.match(stripped):
            flush_para()
            heading_count += 1
            continue
        if re.match(r"^---\s*$", stripped):
            flush_para()
            continue
        cur_para.append(line)
    flush_para()

    non_code_text = "\n".join(non_code_lines)
    urls: set[str] = set()
    links: set[tuple[str, str]] = set()

    for m in MD_LINK_RE.finditer(non_code_text):
        label, url = m.group(1).strip(), m.group(2).strip()
        urls.add(url)
        links.add((label, url))

    for m in REF_DEF_RE.finditer(non_code_text):
        ref_id, url = m.group(1).strip(), m.group(2).strip()
        urls.add(url)
        links.add((f"[{ref_id}]", url))

    for m in HTML_HREF_RE.finditer(non_code_text):
        url = m.group(1).strip()
        urls.add(url)

    return {
        "heading_count": heading_count,
        "paragraph_count": len(paragraphs),
        "code_block_count": len(code_blocks),
        "code_blocks_bytes": code_blocks,
        "urls": sorted(urls),
        "links": sorted([{"text": t, "url": u} for t, u in links], key=lambda x: (x["url"], x["text"])),
        "nav_bar_entries": nav_entries,
    }


def compare_single_document(baseline_text: str, candidate_text: str) -> dict[str, Any]:
    """Compare structural features of two versions of the same language README."""
    b = parse_markdown_structure(baseline_text)
    c = parse_markdown_structure(candidate_text)

    mismatches: list[str] = []
    if b["heading_count"] != c["heading_count"]:
        mismatches.append(f"heading_count: baseline={b['heading_count']} candidate={c['heading_count']}")

    if b["paragraph_count"] != c["paragraph_count"]:
        mismatches.append(f"paragraph_count: baseline={b['paragraph_count']} candidate={c['paragraph_count']}")

    code_blocks_equal = (
        b["code_block_count"] == c["code_block_count"]
        and b["code_blocks_bytes"] == c["code_blocks_bytes"]
    )
    if not code_blocks_equal:
        if b["code_block_count"] != c["code_block_count"]:
            mismatches.append(
                f"code_block_count: baseline={b['code_block_count']} candidate={c['code_block_count']}"
            )
        else:
            diff_indices = [
                idx
                for idx, (blk_b, blk_c) in enumerate(zip(b["code_blocks_bytes"], c["code_blocks_bytes"]))
                if blk_b != blk_c
            ]
            mismatches.append(f"code_block_bytes_mismatch at indices {diff_indices}")

    b_urls = set(b["urls"])
    c_urls = set(c["urls"])
    missing_urls = sorted(b_urls - c_urls)
    extra_urls = sorted(c_urls - b_urls)
    if missing_urls or extra_urls:
        mismatches.append(f"url_set_mismatch: missing={missing_urls} extra={extra_urls}")

    b_nav_hrefs = [e["href"] for e in b["nav_bar_entries"]]
    c_nav_hrefs = [e["href"] for e in c["nav_bar_entries"]]
    nav_equal = b["nav_bar_entries"] == c["nav_bar_entries"]
    if not nav_equal:
        mismatches.append(f"nav_bar_entries: baseline={b_nav_hrefs} candidate={c_nav_hrefs}")

    return {
        "match": len(mismatches) == 0,
        "mismatches": mismatches,
        "heading_count": {"baseline": b["heading_count"], "candidate": c["heading_count"]},
        "paragraph_count": {"baseline": b["paragraph_count"], "candidate": c["paragraph_count"]},
        "code_block_count": {"baseline": b["code_block_count"], "candidate": c["code_block_count"]},
        "code_blocks_byte_identical": code_blocks_equal,
        "urls": {
            "baseline": b["urls"],
            "candidate": c["urls"],
            "missing": missing_urls,
            "extra": extra_urls,
        },
        "links": {
            "baseline_count": len(b["links"]),
            "candidate_count": len(c["links"]),
        },
        "nav_bar_entries": {
            "baseline": b["nav_bar_entries"],
            "candidate": c["nav_bar_entries"],
            "equal": nav_equal,
        },
    }


def compare_translation_sets(
    baseline_dir: Path,
    candidate_dir: Path,
    langs: list[str] | None = None,
    include_source: bool = True,
) -> dict[str, Any]:
    """Compare two README output sets directory-to-directory across languages."""
    target_codes = list(langs) if langs is not None else ["ja", "zh", "es", "fr", "hi", "it", "pt"]
    check_codes = (["en"] if include_source else []) + [c for c in target_codes if c != "en"]

    per_language: dict[str, Any] = {}
    all_match = True

    for code in check_codes:
        fname = DEFAULT_LANG_FILES.get(code, f"README.{code}.md")
        b_path = Path(baseline_dir) / fname
        c_path = Path(candidate_dir) / fname
        if not b_path.is_file() or not c_path.is_file():
            all_match = False
            per_language[code] = {
                "file": fname,
                "match": False,
                "mismatches": [
                    f"missing_file: baseline_exists={b_path.is_file()} candidate_exists={c_path.is_file()}"
                ],
            }
            continue
        comp = compare_single_document(
            b_path.read_text(encoding="utf-8"),
            c_path.read_text(encoding="utf-8"),
        )
        comp["file"] = fname
        per_language[code] = comp
        if not comp["match"]:
            all_match = False

    return {
        "match": all_match,
        "baseline_dir": str(baseline_dir),
        "candidate_dir": str(candidate_dir),
        "languages_checked": check_codes,
        "per_language": per_language,
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Structural comparison of two README translation output sets.")
    parser.add_argument("dirs", nargs="*", help="Optional positional <baseline_dir> <candidate_dir>")
    parser.add_argument("--baseline", type=Path, help="Baseline output directory")
    parser.add_argument("--candidate", type=Path, help="Candidate output directory")
    parser.add_argument(
        "--langs",
        default="ja,zh,es,fr,hi,it,pt",
        help="Comma-separated language codes (default: ja,zh,es,fr,hi,it,pt)",
    )
    parser.add_argument("--no-source", action="store_true", help="Skip comparing source README.md")
    parser.add_argument("--out", type=Path, help="Optional path to write JSON report")
    args = parser.parse_args(argv)

    baseline = args.baseline
    candidate = args.candidate
    if baseline is None and len(args.dirs) >= 1:
        baseline = Path(args.dirs[0])
    if candidate is None and len(args.dirs) >= 2:
        candidate = Path(args.dirs[1])

    if baseline is None or candidate is None:
        parser.error("Provide --baseline <dir> --candidate <dir> or two positional directories.")

    langs = [c.strip() for c in args.langs.split(",") if c.strip()]
    report = compare_translation_sets(
        baseline,
        candidate,
        langs=langs,
        include_source=not args.no_source,
    )
    text = json.dumps(report, indent=2, ensure_ascii=False)
    if args.out is not None:
        args.out.write_text(text + "\n", encoding="utf-8", newline="\n")
    print(text)
    return 0 if report["match"] else 1


if __name__ == "__main__":
    raise SystemExit(main())

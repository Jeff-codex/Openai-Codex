#!/usr/bin/env python3
"""
Scrape the mediap.kr `/newsix/order3` table after login and convert it
into a DELIVER media-seed style JSON payload.

Usage:
  MEDIAP_ID=dliver MEDIAP_PW=secret \
  python3 07_자동화스크립트-AutomationScripts/mediap_order3_scrape.py \
    --out /tmp/mediap_order3_media.json
"""

from __future__ import annotations

import argparse
import html
import json
import os
import random
import re
import sys
import time
import urllib.parse
import urllib.request
from html.parser import HTMLParser
from http.cookiejar import CookieJar
from typing import Dict, List, Optional, Tuple


BASE_URL = "https://mediap.kr"
LOGIN_FORM_URL = f"{BASE_URL}/login-form"
LOGIN_POST_URL = f"{BASE_URL}/main/login_check.php"
ORDER_URL = f"{BASE_URL}/newsix/order3"


def _clean_text(value: str) -> str:
    value = html.unescape(value or "")
    value = value.replace("\xa0", " ")
    value = re.sub(r"\s+", " ", value).strip()
    return value


def _parse_price(value: str) -> int:
    digits = re.sub(r"[^\d]", "", value or "")
    if not digits:
        return 0
    try:
        return int(digits)
    except ValueError:
        return 0


def _format_price_label(amount: int) -> str:
    return f"{amount:,}원" if amount > 0 else "회원전용"


def _normalize_byline(value: str) -> str:
    text = _clean_text(value)
    if "무기명" in text:
        return "무기명"
    if "기명" in text:
        return "기명"
    return text


class TableParser(HTMLParser):
    """Minimal HTML table parser that extracts cell text."""

    def __init__(self) -> None:
        super().__init__()
        self.in_table = False
        self.in_row = False
        self.in_cell = False
        self.current_cell_tag = ""
        self.current_cell_text: List[str] = []
        self.current_row: List[Tuple[str, str]] = []
        self.current_table: List[List[Tuple[str, str]]] = []
        self.tables: List[List[List[Tuple[str, str]]]] = []

    def handle_starttag(self, tag: str, attrs) -> None:
        if tag == "table":
            self.in_table = True
            self.current_table = []
        elif self.in_table and tag == "tr":
            self.in_row = True
            self.current_row = []
        elif self.in_row and tag in ("th", "td"):
            self.in_cell = True
            self.current_cell_tag = tag
            self.current_cell_text = []
        elif self.in_cell and tag == "br":
            self.current_cell_text.append(" ")

    def handle_endtag(self, tag: str) -> None:
        if self.in_cell and tag in ("th", "td"):
            text = _clean_text("".join(self.current_cell_text))
            self.current_row.append((self.current_cell_tag, text))
            self.in_cell = False
            self.current_cell_tag = ""
            self.current_cell_text = []
        elif self.in_row and tag == "tr":
            if self.current_row:
                self.current_table.append(self.current_row)
            self.in_row = False
            self.current_row = []
        elif self.in_table and tag == "table":
            if self.current_table:
                self.tables.append(self.current_table)
            self.in_table = False
            self.current_table = []

    def handle_data(self, data: str) -> None:
        if self.in_cell:
            self.current_cell_text.append(data)


def _request_with_retry(
    opener: urllib.request.OpenerDirector,
    url: str,
    data: Optional[bytes] = None,
    method: Optional[str] = None,
    retries: int = 5,
    timeout: int = 20,
) -> str:
    last_error = None
    for i in range(retries):
        try:
            req = urllib.request.Request(url, data=data, method=method)
            req.add_header("User-Agent", "Mozilla/5.0 (X11; Linux x86_64) mediap-order3-scraper/1.0")
            if data is not None:
                req.add_header("Content-Type", "application/x-www-form-urlencoded")
            with opener.open(req, timeout=timeout) as res:
                raw = res.read()
            return raw.decode("utf-8", errors="replace")
        except Exception as exc:  # noqa: BLE001
            last_error = exc
            if i < retries - 1:
                time.sleep(1 + random.random())
    raise RuntimeError(f"request failed: {url} ({last_error})")


def _login_and_fetch_order_html(user_id: str, password: str) -> str:
    cookie_jar = CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cookie_jar))

    _request_with_retry(opener, LOGIN_FORM_URL, method="GET")

    payload = urllib.parse.urlencode(
        {
            "c_user_id": user_id,
            "c_password": password,
            "s_url": "",
        }
    ).encode("utf-8")
    _request_with_retry(opener, LOGIN_POST_URL, data=payload, method="POST")
    order_html = _request_with_retry(opener, ORDER_URL, method="GET")

    if "login-form" in order_html and "로그인" in order_html:
        raise RuntimeError("login failed or session not authorized for /newsix/order3")

    return order_html


def _guess_header_map(headers: List[str]) -> Dict[str, int]:
    index_map: Dict[str, int] = {}
    normalized = [h.replace(" ", "") for h in headers]
    for idx, head in enumerate(normalized):
        if "매체" in head or "언론" in head:
            index_map.setdefault("name", idx)
        if "기명" in head or "작성" in head or "타입" in head:
            index_map.setdefault("bylineType", idx)
        if "금액" in head or "단가" in head or "가격" in head:
            index_map.setdefault("unitPrice", idx)
        if "노출" in head or "채널" in head or "상세" in head:
            index_map.setdefault("channel", idx)
        if "참고" in head or "비고" in head or "제한" in head or "메모" in head:
            index_map.setdefault("description", idx)
        if "상품" in head or "구분" in head or "카테고리" in head:
            index_map.setdefault("category", idx)
    return index_map


def _select_best_table(tables: List[List[List[Tuple[str, str]]]]) -> Optional[List[List[Tuple[str, str]]]]:
    best = None
    best_score = -1
    for table in tables:
        if not table:
            continue
        first_row = table[0]
        headers = [cell_text for tag, cell_text in first_row if tag == "th"] or [cell_text for _, cell_text in first_row]
        if not headers:
            continue
        header_text = " ".join(headers)
        score = 0
        for key in ("매체", "기명", "금액", "노출", "참고", "비고"):
            if key in header_text:
                score += 1
        if len(table) > 5:
            score += 1
        if score > best_score:
            best = table
            best_score = score
    return best


def _rows_from_table(table: List[List[Tuple[str, str]]]) -> Tuple[List[str], List[List[str]]]:
    if not table:
        return [], []
    first = table[0]
    has_th = any(tag == "th" for tag, _ in first)
    headers = [text for _, text in first] if has_th else []
    data_rows = table[1:] if has_th else table
    rows: List[List[str]] = []
    for row in data_rows:
        cells = [_clean_text(text) for _, text in row]
        if any(cells):
            rows.append(cells)
    return headers, rows


def _convert_rows_to_deliver_seed(headers: List[str], rows: List[List[str]]) -> List[Dict[str, object]]:
    header_map = _guess_header_map(headers)
    result: List[Dict[str, object]] = []

    def get_value(cells: List[str], field: str, fallback_index: int) -> str:
        idx = header_map.get(field, fallback_index)
        if 0 <= idx < len(cells):
            return _clean_text(cells[idx])
        return ""

    for i, cells in enumerate(rows, start=1):
        # Conservative fallback order when header matching is incomplete.
        name = get_value(cells, "name", 0)
        byline = get_value(cells, "bylineType", 1)
        price_raw = get_value(cells, "unitPrice", 2)
        channel = get_value(cells, "channel", 3)
        desc = get_value(cells, "description", 4)
        category = get_value(cells, "category", -1) or "미분류"

        if not name:
            continue

        unit_price = _parse_price(price_raw)
        row = {
            "id": f"media_mediap_{i:03d}",
            "name": name,
            "category": category,
            "bylineType": _normalize_byline(byline),
            "unitPrice": unit_price,
            "memberPrice": _format_price_label(unit_price),
            "channel": channel,
            "description": desc,
            "isActive": True,
            "source": "mediap.kr/newsix/order3",
        }
        result.append(row)
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description="mediap order3 scraper for DELIVER media format")
    parser.add_argument("--id", dest="user_id", default=os.getenv("MEDIAP_ID", ""))
    parser.add_argument("--pw", dest="password", default=os.getenv("MEDIAP_PW", ""))
    parser.add_argument("--out", dest="out_path", default="/tmp/mediap_order3_media.json")
    parser.add_argument("--raw-html-out", dest="raw_html_out", default="/tmp/mediap_order3_raw.html")
    args = parser.parse_args()

    if not args.user_id or not args.password:
        print("ERROR: MEDIAP_ID / MEDIAP_PW (or --id/--pw) is required", file=sys.stderr)
        return 2

    try:
        order_html = _login_and_fetch_order_html(args.user_id, args.password)
    except Exception as exc:  # noqa: BLE001
        print(f"ERROR: failed to fetch order3 after login: {exc}", file=sys.stderr)
        return 1

    with open(args.raw_html_out, "w", encoding="utf-8") as fp:
        fp.write(order_html)

    parser_obj = TableParser()
    parser_obj.feed(order_html)
    best = _select_best_table(parser_obj.tables)
    if not best:
        print("ERROR: could not find candidate table on order3 page", file=sys.stderr)
        return 1

    headers, rows = _rows_from_table(best)
    media = _convert_rows_to_deliver_seed(headers, rows)
    if not media:
        print("ERROR: table parsed but no media rows converted", file=sys.stderr)
        return 1

    payload = {
        "source": ORDER_URL,
        "fetchedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "headers": headers,
        "count": len(media),
        "media": media,
    }
    with open(args.out_path, "w", encoding="utf-8") as fp:
        json.dump(payload, fp, ensure_ascii=False, indent=2)

    print(f"OK: saved {len(media)} rows -> {args.out_path}")
    print(f"Raw HTML saved -> {args.raw_html_out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

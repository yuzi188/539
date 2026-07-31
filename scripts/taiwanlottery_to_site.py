import argparse
import json
import os
import re
import sys
import urllib.error
import urllib.request
from datetime import datetime


def parse_numbers(value):
    if isinstance(value, list):
        return [int(item) for item in value][:5]
    if isinstance(value, str):
        return [int(item) for item in re.findall(r"\d+", value)[:5]]
    return []


def normalize_date(value):
    text = str(value).strip().replace("-", "/")
    if "T" in text:
        text = text.split("T", 1)[0].replace("-", "/")
    return text


def normalize_record(record, source):
    period = str(
        record.get("期別")
        or record.get("period")
        or record.get("issue")
        or record.get("drawNo")
        or ""
    ).strip()
    date = normalize_date(
        record.get("開獎日期")
        or record.get("date")
        or record.get("drawDate")
        or datetime.now().strftime("%Y/%m/%d")
    )
    numbers = parse_numbers(
        record.get("獎號")
        or record.get("numbers")
        or record.get("draw_numbers")
        or record.get("drawNumbers")
    )

    if not period or len(numbers) != 5:
        raise ValueError(f"Cannot normalize crawler record: {record}")

    return {
        "period": period,
        "date": date,
        "numbers": sorted(numbers),
        "source": source,
        "raw": record,
    }


def fetch_daily_cash(year_month):
    try:
        from TaiwanLottery import TaiwanLotteryCrawler
    except ImportError as exc:
        raise SystemExit(
            "Missing package. Install it first with: pip install taiwanlottery"
        ) from exc

    crawler = TaiwanLotteryCrawler()
    if year_month:
        year, month = year_month.split("-", 1)
        return crawler.daily_cash([year, month])
    return crawler.daily_cash()


def post_draws(endpoint, draws, token=None):
    body = json.dumps(
        {"source": "TaiwanLotteryCrawler", "draws": draws},
        ensure_ascii=False,
    ).encode("utf-8")
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    request = urllib.request.Request(
        endpoint.rstrip("/") + "/api/draws",
        data=body,
        headers=headers,
        method="POST",
    )

    with urllib.request.urlopen(request, timeout=30) as response:
        return json.loads(response.read().decode("utf-8"))


def main():
    parser = argparse.ArgumentParser(
        description="Fetch Taiwan Lottery daily cash draws and send them to 539 Predictor Lab."
    )
    parser.add_argument(
        "--site",
        default=os.getenv("LOTTO539_SITE_URL", "http://localhost:3002"),
        help="Site base URL, for example https://your-site.chatgpt.site",
    )
    parser.add_argument(
        "--token",
        default=os.getenv("LOTTO539_DRAW_SYNC_TOKEN") or os.getenv("DRAW_SYNC_TOKEN"),
        help="Optional sync token for protected /api/draws writes.",
    )
    parser.add_argument(
        "--month",
        help="Optional Gregorian year-month, for example 2026-07. Defaults to current month.",
    )
    parser.add_argument(
        "--print-only",
        action="store_true",
        help="Print normalized JSON without posting it.",
    )
    args = parser.parse_args()

    raw = fetch_daily_cash(args.month)
    records = raw if isinstance(raw, list) else raw.get("data", [])
    draws = [normalize_record(record, "TaiwanLotteryCrawler") for record in records]

    if args.print_only:
        print(json.dumps(draws, ensure_ascii=False, indent=2))
        return

    try:
        result = post_draws(args.site, draws, args.token)
    except urllib.error.HTTPError as exc:
        sys.stderr.write(exc.read().decode("utf-8", errors="replace") + "\n")
        raise

    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()

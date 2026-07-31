import argparse
import csv
import json
import os
import time
import urllib.error
from datetime import datetime
from pathlib import Path

from taiwanlottery_to_site import fetch_daily_cash, normalize_record, post_draws


ROOT = Path(__file__).resolve().parents[1]
OUTPUT_JSON = ROOT / "outputs" / "lotto539_daily_cash_2021-08_to_2026-07.json"
OUTPUT_CSV = ROOT / "outputs" / "lotto539_daily_cash_2021-08_to_2026-07.csv"
OUTPUT_SUMMARY = ROOT / "outputs" / "lotto539_daily_cash_2021-08_to_2026-07_summary.json"
PUBLIC_JSON = ROOT / "public" / "data" / "lotto539_daily_cash_history.json"
SEED_SQL = ROOT / "drizzle" / "0001_seed_lotto539_history.sql"


def q(value):
    return "'" + str(value).replace("'", "''") + "'"


def month_list(months):
    if months:
        return months
    now = datetime.now()
    return [f"{now.year:04d}-{now.month:02d}"]


def target_date(value):
    if value:
        return value.replace("-", "/")
    return datetime.now().strftime("%Y/%m/%d")


def load_existing():
    if OUTPUT_JSON.exists():
        return json.loads(OUTPUT_JSON.read_text(encoding="utf-8"))
    if PUBLIC_JSON.exists():
        return json.loads(PUBLIC_JSON.read_text(encoding="utf-8"))
    return []


def fetch_months(months):
    rows = []
    errors = []
    for month in months:
        try:
            raw = fetch_daily_cash(month)
            records = raw if isinstance(raw, list) else raw.get("data", [])
            rows.extend(
                normalize_record(record, "TaiwanLotteryCrawler")
                for record in records
            )
            print(f"{month}: {len(records)}")
        except Exception as exc:
            errors.append({"month": month, "error": repr(exc)})
            print(f"{month}: ERROR {exc!r}")
        time.sleep(0.2)
    return rows, errors


def merge_draws(existing, incoming):
    by_period = {str(draw["period"]): draw for draw in existing}
    for draw in incoming:
        by_period[str(draw["period"])] = draw
    return sorted(
        by_period.values(),
        key=lambda item: (item["date"], str(item["period"])),
        reverse=True,
    )


def write_outputs(draws, errors):
    OUTPUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    PUBLIC_JSON.parent.mkdir(parents=True, exist_ok=True)

    payload = json.dumps(draws, ensure_ascii=False, indent=2)
    OUTPUT_JSON.write_text(payload, encoding="utf-8")
    PUBLIC_JSON.write_text(payload, encoding="utf-8")

    with OUTPUT_CSV.open("w", newline="", encoding="utf-8-sig") as file:
        writer = csv.writer(file)
        writer.writerow(["period", "date", "n1", "n2", "n3", "n4", "n5", "source"])
        for draw in draws:
            writer.writerow([draw["period"], draw["date"], *draw["numbers"], draw["source"]])

    summary = {
        "range": f"{draws[-1]['date']} to {draws[0]['date']}" if draws else "",
        "draws_saved": len(draws),
        "latest": draws[0] if draws else None,
        "oldest": draws[-1] if draws else None,
        "updated_at": datetime.now().isoformat(timespec="seconds"),
        "errors": errors,
        "json": str(OUTPUT_JSON),
        "csv": str(OUTPUT_CSV),
    }
    OUTPUT_SUMMARY.write_text(
        json.dumps(summary, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def write_seed_sql(draws):
    lines = [
        "-- Seed Daily Cash / 539 draw history from TaiwanLotteryCrawler.",
        f"-- Range: {draws[-1]['date']} to {draws[0]['date']}; rows: {len(draws)}.",
    ]
    for draw in sorted(draws, key=lambda item: (item["date"], str(item["period"]))):
        n1, n2, n3, n4, n5 = draw["numbers"]
        raw = json.dumps(draw, ensure_ascii=False, separators=(",", ":"))
        lines.append(
            "INSERT OR IGNORE INTO `draws` "
            "(`game`,`period`,`draw_date`,`n1`,`n2`,`n3`,`n4`,`n5`,`source`,`raw_json`) VALUES "
            f"('daily_cash',{q(draw['period'])},{q(draw['date'])},{n1},{n2},{n3},{n4},{n5},{q(draw.get('source', 'TaiwanLotteryCrawler'))},{q(raw)});"
        )
        lines.append("--> statement-breakpoint")

    SEED_SQL.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main():
    parser = argparse.ArgumentParser(description="Update 539 history data and database seed.")
    parser.add_argument("--month", action="append", help="Month to refresh, for example 2026-07. Can be repeated.")
    parser.add_argument("--today-only", action="store_true", help="Only keep today's draw from the fetched month.")
    parser.add_argument("--date", help="Target date for --today-only, for example 2026-07-31. Defaults to today.")
    parser.add_argument(
        "--site",
        default=os.getenv("LOTTO539_SITE_URL"),
        help="Optional public site URL. When present, posts fetched rows to /api/draws.",
    )
    parser.add_argument(
        "--token",
        default=os.getenv("LOTTO539_DRAW_SYNC_TOKEN") or os.getenv("DRAW_SYNC_TOKEN"),
        help="Optional sync token for protected /api/draws writes.",
    )
    args = parser.parse_args()

    months = month_list(args.month)
    existing = load_existing()
    incoming, errors = fetch_months(months)
    if args.today_only:
        wanted = target_date(args.date)
        incoming = [draw for draw in incoming if draw["date"] == wanted]
        if not incoming:
            print(f"{wanted}: no draw found yet")
    merged = merge_draws(existing, incoming)

    write_outputs(merged, errors)
    write_seed_sql(merged)

    posted = None
    if args.site and incoming:
        try:
            posted = post_draws(args.site, incoming, args.token)
        except urllib.error.HTTPError as exc:
            posted = {"error": exc.read().decode("utf-8", errors="replace")}

    print(
        json.dumps(
            {
                "months": months,
                "fetched": len(incoming),
                "total": len(merged),
                "latest": merged[0] if merged else None,
                "errors": errors,
                "posted": posted,
            },
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()

"""Generate a local story-style recap from demo data or authorized MCP history."""

import argparse
from collections import Counter
from datetime import datetime, timedelta, timezone
import getpass
import json
from pathlib import Path
import sys

from mcp_client import McpError, ReadonlyMcp


ROOT = Path(__file__).resolve().parent
CST = timezone(timedelta(hours=8))
COMPLETED = {"6", "8", "已完成", "已评价", "订单已完成"}
PERIODS = ("早餐", "午间", "下午", "晚间", "深夜")


def parse_time(value):
    if not isinstance(value, str):
        return None
    try:
        parsed = datetime.fromisoformat(value.strip().replace("Z", "+00:00"))
        return parsed.astimezone(CST) if parsed.tzinfo else parsed.replace(tzinfo=CST)
    except ValueError:
        return None


def period(hour):
    if 5 <= hour < 11:
        return "早餐"
    if 11 <= hour < 14:
        return "午间"
    if 14 <= hour < 17:
        return "下午"
    if 17 <= hour < 22:
        return "晚间"
    return "深夜"


def clean_text(value, limit=160):
    return value.strip()[:limit] if isinstance(value, str) else ""


def analyze(raw_orders, source):
    """Allowlist report fields; deduplicate and count completed orders only."""
    records, seen = [], set()
    periods, stores, meal_orders, meal_units = Counter(), Counter(), Counter(), Counter()
    unknown_time = unknown_store = unknown_meals = skipped = 0
    for index, raw in enumerate(raw_orders):
        identity = raw.get("orderId")
        if identity and identity in seen:
            continue
        if identity:
            seen.add(identity)
        if str(raw.get("orderStatus", "")) not in COMPLETED:
            skipped += 1
            continue
        time = parse_time(raw.get("createTime"))
        store = clean_text(raw.get("storeName"))
        items = []
        for item in raw.get("orderProductList", []) or []:
            if not isinstance(item, dict):
                continue
            name = clean_text(item.get("productName"))
            quantity = item.get("quantity")
            if name and isinstance(quantity, int) and not isinstance(quantity, bool) and quantity > 0:
                items.append({"name": name, "quantity": quantity})
                meal_units[name] += quantity
        for name in {item["name"] for item in items}:
            meal_orders[name] += 1
        if time:
            periods[period(time.hour)] += 1
        else:
            unknown_time += 1
        if store:
            stores[store] += 1
        else:
            unknown_store += 1
        if not items:
            unknown_meals += 1
        records.append({
            "time": time.isoformat() if time else None,
            "date": time.strftime("%m.%d") if time else "日期未提供",
            "clock": time.strftime("%H:%M") if time else "",
            "store": store or "门店未提供", "items": items,
        })
    records.sort(key=lambda row: row["time"] or "", reverse=True)
    dates = sorted(row["time"] for row in records if row["time"])
    period_max = max(periods.values(), default=0)
    favorite_periods = [name for name in PERIODS if periods[name] == period_max and period_max]
    store_max = max(stores.values(), default=0)
    favorite_stores = sorted(name for name, count in stores.items() if count == store_max)
    meal_max = max(meal_orders.values(), default=0)
    favorite_meals = sorted(name for name, count in meal_orders.items() if count == meal_max)
    ranked_meals = sorted(meal_orders.items(), key=lambda item: (-item[1], -meal_units[item[0]], item[0]))
    return {
        "source": source, "count": len(records), "fetched": len(raw_orders), "skipped": skipped,
        "dateStart": dates[0][:10] if dates else None, "dateEnd": dates[-1][:10] if dates else None,
        "periods": [{"name": name, "count": periods[name]} for name in PERIODS],
        "favoritePeriods": favorite_periods,
        "stores": [{"name": name, "count": count} for name, count in stores.most_common()],
        "favoriteStores": favorite_stores, "storeCount": len(stores),
        "meals": [{"name": name, "orders": count, "quantity": meal_units[name]}
                  for name, count in ranked_meals[:6]], "favoriteMeals": favorite_meals,
        "unknown": {"time": unknown_time, "store": unknown_store, "meals": unknown_meals},
        "records": records,
    }


def demo_orders():
    fixtures = [
        ("2026-10-18 12:26:00", "示例·河畔餐厅", [("麦辣鸡腿汉堡", 1), ("薯条（中）", 1)]),
        ("2026-10-14 18:42:00", "示例·车站餐厅", [("巨无霸", 1), ("可口可乐（中）", 1)]),
        ("2026-10-09 12:08:00", "示例·河畔餐厅", [("麦辣鸡腿汉堡", 1), ("麦乐鸡（5块）", 1)]),
        ("2026-10-03 09:12:00", "示例·公园餐厅", [("猪柳蛋麦满分", 1), ("美式咖啡", 1)]),
        ("2026-09-26 12:44:00", "示例·河畔餐厅", [("麦辣鸡腿汉堡", 1), ("薯条（中）", 1)]),
        ("2026-09-19 19:18:00", "示例·车站餐厅", [("巨无霸", 1), ("薯条（中）", 1)]),
        ("2026-09-11 12:17:00", "示例·河畔餐厅", [("麦辣鸡腿汉堡", 1), ("可口可乐（中）", 1)]),
        ("2026-09-03 15:36:00", "示例·公园餐厅", [("奥利奥麦旋风", 1)]),
        ("2026-08-25 22:14:00", "示例·车站餐厅", [("麦乐鸡（5块）", 2), ("可口可乐（中）", 1)]),
        ("2026-08-18 11:57:00", "示例·河畔餐厅", [("巨无霸", 1), ("薯条（中）", 1)]),
    ]
    return [{"orderId": f"DEMO-{index}", "orderStatus": "6", "createTime": date,
             "storeName": store, "orderProductList": [{"productName": name, "quantity": quantity}
             for name, quantity in items]} for index, (date, store, items) in enumerate(fixtures)]


def render(report, target):
    embedded = json.dumps({"initial": report, "demo": analyze(demo_orders(), "demo")}, ensure_ascii=False)
    # Embedded JSON cannot terminate its script element or introduce HTML.
    embedded = embedded.replace("&", "\\u0026").replace("<", "\\u003c").replace(">", "\\u003e")
    template = (ROOT / "template.html").read_text(encoding="utf-8")
    html = template.replace("__RECAP_DATA__", embedded)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(html, encoding="utf-8", newline="\n")


def main():
    parser = argparse.ArgumentParser(description="麦迹：把近期点餐记录做成一份回顾")
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--demo", action="store_true", help="使用明确标注的虚构示例")
    mode.add_argument("--live", action="store_true", help="只读查询本人授权账号，凭证输入不回显")
    parser.add_argument("--output", type=Path, default=None)
    args = parser.parse_args()
    if args.demo:
        report = analyze(demo_orders(), "demo")
        target = args.output or ROOT / "麦迹-演示.html"
    else:
        token = getpass.getpass("请输入 MCP Token（输入不显示）：").strip()
        if not token:
            raise McpError("没有输入连接凭证。")
        orders = ReadonlyMcp(token).history()
        token = ""
        report = analyze(orders, "live")
        target = args.output or ROOT / "麦迹-我的回顾.html"
    render(report, target)
    print(f"已生成：{target.resolve()}")
    print(f"本次获取 {report['fetched']} 笔，其中 {report['count']} 笔已完成。未保存凭证和原始订单。")


if __name__ == "__main__":
    try:
        main()
    except (McpError, OSError) as exc:
        print(f"未生成回顾：{exc}", file=sys.stderr)
        sys.exit(1)

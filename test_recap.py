import json
from pathlib import Path
import tempfile
import unittest

from mcp_client import McpError, extract_orders
from recap import analyze, demo_orders, parse_time, period, render


class RecapTests(unittest.TestCase):
    def test_verified_empty_account_response(self):
        raw = {"success": True, "code": 200, "data": {}}
        result = {"content": [{"type": "text", "text": "## Original Response\n```json\n" + json.dumps(raw) + "\n```"}]}
        self.assertEqual(extract_orders(result), [])

    def test_failure_and_bad_payload_are_not_empty_accounts(self):
        for payload in ({"success": False, "code": 401, "data": {}}, {"data": None}, {"data": {"list": "oops"}}, {}):
            with self.subTest(payload=payload), self.assertRaises(McpError):
                extract_orders({"structuredContent": payload})

    def test_duplicate_cancelled_and_unknown_states(self):
        one = demo_orders()[0]
        cancelled = {**one, "orderId": "cancelled", "orderStatus": "7"}
        unknown = {**one, "orderId": "unknown", "orderStatus": "99"}
        report = analyze([one, one, cancelled, unknown], "live")
        self.assertEqual(report["count"], 1)
        self.assertEqual(report["skipped"], 2)
        self.assertEqual(report["meals"][0]["orders"], 1)

    def test_combo_children_are_not_double_counted(self):
        row = {**demo_orders()[0], "orderProductList": [{"productName": "套餐", "quantity": 1, "comboItemList": [{"name": "汉堡", "quantity": 1}]}]}
        report = analyze([row], "demo")
        self.assertEqual([x["name"] for x in report["meals"]], ["套餐"])

    def test_order_frequency_is_distinct_from_quantity(self):
        row = {**demo_orders()[0], "orderProductList": [{"productName": "薯条", "quantity": 2}, {"productName": "薯条", "quantity": 1}]}
        meal = analyze([row], "demo")["meals"][0]
        self.assertEqual((meal["orders"], meal["quantity"]), (1, 3))

    def test_missing_fields_remain_unknown(self):
        report = analyze([{"orderStatus": "6", "createTime": "bad date"}], "live")
        self.assertEqual(report["unknown"], {"time": 1, "store": 1, "meals": 1})
        self.assertEqual(report["favoritePeriods"], [])
        self.assertEqual(report["storeCount"], 0)

    def test_time_boundaries_and_timezone(self):
        self.assertEqual([period(h) for h in (4, 5, 10, 11, 14, 17, 22)], ["深夜", "早餐", "早餐", "午间", "下午", "晚间", "深夜"])
        self.assertEqual(parse_time("2026-10-20T04:00:00Z").hour, 12)

    def test_private_fields_are_not_retained(self):
        row = {**demo_orders()[0], "deliveryInfo": {"mobilePhone": "PRIVATE_PHONE", "deliveryAddress": "PRIVATE_ADDRESS"}, "token": "PRIVATE_TOKEN", "orderId": "PRIVATE_ORDER_ID"}
        encoded = json.dumps(analyze([row], "live"), ensure_ascii=False)
        for value in ("PRIVATE_PHONE", "PRIVATE_ADDRESS", "PRIVATE_TOKEN", "PRIVATE_ORDER_ID"):
            self.assertNotIn(value, encoded)

    def test_report_escapes_script_termination(self):
        row = {**demo_orders()[0], "storeName": "</script><script>alert(1)</script>"}
        with tempfile.TemporaryDirectory() as folder:
            target = Path(folder) / "report.html"
            render(analyze([row], "live"), target)
            text = target.read_text(encoding="utf-8")
            self.assertNotIn("</script><script>alert(1)</script>", text)
            self.assertIn("\\u003c/script\\u003e", text)

    def test_demo_totals(self):
        report = analyze(demo_orders(), "demo")
        self.assertEqual(report["count"], 10)
        self.assertEqual(report["storeCount"], 3)
        self.assertEqual(report["favoritePeriods"], ["午间"])
        self.assertEqual(sum(p["count"] for p in report["periods"]), 10)

    def test_ties_include_meals_outside_top_six(self):
        row = {**demo_orders()[0], "orderProductList": [{"productName": f"餐品{i}", "quantity": 1} for i in range(8)]}
        report = analyze([row], "demo")
        self.assertEqual(len(report["meals"]), 6)
        self.assertEqual(len(report["favoriteMeals"]), 8)


if __name__ == "__main__":
    unittest.main()

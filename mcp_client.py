"""Small read-only MCP client. No credential or raw response is written to disk."""

import json
import re
import urllib.error
import urllib.request


class McpError(RuntimeError):
    pass


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise McpError("服务发生跳转，已停止请求以保护连接凭证。")


class ReadonlyMcp:
    def __init__(self, token):
        self._token = token
        self._session = None
        self._version = "2025-06-18"
        self._id = 0
        self._opener = urllib.request.build_opener(NoRedirect())

    def _request(self, method, params=None, notification=False):
        payload = {"jsonrpc": "2.0", "method": method}
        if not notification:
            self._id += 1
            payload["id"] = self._id
        if params is not None:
            payload["params"] = params
        headers = {
            "Authorization": "Bearer " + self._token,
            "Accept": "application/json, text/event-stream",
            "Content-Type": "application/json",
            "User-Agent": "mai-recap/0.1",
        }
        if self._session:
            headers["Mcp-Session-Id"] = self._session
        if method != "initialize":
            headers["MCP-Protocol-Version"] = self._version
        request = urllib.request.Request(
            "https://mcp.mcd.cn", json.dumps(payload).encode(), headers, method="POST"
        )
        try:
            with self._opener.open(request, timeout=25) as response:
                self._session = response.headers.get("Mcp-Session-Id", self._session)
                if response.status == 202:
                    return {}
                if "text/event-stream" in response.headers.get("Content-Type", ""):
                    lines = []
                    for raw in response:
                        line = raw.decode("utf-8").rstrip("\r\n")
                        if line.startswith("data:"):
                            lines.append(line[5:].lstrip())
                        elif not line and lines:
                            event = json.loads("\n".join(lines))
                            lines = []
                            if event.get("id") == payload.get("id"):
                                return self._checked(event)
                    raise McpError("连接结束，但没有收到完整结果，请稍后重试。")
                return self._checked(json.load(response))
        except urllib.error.HTTPError as exc:
            raise McpError(f"连接失败（HTTP {exc.code}）。请检查凭证是否有效，并稍后重试。") from None
        except (urllib.error.URLError, TimeoutError, OSError, ValueError) as exc:
            raise McpError("没有取得有效响应，请检查网络后重试。") from None

    @staticmethod
    def _checked(response):
        if not isinstance(response, dict) or "error" in response:
            raise McpError("麦当劳服务没有返回有效结果。")
        return response

    def history(self):
        try:
            initialized = self._request("initialize", {
                "protocolVersion": self._version, "capabilities": {},
                "clientInfo": {"name": "mai-recap", "version": "0.1.0"},
            })
            version = initialized.get("result", {}).get("protocolVersion")
            if version not in {"2025-06-18", "2025-03-26", "2024-11-05"}:
                raise McpError("服务使用了尚未支持的协议版本。")
            self._version = version
            self._request("notifications/initialized", notification=True)
            result = self._request("tools/call", {"name": "order-list", "arguments": {}})
            return extract_orders(result.get("result", {}))
        finally:
            self._token = ""
            self._session = None


def decode_result(result):
    if not isinstance(result, dict) or result.get("isError"):
        raise McpError("历史订单查询失败，请稍后再试。")
    structured = result.get("structuredContent")
    if isinstance(structured, dict):
        return structured
    decoder = json.JSONDecoder()
    for block in result.get("content", []):
        if block.get("type") != "text":
            continue
        text = block.get("text", "")
        if "Original Response" in text:
            text = text.split("Original Response", 1)[1]
        for start in re.finditer(r"\{", text):
            try:
                value, _ = decoder.raw_decode(text[start.start():])
                if isinstance(value, dict) and any(k in value for k in ("data", "success", "code")):
                    return value
            except ValueError:
                continue
    raise McpError("服务返回的订单格式尚未支持，未把它当作空账户处理。")


def extract_orders(result):
    payload = decode_result(result)
    if payload.get("success") is False or payload.get("code", 200) not in (200, "200", 0, "0"):
        raise McpError("订单查询没有成功，请检查账号连接状态。")
    if "data" not in payload:
        raise McpError("响应缺少订单数据，无法判断账户是否为空。")
    data = payload["data"]
    # Verified empty-account response from the official service on 2026-10-20.
    if data == {}:
        return []
    if not isinstance(data, dict) or not isinstance(data.get("list"), list):
        raise McpError("订单数据结构与当前版本不一致，已停止生成。")
    if any(not isinstance(row, dict) for row in data["list"]):
        raise McpError("部分订单格式不完整，已停止生成。")
    return data["list"]

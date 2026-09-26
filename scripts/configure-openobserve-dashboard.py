"""Create the FARMAN agent monitoring dashboard on the local OpenObserve instance."""

import json
import os
import pathlib
import time
import urllib.request
import urllib.error

ROOT = pathlib.Path(__file__).resolve().parents[1]


def env_value(name):
    if os.environ.get(name):
        return os.environ[name]
    for line in (ROOT / ".env").read_text().splitlines():
        if line.startswith(name + "="):
            return line.split("=", 1)[1].strip().strip('"')
    raise RuntimeError(f"{name} is missing")


BASE = os.environ.get("OPENOBSERVE_BASE_URL", "http://127.0.0.1:5080")
AUTH = env_value("OPENOBSERVE_AUTHORIZATION")
TITLE = "FARMAN n8n Agent"


def api(method, path, body=None):
    data = None if body is None else json.dumps(body).encode()
    request = urllib.request.Request(
        BASE + path,
        data=data,
        headers={"Authorization": AUTH, "Content-Type": "application/json"},
        method=method,
    )
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            return response.status, json.load(response)
    except urllib.error.HTTPError as error:
        raise RuntimeError(f"OpenObserve HTTP {error.code}: {error.read().decode()[:600]}") from error


def axis(label, alias, column):
    return {"label": label, "alias": alias, "column": column}


def panel(panel_id, title, kind, sql, x, y, layout):
    return {
        "id": panel_id,
        "type": kind,
        "title": title,
        "description": "FARMAN agent events exported as OpenTelemetry traces.",
        "config": {"show_legends": True, "unit": "numbers"},
        "queryType": "sql",
        "queries": [{
            "query": sql,
            "customQuery": True,
            "fields": {"stream": "default", "stream_type": "traces", "x": x, "y": y,
                       "filter": {"filterType": "group", "logicalOperator": "AND", "conditions": []}},
            "config": {"promql_legend": ""},
        }],
        "layout": layout,
    }


def main():
    state_sql = (
        'SELECT agent_state AS x_axis_1, count(*) AS y_axis_1 FROM "default" '
        "WHERE service_name = 'farman-agent' GROUP BY x_axis_1 ORDER BY y_axis_1 DESC"
    )
    trend_sql = (
        'SELECT histogram(_timestamp) AS x_axis_1, count(*) AS y_axis_1 FROM "default" '
        "WHERE service_name = 'farman-agent' GROUP BY x_axis_1 ORDER BY x_axis_1"
    )
    failure_sql = (
        'SELECT count(*) AS y_axis_1 FROM "default" '
        "WHERE service_name = 'farman-agent' AND (agent_state = 'failed' OR status_code = 2)"
    )
    latest_sql = (
        'SELECT _timestamp AS x_axis_1, agent_run_id AS x_axis_2, '
        'operation_name AS x_axis_3, agent_state AS x_axis_4, agent_tool AS x_axis_5, '
        'agent_duration_ms AS x_axis_6 FROM "default" '
        "WHERE service_name = 'farman-agent' ORDER BY x_axis_1 DESC LIMIT 50"
    )
    panels = [
        panel("agent_states", "وضعیت اجراها", "pie", state_sql,
              [axis("وضعیت", "x_axis_1", "agent_state")],
              [axis("تعداد", "y_axis_1", "agent_state")], {"x": 0, "y": 0, "w": 6, "h": 8, "i": 1}),
        panel("agent_trend", "روند رویدادهای ایجنت", "bar", trend_sql,
              [axis("زمان", "x_axis_1", "_timestamp")],
              [axis("تعداد", "y_axis_1", "_timestamp")], {"x": 6, "y": 0, "w": 6, "h": 8, "i": 2}),
        panel("agent_failures", "خطاها", "metric", failure_sql, [],
              [axis("تعداد خطا", "y_axis_1", "status_code")], {"x": 0, "y": 8, "w": 3, "h": 5, "i": 3}),
        panel("agent_recent", "آخرین رویدادها", "table", latest_sql,
              [axis("زمان", "x_axis_1", "_timestamp"), axis("شناسه اجرا", "x_axis_2", "agent_run_id"),
               axis("مرحله", "x_axis_3", "operation_name"), axis("وضعیت", "x_axis_4", "agent_state"),
               axis("ابزار", "x_axis_5", "agent_tool"), axis("مدت", "x_axis_6", "agent_duration_ms")],
              [], {"x": 3, "y": 8, "w": 9, "h": 9, "i": 4}),
    ]
    now = int(time.time() * 1_000_000)
    for item in panels:
        sql = item["queries"][0]["query"]
        status, result = api("POST", "/api/default/_search?type=traces", {
            "query": {"sql": sql, "start_time": now - 7 * 86400 * 1_000_000,
                      "end_time": now, "from": 0, "size": 50},
        })
        print(f"query {item['id']}: HTTP {status}, rows={len(result.get('hits', []))}")
    _, existing = api("GET", "/api/default/dashboards")
    for item in existing.get("dashboards", []):
        dashboard = item.get("v8") or item
        if dashboard.get("title") == TITLE:
            dashboard_id = dashboard.get("dashboardId")
            _, readback = api("GET", f"/api/default/dashboards/{dashboard_id}")
            tabs = (readback.get("v8") or readback).get("tabs", [])
            print(f"dashboard already exists: {dashboard_id}, panels={sum(len(t.get('panels', [])) for t in tabs)}")
            return
    payload = {
        "title": TITLE,
        "description": "Agent run states, failures and recent activity from FARMAN's n8n-backed workflow.",
        "tabs": [{"tabId": "agent", "name": "اجرای ایجنت", "panels": panels}],
    }
    status, result = api("POST", "/api/default/dashboards", payload)
    dashboard_id = (result.get("v8") or result).get("dashboardId")
    if not dashboard_id:
        raise RuntimeError(f"dashboard creation returned no ID: {result}")
    _, readback = api("GET", f"/api/default/dashboards/{dashboard_id}")
    tabs = (readback.get("v8") or readback).get("tabs", [])
    print(f"created dashboard: HTTP {status}, id={dashboard_id}, panels={sum(len(t.get('panels', [])) for t in tabs)}")


if __name__ == "__main__":
    main()

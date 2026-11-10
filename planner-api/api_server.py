"""FitMind AI — 轻量级 JSON REST API 服务
提供 /api/plan/catalog, /api/plan/generate, /api/plan/edit, /api/plan/validate 接口，
无缝集成至 AI Fit Coach 前端原生界面中。
"""
from __future__ import annotations
import copy
import json
import os
import sys
import time
from http.server import HTTPServer, BaseHTTPRequestHandler
from pathlib import Path

# 添加当前目录与 src 目录到系统路径
CURRENT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(CURRENT_DIR))

# 加载 .env 环境变量
env_file = CURRENT_DIR / ".env"
if env_file.exists():
    for line in env_file.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip())

from src.schemas import UserProfile, EditIntent, WeeklyPlan
from src.retrieval import load_catalog, get_eligible_exercises, get_safe_foods_and_meals
from src.validator import validate_weekly_plan
from src.planner_llm import generate_weekly_plan_llm
from src.planner_baseline import generate_weekly_plan_baseline
from src.core import build_demo_plan
from src.replanner import apply_plan_edit, parse_intent_hybrid

PORT = int(os.environ.get("FITMIND_API_PORT", 6692))
HOST = "0.0.0.0"

DAYS = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"]
PRESET_PROFILES = {
    "P01": {
        "title": "【预设】P01: 徒手/初学减脂 (无过敏)",
        "age": 21, "height_cm": 161, "weight_kg": 56.0, "goal": "减脂",
        "experience": "初学者", "equipment": "徒手", "sessions": 2,
        "available_days": ["周一", "周三"], "allergies": [], "exclude_foods": []
    },
    "P05": {
        "title": "【预设】P05: 健身房/减脂进阶",
        "age": 25, "height_cm": 165, "weight_kg": 60.0, "goal": "减脂",
        "experience": "初学者", "equipment": "健身房", "sessions": 3,
        "available_days": ["周一", "周三", "周五"], "allergies": [], "exclude_foods": []
    },
    "P15": {
        "title": "【预设】P15: 健身房/增肌进阶 (高频次)",
        "age": 35, "height_cm": 175, "weight_kg": 70.0, "goal": "增肌",
        "experience": "有经验", "equipment": "健身房", "sessions": 4,
        "available_days": ["周一", "周二", "周四", "周六"], "allergies": [], "exclude_foods": []
    },
    "E01": {
        "title": "【预设】E01: 乳制品过敏特殊样本",
        "age": 21, "height_cm": 161, "weight_kg": 56.0, "goal": "减脂",
        "experience": "初学者", "equipment": "徒手", "sessions": 2,
        "available_days": ["周一", "周三"], "allergies": ["乳制品"], "exclude_foods": []
    },
    "E06": {
        "title": "【预设】E06: 鸡蛋过敏 + 排除鸡肉与牛肉",
        "age": 26, "height_cm": 166, "weight_kg": 61.0, "goal": "减脂",
        "experience": "有经验", "equipment": "健身房", "sessions": 2,
        "available_days": ["周一", "周三"], "allergies": ["鸡蛋"], "exclude_foods": ["chicken", "beef"]
    }
}

VISION_EXERCISE_MAP = {
    "squat": {"exercise": "squat", "label": "徒手深蹲"},
    "pushup": {"exercise": "pushup", "label": "标准俯卧撑"},
    "lunge": {"exercise": "lunge", "label": "弓步蹲"},
    "jumping_jacks": {"exercise": "jumping_jack", "label": "开合跳"}
}

class PlanApiHandler(BaseHTTPRequestHandler):
    def _send_json(self, data, status=200):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):
        url = self.path.split("?")[0].rstrip("/")
        if url in ("/api/plan/catalog", "/plan/api/catalog"):
            try:
                ex_list, foods_list, meals_list = load_catalog()
                self._send_json({
                    "ok": True,
                    "exercises": ex_list,
                    "foods": foods_list,
                    "presets": PRESET_PROFILES,
                    "vision_map": VISION_EXERCISE_MAP,
                    "days": DAYS
                })
            except Exception as e:
                self._send_json({"ok": False, "error": str(e)}, status=500)
        elif url in ("/api/plan/health", "/health", "/plan/health"):
            self._send_json({"ok": True, "service": "FitMind AI API", "time": time.time()})
        else:
            self._send_json({"ok": False, "error": "Not Found"}, status=404)

    def do_POST(self):
        url = self.path.split("?")[0].rstrip("/")
        length = int(self.headers.get("Content-Length", 0))
        raw_body = self.rfile.read(length).decode("utf-8") if length > 0 else "{}"
        try:
            payload = json.loads(raw_body)
        except Exception:
            self._send_json({"ok": False, "error": "Invalid JSON body"}, status=400)
            return

        if url in ("/api/plan/generate", "/plan/api/generate"):
            try:
                profile = payload.get("profile", {})
                mode = payload.get("mode", "llm")
                t0 = time.time()
                
                if mode == "llm":
                    plan_obj, meta = generate_weekly_plan_llm(profile)
                    plan = plan_obj.model_dump()
                elif mode == "baseline":
                    plan_obj, meta = generate_weekly_plan_baseline(profile)
                    plan = plan_obj.model_dump()
                else:
                    plan = build_demo_plan(profile)
                    meta = {"mode": "local_demo", "latency_ms": round((time.time() - t0) * 1000)}

                val = validate_weekly_plan(plan)
                self._send_json({
                    "ok": True,
                    "plan": plan,
                    "meta": meta,
                    "validation": {
                        "is_valid": val.is_valid,
                        "issues": val.issues
                    }
                })
            except Exception as e:
                import traceback
                traceback.print_exc()
                self._send_json({"ok": False, "error": str(e)}, status=500)

        elif url in ("/api/plan/edit", "/plan/api/edit"):
            try:
                plan = payload.get("plan")
                text = payload.get("text", "").strip()
                if not plan or not text:
                    self._send_json({"ok": False, "error": "Missing plan or text parameter"}, status=400)
                    return

                ex_list, foods_list, _ = load_catalog()
                allowed_catalog = [{"id": f["id"], "name": f["name"]} for f in foods_list]
                intent = parse_intent_hybrid(text, allowed_catalog)
                updated_plan, diff_summary = apply_plan_edit(plan, intent)
                updated_dict = updated_plan.model_dump()
                val = validate_weekly_plan(updated_dict)

                self._send_json({
                    "ok": True,
                    "plan": updated_dict,
                    "diff": diff_summary,
                    "validation": {
                        "is_valid": val.is_valid,
                        "issues": val.issues
                    }
                })
            except Exception as e:
                import traceback
                traceback.print_exc()
                self._send_json({"ok": False, "error": str(e)}, status=500)

        elif url in ("/api/plan/validate", "/plan/api/validate"):
            try:
                plan = payload.get("plan", {})
                val = validate_weekly_plan(plan)
                self._send_json({
                    "ok": True,
                    "validation": {
                        "is_valid": val.is_valid,
                        "issues": val.issues
                    }
                })
            except Exception as e:
                self._send_json({"ok": False, "error": str(e)}, status=500)
        else:
            self._send_json({"ok": False, "error": "Not Found"}, status=404)

    def log_message(self, format, *args):
        # 简化日志输出
        print(f"[FitMind API] {self.address_string()} - {format % args}")

def main():
    server = HTTPServer((HOST, PORT), PlanApiHandler)
    print(f"FitMind AI REST API Server running at http://{HOST}:{PORT}/api/plan/catalog")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down FitMind API server...")
        server.server_close()

if __name__ == "__main__":
    main()

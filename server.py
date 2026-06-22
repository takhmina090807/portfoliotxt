#!/usr/bin/env python3
"""Локальный сервер: раздаёт сайт и сохраняет портфолио в файлы."""

import base64
import cgi
import json
import os
import uuid
from datetime import datetime, timezone
from http.server import HTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from urllib.parse import quote

ROOT = Path(__file__).resolve().parent
USER_CONTENT = ROOT / "data" / "user-content.json"
BOOKINGS_FILE = ROOT / "data" / "bookings.json"
PORTFOLIO_DIR = ROOT / "images" / "portfolio"
UPLOAD_DIRS = {
    "portfolio": PORTFOLIO_DIR,
    "moodboards": ROOT / "images" / "moodboards",
    "site": ROOT / "images" / "site",
    "receipts": ROOT / "images" / "receipts",
    "reviews": ROOT / "images" / "reviews",
}
RECEIPT_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".pdf"}
REVIEW_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}


def save_bytes(data: bytes, folder: str, ext: str) -> str:
    dest_dir = UPLOAD_DIRS[folder]
    dest_dir.mkdir(parents=True, exist_ok=True)
    name = f"{uuid.uuid4().hex}{ext}"
    (dest_dir / name).write_bytes(data)
    return f"images/{folder}/{name}"


def save_data_url(data_url: str, folder: str = "portfolio") -> str:
    if not data_url.startswith("data:"):
        return data_url
    header, encoded = data_url.split(",", 1)
    ext = ".jpg"
    if "png" in header:
        ext = ".png"
    elif "webp" in header:
        ext = ".webp"
    raw = base64.b64decode(encoded)
    return save_bytes(raw, folder, ext)


def deep_merge(base: dict, override: dict) -> dict:
    result = json.loads(json.dumps(base))
    for key, value in override.items():
        if value is None:
            continue
        if isinstance(value, list):
            result[key] = value
        elif isinstance(value, dict):
            result[key] = deep_merge(result.get(key, {}), value)
        else:
            result[key] = value
    return result


def normalize_content(data: dict) -> dict:
    site = data.get("site", {})
    for key in ("heroImage", "aboutImage"):
        if isinstance(site.get(key), str) and site[key].startswith("data:"):
            site[key] = save_data_url(site[key], "site")

    for item in data.get("portfolio", []):
        if isinstance(item.get("cover"), str) and item["cover"].startswith("data:"):
            item["cover"] = save_data_url(item["cover"])
        images = []
        for img in item.get("images", []):
            images.append(save_data_url(img) if isinstance(img, str) and img.startswith("data:") else img)
        item["images"] = images

    for board in data.get("moodboards", []):
        if isinstance(board.get("cover"), str) and board["cover"].startswith("data:"):
            board["cover"] = save_data_url(board["cover"])
        images = []
        for img in board.get("images", []):
            images.append(save_data_url(img) if isinstance(img, str) and img.startswith("data:") else img)
        board["images"] = images

    return data


def load_bookings() -> list:
    if BOOKINGS_FILE.exists():
        try:
            data = json.loads(BOOKINGS_FILE.read_text(encoding="utf-8"))
            return data if isinstance(data, list) else []
        except json.JSONDecodeError:
            return []
    return []


def save_bookings(bookings: list) -> None:
    BOOKINGS_FILE.parent.mkdir(parents=True, exist_ok=True)
    BOOKINGS_FILE.write_text(json.dumps(bookings, ensure_ascii=False, indent=2), encoding="utf-8")


def get_booked_slots(bookings: list) -> dict:
    booked = {}
    for item in bookings:
        if item.get("status") == "cancelled":
            continue
        date = item.get("date")
        time = item.get("time")
        if date and time:
            booked.setdefault(date, set()).add(time)
    return booked


def compute_availability(base: dict) -> list:
    booking = base.get("booking") or {}
    default_slots = booking.get("defaultSlots") or ["10:00", "12:00", "14:00", "16:00", "18:00"]
    available_dates = booking.get("availableDates") or []
    booked = get_booked_slots(load_bookings())
    result = []
    for day in available_dates:
        date = day.get("date")
        if not date:
            continue
        slots = day.get("slots") or default_slots
        free = [slot for slot in slots if slot not in booked.get(date, set())]
        if free:
            result.append({"date": date, "slots": free})
    result.sort(key=lambda x: x["date"])
    return result


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def do_GET(self):
        if self.path.startswith("/api/booking-info"):
            self.handle_booking_info()
        elif self.path.startswith("/api/bookings"):
            self.handle_get_bookings()
        else:
            super().do_GET()

    def do_POST(self):
        if self.path == "/api/save":
            self.handle_save()
        elif self.path == "/api/save-portfolio":
            self.handle_save_portfolio()
        elif self.path == "/api/save-moodboards":
            self.handle_save_moodboards()
        elif self.path == "/api/save-services":
            self.handle_save_services()
        elif self.path == "/api/save-booking-config":
            self.handle_save_booking_config()
        elif self.path == "/api/booking":
            self.handle_create_booking()
        elif self.path == "/api/upload":
            self.handle_upload()
        else:
            self.send_error(404)

    def load_content_base(self) -> dict:
        if USER_CONTENT.exists():
            return json.loads(USER_CONTENT.read_text(encoding="utf-8"))
        default_path = ROOT / "data" / "content.json"
        if default_path.exists():
            return json.loads(default_path.read_text(encoding="utf-8"))
        return {}

    def write_content(self, payload: dict) -> dict:
        payload = normalize_content(payload)
        USER_CONTENT.parent.mkdir(parents=True, exist_ok=True)
        USER_CONTENT.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        return payload

    def handle_save(self):
        try:
            length = int(self.headers.get("Content-Length", 0))
            incoming = json.loads(self.rfile.read(length).decode("utf-8"))
            base = self.load_content_base()
            payload = self.write_content(deep_merge(base, incoming))
            self.send_json(200, {"ok": True, "portfolioCount": len(payload.get("portfolio", []))})
        except Exception as exc:
            self.send_json(500, {"error": str(exc)})

    def handle_save_portfolio(self):
        try:
            length = int(self.headers.get("Content-Length", 0))
            incoming = json.loads(self.rfile.read(length).decode("utf-8"))
            portfolio = incoming.get("portfolio")
            if not isinstance(portfolio, list):
                self.send_json(400, {"error": "Нужен массив portfolio"})
                return
            base = self.load_content_base()
            base["portfolio"] = portfolio
            payload = self.write_content(base)
            self.send_json(
                200,
                {
                    "ok": True,
                    "portfolioCount": len(payload.get("portfolio", [])),
                    "imageCount": sum(len(item.get("images", [])) for item in portfolio),
                },
            )
        except Exception as exc:
            self.send_json(500, {"error": str(exc)})

    def handle_save_moodboards(self):
        try:
            length = int(self.headers.get("Content-Length", 0))
            incoming = json.loads(self.rfile.read(length).decode("utf-8"))
            moodboards = incoming.get("moodboards")
            if not isinstance(moodboards, list):
                self.send_json(400, {"error": "Нужен массив moodboards"})
                return
            base = self.load_content_base()
            base["moodboards"] = moodboards
            payload = self.write_content(base)
            self.send_json(
                200,
                {
                    "ok": True,
                    "moodboardCount": len(payload.get("moodboards", [])),
                    "imageCount": sum(len(item.get("images", [])) for item in moodboards),
                },
            )
        except Exception as exc:
            self.send_json(500, {"error": str(exc)})

    def handle_save_services(self):
        try:
            length = int(self.headers.get("Content-Length", 0))
            incoming = json.loads(self.rfile.read(length).decode("utf-8"))
            services = incoming.get("services")
            if not isinstance(services, dict):
                self.send_json(400, {"error": "Нужен объект services"})
                return
            base = self.load_content_base()
            base["services"] = services
            payload = self.write_content(base)
            items = payload.get("services", {}).get("items", [])
            self.send_json(200, {"ok": True, "serviceCount": len(items)})
        except Exception as exc:
            self.send_json(500, {"error": str(exc)})

    def handle_booking_info(self):
        try:
            base = self.load_content_base()
            default_path = ROOT / "data" / "content.json"
            defaults = json.loads(default_path.read_text(encoding="utf-8")) if default_path.exists() else {}
            merged = deep_merge(defaults, base)
            booking = merged.get("booking") or {}
            self.send_json(
                200,
                {
                    "ok": True,
                    "brand": merged.get("site", {}).get("brand", ""),
                    "phone": merged.get("site", {}).get("phone", ""),
                    "phoneLink": merged.get("site", {}).get("phoneLink", ""),
                    "services": merged.get("services", {}).get("items", []),
                    "moodboards": [
                        {"id": b.get("id"), "title": b.get("title")}
                        for b in merged.get("moodboards", [])
                    ],
                    "booking": {
                        "prepaymentPercent": booking.get("prepaymentPercent", 20),
                        "bank": booking.get("bank", {}),
                        "defaultSlots": booking.get("defaultSlots", []),
                    },
                    "availability": compute_availability(merged),
                },
            )
        except Exception as exc:
            self.send_json(500, {"error": str(exc)})

    def handle_get_bookings(self):
        try:
            bookings = load_bookings()
            bookings.sort(key=lambda b: b.get("createdAt", ""), reverse=True)
            self.send_json(200, {"ok": True, "bookings": bookings})
        except Exception as exc:
            self.send_json(500, {"error": str(exc)})

    def handle_save_booking_config(self):
        try:
            length = int(self.headers.get("Content-Length", 0))
            incoming = json.loads(self.rfile.read(length).decode("utf-8"))
            booking = incoming.get("booking")
            if not isinstance(booking, dict):
                self.send_json(400, {"error": "Нужен объект booking"})
                return
            base = self.load_content_base()
            base["booking"] = booking
            self.write_content(base)
            self.send_json(200, {"ok": True, "dateCount": len(booking.get("availableDates", []))})
        except Exception as exc:
            self.send_json(500, {"error": str(exc)})

    def handle_create_booking(self):
        try:
            length = int(self.headers.get("Content-Length", 0))
            incoming = json.loads(self.rfile.read(length).decode("utf-8"))
            required = ("clientName", "clientPhone", "serviceId", "date", "time")
            for key in required:
                if not str(incoming.get(key, "")).strip():
                    self.send_json(400, {"error": f"Поле {key} обязательно"})
                    return
            if not incoming.get("prepaymentPaid"):
                self.send_json(400, {"error": "Подтвердите перевод предоплаты"})
                return
            receipt_path = (incoming.get("receiptPath") or "").strip()
            if not receipt_path:
                self.send_json(400, {"error": "Прикрепите чек об оплате"})
                return
            if not receipt_path.startswith("images/receipts/"):
                self.send_json(400, {"error": "Некорректный файл чека"})
                return

            base = self.load_content_base()
            date = incoming["date"]
            time = incoming["time"]
            availability = compute_availability(base)
            day = next((d for d in availability if d["date"] == date), None)
            if not day or time not in day.get("slots", []):
                self.send_json(409, {"error": "Это время уже занято. Выберите другой слот."})
                return

            booking_id = uuid.uuid4().hex[:12]
            record = {
                "id": booking_id,
                "createdAt": datetime.now(timezone.utc).isoformat(),
                "status": "pending",
                "clientName": incoming["clientName"].strip(),
                "clientPhone": incoming["clientPhone"].strip(),
                "clientEmail": (incoming.get("clientEmail") or "").strip(),
                "serviceId": incoming["serviceId"],
                "serviceTitle": incoming.get("serviceTitle", ""),
                "ideaId": incoming.get("ideaId", ""),
                "ideaTitle": incoming.get("ideaTitle", ""),
                "date": date,
                "time": time,
                "prepaymentAmount": incoming.get("prepaymentAmount"),
                "prepaymentCurrency": incoming.get("prepaymentCurrency", ""),
                "prepaymentPaid": True,
                "receiptPath": receipt_path,
                "notes": (incoming.get("notes") or "").strip(),
            }
            bookings = load_bookings()
            bookings.append(record)
            save_bookings(bookings)

            site = base.get("site", {})
            phone_link = site.get("phoneLink", "")
            wa_num = "".join(ch for ch in phone_link if ch.isdigit())
            msg_lines = [
                "Здравствуйте! Хочу забронировать съёмку 🤍",
                f"Имя: {record['clientName']}",
                f"Телефон: {record['clientPhone']}",
                f"Услуга: {record['serviceTitle']}",
            ]
            if record["ideaTitle"]:
                msg_lines.append(f"Идея съёмки: {record['ideaTitle']}")
            msg_lines.extend([
                f"Дата: {record['date']}",
                f"Время: {record['time']}",
            ])
            if record["prepaymentAmount"]:
                msg_lines.append(
                    f"Предоплата {base.get('booking', {}).get('prepaymentPercent', 20)}%: "
                    f"{record['prepaymentAmount']} {record['prepaymentCurrency']} — перевела ✓"
                )
            if record["notes"]:
                msg_lines.append(f"Комментарий: {record['notes']}")
            message = "\n".join(msg_lines)
            whatsapp_url = f"https://wa.me/{wa_num}?text={quote(message)}" if wa_num else phone_link

            self.send_json(200, {"ok": True, "id": booking_id, "whatsappUrl": whatsapp_url})
        except Exception as exc:
            self.send_json(500, {"error": str(exc)})

    def handle_upload(self):
        try:
            form = cgi.FieldStorage(
                fp=self.rfile,
                headers=self.headers,
                environ={"REQUEST_METHOD": "POST", "CONTENT_TYPE": self.headers.get("Content-Type", "")},
            )
            fileitem = form["file"]
            if not fileitem.filename:
                self.send_json(400, {"error": "Файл не выбран"})
                return
            ext = Path(fileitem.filename).suffix.lower()
            folder = form.getvalue("folder", "portfolio")
            if folder not in UPLOAD_DIRS:
                folder = "portfolio"
            if folder == "receipts":
                if ext not in RECEIPT_EXTENSIONS:
                    self.send_json(400, {"error": "Чек: JPG, PNG, WEBP или PDF"})
                    return
            elif folder == "reviews":
                if ext not in REVIEW_EXTENSIONS:
                    self.send_json(400, {"error": "Скриншот: JPG, PNG или WEBP"})
                    return
            elif ext not in (".jpg", ".jpeg"):
                self.send_json(400, {"error": "Только JPG / JPEG"})
                return
            save_ext = ext if ext != ".jpeg" else ".jpg"
            rel = save_bytes(fileitem.file.read(), folder, save_ext)
            self.send_json(200, {"path": rel})
        except Exception as exc:
            self.send_json(500, {"error": str(exc)})

    def send_json(self, code, obj):
        raw = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, fmt, *args):
        if "/api/" in (args[0] if args else ""):
            super().log_message(fmt, *args)


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8080"))
    host = "0.0.0.0"
    print(f"Сайт: http://localhost:{port}")
    print(f"Редактор: http://localhost:{port}/admin/")
    print("Остановить: Ctrl+C")
    HTTPServer((host, port), Handler).serve_forever()

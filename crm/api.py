"""REST API for mslklogistic. Framework-free router."""

import base64
import binascii
import csv
import html
import io
import os
import re
import secrets
import sqlite3
import tempfile
from datetime import date, datetime, timedelta

from . import db, excel, i18n
from .db import ApiError

SESSION_DAYS = 30
MAX_FILE_BYTES = 8 * 1024 * 1024

EXPENSE_KINDS = {
    "fuel": "Топливо",
    "toll": "Платные дороги",
    "repair": "Ремонт",
    "other": "Прочее",
}

CONTRACTOR_FIELDS = ["name", "inn", "contact", "phone", "email", "notes"]

MONTHS_RU = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"]
MONTHS_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

CLIENT_IMPORT_HEADERS = {
    "название": "name", "клиент": "name", "компания": "name", "name": "name",
    "отрасль": "industry", "industry": "industry",
    "инн": "inn", "inn": "inn",
    "телефон": "phone", "phone": "phone",
    "email": "email", "почта": "email", "e-mail": "email",
    "адрес": "address", "address": "address",
    "сайт": "website", "website": "website", "site": "website", "url": "website",
    "заметки": "notes", "notes": "notes", "комментарий": "notes",
}

REQUEST_STATUSES = {
    "new": "Новая",
    "calculating": "Расчёт",
    "sent": "Отправлено",
    "accepted": "Принято",
    "rejected": "Отклонено",
    "converted": "В рейсе",
}

COMPANY = {
    "name": "mslklogistic",
    "legal": "ООО «МСЛК Логистик»",
    "inn": "7700000000",
    "kpp": "770001001",
    "ogrn": "1207700000000",
    "address": "г. Москва, ул. Транспортная, д. 12, офис 4",
    "phone": "+7 (495) 000-00-00",
    "email": "office@mslklogistic.ru",
    "bank": "ООО «Банк»",
    "account": "40702810000000000001",
    "corr": "30101810000000000002",
    "bik": "044525000",
}
PUBLIC_ROUTES = {"GET /api/health", "POST /api/auth/login", "POST /api/auth/register"}

# Field roles get narrow route allowlists instead of the office workspace.
DRIVER_ROUTES = (
    ("GET", r"^/api/auth/me$"),
    ("POST", r"^/api/auth/logout$"),
    ("GET", r"^/api/deals$"),
    ("GET", r"^/api/deals/\d+$"),
    ("PATCH", r"^/api/deals/\d+/trip$"),
    ("GET", r"^/api/deals/\d+/comments$"),
    ("POST", r"^/api/deals/\d+/comments$"),
    ("POST", r"^/api/deals/\d+/files$"),
    ("GET", r"^/api/vehicles$"),
    ("GET", r"^/api/repairs$"),
    ("GET", r"^/api/repairs/\d+$"),
    ("POST", r"^/api/repairs$"),
    ("GET", r"^/api/repairs/\d+/files$"),
    ("POST", r"^/api/repairs/\d+/files$"),
    ("GET", r"^/api/repair-files/\d+/raw$"),
    ("GET", r"^/api/repairs/\d+/comments$"),
    ("POST", r"^/api/repairs/\d+/comments$"),
    ("GET", r"^/api/reminders$"),
)

MECHANIC_ROUTES = (
    ("GET", r"^/api/auth/me$"),
    ("POST", r"^/api/auth/logout$"),
    ("GET", r"^/api/vehicles$"),
    ("GET", r"^/api/vehicles/\d+$"),
    ("POST", r"^/api/vehicles$"),
    ("PATCH", r"^/api/vehicles/\d+$"),
    ("DELETE", r"^/api/vehicles/\d+$"),
    ("GET", r"^/api/drivers$"),
    ("GET", r"^/api/repairs$"),
    ("GET", r"^/api/repairs/\d+$"),
    ("PATCH", r"^/api/repairs/\d+$"),
    ("GET", r"^/api/repairs/\d+/files$"),
    ("POST", r"^/api/repairs/\d+/files$"),
    ("GET", r"^/api/repair-files/\d+/raw$"),
    ("GET", r"^/api/repairs/\d+/comments$"),
    ("POST", r"^/api/repairs/\d+/comments$"),
    ("GET", r"^/api/reminders$"),
)


class Raw:
    """Binary response body served verbatim with the given content type."""

    def __init__(self, data, content_type):
        self.data = data
        self.content_type = content_type



# ---------------------------------------------------------------- utilities

def to_int(value, default=None):
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def to_float(value, default=0.0):
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def clean(value, limit=500):
    if value is None:
        return ""
    return str(value).strip()[:limit]


def require(condition, message, status=400):
    if not condition:
        raise ApiError(status, message)


def parse_stage(value):
    require(value in db.STAGES, "Неизвестный этап перевозки")
    return value


def parse_transport(value):
    require(value in db.TRANSPORT_TYPES, "Неизвестный тип перевозки")
    return value


def parse_date(value, label):
    value = clean(value, 20)
    if not value:
        return ""
    try:
        return datetime.strptime(value, "%Y-%m-%d").date().isoformat()
    except ValueError:
        raise ApiError(400, "Некорректная дата: %s" % label)


def parse_priority(value):
    require(value in db.PRIORITIES, "Неизвестный приоритет задачи")
    return value


def session_cookie(token):
    return "sid=%s; Path=/; HttpOnly; SameSite=Lax; Max-Age=%d" % (token, SESSION_DAYS * 24 * 3600)


def clear_cookie():
    return "sid=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0"


def current_user(conn, token):
    if not token:
        return None
    row = conn.execute(
        """SELECT u.*, s.expires_at AS session_expires FROM sessions s
           JOIN users u ON u.id = s.user_id WHERE s.token = ?""",
        (token,),
    ).fetchone()
    if row is None:
        return None
    if row["session_expires"] < db.now_iso() or not row["active"]:
        conn.execute("DELETE FROM sessions WHERE token = ?", (token,))
        conn.commit()
        return None
    return db.user_dict(row)


def is_manager(user):
    return user["role"] == "manager"


def is_driver(user):
    return user["role"] == "driver"


def is_mechanic(user):
    return user["role"] == "mechanic"


def is_field_role(user):
    """Driver and mechanic accounts work outside the office CRM."""
    return user["role"] in db.FIELD_ROLES


def deny_driver(user, message="Водителю доступны только его рейсы, заявки на ремонт и загрузка документов"):
    """Reject office-only operations for the driver role."""
    if is_driver(user):
        raise ApiError(403, message)


def deal_view(row, user):
    """Serialise a deal row, hiding money and office data from drivers."""
    data = dict(row)
    if is_driver(user):
        for key in ("amount", "currency", "owner_id", "owner_name", "driver", "driver_id", "files_count",
                    "expenses_total", "margin", "margin_pct", "paid_total", "debt", "payment_status",
                    "payment_due", "contractor_id", "contractor_cost", "contractor_name"):
            data.pop(key, None)
    elif "expenses_total" in data:
        total = float(data.get("expenses_total") or 0) + float(data.get("contractor_cost") or 0)
        amount = float(data.get("amount") or 0)
        paid = float(data.get("paid_total") or 0)
        data["expenses_total"] = round(total, 2)
        data["margin"] = round(amount - total, 2)
        data["margin_pct"] = round((amount - total) / amount * 100, 1) if amount else None
        data["paid_total"] = round(paid, 2)
        data["debt"] = round(max(amount - paid, 0), 2)
        data["payment_status"] = "paid" if amount and paid >= amount - 0.01 else ("partial" if paid > 0 else "unpaid")
    return data


def scope_clause(user, alias):
    """Return (sql, params) restricting rows to the user's workspace (own records only for managers)."""
    conds, params = ["%s.workspace = ?" % alias], [user["workspace"]]
    if is_manager(user):
        conds.append("%s.owner_id = ?" % alias)
        params.append(user["id"])
    return " AND " + " AND ".join(conds), params


# ---------------------------------------------------------------- lookups

def get_client(conn, user, client_id, write=False):
    row = conn.execute("""SELECT c.*, u.name AS owner_name FROM clients c
                          LEFT JOIN users u ON u.id = c.owner_id WHERE c.id = ?""", (client_id,)).fetchone()
    if row is None or row["workspace"] != user["workspace"]:
        raise ApiError(404, "Клиент не найден")
    if is_manager(user) and row["owner_id"] != user["id"]:
        raise ApiError(403, "Нет доступа к этому клиенту")
    return row


def get_deal(conn, user, deal_id):
    row = conn.execute("SELECT * FROM deals WHERE id = ?", (deal_id,)).fetchone()
    if row is None or row["workspace"] != user["workspace"]:
        raise ApiError(404, "Перевозка не найдена")
    if is_manager(user) and row["owner_id"] != user["id"]:
        raise ApiError(403, "Нет доступа к этой перевозке")
    if is_driver(user) and row["driver_id"] != user["id"]:
        raise ApiError(404, "Перевозка не найдена")
    return row


def get_task(conn, user, task_id):
    row = conn.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()
    if row is None or row["workspace"] != user["workspace"]:
        raise ApiError(404, "Задача не найдена")
    if is_manager(user) and row["assignee_id"] != user["id"]:
        raise ApiError(403, "Нет доступа к этой задаче")
    return row


def user_name(conn, user_id):
    row = conn.execute("SELECT name FROM users WHERE id = ?", (user_id,)).fetchone()
    return row["name"] if row else ""


def assert_assignee(conn, user, assignee_id):
    if is_manager(user):
        return user["id"]
    if assignee_id in (None, "", 0):
        return user["id"]
    target = conn.execute("SELECT id, role, active, workspace FROM users WHERE id = ?", (assignee_id,)).fetchone()
    require(target is not None and target["active"] and target["workspace"] == user["workspace"]
            and target["role"] not in db.FIELD_ROLES,
            "Ответственный не найден")
    return assignee_id


# ---------------------------------------------------------------- auth

def health(ctx):
    return 200, {"ok": True, "service": "mslklogistic", "time": db.now_iso()}


def issue_session(conn, user_id):
    """Create a fresh session for the user and return its token."""
    conn.execute("DELETE FROM sessions WHERE expires_at < ?", (db.now_iso(),))
    token = secrets.token_hex(32)
    expires = (datetime.now() + timedelta(days=SESSION_DAYS)).replace(microsecond=0).isoformat()
    conn.execute(
        "INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
        (token, user_id, db.now_iso(), expires),
    )
    conn.commit()
    return token


def login(ctx):
    conn, body = ctx["conn"], ctx["body"]
    identifier = clean(body.get("email"), 200)
    password = body.get("password") or ""
    require(identifier and password, "Введите логин и пароль")
    row = conn.execute("SELECT * FROM users WHERE lower(email) = ?", (identifier.lower(),)).fetchone()
    if row is None:
        for candidate in conn.execute("SELECT * FROM users"):
            if candidate["name"].strip().lower() == identifier.lower():
                row = candidate
                break
    if row is None or not row["active"] or not db.verify_password(password, row["password"]):
        raise ApiError(401, "Неверный логин или пароль")
    token = issue_session(conn, row["id"])
    return 200, {"ok": True, "user": db.user_dict(row)}, [("Set-Cookie", session_cookie(token))]


def register(ctx):
    """Self-service sign-up: every new account gets its own clean workspace."""
    conn, body = ctx["conn"], ctx["body"]
    name = clean(body.get("name"), 120)
    email = clean(body.get("email"), 200).lower()
    password = body.get("password") or ""
    require(name, "Укажите имя")
    require(len(name) >= 2, "Имя слишком короткое")
    require("@" in email and "." in email, "Укажите корректный email")
    require(len(password) >= 6, "Пароль должен быть не короче 6 символов")
    exists = conn.execute("SELECT id FROM users WHERE lower(email) = ?", (email,)).fetchone()
    require(exists is None, "Аккаунт с таким email уже существует", 409)
    name_taken = any(
        row["name"].strip().lower() == name.lower()
        for row in conn.execute("SELECT name FROM users")
    )
    require(not name_taken, "Это имя уже занято — укажите фамилию или другой логин", 409)
    workspace = "ws-" + secrets.token_hex(8)
    cur = conn.execute(
        """INSERT INTO users (name, email, password, role, active, workspace, created_at)
           VALUES (?, ?, ?, 'admin', 1, ?, ?)""",
        (name, email, db.hash_password(password), workspace, db.now_iso()),
    )
    db.add_activity(conn, cur.lastrowid, "user", "Создано рабочее пространство", "user", cur.lastrowid)
    conn.commit()
    row = conn.execute("SELECT * FROM users WHERE id = ?", (cur.lastrowid,)).fetchone()
    token = issue_session(conn, cur.lastrowid)
    return 201, {"ok": True, "user": db.user_dict(row)}, [("Set-Cookie", session_cookie(token))]


def logout(ctx):
    conn = ctx["conn"]
    if ctx.get("token"):
        conn.execute("DELETE FROM sessions WHERE token = ?", (ctx["token"],))
        conn.commit()
    return 200, {"ok": True}, [("Set-Cookie", clear_cookie())]


def me(ctx):
    return 200, {"ok": True, "user": ctx["user"]}


# ---------------------------------------------------------------- users

def list_users(ctx):
    conn, user = ctx["conn"], ctx["user"]
    require(user["role"] in ("admin", "head"), "Недостаточно прав", 403)
    rows = conn.execute(
        "SELECT * FROM users WHERE workspace = ? ORDER BY active DESC, name ASC",
        (user["workspace"],),
    ).fetchall()
    return 200, {"ok": True, "users": [db.user_dict(r) for r in rows]}


def team_roster(ctx):
    """Minimal roster for owner selects; available to every signed-in user."""
    conn, user = ctx["conn"], ctx["user"]
    rows = conn.execute(
        "SELECT id, name, role, active FROM users WHERE active = 1 AND workspace = ? ORDER BY name",
        (user["workspace"],),
    ).fetchall()
    return 200, {"ok": True, "users": [{"id": r["id"], "name": r["name"], "role": r["role"]} for r in rows]}


def create_user(ctx):
    conn, user = ctx["conn"], ctx["user"]
    require(user["role"] == "admin", "Только администратор может создавать пользователей", 403)
    body = ctx["body"]
    name = clean(body.get("name"), 120)
    email = clean(body.get("email"), 200).lower()
    password = body.get("password") or ""
    role = clean(body.get("role"), 20) or "manager"
    require(name, "Укажите имя")
    require("@" in email and "." in email, "Укажите корректный email")
    require(len(password) >= 6, "Пароль должен быть не короче 6 символов")
    require(role in db.ROLES, "Неизвестная роль")
    exists = conn.execute("SELECT id FROM users WHERE lower(email) = ?", (email,)).fetchone()
    require(exists is None, "Пользователь с таким email уже существует", 409)
    cur = conn.execute(
        """INSERT INTO users (name, email, password, role, active, workspace, created_at)
           VALUES (?, ?, ?, ?, 1, ?, ?)""",
        (name, email, db.hash_password(password), role, user["workspace"], db.now_iso()),
    )
    conn.commit()
    db.add_activity(conn, user["id"], "user", "Добавлен пользователь %s" % name, "user", cur.lastrowid)
    conn.commit()
    row = conn.execute("SELECT * FROM users WHERE id = ?", (cur.lastrowid,)).fetchone()
    return 201, {"ok": True, "user": db.user_dict(row)}


def admin_count(conn, workspace):
    return conn.execute(
        "SELECT COUNT(*) AS c FROM users WHERE role = 'admin' AND active = 1 AND workspace = ?",
        (workspace,),
    ).fetchone()["c"]


def update_user(ctx, user_id):
    conn, actor = ctx["conn"], ctx["user"]
    require(actor["role"] == "admin", "Только администратор может менять пользователей", 403)
    row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    require(row is not None and row["workspace"] == actor["workspace"], "Пользователь не найден", 404)
    body = ctx["body"]
    name = clean(body.get("name", row["name"]), 120) or row["name"]
    email = clean(body.get("email", row["email"]), 200).lower()
    role = body.get("role", row["role"])
    active = 1 if body.get("active", True) else 0
    password = body.get("password") or ""
    require(role in db.ROLES, "Неизвестная роль")
    is_owner_account = row["email"].lower() == db.OWNER_EMAIL
    if is_owner_account and (role != "admin" or not active):
        raise ApiError(400, "Личный аккаунт нельзя отключить или понизить")
    if row["id"] == actor["id"] and (role != "admin" or not active):
        raise ApiError(400, "Нельзя отключить или понизить собственную учётную запись")
    if row["role"] == "admin" and (role != "admin" or not active) and admin_count(conn, actor["workspace"]) <= 1:
        raise ApiError(400, "В системе должен остаться хотя бы один активный администратор")
    if email != row["email"]:
        exists = conn.execute("SELECT id FROM users WHERE lower(email) = ? AND id != ?", (email, row["id"])).fetchone()
        require(exists is None, "Пользователь с таким email уже существует", 409)
    if row["role"] not in db.FIELD_ROLES and role in db.FIELD_ROLES:
        owned = conn.execute(
            """SELECT (SELECT COUNT(*) FROM deals WHERE owner_id = ?)
                    + (SELECT COUNT(*) FROM clients WHERE owner_id = ?)
                    + (SELECT COUNT(*) FROM tasks WHERE assignee_id = ?) AS c""",
            (row["id"], row["id"], row["id"]),
        ).fetchone()["c"]
        require(owned == 0, "Сначала передайте клиентов, перевозки и задачи другому сотруднику")
    if password:
        require(len(password) >= 6, "Пароль должен быть не короче 6 символов")
        conn.execute("UPDATE users SET password = ? WHERE id = ?", (db.hash_password(password), row["id"]))
    conn.execute(
        "UPDATE users SET name = ?, email = ?, role = ?, active = ? WHERE id = ?",
        (name, email, role, active, row["id"]),
    )
    if row["role"] == "driver" and (role != "driver" or not active):
        conn.execute("UPDATE deals SET driver_id = NULL WHERE driver_id = ?", (row["id"],))
        conn.execute("UPDATE vehicles SET driver_id = NULL WHERE driver_id = ?", (row["id"],))
    if row["role"] == "mechanic" and (role != "mechanic" or not active):
        conn.execute("UPDATE repair_requests SET mechanic_id = NULL WHERE mechanic_id = ?", (row["id"],))
    conn.commit()
    updated = conn.execute("SELECT * FROM users WHERE id = ?", (row["id"],)).fetchone()
    return 200, {"ok": True, "user": db.user_dict(updated)}


def delete_user(ctx, user_id):
    conn, actor = ctx["conn"], ctx["user"]
    require(actor["role"] == "admin", "Только администратор может удалять пользователей", 403)
    require(user_id != actor["id"], "Нельзя удалить собственную учётную запись")
    row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    require(row is not None and row["workspace"] == actor["workspace"], "Пользователь не найден", 404)
    require(row["email"].lower() != db.OWNER_EMAIL, "Личный аккаунт нельзя удалить")
    if row["role"] == "admin" and admin_count(conn, actor["workspace"]) <= 1:
        raise ApiError(400, "В системе должен остаться хотя бы один администратор")
    conn.execute("DELETE FROM users WHERE id = ?", (user_id,))
    conn.commit()
    return 200, {"ok": True}


# ---------------------------------------------------------------- clients

CLIENT_FIELDS = ["name", "industry", "inn", "website", "phone", "email", "address", "notes"]


def client_payload(conn, user, body, row=None):
    data = {}
    for field in CLIENT_FIELDS:
        default = row[field] if row else ""
        data[field] = clean(body.get(field, default), 2000)
    require(data["name"], "Укажите название клиента")
    inn = data["inn"].replace(" ", "")
    data["inn"] = inn
    if inn:
        require(inn.isdigit() and len(inn) in (10, 12), "ИНН должен содержать 10 или 12 цифр")
    if is_manager(user):
        owner_id = user["id"]
    else:
        owner_id = body.get("owner_id", row["owner_id"] if row else user["id"])
        owner_id = to_int(owner_id, user["id"])
        target = conn.execute("SELECT id, workspace, role FROM users WHERE id = ?", (owner_id,)).fetchone()
        require(target is not None and target["workspace"] == user["workspace"]
                and target["role"] not in db.FIELD_ROLES,
                "Ответственный не найден")
    data["owner_id"] = owner_id
    return data


def list_clients(ctx):
    conn, user = ctx["conn"], ctx["user"]
    query = ctx["query"]
    conds, params = ["1=1"], []
    scope_sql, scope_params = scope_clause(user, "c")
    if scope_sql:
        conds.append(scope_sql.replace(" AND ", "", 1))
        params.extend(scope_params)
    search = clean(query.get("q", ""), 100)
    if search:
        like = "%" + search + "%"
        conds.append("(c.name LIKE ? OR c.industry LIKE ? OR c.inn LIKE ? OR c.email LIKE ? OR c.phone LIKE ?)")
        params.extend([like, like, like, like, like])
    owner = to_int(query.get("owner"))
    if owner and not is_manager(user):
        conds.append("c.owner_id = ?")
        params.append(owner)
    money_scope = (" AND d.owner_id = %d" % int(user["id"])) if is_manager(user) else ""
    sql = f"""
        SELECT c.*, u.name AS owner_name,
            (SELECT COUNT(*) FROM contacts ct WHERE ct.client_id = c.id) AS contacts_count,
            (SELECT COUNT(*) FROM deals d WHERE d.client_id = c.id) AS deals_count,
            (SELECT COALESCE(SUM(d.amount), 0) FROM deals d
              WHERE d.client_id = c.id AND d.stage NOT IN ('won', 'lost')) AS open_amount,
            (SELECT COUNT(*) FROM deals d
              WHERE d.client_id = c.id AND d.stage = 'won'{money_scope}) AS won_count,
            (SELECT COALESCE(SUM(d.amount), 0) FROM deals d
              WHERE d.client_id = c.id AND d.stage = 'won'{money_scope}) AS revenue_total,
            (SELECT COALESCE(SUM(e.amount), 0) FROM deal_expenses e
              JOIN deals d ON d.id = e.deal_id
              WHERE d.client_id = c.id AND d.stage = 'won'{money_scope})
            + (SELECT COALESCE(SUM(d.contractor_cost), 0) FROM deals d
              WHERE d.client_id = c.id AND d.stage = 'won'{money_scope}) AS expenses_total
        FROM clients c LEFT JOIN users u ON u.id = c.owner_id
        WHERE {' AND '.join(conds)} ORDER BY c.updated_at DESC
    """
    rows = conn.execute(sql, params).fetchall()
    clients = []
    for row in rows:
        data = dict(row)
        revenue = float(data.get("revenue_total") or 0)
        costs = float(data.get("expenses_total") or 0)
        data["margin"] = round(revenue - costs, 2)
        data["margin_pct"] = round((revenue - costs) / revenue * 100, 1) if revenue else None
        clients.append(data)
    return 200, {"ok": True, "clients": clients}


def client_detail(ctx, client_id):
    conn, user = ctx["conn"], ctx["user"]
    row = get_client(conn, user, client_id)
    contacts = conn.execute("SELECT * FROM contacts WHERE client_id = ? ORDER BY name", (client_id,)).fetchall()
    deals_sql = """SELECT d.*, u.name AS owner_name,
                      (SELECT COALESCE(SUM(e.amount), 0) FROM deal_expenses e WHERE e.deal_id = d.id) AS expenses_total
                   FROM deals d
                   LEFT JOIN users u ON u.id = d.owner_id WHERE d.client_id = ? AND d.workspace = ?"""
    params = [client_id, user["workspace"]]
    if is_manager(user):
        deals_sql += " AND d.owner_id = ?"
        params.append(user["id"])
    deals_sql += " ORDER BY d.updated_at DESC"
    deals = conn.execute(deals_sql, params).fetchall()
    deal_list = []
    revenue = expenses = 0.0
    for deal in deals:
        item = dict(deal)
        costs = float(item.get("expenses_total") or 0) + float(item.get("contractor_cost") or 0)
        item["expenses_total"] = round(costs, 2)
        item["margin"] = round(float(item.get("amount") or 0) - costs, 2)
        if item["stage"] == "won":
            revenue += float(item.get("amount") or 0)
            expenses += costs
        deal_list.append(item)
    data = dict(row)
    data["contacts"] = [dict(c) for c in contacts]
    data["deals"] = deal_list
    data["finance"] = {
        "revenue": round(revenue, 2),
        "expenses": round(expenses, 2),
        "margin": round(revenue - expenses, 2),
        "margin_pct": round((revenue - expenses) / revenue * 100, 1) if revenue else None,
    }
    return 200, {"ok": True, "client": data}


def create_client(ctx):
    conn, user = ctx["conn"], ctx["user"]
    data = client_payload(conn, user, ctx["body"])
    stamp = db.now_iso()
    cur = conn.execute(
        """INSERT INTO clients (workspace, name, industry, inn, website, phone, email, address, notes, owner_id, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (user["workspace"], data["name"], data["industry"], data["inn"], data["website"], data["phone"], data["email"],
         data["address"], data["notes"], data["owner_id"], stamp, stamp),
    )
    db.add_activity(conn, user["id"], "client", "Добавлен клиент «%s»" % data["name"], "client", cur.lastrowid)
    conn.commit()
    row = conn.execute("SELECT * FROM clients WHERE id = ?", (cur.lastrowid,)).fetchone()
    return 201, {"ok": True, "client": dict(row)}


def update_client(ctx, client_id):
    conn, user = ctx["conn"], ctx["user"]
    row = get_client(conn, user, client_id)
    data = client_payload(conn, user, ctx["body"], row)
    conn.execute(
        """UPDATE clients SET name = ?, industry = ?, inn = ?, website = ?, phone = ?, email = ?,
           address = ?, notes = ?, owner_id = ?, updated_at = ? WHERE id = ?""",
        (data["name"], data["industry"], data["inn"], data["website"], data["phone"], data["email"],
         data["address"], data["notes"], data["owner_id"], db.now_iso(), client_id),
    )
    conn.commit()
    updated = conn.execute("SELECT * FROM clients WHERE id = ?", (client_id,)).fetchone()
    return 200, {"ok": True, "client": dict(updated)}


def delete_client(ctx, client_id):
    conn, user = ctx["conn"], ctx["user"]
    row = get_client(conn, user, client_id)
    if is_manager(user):
        foreign = conn.execute(
            "SELECT COUNT(*) AS c FROM deals WHERE client_id = ? AND (owner_id IS NULL OR owner_id != ?)",
            (client_id, user["id"]),
        ).fetchone()["c"]
        require(foreign == 0, "К клиенту привязаны перевозки других менеджеров", 409)
    conn.execute("DELETE FROM clients WHERE id = ?", (client_id,))
    conn.commit()
    db.add_activity(conn, user["id"], "client", "Удалён клиент «%s»" % row["name"], "client", client_id)
    conn.commit()
    return 200, {"ok": True}


# ---------------------------------------------------------------- contacts

def create_contact(ctx, client_id):
    conn, user = ctx["conn"], ctx["user"]
    get_client(conn, user, client_id, write=True)
    body = ctx["body"]
    name = clean(body.get("name"), 160)
    require(name, "Укажите имя контакта")
    cur = conn.execute(
        "INSERT INTO contacts (client_id, name, position, phone, email, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        (client_id, name, clean(body.get("position"), 160), clean(body.get("phone"), 60),
         clean(body.get("email"), 200), db.now_iso()),
    )
    conn.commit()
    row = conn.execute("SELECT * FROM contacts WHERE id = ?", (cur.lastrowid,)).fetchone()
    return 201, {"ok": True, "contact": dict(row)}


def contact_owner(conn, contact_id):
    row = conn.execute(
        """SELECT ct.*, c.owner_id AS client_owner, c.workspace AS client_workspace FROM contacts ct
           JOIN clients c ON c.id = ct.client_id WHERE ct.id = ?""",
        (contact_id,),
    ).fetchone()
    require(row is not None, "Контакт не найден", 404)
    return row


def update_contact(ctx, contact_id):
    conn, user = ctx["conn"], ctx["user"]
    row = contact_owner(conn, contact_id)
    require(row["client_workspace"] == user["workspace"], "Контакт не найден", 404)
    if is_manager(user):
        require(row["client_owner"] == user["id"], "Нет доступа к этому контакту", 403)
    body = ctx["body"]
    conn.execute(
        "UPDATE contacts SET name = ?, position = ?, phone = ?, email = ? WHERE id = ?",
        (clean(body.get("name", row["name"]), 160) or row["name"],
         clean(body.get("position", row["position"]), 160),
         clean(body.get("phone", row["phone"]), 60),
         clean(body.get("email", row["email"]), 200), contact_id),
    )
    conn.commit()
    updated = conn.execute("SELECT * FROM contacts WHERE id = ?", (contact_id,)).fetchone()
    return 200, {"ok": True, "contact": dict(updated)}


def delete_contact(ctx, contact_id):
    conn, user = ctx["conn"], ctx["user"]
    row = contact_owner(conn, contact_id)
    require(row["client_workspace"] == user["workspace"], "Контакт не найден", 404)
    if is_manager(user):
        require(row["client_owner"] == user["id"], "Нет доступа к этому контакту", 403)
    conn.execute("DELETE FROM contacts WHERE id = ?", (contact_id,))
    conn.commit()
    return 200, {"ok": True}


# ---------------------------------------------------------------- deals

def list_deals(ctx):
    conn, user = ctx["conn"], ctx["user"]
    query = ctx["query"]
    conds, params = ["1=1"], []
    conds.append("d.workspace = ?")
    params.append(user["workspace"])
    if is_driver(user):
        conds.append("d.driver_id = ?")
        params.append(user["id"])
    elif is_manager(user):
        conds.append("d.owner_id = ?")
        params.append(user["id"])
    stage = clean(query.get("stage", ""), 20)
    if stage:
        conds.append("d.stage = ?")
        params.append(parse_stage(stage))
    owner = to_int(query.get("owner"))
    if owner and not is_manager(user) and not is_driver(user):
        conds.append("d.owner_id = ?")
        params.append(owner)
    search = clean(query.get("q", ""), 100)
    if search:
        like = "%" + search + "%"
        conds.append("(d.title LIKE ? OR d.route_from LIKE ? OR d.route_to LIKE ? OR d.cargo LIKE ? OR c.name LIKE ?)")
        params.extend([like, like, like, like, like])
    sql = """
        SELECT d.*, c.name AS client_name, u.name AS owner_name, co.name AS contractor_name,
               (SELECT COUNT(*) FROM deal_files f WHERE f.deal_id = d.id) AS files_count,
               (SELECT COUNT(*) FROM deal_comments dc WHERE dc.deal_id = d.id) AS comments_count,
               (SELECT COALESCE(SUM(e.amount), 0) FROM deal_expenses e WHERE e.deal_id = d.id) AS expenses_total,
               (SELECT COALESCE(SUM(p.amount), 0) FROM payments p WHERE p.deal_id = d.id) AS paid_total
        FROM deals d LEFT JOIN clients c ON c.id = d.client_id
        LEFT JOIN users u ON u.id = d.owner_id
        LEFT JOIN contractors co ON co.id = d.contractor_id
        WHERE %s ORDER BY d.updated_at DESC
    """ % " AND ".join(conds)
    rows = conn.execute(sql, params).fetchall()
    return 200, {"ok": True, "deals": [deal_view(r, user) for r in rows]}


def deal_payload(conn, user, body, row=None):
    route_from = clean(body.get("route_from", row["route_from"] if row else ""), 120)
    route_to = clean(body.get("route_to", row["route_to"] if row else ""), 120)
    require(route_from, "Укажите город отправления")
    require(route_to, "Укажите город назначения")
    title = "%s → %s" % (route_from, route_to)
    client_id = body.get("client_id", row["client_id"] if row else None)
    client_id = to_int(client_id)
    require(client_id is not None, "Выберите клиента")
    get_client(conn, user, client_id)
    amount = to_float(body.get("amount", row["amount"] if row else 0))
    require(amount >= 0, "Стоимость не может быть отрицательной")
    weight = to_float(body.get("weight", row["weight"] if row else 0))
    require(weight >= 0, "Вес не может быть отрицательным")
    volume = to_float(body.get("volume", row["volume"] if row else 0))
    require(volume >= 0, "Объём не может быть отрицательным")
    distance_km = to_float(body.get("distance_km", row["distance_km"] if row else 0))
    require(distance_km >= 0, "Расстояние не может быть отрицательным")
    transport_type = body.get("transport_type", row["transport_type"] if row else "ftl")
    parse_transport(transport_type)
    pickup_date = parse_date(body.get("pickup_date", row["pickup_date"] if row else ""), "дата погрузки")
    close_date = parse_date(body.get("close_date", row["close_date"] if row else ""), "дата доставки")
    require(not (pickup_date and close_date and pickup_date > close_date),
            "Дата погрузки позже даты доставки")
    stage = body.get("stage", row["stage"] if row else "lead")
    parse_stage(stage)
    if is_manager(user):
        owner_id = user["id"]
    else:
        owner_id = to_int(body.get("owner_id", row["owner_id"] if row else user["id"]), user["id"])
        target = conn.execute("SELECT id, workspace, role FROM users WHERE id = ?", (owner_id,)).fetchone()
        require(target is not None and target["workspace"] == user["workspace"]
                and target["role"] not in db.FIELD_ROLES,
                "Ответственный не найден")
    driver_name = clean(body.get("driver", row["driver"] if row else ""), 120)
    driver_id = to_int(body.get("driver_id", row["driver_id"] if row else None))
    if driver_id is None and "driver_id" in body and row is not None and row["driver_id"]:
        driver_name = ""
    if driver_id:
        driver = conn.execute(
            "SELECT id, name, role, active, workspace FROM users WHERE id = ?", (driver_id,)
        ).fetchone()
        require(driver is not None and driver["workspace"] == user["workspace"]
                and driver["role"] == "driver" and driver["active"],
                "Водитель не найден")
        driver_name = driver["name"]
    else:
        driver_id = None
    payment_due = parse_date(body.get("payment_due", row["payment_due"] if row else ""), "срок оплаты")
    contractor_id = to_int(body.get("contractor_id", row["contractor_id"] if row else None))
    contractor_cost = to_float(body.get("contractor_cost", row["contractor_cost"] if row else 0))
    if contractor_id:
        contractor = conn.execute(
            "SELECT id, rate FROM contractors WHERE id = ? AND workspace = ?",
            (contractor_id, user["workspace"]),
        ).fetchone()
        require(contractor is not None, "Подрядчик не найден")
        if "contractor_cost" not in body and row is None:
            contractor_cost = float(contractor["rate"] or 0)
    else:
        contractor_id = None
        contractor_cost = 0.0
    require(contractor_cost >= 0, "Стоимость субподряда не может быть отрицательной")
    return {
        "title": title,
        "client_id": client_id,
        "amount": amount,
        "stage": stage,
        "owner_id": owner_id,
        "route_from": route_from,
        "route_to": route_to,
        "cargo": clean(body.get("cargo", row["cargo"] if row else ""), 300),
        "weight": weight,
        "volume": volume,
        "distance_km": distance_km,
        "transport_type": transport_type,
        "pickup_date": pickup_date,
        "close_date": close_date,
        "payment_due": payment_due,
        "driver": driver_name,
        "driver_id": driver_id,
        "vehicle": clean(body.get("vehicle", row["vehicle"] if row else ""), 160),
        "contractor_id": contractor_id,
        "contractor_cost": round(contractor_cost, 2),
        "notes": clean(body.get("notes", row["notes"] if row else ""), 4000),
    }


def create_deal(ctx):
    conn, user = ctx["conn"], ctx["user"]
    deny_driver(user, "Водитель не может создавать перевозки")
    data = deal_payload(conn, user, ctx["body"])
    stamp = db.now_iso()
    cur = conn.execute(
        """INSERT INTO deals (workspace, title, client_id, amount, currency, stage, owner_id, route_from, route_to, cargo, weight, volume,
                              distance_km, transport_type, pickup_date, close_date, payment_due, driver, driver_id, vehicle,
                              contractor_id, contractor_cost, notes, created_at, updated_at)
           VALUES (?, ?, ?, ?, 'RUB', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (user["workspace"], data["title"], data["client_id"], data["amount"], data["stage"], data["owner_id"],
         data["route_from"], data["route_to"], data["cargo"], data["weight"], data["volume"], data["distance_km"],
         data["transport_type"], data["pickup_date"], data["close_date"], data["payment_due"], data["driver"],
         data["driver_id"], data["vehicle"], data["contractor_id"], data["contractor_cost"], data["notes"], stamp, stamp),
    )
    db.add_activity(conn, user["id"], "deal", "Создана перевозка «%s»" % data["title"], "deal", cur.lastrowid)
    conn.commit()
    row = conn.execute(
        """SELECT d.*, c.name AS client_name, u.name AS owner_name FROM deals d
           LEFT JOIN clients c ON c.id = d.client_id LEFT JOIN users u ON u.id = d.owner_id
           WHERE d.id = ?""",
        (cur.lastrowid,),
    ).fetchone()
    return 201, {"ok": True, "deal": dict(row)}


def update_deal(ctx, deal_id):
    conn, user = ctx["conn"], ctx["user"]
    deny_driver(user, "Водитель не может изменять рейс")
    row = get_deal(conn, user, deal_id)
    data = deal_payload(conn, user, ctx["body"], row)
    conn.execute(
        """UPDATE deals SET title = ?, client_id = ?, amount = ?, stage = ?, owner_id = ?,
           route_from = ?, route_to = ?, cargo = ?, weight = ?, volume = ?, distance_km = ?, transport_type = ?,
           pickup_date = ?, close_date = ?, payment_due = ?, driver = ?, driver_id = ?, vehicle = ?,
           contractor_id = ?, contractor_cost = ?, notes = ?, updated_at = ?
           WHERE id = ?""",
        (data["title"], data["client_id"], data["amount"], data["stage"], data["owner_id"],
         data["route_from"], data["route_to"], data["cargo"], data["weight"], data["volume"], data["distance_km"],
         data["transport_type"], data["pickup_date"], data["close_date"], data["payment_due"], data["driver"],
         data["driver_id"], data["vehicle"], data["contractor_id"], data["contractor_cost"], data["notes"],
         db.now_iso(), deal_id),
    )
    if data["stage"] != row["stage"]:
        db.add_activity(
            conn, user["id"], "deal",
            "Перевозка «%s» перешла на этап «%s»" % (data["title"], db.STAGE_TITLES[data["stage"]]),
            "deal", deal_id,
        )
    conn.commit()
    updated = conn.execute(
        """SELECT d.*, c.name AS client_name, u.name AS owner_name FROM deals d
           LEFT JOIN clients c ON c.id = d.client_id LEFT JOIN users u ON u.id = d.owner_id
           WHERE d.id = ?""",
        (deal_id,),
    ).fetchone()
    return 200, {"ok": True, "deal": dict(updated)}


def delete_deal(ctx, deal_id):
    conn, user = ctx["conn"], ctx["user"]
    deny_driver(user, "Водитель не может удалять перевозки")
    row = get_deal(conn, user, deal_id)
    stored = [r["stored_name"] for r in conn.execute(
        "SELECT stored_name FROM deal_files WHERE deal_id = ?", (deal_id,))]
    conn.execute("DELETE FROM deals WHERE id = ?", (deal_id,))
    conn.commit()
    db.add_activity(conn, user["id"], "deal", "Удалена перевозка «%s»" % row["title"], "deal", deal_id)
    conn.commit()
    for name in stored:
        remove_stored_file(name)
    return 200, {"ok": True}


def duplicate_deal(ctx, deal_id):
    """Create a fresh copy of a trip: same route, cargo and price, no dates or payments."""
    conn, user = ctx["conn"], ctx["user"]
    deny_driver(user, "Водитель не может повторять перевозки")
    row = get_deal(conn, user, deal_id)
    stamp = db.now_iso()
    notes = row["notes"] or ""
    notes = (notes + " · " if notes else "") + "Повтор рейса №%d." % deal_id
    cur = conn.execute(
        """INSERT INTO deals (workspace, title, client_id, amount, currency, stage, owner_id,
               route_from, route_to, cargo, weight, volume, distance_km, transport_type,
               pickup_date, close_date, payment_due, driver, driver_id, vehicle,
               contractor_id, contractor_cost, notes, created_at, updated_at)
           VALUES (?, ?, ?, ?, 'RUB', 'proposal', ?, ?, ?, ?, ?, ?, ?, ?, '', '', '', ?, ?, ?, ?, ?, ?, ?, ?)""",
        (user["workspace"], row["title"], row["client_id"], row["amount"], row["owner_id"],
         row["route_from"], row["route_to"], row["cargo"], row["weight"], row["volume"], row["distance_km"],
         row["transport_type"], row["driver"], row["driver_id"], row["vehicle"],
         row["contractor_id"], row["contractor_cost"], notes, stamp, stamp),
    )
    db.add_activity(
        conn, user["id"], "deal",
        "Создан повтор перевозки «%s» на основе рейса №%d" % (row["title"], deal_id),
        "deal", cur.lastrowid,
    )
    conn.commit()
    created = conn.execute(
        """SELECT d.*, c.name AS client_name, u.name AS owner_name FROM deals d
           LEFT JOIN clients c ON c.id = d.client_id LEFT JOIN users u ON u.id = d.owner_id
           WHERE d.id = ?""",
        (cur.lastrowid,),
    ).fetchone()
    return 201, {"ok": True, "deal": dict(created)}


# ---------------------------------------------------------------- deal documents

IMAGE_TYPES = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
}


def sniff_image(data):
    """Detect a raster image by its signature; None for anything else."""
    if data.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if data.startswith(b"GIF87a") or data.startswith(b"GIF89a"):
        return "image/gif"
    if len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    return None


def stored_path(name):
    base = os.path.realpath(db.DOC_UPLOAD_DIR)
    full = os.path.realpath(os.path.join(base, name))
    if not full.startswith(base + os.sep):
        raise ApiError(404, "Файл не найден")
    return full


def remove_stored_file(name):
    try:
        os.remove(stored_path(name))
    except (OSError, ApiError):
        pass


def read_upload(body, required_message="Прикрепите фото"):
    """Decode a base64 photo from a JSON body and store it on disk."""
    raw = body.get("data")
    require(isinstance(raw, str) and raw.strip(), required_message)
    raw = raw.strip()
    if raw.startswith("data:"):
        _, _, raw = raw.partition(",")
    try:
        data = base64.b64decode(raw, validate=True)
    except (binascii.Error, ValueError):
        raise ApiError(400, "Не удалось прочитать файл — повторите загрузку")
    require(len(data) >= 32, "Файл пустой или повреждён")
    require(len(data) <= MAX_FILE_BYTES, "Фото больше 8 МБ — уменьшите и повторите")
    mime = sniff_image(data)
    require(mime is not None, "Поддерживаются фото в формате JPEG, PNG, WebP или GIF")
    filename = os.path.basename(str(body.get("filename") or "")).strip()[:160]
    if not filename:
        filename = "photo" + IMAGE_TYPES[mime]
    stored_name = secrets.token_hex(16) + IMAGE_TYPES[mime]
    os.makedirs(db.DOC_UPLOAD_DIR, exist_ok=True)
    with open(stored_path(stored_name), "wb") as fh:
        fh.write(data)
    return {"data": data, "mime": mime, "filename": filename, "stored_name": stored_name}


def get_deal_file(conn, user, file_id):
    row = conn.execute(
        """SELECT f.*, d.owner_id AS deal_owner, d.title AS deal_title, d.workspace AS deal_workspace,
                  u.name AS uploader_name
           FROM deal_files f JOIN deals d ON d.id = f.deal_id
           LEFT JOIN users u ON u.id = f.uploaded_by WHERE f.id = ?""",
        (file_id,),
    ).fetchone()
    if row is None or row["deal_workspace"] != user["workspace"]:
        raise ApiError(404, "Документ не найден")
    if is_driver(user):
        raise ApiError(403, "Водитель может только загружать документы — просмотр недоступен")
    if is_manager(user) and row["deal_owner"] != user["id"]:
        raise ApiError(403, "Нет доступа к этому документу")
    return row


def file_dict(row):
    payload = dict(row)
    for key in ("stored_name", "deal_owner", "deal_workspace"):
        payload.pop(key, None)
    payload["kind_title"] = db.DOC_KINDS.get(row["kind"], db.DOC_KINDS["other"])
    payload["url"] = "/api/files/%d/raw" % row["id"]
    return payload


def list_deal_files(ctx, deal_id):
    conn, user = ctx["conn"], ctx["user"]
    deny_driver(user, "Водитель может только загружать документы — просмотр недоступен")
    get_deal(conn, user, deal_id)
    rows = conn.execute(
        """SELECT f.*, u.name AS uploader_name FROM deal_files f
           LEFT JOIN users u ON u.id = f.uploaded_by
           WHERE f.deal_id = ? ORDER BY f.created_at DESC, f.id DESC""",
        (deal_id,),
    ).fetchall()
    kinds = [{"id": key, "title": title} for key, title in db.DOC_KINDS.items()]
    return 200, {"ok": True, "files": [file_dict(r) for r in rows], "kinds": kinds}


def upload_deal_file(ctx, deal_id):
    conn, user = ctx["conn"], ctx["user"]
    deal = get_deal(conn, user, deal_id)
    body = ctx["body"]

    kind = clean(body.get("kind", "other"), 40) or "other"
    require(kind in db.DOC_KINDS, "Неизвестная категория документа")

    upload = read_upload(body, "Прикрепите фото документа")

    cur = conn.execute(
        """INSERT INTO deal_files (deal_id, kind, filename, stored_name, mime, size, uploaded_by, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
        (deal_id, kind, upload["filename"], upload["stored_name"], upload["mime"],
         len(upload["data"]), user["id"], db.now_iso()),
    )
    db.add_activity(
        conn, user["id"], "doc",
        "К перевозке «%s» прикреплён документ «%s»" % (deal["title"], upload["filename"]),
        "deal", deal_id,
    )
    conn.commit()
    row = conn.execute(
        """SELECT f.*, u.name AS uploader_name FROM deal_files f
           LEFT JOIN users u ON u.id = f.uploaded_by WHERE f.id = ?""",
        (cur.lastrowid,),
    ).fetchone()
    return 201, {"ok": True, "file": file_dict(row)}


def delete_deal_file(ctx, file_id):
    conn, user = ctx["conn"], ctx["user"]
    row = get_deal_file(conn, user, file_id)
    conn.execute("DELETE FROM deal_files WHERE id = ?", (file_id,))
    db.add_activity(
        conn, user["id"], "doc",
        "Из перевозки «%s» удалён документ «%s»" % (row["deal_title"], row["filename"]),
        "deal", row["deal_id"],
    )
    conn.commit()
    remove_stored_file(row["stored_name"])
    return 200, {"ok": True}


def serve_deal_file(ctx, file_id):
    conn, user = ctx["conn"], ctx["user"]
    row = get_deal_file(conn, user, file_id)
    full = stored_path(row["stored_name"])
    try:
        with open(full, "rb") as fh:
            data = fh.read()
    except OSError:
        raise ApiError(404, "Файл не найден на диске")
    return 200, Raw(data, row["mime"]), [("Content-Disposition", "inline")]


# ---------------------------------------------------------------- trip execution

def deal_comments(conn, deal_id):
    rows = conn.execute(
        """SELECT c.*, u.name AS author_name FROM deal_comments c
           LEFT JOIN users u ON u.id = c.author_id
           WHERE c.deal_id = ? ORDER BY c.created_at ASC, c.id ASC""",
        (deal_id,),
    ).fetchall()
    return [comment_view(r) for r in rows]


def deal_detail_payload(conn, user, deal_id):
    row = get_deal(conn, user, deal_id)
    data = deal_view(row, user)
    data["comments"] = deal_comments(conn, deal_id)
    if not is_driver(user):
        expenses = deal_expense_rows(conn, deal_id)
        summary = finance_summary(data["amount"], expenses, row["contractor_cost"])
        data["expenses"] = expenses
        data["expenses_total"] = summary["total"]
        data["expense_kinds"] = EXPENSE_KINDS
        data["finance"] = summary
        data["margin"] = summary["margin"]
        data["margin_pct"] = summary["margin_pct"]
        data["payment_due"] = row["payment_due"]
        data["payments"] = payment_rows(conn, deal_id)
        paid = round(sum(float(item["amount"] or 0) for item in data["payments"]), 2)
        amount = float(data["amount"] or 0)
        data["paid_total"] = paid
        data["debt"] = round(max(amount - paid, 0), 2)
        data["payment_status"] = "paid" if amount and paid >= amount - 0.01 else ("partial" if paid > 0 else "unpaid")
        data["payment_overdue"] = bool(
            row["stage"] == "won" and data["debt"] > 0 and row["payment_due"]
            and row["payment_due"] < date.today().isoformat()
        )
        contractor = conn.execute(
            "SELECT name, rate FROM contractors WHERE id = ?", (row["contractor_id"],)
        ).fetchone() if row["contractor_id"] else None
        data["contractor_name"] = contractor["name"] if contractor else ""
        data["contractor_rate"] = contractor["rate"] if contractor else 0
    return data


def deal_detail(ctx, deal_id):
    conn, user = ctx["conn"], ctx["user"]
    return 200, {"ok": True, "deal": deal_detail_payload(conn, user, deal_id)}


# ---------------------------------------------------------------- deal finance

def deal_expense_rows(conn, deal_id):
    rows = conn.execute(
        """SELECT e.*, u.name AS author_name FROM deal_expenses e
           LEFT JOIN users u ON u.id = e.created_by
           WHERE e.deal_id = ? ORDER BY e.created_at DESC, e.id DESC""",
        (deal_id,),
    ).fetchall()
    return [dict(row) for row in rows]


def finance_summary(amount, expenses, contractor_cost=0):
    by_kind = {kind: 0.0 for kind in EXPENSE_KINDS}
    for row in expenses:
        if row["kind"] in by_kind:
            by_kind[row["kind"]] += float(row["amount"] or 0)
    subcontract = round(float(contractor_cost or 0), 2)
    total = sum(by_kind.values()) + subcontract
    income = float(amount or 0)
    margin = round(income - total, 2)
    return {
        "income": income,
        "by_kind": by_kind,
        "subcontract": subcontract,
        "total": round(total, 2),
        "margin": margin,
        "margin_pct": round(margin / income * 100, 1) if income else None,
    }


def list_deal_expenses(ctx, deal_id):
    conn, user = ctx["conn"], ctx["user"]
    deny_driver(user, "Финансы рейса доступны только офису")
    get_deal(conn, user, deal_id)
    expenses = deal_expense_rows(conn, deal_id)
    deal = get_deal(conn, user, deal_id)
    return 200, {"ok": True, "expenses": expenses,
                 "finance": finance_summary(deal["amount"], expenses, deal["contractor_cost"])}


def add_deal_expense(ctx, deal_id):
    conn, user = ctx["conn"], ctx["user"]
    deny_driver(user, "Финансы рейса доступны только офису")
    deal = get_deal(conn, user, deal_id)
    body = ctx["body"]
    kind = clean(body.get("kind", "other"), 20) or "other"
    require(kind in EXPENSE_KINDS, "Неизвестная статья расходов")
    amount = to_float(body.get("amount"))
    require(amount > 0, "Укажите сумму расхода")
    require(amount <= 100000000, "Сумма расхода слишком большая")
    note = clean(body.get("note"), 300)
    cur = conn.execute(
        """INSERT INTO deal_expenses (deal_id, kind, amount, note, created_by, created_at)
           VALUES (?, ?, ?, ?, ?, ?)""",
        (deal_id, kind, round(amount, 2), note, user["id"], db.now_iso()),
    )
    db.add_activity(
        conn, user["id"], "finance",
        "В рейс «%s» добавлен расход: %s на %s ₽" % (deal["title"], EXPENSE_KINDS[kind], int(amount)),
        "deal", deal_id,
    )
    conn.commit()
    row = conn.execute(
        """SELECT e.*, u.name AS author_name FROM deal_expenses e
           LEFT JOIN users u ON u.id = e.created_by WHERE e.id = ?""",
        (cur.lastrowid,),
    ).fetchone()
    expenses = deal_expense_rows(conn, deal_id)
    return 201, {"ok": True, "expense": dict(row),
                 "finance": finance_summary(deal["amount"], expenses, deal["contractor_cost"])}


def delete_expense(ctx, expense_id):
    conn, user = ctx["conn"], ctx["user"]
    deny_driver(user, "Финансы рейса доступны только офису")
    row = conn.execute(
        """SELECT e.*, d.workspace AS deal_workspace FROM deal_expenses e
           JOIN deals d ON d.id = e.deal_id WHERE e.id = ?""",
        (expense_id,),
    ).fetchone()
    if row is None or row["deal_workspace"] != user["workspace"]:
        raise ApiError(404, "Расход не найден")
    get_deal(conn, user, row["deal_id"])
    conn.execute("DELETE FROM deal_expenses WHERE id = ?", (expense_id,))
    conn.commit()
    return 200, {"ok": True}


# ---------------------------------------------------------------- payments

def rub_text(value):
    text = ("%.2f" % float(value or 0)).replace(".", ",")
    if text.endswith(",00"):
        text = text[:-3]
    whole, _, cents = text.partition(",")
    sign = "-" if whole.startswith("-") else ""
    whole = whole.lstrip("-")
    groups = []
    while whole:
        groups.append(whole[-3:])
        whole = whole[:-3]
    out = sign + " ".join(reversed(groups))
    return out + ("," + cents if cents else "")


def payment_rows(conn, deal_id):
    rows = conn.execute(
        """SELECT p.*, u.name AS author_name FROM payments p
           LEFT JOIN users u ON u.id = p.created_by
           WHERE p.deal_id = ? ORDER BY p.paid_at DESC, p.id DESC""",
        (deal_id,),
    ).fetchall()
    return [dict(row) for row in rows]


def payment_summary(conn, deal_id, amount):
    paid = conn.execute(
        "SELECT COALESCE(SUM(amount), 0) AS paid FROM payments WHERE deal_id = ?", (deal_id,)
    ).fetchone()["paid"]
    paid = round(float(paid or 0), 2)
    income = float(amount or 0)
    return {
        "paid": paid,
        "debt": round(max(income - paid, 0), 2),
        "status": "paid" if income and paid >= income - 0.01 else ("partial" if paid > 0 else "unpaid"),
    }


def list_deal_payments(ctx, deal_id):
    conn, user = ctx["conn"], ctx["user"]
    deny_driver(user, "Оплаты доступны только офису")
    deal = get_deal(conn, user, deal_id)
    return 200, {"ok": True, "payments": payment_rows(conn, deal_id),
                 "summary": payment_summary(conn, deal_id, deal["amount"])}


def add_deal_payment(ctx, deal_id):
    conn, user = ctx["conn"], ctx["user"]
    deny_driver(user, "Оплаты доступны только офису")
    deal = get_deal(conn, user, deal_id)
    body = ctx["body"]
    amount = to_float(body.get("amount"))
    require(amount > 0, "Укажите сумму оплаты")
    require(amount <= 100000000, "Сумма оплаты слишком большая")
    income = float(deal["amount"] or 0)
    require(income > 0, "Сначала укажите стоимость перевозки")
    paid = float(conn.execute(
        "SELECT COALESCE(SUM(amount), 0) AS paid FROM payments WHERE deal_id = ?", (deal_id,)
    ).fetchone()["paid"])
    require(paid + amount <= income + 0.01, "Сумма оплат превышает стоимость перевозки")
    paid_at = parse_date(body.get("paid_at", ""), "дата оплаты") or date.today().isoformat()
    note = clean(body.get("note"), 300)
    cur = conn.execute(
        """INSERT INTO payments (deal_id, amount, paid_at, note, created_by, created_at)
           VALUES (?, ?, ?, ?, ?, ?)""",
        (deal_id, round(amount, 2), paid_at, note, user["id"], db.now_iso()),
    )
    db.add_activity(
        conn, user["id"], "payment",
        "Получена оплата %s ₽ по рейсу «%s»" % (rub_text(amount), deal["title"]),
        "deal", deal_id,
    )
    conn.commit()
    row = conn.execute(
        """SELECT p.*, u.name AS author_name FROM payments p
           LEFT JOIN users u ON u.id = p.created_by WHERE p.id = ?""",
        (cur.lastrowid,),
    ).fetchone()
    return 201, {"ok": True, "payment": dict(row),
                 "summary": payment_summary(conn, deal_id, deal["amount"])}


def delete_payment(ctx, payment_id):
    conn, user = ctx["conn"], ctx["user"]
    deny_driver(user, "Оплаты доступны только офису")
    row = conn.execute(
        """SELECT p.*, d.workspace AS deal_workspace FROM payments p
           JOIN deals d ON d.id = p.deal_id WHERE p.id = ?""",
        (payment_id,),
    ).fetchone()
    if row is None or row["deal_workspace"] != user["workspace"]:
        raise ApiError(404, "Оплата не найдена")
    deal = get_deal(conn, user, row["deal_id"])
    conn.execute("DELETE FROM payments WHERE id = ?", (payment_id,))
    conn.commit()
    return 200, {"ok": True, "summary": payment_summary(conn, row["deal_id"], deal["amount"])}


# ---------------------------------------------------------------- contractors

def get_contractor(conn, user, contractor_id):
    row = conn.execute(
        "SELECT * FROM contractors WHERE id = ? AND workspace = ?", (contractor_id, user["workspace"])
    ).fetchone()
    if row is None:
        raise ApiError(404, "Подрядчик не найден")
    return row


def contractor_payload(body, row=None):
    data = {}
    for field in CONTRACTOR_FIELDS:
        data[field] = clean(body.get(field, row[field] if row else ""), 2000)
    require(data["name"], "Укажите название подрядчика")
    inn = data["inn"].replace(" ", "")
    data["inn"] = inn
    if inn:
        require(inn.isdigit() and len(inn) in (10, 12), "ИНН подрядчика должен содержать 10 или 12 цифр")
    rate = to_float(body.get("rate", row["rate"] if row else 0))
    require(rate >= 0, "Ставка не может быть отрицательной")
    data["rate"] = round(rate, 2)
    data["active"] = 1 if body.get("active", row["active"] if row else True) else 0
    return data


def contractor_view(row):
    data = dict(row)
    data["active"] = bool(data.get("active"))
    return data


def list_contractors(ctx):
    conn, user = ctx["conn"], ctx["user"]
    deny_driver(user, "Справочник подрядчиков доступен офису")
    rows = conn.execute(
        """SELECT c.*, (SELECT COUNT(*) FROM deals d WHERE d.contractor_id = c.id) AS deals_count,
                  (SELECT COALESCE(SUM(d.contractor_cost), 0) FROM deals d WHERE d.contractor_id = c.id) AS cost_total
           FROM contractors c WHERE c.workspace = ? ORDER BY c.active DESC, c.name""",
        (user["workspace"],),
    ).fetchall()
    return 200, {"ok": True, "contractors": [contractor_view(r) for r in rows]}


def create_contractor(ctx):
    conn, user = ctx["conn"], ctx["user"]
    deny_driver(user, "Справочник подрядчиков доступен офису")
    data = contractor_payload(ctx["body"])
    stamp = db.now_iso()
    cur = conn.execute(
        """INSERT INTO contractors (workspace, name, inn, contact, phone, email, rate, notes, active, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (user["workspace"], data["name"], data["inn"], data["contact"], data["phone"], data["email"],
         data["rate"], data["notes"], data["active"], stamp, stamp),
    )
    db.add_activity(conn, user["id"], "contractor", "Добавлен подрядчик «%s»" % data["name"],
                    "contractor", cur.lastrowid)
    conn.commit()
    return 201, {"ok": True, "contractor": contractor_view(get_contractor(conn, user, cur.lastrowid))}


def update_contractor(ctx, contractor_id):
    conn, user = ctx["conn"], ctx["user"]
    deny_driver(user, "Справочник подрядчиков доступен офису")
    row = get_contractor(conn, user, contractor_id)
    data = contractor_payload(ctx["body"], row)
    conn.execute(
        """UPDATE contractors SET name = ?, inn = ?, contact = ?, phone = ?, email = ?, rate = ?,
               notes = ?, active = ?, updated_at = ? WHERE id = ?""",
        (data["name"], data["inn"], data["contact"], data["phone"], data["email"], data["rate"],
         data["notes"], data["active"], db.now_iso(), contractor_id),
    )
    conn.commit()
    return 200, {"ok": True, "contractor": contractor_view(get_contractor(conn, user, contractor_id))}


def delete_contractor(ctx, contractor_id):
    conn, user = ctx["conn"], ctx["user"]
    deny_driver(user, "Справочник подрядчиков доступен офису")
    get_contractor(conn, user, contractor_id)
    used = conn.execute(
        "SELECT COUNT(*) AS c FROM deals WHERE contractor_id = ?", (contractor_id,)
    ).fetchone()["c"]
    require(used == 0, "Подрядчик указан в перевозках — отключите его вместо удаления", 409)
    conn.execute("DELETE FROM contractors WHERE id = ?", (contractor_id,))
    conn.commit()
    return 200, {"ok": True}


# ---------------------------------------------------------------- transport requests

def get_request(conn, user, request_id):
    row = conn.execute("SELECT * FROM transport_requests WHERE id = ?", (request_id,)).fetchone()
    if row is None or row["workspace"] != user["workspace"]:
        raise ApiError(404, "Заявка не найдена")
    if is_manager(user) and row["owner_id"] != user["id"]:
        raise ApiError(403, "Нет доступа к этой заявке")
    return row


def request_payload(conn, user, body, row=None):
    if row is not None and row["status"] == "converted":
        raise ApiError(400, "Заявка уже преобразована в рейс")
    route_from = clean(body.get("route_from", row["route_from"] if row else ""), 120)
    route_to = clean(body.get("route_to", row["route_to"] if row else ""), 120)
    require(route_from, "Укажите город отправления")
    require(route_to, "Укажите город назначения")
    client_id = to_int(body.get("client_id", row["client_id"] if row else None))
    if client_id is not None:
        get_client(conn, user, client_id)
    transport_type = body.get("transport_type", row["transport_type"] if row else "ftl")
    parse_transport(transport_type)
    weight = to_float(body.get("weight", row["weight"] if row else 0))
    volume = to_float(body.get("volume", row["volume"] if row else 0))
    distance_km = to_float(body.get("distance_km", row["distance_km"] if row else 0))
    cost_price = to_float(body.get("cost_price", row["cost_price"] if row else 0))
    markup_pct = to_float(body.get("markup_pct", row["markup_pct"] if row else 0))
    require(weight >= 0 and volume >= 0 and distance_km >= 0, "Проверьте вес, объём и расстояние")
    require(cost_price >= 0, "Себестоимость не может быть отрицательной")
    require(0 <= markup_pct <= 1000, "Наценка должна быть от 0 до 1000%")
    amount_raw = body.get("amount", row["amount"] if row else None)
    if amount_raw in (None, ""):
        amount = round(cost_price * (1 + markup_pct / 100), 2)
    else:
        amount = to_float(amount_raw)
    require(amount >= 0, "Ставка не может быть отрицательной")
    status = clean(body.get("status", row["status"] if row else "new"), 20) or "new"
    require(status in REQUEST_STATUSES and status != "converted", "Неизвестный статус заявки")
    if is_manager(user):
        owner_id = user["id"]
    else:
        owner_id = to_int(body.get("owner_id", row["owner_id"] if row else user["id"]), user["id"])
        target = conn.execute("SELECT id, workspace, role FROM users WHERE id = ?", (owner_id,)).fetchone()
        require(target is not None and target["workspace"] == user["workspace"]
                and target["role"] not in db.FIELD_ROLES,
                "Ответственный не найден")
    return {
        "route_from": route_from,
        "route_to": route_to,
        "client_id": client_id,
        "cargo": clean(body.get("cargo", row["cargo"] if row else ""), 300),
        "transport_type": transport_type,
        "weight": weight,
        "volume": volume,
        "distance_km": round(distance_km, 1),
        "cost_price": round(cost_price, 2),
        "markup_pct": round(markup_pct, 2),
        "amount": round(amount, 2),
        "status": status,
        "note": clean(body.get("note", row["note"] if row else ""), 2000),
        "owner_id": owner_id,
    }


def request_row(conn, request_id):
    return conn.execute(
        """SELECT r.*, c.name AS client_name, u.name AS owner_name
           FROM transport_requests r
           LEFT JOIN clients c ON c.id = r.client_id
           LEFT JOIN users u ON u.id = r.owner_id
           WHERE r.id = ?""",
        (request_id,),
    ).fetchone()


def request_detail(ctx, request_id):
    conn, user = ctx["conn"], ctx["user"]
    deny_driver(user, "Заявки на перевозку ведёт офис")
    get_request(conn, user, request_id)
    return 200, {"ok": True, "request": dict(request_row(conn, request_id))}


def list_requests(ctx):
    conn, user = ctx["conn"], ctx["user"]
    query = ctx["query"]
    conds, params = ["r.workspace = ?"], [user["workspace"]]
    if is_manager(user):
        conds.append("r.owner_id = ?")
        params.append(user["id"])
    status = clean(query.get("status", ""), 20)
    if status and status in REQUEST_STATUSES:
        conds.append("r.status = ?")
        params.append(status)
    search = clean(query.get("q", ""), 100)
    if search:
        like = "%" + search + "%"
        conds.append("(r.route_from LIKE ? OR r.route_to LIKE ? OR r.cargo LIKE ? OR c.name LIKE ?)")
        params.extend([like, like, like, like])
    rows = conn.execute(
        """SELECT r.*, c.name AS client_name, u.name AS owner_name
           FROM transport_requests r
           LEFT JOIN clients c ON c.id = r.client_id
           LEFT JOIN users u ON u.id = r.owner_id
           WHERE """ + " AND ".join(conds) + " ORDER BY r.updated_at DESC, r.id DESC",
        params,
    ).fetchall()
    return 200, {"ok": True, "requests": [dict(row) for row in rows]}


def create_request(ctx):
    conn, user = ctx["conn"], ctx["user"]
    deny_driver(user, "Заявки на перевозку ведёт офис")
    data = request_payload(conn, user, ctx["body"])
    stamp = db.now_iso()
    cur = conn.execute(
        """INSERT INTO transport_requests (workspace, client_id, route_from, route_to, cargo,
               transport_type, weight, volume, distance_km, cost_price, markup_pct, amount,
               status, note, owner_id, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (user["workspace"], data["client_id"], data["route_from"], data["route_to"], data["cargo"],
         data["transport_type"], data["weight"], data["volume"], data["distance_km"],
         data["cost_price"], data["markup_pct"], data["amount"], data["status"], data["note"],
         data["owner_id"], stamp, stamp),
    )
    db.add_activity(
        conn, user["id"], "request",
        "Заявка %s → %s на %s ₽" % (data["route_from"], data["route_to"], int(data["amount"])),
        "request", cur.lastrowid,
    )
    conn.commit()
    return 201, {"ok": True, "request": dict(request_row(conn, cur.lastrowid))}


def update_request(ctx, request_id):
    conn, user = ctx["conn"], ctx["user"]
    deny_driver(user, "Заявки на перевозку ведёт офис")
    row = get_request(conn, user, request_id)
    data = request_payload(conn, user, ctx["body"], row)
    conn.execute(
        """UPDATE transport_requests SET client_id = ?, route_from = ?, route_to = ?, cargo = ?,
               transport_type = ?, weight = ?, volume = ?, distance_km = ?, cost_price = ?,
               markup_pct = ?, amount = ?, status = ?, note = ?, owner_id = ?, updated_at = ?
           WHERE id = ?""",
        (data["client_id"], data["route_from"], data["route_to"], data["cargo"], data["transport_type"],
         data["weight"], data["volume"], data["distance_km"], data["cost_price"], data["markup_pct"],
         data["amount"], data["status"], data["note"], data["owner_id"], db.now_iso(), request_id),
    )
    conn.commit()
    return 200, {"ok": True, "request": dict(request_row(conn, request_id))}


def delete_request(ctx, request_id):
    conn, user = ctx["conn"], ctx["user"]
    deny_driver(user, "Заявки на перевозку ведёт офис")
    row = get_request(conn, user, request_id)
    require(row["status"] != "converted" and not row["deal_id"],
            "Заявка уже преобразована в рейс — удалите сам рейс", 409)
    conn.execute("DELETE FROM transport_requests WHERE id = ?", (request_id,))
    conn.commit()
    return 200, {"ok": True}


def convert_request(ctx, request_id):
    conn, user = ctx["conn"], ctx["user"]
    deny_driver(user, "Заявки на перевозку ведёт офис")
    row = get_request(conn, user, request_id)
    require(row["status"] != "converted" and not row["deal_id"], "Заявка уже преобразована в рейс", 409)
    require(row["client_id"], "Выберите клиента в заявке перед преобразованием в рейс")
    data = deal_payload(conn, user, {
        "client_id": row["client_id"],
        "route_from": row["route_from"],
        "route_to": row["route_to"],
        "cargo": row["cargo"],
        "transport_type": row["transport_type"],
        "weight": row["weight"],
        "volume": row["volume"],
        "distance_km": row["distance_km"],
        "amount": row["amount"],
        "stage": "proposal",
        "notes": row["note"],
        "owner_id": row["owner_id"] or user["id"],
    })
    stamp = db.now_iso()
    cur = conn.execute(
        """INSERT INTO deals (workspace, title, client_id, amount, currency, stage, owner_id,
               route_from, route_to, cargo, weight, volume, distance_km, transport_type,
               pickup_date, close_date, driver, driver_id, vehicle, notes, request_id, created_at, updated_at)
           VALUES (?, ?, ?, ?, 'RUB', ?, ?, ?, ?, ?, ?, ?, ?, ?, '', '', '', NULL, '', ?, ?, ?, ?)""",
        (user["workspace"], data["title"], data["client_id"], data["amount"], data["stage"], data["owner_id"],
         data["route_from"], data["route_to"], data["cargo"], data["weight"], data["volume"],
         data["distance_km"], data["transport_type"], data["notes"], request_id, stamp, stamp),
    )
    deal_id = cur.lastrowid
    conn.execute(
        "UPDATE transport_requests SET status = 'converted', deal_id = ?, updated_at = ? WHERE id = ?",
        (deal_id, stamp, request_id),
    )
    db.add_activity(
        conn, user["id"], "request",
        "Заявка %s → %s преобразована в рейс" % (row["route_from"], row["route_to"]),
        "deal", deal_id,
    )
    conn.commit()
    deal = conn.execute(
        """SELECT d.*, c.name AS client_name, u.name AS owner_name FROM deals d
           LEFT JOIN clients c ON c.id = d.client_id LEFT JOIN users u ON u.id = d.owner_id
           WHERE d.id = ?""",
        (deal_id,),
    ).fetchone()
    return 201, {"ok": True, "deal": dict(deal), "request": dict(request_row(conn, request_id))}


def list_deal_comments(ctx, deal_id):
    conn, user = ctx["conn"], ctx["user"]
    get_deal(conn, user, deal_id)
    return 200, {"ok": True, "comments": deal_comments(conn, deal_id)}


def add_deal_comment(ctx, deal_id):
    conn, user = ctx["conn"], ctx["user"]
    get_deal(conn, user, deal_id)
    text = clean(ctx["body"].get("text"), 2000)
    require(text, "Напишите комментарий")
    cur = conn.execute(
        """INSERT INTO deal_comments (deal_id, author_id, kind, text, created_at)
           VALUES (?, ?, 'comment', ?, ?)""",
        (deal_id, user["id"], text, db.now_iso()),
    )
    conn.commit()
    row = conn.execute(
        """SELECT c.*, u.name AS author_name FROM deal_comments c
           LEFT JOIN users u ON u.id = c.author_id WHERE c.id = ?""",
        (cur.lastrowid,),
    ).fetchone()
    return 201, {"ok": True, "comment": comment_view(row)}


def update_trip(ctx, deal_id):
    conn, user = ctx["conn"], ctx["user"]
    require(is_driver(user), "Отметки о рейсе ставит водитель", 403)
    row = get_deal(conn, user, deal_id)
    body = ctx["body"]
    action = clean(body.get("action", ""), 20)
    require(action in ("", "loaded", "departed", "delivered"), "Неизвестное действие рейса")
    if action and row["stage"] == "lost":
        raise ApiError(400, "Рейс отменён — отметки недоступны")
    if action and row["stage"] == "won":
        raise ApiError(400, "Рейс уже завершён")
    loaded_at, departed_at, delivered_at = row["loaded_at"], row["departed_at"], row["delivered_at"]
    stage, close_date = row["stage"], row["close_date"]
    stamp = db.now_iso()
    event = ""
    if action == "loaded":
        require(not loaded_at, "Погрузка уже отмечена")
        loaded_at, stage = stamp, "negotiation"
        event = "Отмечена погрузка"
    elif action == "departed":
        require(loaded_at, "Сначала отметьте погрузку")
        require(not departed_at, "Выезд уже отмечен")
        departed_at, stage = stamp, "negotiation"
        event = "Отмечен выезд с погрузки"
    elif action == "delivered":
        require(departed_at, "Сначала отметьте выезд")
        require(not delivered_at, "Выгрузка уже отмечена")
        delivered_at, stage = stamp, "won"
        if not close_date:
            close_date = date.today().isoformat()
        event = "Отмечена выгрузка, рейс завершён"

    actual_mileage = row["actual_mileage"]
    fuel_used = row["fuel_used"]
    trip_report = row["trip_report"]
    if "actual_mileage" in body:
        actual_mileage = to_int(body.get("actual_mileage"), 0)
        require(0 <= actual_mileage <= 2000000, "Некорректный фактический пробег")
    if "fuel_used" in body:
        fuel_used = to_float(body.get("fuel_used"), 0)
        require(0 <= fuel_used <= 100000, "Некорректный расход топлива")
    if "trip_report" in body:
        trip_report = clean(body.get("trip_report"), 4000)

    conn.execute(
        """UPDATE deals SET loaded_at = ?, departed_at = ?, delivered_at = ?, stage = ?,
               close_date = ?, actual_mileage = ?, fuel_used = ?, trip_report = ?, updated_at = ?
           WHERE id = ?""",
        (loaded_at, departed_at, delivered_at, stage, close_date, actual_mileage,
         fuel_used, trip_report, stamp, deal_id),
    )
    if event:
        conn.execute(
            """INSERT INTO deal_comments (deal_id, author_id, kind, text, created_at)
               VALUES (?, ?, 'status', ?, ?)""",
            (deal_id, user["id"], "%s · %s" % (event, user["name"]), stamp),
        )
        db.add_activity(
            conn, user["id"], "deal",
            "Водитель %s: %s по рейсу «%s»" % (user["name"], event.lower(), row["title"]),
            "deal", deal_id,
        )
    conn.commit()
    return 200, {"ok": True, "deal": deal_detail_payload(conn, user, deal_id)}


# ---------------------------------------------------------------- fleet & repairs

def vehicle_label(row):
    parts = [part for part in (row["name"], row["plate"]) if part]
    return ", ".join(parts)


def vehicle_view(row):
    data = dict(row)
    data["label"] = vehicle_label(row)
    return data


def list_vehicles(ctx):
    conn, user = ctx["conn"], ctx["user"]
    rows = conn.execute(
        """SELECT v.*, u.name AS driver_name,
                  (SELECT COUNT(*) FROM repair_requests r
                    WHERE r.vehicle_id = v.id AND r.status != 'done') AS open_repairs
           FROM vehicles v LEFT JOIN users u ON u.id = v.driver_id
           WHERE v.workspace = ?
           ORDER BY v.name COLLATE NOCASE, v.plate""",
        (user["workspace"],),
    ).fetchall()
    return 200, {"ok": True, "vehicles": [vehicle_view(r) for r in rows]}


def get_vehicle(conn, user, vehicle_id):
    row = conn.execute(
        """SELECT v.*, u.name AS driver_name FROM vehicles v
           LEFT JOIN users u ON u.id = v.driver_id
           WHERE v.id = ? AND v.workspace = ?""",
        (vehicle_id, user["workspace"]),
    ).fetchone()
    require(row is not None, "Машина не найдена", 404)
    return row


def require_fleet_manager(user):
    require(user["role"] in ("admin", "head", "mechanic"),
            "Управлять автопарком может администратор, руководитель или механик", 403)


def vehicle_payload(conn, user, body, row=None):
    name = clean(body.get("name", row["name"] if row else ""), 120)
    require(name, "Укажите название или марку машины")
    plate = clean(body.get("plate", row["plate"] if row else ""), 40).upper()
    if plate:
        other = conn.execute(
            "SELECT id FROM vehicles WHERE workspace = ? AND lower(plate) = lower(?) AND id != ?",
            (user["workspace"], plate, row["id"] if row else 0),
        ).fetchone()
        require(other is None, "Машина с номером %s уже есть в автопарке" % plate)
    year = to_int(body.get("year", row["year"] if row else 0), 0)
    require(0 <= year <= 2100, "Некорректный год выпуска")
    mileage = to_int(body.get("mileage", row["mileage"] if row else 0), 0)
    require(0 <= mileage <= 5000000, "Некорректный пробег")
    interval = to_int(body.get("service_interval", row["service_interval"] if row else 15000), 15000)
    require(1000 <= interval <= 1000000, "Интервал ТО должен быть от 1 000 до 1 000 000 км")
    driver_id = to_int(body.get("driver_id", row["driver_id"] if row else None))
    if driver_id:
        driver = conn.execute(
            "SELECT id, role, active, workspace FROM users WHERE id = ?", (driver_id,)
        ).fetchone()
        require(driver is not None and driver["workspace"] == user["workspace"]
                and driver["role"] == "driver" and driver["active"],
                "Водитель не найден")
    else:
        driver_id = None
    return {
        "name": name,
        "plate": plate,
        "kind": clean(body.get("kind", row["kind"] if row else ""), 80),
        "vin": clean(body.get("vin", row["vin"] if row else ""), 40).upper(),
        "year": year,
        "mileage": mileage,
        "service_interval": interval,
        "next_service": parse_date(body.get("next_service", row["next_service"] if row else ""), "дата ТО"),
        "insurance_until": parse_date(body.get("insurance_until", row["insurance_until"] if row else ""), "страховка"),
        "inspection_until": parse_date(body.get("inspection_until", row["inspection_until"] if row else ""), "техосмотр"),
        "driver_id": driver_id,
        "notes": clean(body.get("notes", row["notes"] if row else ""), 2000),
    }


def create_vehicle(ctx):
    conn, user = ctx["conn"], ctx["user"]
    require_fleet_manager(user)
    data = vehicle_payload(conn, user, ctx["body"])
    stamp = db.now_iso()
    cur = conn.execute(
        """INSERT INTO vehicles (workspace, name, plate, kind, vin, year, mileage, service_interval,
               next_service, insurance_until, inspection_until, driver_id, notes, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (user["workspace"], data["name"], data["plate"], data["kind"], data["vin"], data["year"],
         data["mileage"], data["service_interval"], data["next_service"], data["insurance_until"],
         data["inspection_until"], data["driver_id"], data["notes"], stamp, stamp),
    )
    db.add_activity(
        conn, user["id"], "fleet",
        "В автопарк добавлена машина «%s»" % vehicle_label(data),
        "vehicle", cur.lastrowid,
    )
    conn.commit()
    row = get_vehicle(conn, user, cur.lastrowid)
    return 201, {"ok": True, "vehicle": vehicle_view(row)}


def update_vehicle(ctx, vehicle_id):
    conn, user = ctx["conn"], ctx["user"]
    require_fleet_manager(user)
    row = get_vehicle(conn, user, vehicle_id)
    data = vehicle_payload(conn, user, ctx["body"], row)
    conn.execute(
        """UPDATE vehicles SET name = ?, plate = ?, kind = ?, vin = ?, year = ?, mileage = ?,
               service_interval = ?, next_service = ?, insurance_until = ?, inspection_until = ?,
               driver_id = ?, notes = ?, updated_at = ? WHERE id = ?""",
        (data["name"], data["plate"], data["kind"], data["vin"], data["year"], data["mileage"],
         data["service_interval"], data["next_service"], data["insurance_until"],
         data["inspection_until"], data["driver_id"], data["notes"], db.now_iso(), vehicle_id),
    )
    db.add_activity(
        conn, user["id"], "fleet",
        "Обновлена карточка машины «%s»" % vehicle_label(data),
        "vehicle", vehicle_id,
    )
    conn.commit()
    updated = get_vehicle(conn, user, vehicle_id)
    return 200, {"ok": True, "vehicle": vehicle_view(updated)}


def delete_vehicle(ctx, vehicle_id):
    conn, user = ctx["conn"], ctx["user"]
    require_fleet_manager(user)
    row = get_vehicle(conn, user, vehicle_id)
    repairs = conn.execute(
        "SELECT COUNT(*) AS count FROM repair_requests WHERE vehicle_id = ?", (vehicle_id,)
    ).fetchone()["count"]
    require(repairs == 0, "У машины есть история ремонтов — удаление недоступно")
    conn.execute("DELETE FROM vehicles WHERE id = ?", (vehicle_id,))
    db.add_activity(
        conn, user["id"], "fleet",
        "Из автопарка удалена машина «%s»" % vehicle_label(row),
        "vehicle", vehicle_id,
    )
    conn.commit()
    return 200, {"ok": True}


def vehicle_service_state(row, today=None):
    today = today or date.today()
    next_service = row["next_service"] or ""
    if not next_service:
        return "none", ""
    if next_service < today.isoformat():
        return "overdue", "ТО просрочено"
    if next_service <= (today + timedelta(days=14)).isoformat():
        return "soon", "ТО скоро"
    return "ok", "ТО по плану"


def vehicle_detail(ctx, vehicle_id):
    conn, user = ctx["conn"], ctx["user"]
    require_fleet_manager(user)
    row = get_vehicle(conn, user, vehicle_id)
    repairs = conn.execute(
        repair_query() + " WHERE r.vehicle_id = ? ORDER BY r.created_at DESC, r.id DESC",
        (vehicle_id,),
    ).fetchall()
    total_cost = sum((r["cost"] or 0) for r in repairs if r["status"] == "done")
    last_done = max((r["closed_at"] for r in repairs if r["status"] == "done" and r["closed_at"]), default="")
    service_state, service_title = vehicle_service_state(row)
    data = vehicle_view(row)
    data["service_state"] = service_state
    data["service_title"] = service_title
    data["history"] = [repair_view(r) for r in repairs]
    data["summary"] = {
        "repairs_total": len(repairs),
        "repairs_open": sum(1 for r in repairs if r["status"] != "done"),
        "cost_total": total_cost,
        "last_service_at": last_done,
    }
    return 200, {"ok": True, "vehicle": data}


def list_drivers(ctx):
    conn, user = ctx["conn"], ctx["user"]
    require_fleet_manager(user)
    rows = conn.execute(
        "SELECT id, name, email FROM users WHERE workspace = ? AND role = 'driver' AND active = 1 ORDER BY name",
        (user["workspace"],),
    ).fetchall()
    return 200, {"ok": True, "drivers": [dict(r) for r in rows]}


def repair_query():
    return """SELECT r.*, v.name AS vehicle_name, v.plate AS vehicle_plate,
                     d.name AS driver_name, m.name AS mechanic_name,
                     (SELECT COUNT(*) FROM repair_comments rc WHERE rc.repair_id = r.id) AS comments_count,
                     (SELECT COUNT(*) FROM repair_files rf WHERE rf.repair_id = r.id) AS photos_count
              FROM repair_requests r
              LEFT JOIN vehicles v ON v.id = r.vehicle_id
              LEFT JOIN users d ON d.id = r.driver_id
              LEFT JOIN users m ON m.id = r.mechanic_id"""


def get_repair(conn, user, repair_id):
    row = conn.execute(repair_query() + " WHERE r.id = ?", (repair_id,)).fetchone()
    require(row is not None and row["workspace"] == user["workspace"], "Заявка на ремонт не найдена", 404)
    if is_driver(user):
        require(row["driver_id"] == user["id"], "Заявка на ремонт не найдена", 404)
    return row


def repair_view(row):
    data = dict(row)
    data["status_title"] = db.REPAIR_STATUSES.get(row["status"], db.REPAIR_STATUSES["new"])
    data["urgency_title"] = db.REPAIR_URGENCIES.get(row["urgency"], db.REPAIR_URGENCIES["normal"])
    parts = [part for part in (row["vehicle_name"], row["vehicle_plate"]) if part]
    data["vehicle_label"] = ", ".join(parts) if parts else "Машина не указана"
    return data


def list_repairs(ctx):
    conn, user = ctx["conn"], ctx["user"]
    conds, params = ["r.workspace = ?"], [user["workspace"]]
    if is_driver(user):
        conds.append("r.driver_id = ?")
        params.append(user["id"])
    elif not (is_mechanic(user) or user["role"] in ("admin", "head")):
        raise ApiError(403, "Нет доступа к заявкам на ремонт")
    sql = repair_query() + " WHERE " + " AND ".join(conds) + """
        ORDER BY CASE r.status WHEN 'new' THEN 0 WHEN 'in_progress' THEN 1 ELSE 2 END,
                 r.created_at DESC, r.id DESC
    """
    rows = conn.execute(sql, params).fetchall()
    return 200, {"ok": True, "repairs": [repair_view(r) for r in rows]}


def create_repair(ctx):
    conn, user = ctx["conn"], ctx["user"]
    require(is_driver(user), "Заявку на ремонт может отправить водитель", 403)
    body = ctx["body"]
    title = clean(body.get("title"), 200)
    require(title, "Опишите неисправность")
    vehicle_id = to_int(body.get("vehicle_id"))
    vehicle = conn.execute(
        "SELECT id, name, plate, workspace FROM vehicles WHERE id = ?", (vehicle_id,)
    ).fetchone()
    require(vehicle is not None and vehicle["workspace"] == user["workspace"], "Выберите машину из автопарка")
    urgency = clean(body.get("urgency", "normal"), 20) or "normal"
    require(urgency in db.REPAIR_URGENCIES, "Неизвестная срочность заявки")
    stamp = db.now_iso()
    cur = conn.execute(
        """INSERT INTO repair_requests (workspace, vehicle_id, driver_id, title, description,
               urgency, status, resolution, mechanic_id, created_at, updated_at, closed_at)
           VALUES (?, ?, ?, ?, ?, ?, 'new', '', NULL, ?, ?, '')""",
        (user["workspace"], vehicle_id, user["id"], title,
         clean(body.get("description"), 2000), urgency, stamp, stamp),
    )
    db.add_activity(
        conn, user["id"], "repair",
        "Водитель %s отправил заявку на ремонт «%s»" % (user["name"], title),
        "repair", cur.lastrowid,
    )
    conn.commit()
    row = conn.execute(repair_query() + " WHERE r.id = ?", (cur.lastrowid,)).fetchone()
    return 201, {"ok": True, "repair": repair_view(row)}


def update_repair(ctx, repair_id):
    conn, user = ctx["conn"], ctx["user"]
    require(user["role"] in ("admin", "head", "mechanic"),
            "Обрабатывать заявки на ремонт может механик, руководитель или администратор", 403)
    row = conn.execute(
        "SELECT * FROM repair_requests WHERE id = ? AND workspace = ?",
        (repair_id, user["workspace"]),
    ).fetchone()
    require(row is not None, "Заявка на ремонт не найдена", 404)
    body = ctx["body"]
    status = clean(body.get("status", row["status"]), 20) or row["status"]
    require(status in db.REPAIR_STATUSES, "Неизвестный статус заявки")
    resolution = clean(body.get("resolution", row["resolution"]), 2000)
    planned_date = parse_date(body.get("planned_date", row["planned_date"]), "плановая дата")
    parts = clean(body.get("parts", row["parts"]), 500)
    cost = to_float(body.get("cost", row["cost"]), row["cost"] or 0)
    require(cost >= 0, "Стоимость не может быть отрицательной")
    closed_at = row["closed_at"]
    if status == "done" and row["status"] != "done":
        closed_at = db.now_iso()
    elif status != "done":
        closed_at = ""
    mechanic_id = row["mechanic_id"]
    if is_mechanic(user) and (status != "new" or resolution):
        mechanic_id = user["id"]
    elif mechanic_id is None and user["role"] in ("admin", "head") and (status != "new" or resolution):
        mechanic_id = user["id"]
    conn.execute(
        """UPDATE repair_requests SET status = ?, resolution = ?, planned_date = ?, parts = ?, cost = ?,
               mechanic_id = ?, updated_at = ?, closed_at = ? WHERE id = ?""",
        (status, resolution, planned_date, parts, cost, mechanic_id, db.now_iso(), closed_at, repair_id),
    )
    if status != row["status"]:
        db.add_activity(
            conn, user["id"], "repair",
            "Заявка на ремонт «%s»: %s" % (row["title"], db.REPAIR_STATUSES[status].lower()),
            "repair", repair_id,
        )
    elif resolution != row["resolution"]:
        db.add_activity(
            conn, user["id"], "repair",
            "Обновлён комментарий по заявке «%s»" % row["title"],
            "repair", repair_id,
        )
    conn.commit()
    updated = get_repair(conn, user, repair_id)
    return 200, {"ok": True, "repair": repair_view(updated)}


def comment_view(row):
    data = dict(row)
    data["author_name"] = data.pop("author_name", "") or i18n.pick("Пользователь", "User")
    if data.get("kind") == "status":
        data["text"] = i18n.comment_text(data.get("text") or "")
    return data


def repair_thread(conn, repair_id):
    comments = conn.execute(
        """SELECT c.*, u.name AS author_name FROM repair_comments c
           LEFT JOIN users u ON u.id = c.author_id
           WHERE c.repair_id = ? ORDER BY c.created_at ASC, c.id ASC""",
        (repair_id,),
    ).fetchall()
    photos = conn.execute(
        """SELECT f.*, u.name AS uploader_name FROM repair_files f
           LEFT JOIN users u ON u.id = f.uploaded_by
           WHERE f.repair_id = ? ORDER BY f.created_at DESC, f.id DESC""",
        (repair_id,),
    ).fetchall()
    return [comment_view(r) for r in comments], [repair_file_dict(r) for r in photos]


def repair_detail(ctx, repair_id):
    conn, user = ctx["conn"], ctx["user"]
    row = get_repair(conn, user, repair_id)
    comments, photos = repair_thread(conn, repair_id)
    data = repair_view(row)
    data["comments"] = comments
    data["photos"] = photos
    return 200, {"ok": True, "repair": data}


def list_repair_comments(ctx, repair_id):
    conn, user = ctx["conn"], ctx["user"]
    get_repair(conn, user, repair_id)
    comments, _ = repair_thread(conn, repair_id)
    return 200, {"ok": True, "comments": comments}


def add_repair_comment(ctx, repair_id):
    conn, user = ctx["conn"], ctx["user"]
    row = get_repair(conn, user, repair_id)
    text = clean(ctx["body"].get("text"), 2000)
    require(text, "Напишите комментарий")
    cur = conn.execute(
        "INSERT INTO repair_comments (repair_id, author_id, text, created_at) VALUES (?, ?, ?, ?)",
        (repair_id, user["id"], text, db.now_iso()),
    )
    if is_mechanic(user) or user["role"] in ("admin", "head"):
        conn.execute(
            "UPDATE repair_requests SET mechanic_id = COALESCE(mechanic_id, ?), updated_at = ? WHERE id = ?",
            (user["id"], db.now_iso(), repair_id),
        )
    conn.commit()
    comment = conn.execute(
        """SELECT c.*, u.name AS author_name FROM repair_comments c
           LEFT JOIN users u ON u.id = c.author_id WHERE c.id = ?""",
        (cur.lastrowid,),
    ).fetchone()
    return 201, {"ok": True, "comment": comment_view(comment)}


def repair_file_dict(row):
    data = dict(row)
    for key in ("stored_name", "repair_workspace", "repair_driver"):
        data.pop(key, None)
    data["url"] = "/api/repair-files/%d/raw" % row["id"]
    return data


def get_repair_file(conn, user, file_id):
    row = conn.execute(
        """SELECT f.*, r.workspace AS repair_workspace, r.driver_id AS repair_driver
           FROM repair_files f JOIN repair_requests r ON r.id = f.repair_id
           WHERE f.id = ?""",
        (file_id,),
    ).fetchone()
    require(row is not None and row["repair_workspace"] == user["workspace"], "Фото не найдено", 404)
    if is_driver(user):
        require(row["repair_driver"] == user["id"], "Фото не найдено", 404)
    return row


def list_repair_files(ctx, repair_id):
    conn, user = ctx["conn"], ctx["user"]
    get_repair(conn, user, repair_id)
    rows = conn.execute(
        """SELECT f.*, u.name AS uploader_name FROM repair_files f
           LEFT JOIN users u ON u.id = f.uploaded_by
           WHERE f.repair_id = ? ORDER BY f.created_at DESC, f.id DESC""",
        (repair_id,),
    ).fetchall()
    return 200, {"ok": True, "photos": [repair_file_dict(r) for r in rows]}


def upload_repair_file(ctx, repair_id):
    conn, user = ctx["conn"], ctx["user"]
    repair = get_repair(conn, user, repair_id)
    upload = read_upload(ctx["body"], "Прикрепите фото неисправности")
    cur = conn.execute(
        """INSERT INTO repair_files (repair_id, filename, stored_name, mime, size, uploaded_by, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)""",
        (repair_id, upload["filename"], upload["stored_name"], upload["mime"],
         len(upload["data"]), user["id"], db.now_iso()),
    )
    db.add_activity(
        conn, user["id"], "repair",
        "К заявке «%s» добавлено фото" % repair["title"], "repair", repair_id,
    )
    conn.commit()
    row = conn.execute(
        """SELECT f.*, u.name AS uploader_name FROM repair_files f
           LEFT JOIN users u ON u.id = f.uploaded_by WHERE f.id = ?""",
        (cur.lastrowid,),
    ).fetchone()
    return 201, {"ok": True, "photo": repair_file_dict(row)}


def serve_repair_file(ctx, file_id):
    conn, user = ctx["conn"], ctx["user"]
    row = get_repair_file(conn, user, file_id)
    full = stored_path(row["stored_name"])
    try:
        with open(full, "rb") as fh:
            data = fh.read()
    except OSError:
        raise ApiError(404, "Файл не найден на диске")
    return 200, Raw(data, row["mime"]), [("Content-Disposition", "inline")]


# ---------------------------------------------------------------- reminders

def reminder_item(title, text, date_value, level, route, ref_id=None):
    return {
        "title": title,
        "text": text,
        "date": date_value,
        "level": level,
        "route": route,
        "ref_id": ref_id,
    }


def reminder_groups(conn, user):
    role = user["role"]
    ws = user["workspace"]
    today = date.today()
    today_iso = today.isoformat()
    groups = []

    def L(ru, en):
        return en if i18n.is_en() else ru

    def num(value):
        text = format(value, ",")
        return text if i18n.is_en() else text.replace(",", " ")

    fleet_access = role in ("admin", "head", "mechanic")
    if fleet_access:
        service_items = []
        document_items = []
        vehicles = conn.execute(
            "SELECT * FROM vehicles WHERE workspace = ? ORDER BY next_service, name", (ws,)
        ).fetchall()
        for vehicle in vehicles:
            label = vehicle_label(vehicle)
            next_service = vehicle["next_service"] or ""
            if next_service and next_service <= (today + timedelta(days=14)).isoformat():
                overdue = next_service < today_iso
                text = L("Срок %s · пробег %s км", "Due %s · mileage %s km") % (
                    next_service, num(vehicle["mileage"]))
                title = L("Просрочено ТО: " if overdue else "Скоро ТО: ",
                          "Service overdue: " if overdue else "Service due soon: ")
                service_items.append(reminder_item(
                    title + label,
                    text, next_service, "danger" if overdue else "warning", "fleet", vehicle["id"],
                ))
            for field, ru_title, en_title in (
                ("insurance_until", "Страховка", "Insurance"),
                ("inspection_until", "Техосмотр", "Inspection"),
            ):
                until = vehicle[field] or ""
                if until and until <= (today + timedelta(days=30)).isoformat():
                    overdue = until < today_iso
                    title = L(ru_title, en_title)
                    if i18n.is_en():
                        prefix = "%s expired: " if overdue else "%s expires: "
                    else:
                        prefix = "%s истекла: " if overdue else "%s заканчивается: "
                    document_items.append(reminder_item(
                        prefix % title + label,
                        L("Действует до %s", "Valid until %s") % until, until,
                        "danger" if overdue else "warning", "fleet", vehicle["id"],
                    ))
        if service_items:
            groups.append({"key": "service", "title": L("Плановое ТО", "Scheduled service"),
                           "items": service_items})
        if document_items:
            groups.append({"key": "documents", "title": L("Документы машин", "Vehicle documents"),
                           "items": document_items})

    if role != "manager":
        conds, params = ["r.workspace = ?", "r.status != 'done'"], [ws]
        if is_driver(user):
            conds.append("r.driver_id = ?")
            params.append(user["id"])
        repair_rows = conn.execute(
            repair_query() + " WHERE " + " AND ".join(conds) + " ORDER BY r.created_at DESC LIMIT 20",
            params,
        ).fetchall()
        repair_items = []
        for repair in repair_rows:
            planned = repair["planned_date"] or ""
            level = "danger" if planned and planned < today_iso else "warning"
            vehicle = ", ".join(part for part in (repair["vehicle_name"], repair["vehicle_plate"]) if part)
            status_ru = db.REPAIR_STATUSES.get(repair["status"], "")
            status_title = i18n.pick(status_ru, i18n.REPAIR_STATUS_EN.get(status_ru, status_ru))
            text = " · ".join(part for part in (vehicle, status_title) if part)
            if planned:
                text += L(" · план %s", " · planned %s") % planned
            repair_items.append(reminder_item(
                L("Заявка на ремонт: ", "Repair request: ") + repair["title"], text,
                planned or repair["created_at"][:10], level,
                "trip" if is_driver(user) else "fleet", repair["id"],
            ))
        if repair_items:
            groups.append({"key": "repairs", "title": L("Открытые заявки на ремонт", "Open repair requests"),
                           "items": repair_items})

    if role in ("admin", "head", "manager"):
        conds, params = ["t.workspace = ?", "t.done = 0", "t.due_date != ''",
                         "t.due_date <= ?"], [ws, (today + timedelta(days=3)).isoformat()]
        if is_manager(user):
            conds.append("t.assignee_id = ?")
            params.append(user["id"])
        task_rows = conn.execute(
            """SELECT t.*, c.name AS client_name, d.title AS deal_title FROM tasks t
               LEFT JOIN clients c ON c.id = t.client_id LEFT JOIN deals d ON d.id = t.deal_id
               WHERE """ + " AND ".join(conds) + " ORDER BY t.due_date ASC LIMIT 20",
            params,
        ).fetchall()
        task_items = []
        for task in task_rows:
            overdue = task["due_date"] < today_iso
            meta = " · ".join(part for part in (task["client_name"], task["deal_title"]) if part)
            task_items.append(reminder_item(
                L("Просрочена задача: " if overdue else "Задача: ",
                  "Task overdue: " if overdue else "Task: ") + task["title"],
                (meta + " · " if meta else "") + L("срок %s", "due %s") % task["due_date"],
                task["due_date"], "danger" if overdue else "warning", "tasks", task["id"],
            ))
        if task_items:
            groups.append({"key": "tasks", "title": L("Задачи с дедлайном", "Tasks with deadlines"),
                           "items": task_items})

        stale_conds, stale_params = [
            "r.workspace = ?", "r.status IN ('new', 'calculating')", "substr(r.updated_at, 1, 10) <= ?",
        ], [ws, (today - timedelta(days=2)).isoformat()]
        if is_manager(user):
            stale_conds.append("r.owner_id = ?")
            stale_params.append(user["id"])
        stale_rows = conn.execute(
            """SELECT r.*, c.name AS client_name FROM transport_requests r
               LEFT JOIN clients c ON c.id = r.client_id
               WHERE """ + " AND ".join(stale_conds) + " ORDER BY r.updated_at ASC LIMIT 10",
            stale_params,
        ).fetchall()
        stale_items = []
        for request_row in stale_rows:
            since = (request_row["updated_at"] or request_row["created_at"] or "")[:10]
            days = (today - date.fromisoformat(since)).days if since else 0
            meta = " · ".join(part for part in (
                request_row["client_name"],
                "%s → %s" % (request_row["route_from"], request_row["route_to"]),
            ) if part)
            stale_items.append(reminder_item(
                ("Request stalled for %d days" % days) if i18n.is_en()
                else ("Заявка без движения %d %s" % (days, plural_ru(days, "день", "дня", "дней"))),
                meta or request_row["cargo"] or "",
                since, "warning", "requests", request_row["id"],
            ))
        if stale_items:
            groups.append({"key": "requests", "title": L("Заявки без движения", "Stalled requests"),
                           "items": stale_items})

        debt_conds, debt_params = ["d.workspace = ?", "d.stage = 'won'", "d.payment_due != ''",
                                   "d.payment_due < ?"], [ws, today_iso]
        if is_manager(user):
            debt_conds.append("d.owner_id = ?")
            debt_params.append(user["id"])
        debt_rows_list = conn.execute(
            """SELECT d.id, d.title, d.amount, d.payment_due, c.name AS client_name,
                      (SELECT COALESCE(SUM(p.amount), 0) FROM payments p WHERE p.deal_id = d.id) AS paid_total
               FROM deals d LEFT JOIN clients c ON c.id = d.client_id
               WHERE """ + " AND ".join(debt_conds) + " ORDER BY d.payment_due ASC LIMIT 10",
            debt_params,
        ).fetchall()
        debt_items = []
        for debt_row in debt_rows_list:
            debt = float(debt_row["amount"] or 0) - float(debt_row["paid_total"] or 0)
            if debt <= 0.01:
                continue
            days = (today - date.fromisoformat(debt_row["payment_due"])).days
            if i18n.is_en():
                debt_meta = "Debt %s ₽ · due %s · %s" % (
                    rub_text(debt), debt_row["payment_due"],
                    "1 day" if days == 1 else "%d days" % days)
            else:
                debt_meta = "Долг %s ₽ · срок %s · %d %s" % (
                    rub_text(debt), debt_row["payment_due"], days,
                    plural_ru(days, "день", "дня", "дней"),
                )
            debt_items.append(reminder_item(
                L("Просрочена оплата: ", "Payment overdue: ")
                + (debt_row["client_name"] or debt_row["title"]),
                debt_meta,
                debt_row["payment_due"], "danger", "reports", debt_row["id"],
            ))
        if debt_items:
            groups.append({"key": "debts", "title": L("Просроченные оплаты", "Overdue payments"),
                           "items": debt_items})

    total = sum(len(group["items"]) for group in groups)
    return groups, total


def reminders(ctx):
    groups, total = reminder_groups(ctx["conn"], ctx["user"])
    return 200, {"ok": True, "reminders": {"total": total, "groups": groups}}


# ---------------------------------------------------------------- tasks

def list_tasks(ctx):
    conn, user = ctx["conn"], ctx["user"]
    query = ctx["query"]
    conds, params = ["1=1"], []
    conds.append("t.workspace = ?")
    params.append(user["workspace"])
    if is_manager(user):
        conds.append("t.assignee_id = ?")
        params.append(user["id"])
    else:
        assignee = to_int(query.get("assignee"))
        if assignee:
            conds.append("t.assignee_id = ?")
            params.append(assignee)
    sql = """
        SELECT t.*, u.name AS assignee_name, d.title AS deal_title, c.name AS client_name
        FROM tasks t LEFT JOIN users u ON u.id = t.assignee_id
        LEFT JOIN deals d ON d.id = t.deal_id LEFT JOIN clients c ON c.id = t.client_id
        WHERE %s
        ORDER BY t.done ASC, CASE WHEN t.due_date = '' THEN 1 ELSE 0 END, t.due_date ASC, t.id DESC
    """ % " AND ".join(conds)
    rows = conn.execute(sql, params).fetchall()
    return 200, {"ok": True, "tasks": [dict(r) for r in rows]}


def task_payload(conn, user, body, row=None):
    title = clean(body.get("title", row["title"] if row else ""), 300)
    require(title, "Укажите текст задачи")
    due_date = clean(body.get("due_date", row["due_date"] if row else ""), 20)
    priority = body.get("priority", row["priority"] if row else "normal")
    parse_priority(priority)
    assignee = body.get("assignee_id", row["assignee_id"] if row else user["id"])
    assignee = assert_assignee(conn, user, to_int(assignee, user["id"]))
    deal_id = body.get("deal_id", row["deal_id"] if row else None)
    deal_id = to_int(deal_id)
    if deal_id:
        get_deal(conn, user, deal_id)
    client_id = to_int(body.get("client_id", row["client_id"] if row else None))
    if client_id:
        get_client(conn, user, client_id)
    return {
        "title": title,
        "notes": clean(body.get("notes", row["notes"] if row else ""), 2000),
        "due_date": due_date,
        "priority": priority,
        "assignee_id": assignee,
        "deal_id": deal_id,
        "client_id": client_id,
    }


def create_task(ctx):
    conn, user = ctx["conn"], ctx["user"]
    data = task_payload(conn, user, ctx["body"])
    cur = conn.execute(
        """INSERT INTO tasks (workspace, title, notes, due_date, priority, done, assignee_id, deal_id, client_id, created_at)
           VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?)""",
        (user["workspace"], data["title"], data["notes"], data["due_date"], data["priority"],
         data["assignee_id"], data["deal_id"], data["client_id"], db.now_iso()),
    )
    conn.commit()
    row = conn.execute(
        """SELECT t.*, u.name AS assignee_name, d.title AS deal_title, c.name AS client_name
           FROM tasks t LEFT JOIN users u ON u.id = t.assignee_id
           LEFT JOIN deals d ON d.id = t.deal_id LEFT JOIN clients c ON c.id = t.client_id
           WHERE t.id = ?""",
        (cur.lastrowid,),
    ).fetchone()
    return 201, {"ok": True, "task": dict(row)}


def update_task(ctx, task_id):
    conn, user = ctx["conn"], ctx["user"]
    row = get_task(conn, user, task_id)
    body = ctx["body"]
    if "done" in body:
        done = 1 if body.get("done") else 0
        completed_at = db.now_iso() if done and not row["done"] else ("" if not done else row["completed_at"])
        if set(body.keys()) <= {"done"}:
            conn.execute("UPDATE tasks SET done = ?, completed_at = ? WHERE id = ?",
                         (done, completed_at, task_id))
            conn.commit()
            updated = conn.execute(
                """SELECT t.*, u.name AS assignee_name, d.title AS deal_title, c.name AS client_name
                   FROM tasks t LEFT JOIN users u ON u.id = t.assignee_id
                   LEFT JOIN deals d ON d.id = t.deal_id LEFT JOIN clients c ON c.id = t.client_id
                   WHERE t.id = ?""",
                (task_id,),
            ).fetchone()
            return 200, {"ok": True, "task": dict(updated)}
    data = task_payload(conn, user, body, row)
    done = 1 if body.get("done", bool(row["done"])) else 0
    completed_at = row["completed_at"]
    if done and not row["done"]:
        completed_at = db.now_iso()
    elif not done:
        completed_at = ""
    conn.execute(
        """UPDATE tasks SET title = ?, notes = ?, due_date = ?, priority = ?, assignee_id = ?,
           deal_id = ?, client_id = ?, done = ?, completed_at = ? WHERE id = ?""",
        (data["title"], data["notes"], data["due_date"], data["priority"], data["assignee_id"],
         data["deal_id"], data["client_id"], done, completed_at, task_id),
    )
    conn.commit()
    updated = conn.execute(
        """SELECT t.*, u.name AS assignee_name, d.title AS deal_title, c.name AS client_name
           FROM tasks t LEFT JOIN users u ON u.id = t.assignee_id
           LEFT JOIN deals d ON d.id = t.deal_id LEFT JOIN clients c ON c.id = t.client_id
           WHERE t.id = ?""",
        (task_id,),
    ).fetchone()
    return 200, {"ok": True, "task": dict(updated)}


def delete_task(ctx, task_id):
    conn, user = ctx["conn"], ctx["user"]
    get_task(conn, user, task_id)
    conn.execute("DELETE FROM tasks WHERE id = ?", (task_id,))
    conn.commit()
    return 200, {"ok": True}


# ---------------------------------------------------------------- dashboard

def dashboard(ctx):
    conn, user = ctx["conn"], ctx["user"]
    deny_driver(user, "Главное меню с суммами недоступно водителю")
    manager = is_manager(user)
    ws = user["workspace"]
    if manager:
        deal_scope = " AND d.workspace = ? AND d.owner_id = ?"
        deal_params = [ws, user["id"]]
        client_scope = " WHERE c.workspace = ? AND c.owner_id = ?"
        client_params = [ws, user["id"]]
        task_scope = " AND t.workspace = ? AND t.assignee_id = ?"
        task_params = [ws, user["id"]]
    else:
        deal_scope = " AND d.workspace = ?"
        deal_params = [ws]
        client_scope = " WHERE c.workspace = ?"
        client_params = [ws]
        task_scope = " AND t.workspace = ?"
        task_params = [ws]

    won = conn.execute(
        "SELECT COALESCE(SUM(d.amount), 0) AS amount, COUNT(*) AS count FROM deals d WHERE d.stage = 'won'" + deal_scope,
        deal_params,
    ).fetchone()
    pipeline = conn.execute(
        "SELECT COALESCE(SUM(d.amount), 0) AS amount, COUNT(*) AS count FROM deals d "
        "WHERE d.stage NOT IN ('won', 'lost')" + deal_scope,
        deal_params,
    ).fetchone()
    won_expenses = conn.execute(
        "SELECT COALESCE(SUM((SELECT COALESCE(SUM(e.amount), 0) FROM deal_expenses e WHERE e.deal_id = d.id)"
        " + d.contractor_cost), 0) AS amount FROM deals d WHERE d.stage = 'won'" + deal_scope,
        deal_params,
    ).fetchone()["amount"]
    paid_total = conn.execute(
        "SELECT COALESCE(SUM(p.amount), 0) AS amount FROM payments p JOIN deals d ON d.id = p.deal_id "
        "WHERE d.stage = 'won'" + deal_scope,
        deal_params,
    ).fetchone()["amount"]
    overdue = conn.execute(
        """SELECT COUNT(*) AS count, COALESCE(SUM(d.amount - COALESCE(
               (SELECT SUM(p.amount) FROM payments p WHERE p.deal_id = d.id), 0)), 0) AS amount
           FROM deals d WHERE d.stage = 'won' AND d.payment_due != '' AND d.payment_due < ?
             AND d.amount > COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.deal_id = d.id), 0)"""
        + deal_scope,
        [date.today().isoformat()] + deal_params,
    ).fetchone()
    new_requests = conn.execute(
        "SELECT COUNT(*) AS count FROM transport_requests r WHERE r.status IN ('new', 'calculating')"
        + (" AND r.workspace = ? AND r.owner_id = ?" if manager else " AND r.workspace = ?"),
        [ws, user["id"]] if manager else [ws],
    ).fetchone()["count"]
    clients_total = conn.execute("SELECT COUNT(*) AS count FROM clients c" + client_scope, client_params).fetchone()["count"]
    new_clients = conn.execute(
        "SELECT COUNT(*) AS count FROM clients c WHERE c.created_at >= ?" + client_scope.replace(" WHERE ", " AND ", 1),
        [ (datetime.now() - timedelta(days=30)).replace(microsecond=0).isoformat() ] + client_params,
    ).fetchone()["count"]

    today = date.today().isoformat()
    tasks_open = conn.execute(
        "SELECT COUNT(*) AS count FROM tasks t WHERE t.done = 0" + task_scope, task_params
    ).fetchone()["count"]
    tasks_today = conn.execute(
        "SELECT COUNT(*) AS count FROM tasks t WHERE t.done = 0 AND t.due_date = ?" + task_scope,
        [today] + task_params,
    ).fetchone()["count"]
    tasks_overdue = conn.execute(
        "SELECT COUNT(*) AS count FROM tasks t WHERE t.done = 0 AND t.due_date != '' AND t.due_date < ?" + task_scope,
        [today] + task_params,
    ).fetchone()["count"]

    stage_rows = conn.execute(
        "SELECT d.stage, COUNT(*) AS count, COALESCE(SUM(d.amount), 0) AS amount FROM deals d "
        "WHERE 1=1" + deal_scope + " GROUP BY d.stage",
        deal_params,
    ).fetchall()
    by_stage = {s: {"count": 0, "amount": 0} for s in db.STAGES}
    for row in stage_rows:
        by_stage[row["stage"]] = {"count": row["count"], "amount": row["amount"]}

    recent = conn.execute(
        """SELECT d.*, c.name AS client_name, u.name AS owner_name FROM deals d
           LEFT JOIN clients c ON c.id = d.client_id LEFT JOIN users u ON u.id = d.owner_id
           WHERE 1=1""" + deal_scope + " ORDER BY d.updated_at DESC LIMIT 6",
        deal_params,
    ).fetchall()

    my_tasks = conn.execute(
        """SELECT t.*, c.name AS client_name FROM tasks t LEFT JOIN clients c ON c.id = t.client_id
           WHERE t.assignee_id = ? AND t.workspace = ? AND t.done = 0
           ORDER BY CASE WHEN t.due_date = '' THEN 1 ELSE 0 END, t.due_date ASC LIMIT 5""",
        (user["id"], ws),
    ).fetchall()

    feed = conn.execute(
        """SELECT a.*, u.name AS actor_name FROM activities a
           LEFT JOIN users u ON u.id = a.actor_id WHERE a.workspace = ?
           ORDER BY a.created_at DESC LIMIT 8""",
        (ws,),
    ).fetchall()

    start_week = date.today() - timedelta(days=date.today().weekday() + 7 * 7)
    week_rows = conn.execute(
        """SELECT d.close_date, d.amount, d.contractor_cost,
                  (SELECT COALESCE(SUM(e.amount), 0) FROM deal_expenses e WHERE e.deal_id = d.id) AS expenses
           FROM deals d WHERE d.stage = 'won' AND d.close_date >= ?""" + deal_scope,
        [start_week.isoformat()] + deal_params,
    ).fetchall()
    weekly = []
    for index in range(8):
        week_start = start_week + timedelta(days=7 * index)
        week_end = week_start + timedelta(days=6)
        items = [row for row in week_rows
                 if week_start.isoformat() <= (row["close_date"] or "") <= week_end.isoformat()]
        revenue = sum(float(row["amount"] or 0) for row in items)
        costs = sum(float(row["expenses"] or 0) + float(row["contractor_cost"] or 0) for row in items)
        weekly.append({
            "label": "%d.%02d" % (week_start.day, week_start.month),
            "from": week_start.isoformat(),
            "to": week_end.isoformat(),
            "revenue": round(revenue, 2),
            "margin": round(revenue - costs, 2),
            "trips": len(items),
        })

    groups, attention_total = reminder_groups(conn, user)
    attention_items = []
    for group in groups:
        for item in group["items"]:
            if len(attention_items) < 6:
                item = dict(item)
                item["group"] = group["title"]
                attention_items.append(item)

    data = {
        "today": today,
        "totals": {
            "won_amount": won["amount"],
            "won_count": won["count"],
            "won_expenses": won_expenses,
            "won_margin": round(float(won["amount"] or 0) - float(won_expenses or 0), 2),
            "won_margin_pct": round((float(won["amount"] or 0) - float(won_expenses or 0))
                                    / float(won["amount"]) * 100, 1) if won["amount"] else None,
            "paid_total": round(float(paid_total or 0), 2),
            "debt_total": round(max(float(won["amount"] or 0) - float(paid_total or 0), 0), 2),
            "overdue_count": overdue["count"],
            "overdue_amount": round(float(overdue["amount"] or 0), 2),
            "requests_new": new_requests,
            "pipeline_amount": pipeline["amount"],
            "pipeline_count": pipeline["count"],
            "clients": clients_total,
            "new_clients": new_clients,
            "tasks_open": tasks_open,
            "tasks_today": tasks_today,
            "tasks_overdue": tasks_overdue,
        },
        "pipeline": by_stage,
        "recent_deals": [dict(r) for r in recent],
        "my_tasks": [dict(r) for r in my_tasks],
        "feed": [i18n.activity_row(r) for r in feed],
        "weekly": weekly,
        "attention": {"total": attention_total, "items": attention_items},
    }

    if not manager:
        leaders = conn.execute(
            """SELECT u.id, u.name, COALESCE(SUM(d.amount), 0) AS won_amount, COUNT(*) AS won_count
               FROM deals d JOIN users u ON u.id = d.owner_id
               WHERE d.stage = 'won' AND d.workspace = ? GROUP BY u.id ORDER BY won_amount DESC LIMIT 4""",
            (ws,),
        ).fetchall()
        data["leaders"] = [dict(r) for r in leaders]
    return 200, {"ok": True, "dashboard": data}


# ---------------------------------------------------------------- reports

def add_months(value, delta):
    index = value.year * 12 + (value.month - 1) + delta
    return date(index // 12, index % 12 + 1, 1)


def parse_period(query, default_months=6):
    today = date.today()
    start = parse_date(query.get("from", ""), "начало периода") or add_months(today, -(default_months - 1)).isoformat()
    end = parse_date(query.get("to", ""), "конец периода") or today.isoformat()
    if start > end:
        start, end = end, start
    return start, end


def month_keys(start, end):
    cursor = date.fromisoformat(start).replace(day=1)
    last = date.fromisoformat(end).replace(day=1)
    keys = []
    while cursor <= last and len(keys) < 36:
        keys.append(cursor.isoformat()[:7])
        cursor = add_months(cursor, 1)
    return keys


def pct(part, whole):
    return round(float(part) / float(whole) * 100, 1) if whole else None


def won_finance_rows(conn, user, start=None, end=None):
    conds = ["d.workspace = ?", "d.stage = 'won'"]
    params = [user["workspace"]]
    if is_manager(user):
        conds.append("d.owner_id = ?")
        params.append(user["id"])
    if start:
        conds.append("d.close_date != '' AND d.close_date >= ?")
        params.append(start)
    if end:
        conds.append("d.close_date <= ?")
        params.append(end)
    rows = conn.execute(
        """SELECT d.*, c.name AS client_name, u.name AS owner_name,
               (SELECT COALESCE(SUM(e.amount), 0) FROM deal_expenses e WHERE e.deal_id = d.id) AS expenses_total,
               (SELECT COALESCE(SUM(p.amount), 0) FROM payments p WHERE p.deal_id = d.id) AS paid_total
            FROM deals d LEFT JOIN clients c ON c.id = d.client_id
            LEFT JOIN users u ON u.id = d.owner_id
            WHERE """ + " AND ".join(conds) + " ORDER BY d.close_date ASC",
        params,
    ).fetchall()
    items = []
    for row in rows:
        data = dict(row)
        costs = float(data.get("expenses_total") or 0) + float(data.get("contractor_cost") or 0)
        amount = float(data.get("amount") or 0)
        data["costs"] = round(costs, 2)
        data["margin"] = round(amount - costs, 2)
        data["margin_pct"] = pct(amount - costs, amount)
        items.append(data)
    return items


def debt_rows(conn, user):
    conds = ["d.workspace = ?", "d.stage = 'won'"]
    params = [user["workspace"]]
    if is_manager(user):
        conds.append("d.owner_id = ?")
        params.append(user["id"])
    rows = conn.execute(
        """SELECT d.id, d.title, d.amount, d.payment_due, d.close_date, d.owner_id,
                  c.name AS client_name, u.name AS owner_name,
                  (SELECT COALESCE(SUM(p.amount), 0) FROM payments p WHERE p.deal_id = d.id) AS paid_total
           FROM deals d LEFT JOIN clients c ON c.id = d.client_id
           LEFT JOIN users u ON u.id = d.owner_id
           WHERE """ + " AND ".join(conds) + " ORDER BY d.close_date DESC",
        params,
    ).fetchall()
    today = date.today()
    items = []
    for row in rows:
        amount = float(row["amount"] or 0)
        paid = float(row["paid_total"] or 0)
        debt = round(amount - paid, 2)
        if debt <= 0.01:
            continue
        due = row["payment_due"] or ""
        overdue_days = 0
        if due and due < today.isoformat():
            overdue_days = (today - date.fromisoformat(due)).days
        items.append({
            "id": row["id"],
            "title": row["title"],
            "client_name": row["client_name"] or "Без клиента",
            "owner_name": row["owner_name"] or "",
            "amount": amount,
            "paid": paid,
            "debt": debt,
            "due": due,
            "close_date": row["close_date"],
            "overdue_days": overdue_days,
        })
    items.sort(key=lambda item: (-item["overdue_days"], -item["debt"]))
    summary = {
        "count": len(items),
        "total": round(sum(item["debt"] for item in items), 2),
        "overdue_count": sum(1 for item in items if item["overdue_days"]),
        "overdue_total": round(sum(item["debt"] for item in items if item["overdue_days"]), 2),
    }
    return items, summary


def reports(ctx):
    conn, user = ctx["conn"], ctx["user"]
    deny_driver(user, "Отчёты доступны только офису")
    start, end = parse_period(ctx["query"])
    rows = won_finance_rows(conn, user, start, end)

    revenue = round(sum(float(r["amount"] or 0) for r in rows), 2)
    costs = round(sum(r["costs"] for r in rows), 2)
    margin = round(revenue - costs, 2)
    distance = round(sum(float(r["distance_km"] or 0) for r in rows), 1)

    monthly_map = {}
    for key in month_keys(start, end):
        year, month = key.split("-")
        monthly_map[key] = {
            "key": key,
            "label": "%s %s" % ((MONTHS_EN if i18n.is_en() else MONTHS_RU)[int(month) - 1], year[2:]),
            "revenue": 0.0,
            "expenses": 0.0,
            "margin": 0.0,
            "trips": 0,
        }
    for row in rows:
        key = (row["close_date"] or "")[:7]
        bucket = monthly_map.get(key)
        if bucket is None:
            continue
        bucket["revenue"] += float(row["amount"] or 0)
        bucket["expenses"] += row["costs"]
        bucket["margin"] += row["margin"]
        bucket["trips"] += 1
    monthly = []
    for bucket in monthly_map.values():
        bucket["revenue"] = round(bucket["revenue"], 2)
        bucket["expenses"] = round(bucket["expenses"], 2)
        bucket["margin"] = round(bucket["margin"], 2)
        monthly.append(bucket)

    directions = {}
    for row in rows:
        key = "%s → %s" % (row["route_from"] or "—", row["route_to"] or "—")
        item = directions.setdefault(key, {
            "route": key, "trips": 0, "revenue": 0.0, "costs": 0.0, "margin": 0.0, "distance": 0.0,
        })
        item["trips"] += 1
        item["revenue"] += float(row["amount"] or 0)
        item["costs"] += row["costs"]
        item["margin"] += row["margin"]
        item["distance"] += float(row["distance_km"] or 0)
    direction_list = []
    for item in directions.values():
        item["revenue"] = round(item["revenue"], 2)
        item["costs"] = round(item["costs"], 2)
        item["margin"] = round(item["margin"], 2)
        item["margin_pct"] = pct(item["margin"], item["revenue"])
        item["avg_rate"] = round(item["revenue"] / item["trips"], 2) if item["trips"] else 0
        item["rate_per_km"] = round(item["revenue"] / item["distance"], 1) if item["distance"] else None
        direction_list.append(item)
    direction_list.sort(key=lambda item: -item["revenue"])

    clients = {}
    for row in rows:
        key = row["client_name"] or "Без клиента"
        item = clients.setdefault(key, {"client": key, "trips": 0, "revenue": 0.0, "margin": 0.0})
        item["trips"] += 1
        item["revenue"] += float(row["amount"] or 0)
        item["margin"] += row["margin"]
    client_list = []
    for item in clients.values():
        item["revenue"] = round(item["revenue"], 2)
        item["margin"] = round(item["margin"], 2)
        item["margin_pct"] = pct(item["margin"], item["revenue"])
        client_list.append(item)
    client_list.sort(key=lambda item: -item["revenue"])

    managers = {}
    for row in rows:
        key = row["owner_name"] or "Без ответственного"
        item = managers.setdefault(key, {"name": key, "trips": 0, "revenue": 0.0, "margin": 0.0})
        item["trips"] += 1
        item["revenue"] += float(row["amount"] or 0)
        item["margin"] += row["margin"]
    manager_list = []
    for item in managers.values():
        item["revenue"] = round(item["revenue"], 2)
        item["margin"] = round(item["margin"], 2)
        manager_list.append(item)
    manager_list.sort(key=lambda item: -item["revenue"])

    req_conds = ["r.workspace = ?", "substr(r.created_at, 1, 10) BETWEEN ? AND ?"]
    req_params = [user["workspace"], start, end]
    if is_manager(user):
        req_conds.append("r.owner_id = ?")
        req_params.append(user["id"])
    req_rows = conn.execute(
        "SELECT r.status, COUNT(*) AS count FROM transport_requests r WHERE "
        + " AND ".join(req_conds) + " GROUP BY r.status",
        req_params,
    ).fetchall()
    by_status = {row["status"]: row["count"] for row in req_rows}
    requests_total = sum(by_status.values())
    converted = by_status.get("converted", 0)

    pay_conds = ["d.workspace = ?", "p.paid_at BETWEEN ? AND ?"]
    pay_params = [user["workspace"], start, end]
    if is_manager(user):
        pay_conds.append("d.owner_id = ?")
        pay_params.append(user["id"])
    paid_period = conn.execute(
        "SELECT COALESCE(SUM(p.amount), 0) AS amount FROM payments p JOIN deals d ON d.id = p.deal_id "
        "WHERE " + " AND ".join(pay_conds),
        pay_params,
    ).fetchone()["amount"]

    debts, debt_summary = debt_rows(conn, user)

    data = {
        "period": {"from": start, "to": end},
        "totals": {
            "revenue": revenue,
            "expenses": costs,
            "margin": margin,
            "margin_pct": pct(margin, revenue),
            "trips": len(rows),
            "distance": distance,
            "avg_check": round(revenue / len(rows), 2) if rows else 0,
            "paid": round(float(paid_period or 0), 2),
            "debt": debt_summary["total"],
            "debt_overdue": debt_summary["overdue_total"],
        },
        "monthly": monthly,
        "directions": direction_list[:8],
        "clients": client_list[:8],
        "managers": manager_list,
        "requests": {
            "total": requests_total,
            "converted": converted,
            "rejected": by_status.get("rejected", 0),
            "open": by_status.get("new", 0) + by_status.get("calculating", 0) + by_status.get("sent", 0),
            "conversion": pct(converted, requests_total),
        },
        "debtors": {"summary": debt_summary, "items": debts[:6]},
    }
    return 200, {"ok": True, "reports": data}


def debtors_report(ctx):
    conn, user = ctx["conn"], ctx["user"]
    deny_driver(user, "Дебиторка доступна только офису")
    items, summary = debt_rows(conn, user)
    return 200, {"ok": True, "debtors": items, "summary": summary}


# ---------------------------------------------------------------- journal and search

def list_activity(ctx):
    conn, user = ctx["conn"], ctx["user"]
    require(user["role"] in ("admin", "head"), "Журнал действий доступен руководителю и администратору", 403)
    limit = min(max(to_int(ctx["query"].get("limit"), 50), 1), 200)
    conds, params = ["a.workspace = ?"], [user["workspace"]]
    kind = clean(ctx["query"].get("kind", ""), 30)
    if kind:
        conds.append("a.kind = ?")
        params.append(kind)
    rows = conn.execute(
        """SELECT a.*, u.name AS actor_name FROM activities a
           LEFT JOIN users u ON u.id = a.actor_id WHERE """ + " AND ".join(conds)
        + " ORDER BY a.created_at DESC, a.id DESC LIMIT ?",
        params + [limit],
    ).fetchall()
    return 200, {"ok": True, "activities": [i18n.activity_row(row) for row in rows]}


def global_search(ctx):
    conn, user = ctx["conn"], ctx["user"]
    deny_driver(user, "Поиск доступен только офису")
    q = clean(ctx["query"].get("q", ""), 80)
    empty = {"deals": [], "clients": [], "requests": [], "tasks": []}
    if len(q) < 2:
        return 200, {"ok": True, "results": empty, "query": q}
    like = "%" + q + "%"

    deal_conds = ["d.workspace = ?", "(d.title LIKE ? OR d.route_from LIKE ? OR d.route_to LIKE ? "
                                "OR d.cargo LIKE ? OR c.name LIKE ?)"]
    deal_params = [user["workspace"], like, like, like, like, like]
    if is_manager(user):
        deal_conds.append("d.owner_id = ?")
        deal_params.append(user["id"])
    deals = conn.execute(
        """SELECT d.id, d.title, d.stage, d.amount, d.route_from, d.route_to, d.client_id,
                  c.name AS client_name FROM deals d LEFT JOIN clients c ON c.id = d.client_id
           WHERE """ + " AND ".join(deal_conds) + " ORDER BY d.updated_at DESC LIMIT 6",
        deal_params,
    ).fetchall()

    client_conds = ["c.workspace = ?", "(c.name LIKE ? OR c.inn LIKE ? OR c.email LIKE ? OR c.phone LIKE ?)"]
    client_params = [user["workspace"], like, like, like, like]
    if is_manager(user):
        client_conds.append("c.owner_id = ?")
        client_params.append(user["id"])
    clients = conn.execute(
        "SELECT c.id, c.name, c.inn, c.industry FROM clients c WHERE "
        + " AND ".join(client_conds) + " ORDER BY c.name LIMIT 6",
        client_params,
    ).fetchall()

    req_conds = ["r.workspace = ?", "(r.route_from LIKE ? OR r.route_to LIKE ? OR r.cargo LIKE ? "
                                    "OR c.name LIKE ?)"]
    req_params = [user["workspace"], like, like, like, like]
    if is_manager(user):
        req_conds.append("r.owner_id = ?")
        req_params.append(user["id"])
    requests = conn.execute(
        """SELECT r.id, r.route_from, r.route_to, r.cargo, r.status, r.amount,
                  c.name AS client_name FROM transport_requests r
           LEFT JOIN clients c ON c.id = r.client_id WHERE """ + " AND ".join(req_conds)
        + " ORDER BY r.updated_at DESC LIMIT 6",
        req_params,
    ).fetchall()

    task_conds = ["t.workspace = ?", "t.title LIKE ?"]
    task_params = [user["workspace"], like]
    if is_manager(user):
        task_conds.append("t.assignee_id = ?")
        task_params.append(user["id"])
    tasks = conn.execute(
        "SELECT t.id, t.title, t.due_date, t.done FROM tasks t WHERE "
        + " AND ".join(task_conds) + " ORDER BY t.done, t.due_date LIMIT 6",
        task_params,
    ).fetchall()

    results = {
        "deals": [dict(row) for row in deals],
        "clients": [dict(row) for row in clients],
        "requests": [dict(row) for row in requests],
        "tasks": [dict(row) for row in tasks],
    }
    return 200, {"ok": True, "results": results, "query": q}


# ---------------------------------------------------------------- client import

def import_rows(filename, data):
    name = (filename or "").lower()
    if name.endswith((".xlsx", ".xlsm")):
        return excel.read_xlsx(data)
    if name.endswith(".xls"):
        raise ApiError(400, "Старый формат .xls не поддерживается — сохраните файл как .xlsx или .csv")
    try:
        text = data.decode("utf-8-sig")
    except UnicodeDecodeError:
        try:
            text = data.decode("cp1251")
        except UnicodeDecodeError:
            raise ApiError(400, "Не удалось прочитать текст файла — сохраните его в UTF-8")
    sample = text[:4096]
    try:
        delimiter = csv.Sniffer().sniff(sample, delimiters=";,\t").delimiter
    except csv.Error:
        delimiter = ";" if text.count(";") >= text.count(",") else ","
    return list(csv.reader(io.StringIO(text), delimiter=delimiter))


def import_clients(ctx):
    conn, user = ctx["conn"], ctx["user"]
    deny_driver(user, "Импорт клиентов доступен только офису")
    body = ctx["body"]
    filename = clean(body.get("filename"), 200)
    content = body.get("content") or ""
    require(content, "Прикрепите файл CSV или Excel")
    try:
        data = base64.b64decode(content, validate=True)
    except (binascii.Error, ValueError):
        raise ApiError(400, "Повреждённый файл — попробуйте сохранить его заново")
    require(len(data) <= 5 * 1024 * 1024, "Файл больше 5 МБ")
    rows = import_rows(filename, data)
    rows = [row for row in rows if any(str(cell).strip() for cell in row)]
    require(rows, "В файле нет данных")
    require(len(rows) <= 1001, "За один раз можно импортировать не больше 1000 клиентов")

    first = [str(cell or "").strip().lower() for cell in rows[0]]
    mapping = [CLIENT_IMPORT_HEADERS.get(cell) for cell in first]
    has_header = any(mapping)
    if has_header:
        data_rows = rows[1:]
    else:
        mapping = ["name", "industry", "inn", "phone", "email", "address", "website", "notes"]
        data_rows = rows

    existing = {
        row["name"].strip().lower()
        for row in conn.execute("SELECT name FROM clients WHERE workspace = ?", (user["workspace"],))
    }
    created = 0
    skipped = 0
    errors = []
    stamp = db.now_iso()
    for index, row in enumerate(data_rows, start=2 if has_header else 1):
        values = {"name": "", "industry": "", "inn": "", "phone": "", "email": "",
                  "address": "", "website": "", "notes": ""}
        for col, field in enumerate(mapping):
            if field and col < len(row):
                values[field] = str(row[col] or "").strip()[:2000]
        values["name"] = values["name"][:200]
        if not values["name"]:
            skipped += 1
            continue
        key = values["name"].lower()
        if key in existing:
            skipped += 1
            continue
        inn = values["inn"].replace(" ", "")
        if inn and not (inn.isdigit() and len(inn) in (10, 12)):
            skipped += 1
            if len(errors) < 10:
                errors.append({"row": index, "message": "Некорректный ИНН у «%s»" % values["name"]})
            continue
        values["inn"] = inn
        conn.execute(
            """INSERT INTO clients (workspace, name, industry, inn, website, phone, email, address, notes,
                   owner_id, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (user["workspace"], values["name"], values["industry"], values["inn"], values["website"],
             values["phone"], values["email"], values["address"], values["notes"], user["id"], stamp, stamp),
        )
        existing.add(key)
        created += 1
    if created:
        db.add_activity(conn, user["id"], "client",
                        "Импортировано клиентов из файла: %d" % created, "client", None)
    conn.commit()
    return 200, {"ok": True, "created": created, "skipped": skipped, "errors": errors}


def import_clients_template(ctx):
    deny_driver(ctx["user"], "Импорт клиентов доступен только офису")
    headers = ["Название", "Отрасль", "ИНН", "Телефон", "Email", "Адрес", "Сайт", "Заметки"]
    sample = ["ООО «Пример»", "Логистика", "7701234567", "+7 495 000-00-00", "info@example.ru",
              "Москва, ул. Примерная, 1", "example.ru", "Отсрочка 14 дней"]
    return csv_response("clients-template.csv", headers, [sample])


# ---------------------------------------------------------------- export

def export_rows(conn, user):
    """Return deals and client aggregates visible to the user."""
    scope = "d.workspace = ?" + (" AND d.owner_id = ?" if is_manager(user) else "")
    params = [user["workspace"]] + ([user["id"]] if is_manager(user) else [])
    deals = conn.execute(
        f"""SELECT d.*, c.name AS client_name, u.name AS owner_name, co.name AS contractor_name,
              (SELECT COALESCE(SUM(e.amount), 0) FROM deal_expenses e WHERE e.deal_id = d.id AND e.kind = 'fuel') AS fuel_total,
              (SELECT COALESCE(SUM(e.amount), 0) FROM deal_expenses e WHERE e.deal_id = d.id AND e.kind = 'toll') AS toll_total,
              (SELECT COALESCE(SUM(e.amount), 0) FROM deal_expenses e WHERE e.deal_id = d.id AND e.kind = 'repair') AS repair_total,
              (SELECT COALESCE(SUM(e.amount), 0) FROM deal_expenses e WHERE e.deal_id = d.id AND e.kind = 'other') AS other_total,
              (SELECT COALESCE(SUM(p.amount), 0) FROM payments p WHERE p.deal_id = d.id) AS paid_total
            FROM deals d LEFT JOIN clients c ON c.id = d.client_id
            LEFT JOIN users u ON u.id = d.owner_id
            LEFT JOIN contractors co ON co.id = d.contractor_id
            WHERE {scope} ORDER BY d.created_at DESC""",
        params,
    ).fetchall()
    deal_rows = []
    for row in deals:
        amount = float(row["amount"] or 0)
        total = (sum(float(row[key] or 0) for key in ("fuel_total", "toll_total", "repair_total", "other_total"))
                 + float(row["contractor_cost"] or 0))
        margin = round(amount - total, 2)
        paid = float(row["paid_total"] or 0)
        deal_rows.append({
            "id": row["id"],
            "title": row["title"],
            "client": row["client_name"] or "",
            "stage": db.STAGE_TITLES.get(row["stage"], row["stage"]),
            "owner": row["owner_name"] or "",
            "driver": row["driver"] or "",
            "pickup": row["pickup_date"] or "",
            "close": row["close_date"] or "",
            "distance": float(row["distance_km"] or 0),
            "amount": amount,
            "fuel": float(row["fuel_total"] or 0),
            "toll": float(row["toll_total"] or 0),
            "repair": float(row["repair_total"] or 0),
            "other": float(row["other_total"] or 0),
            "subcontract": float(row["contractor_cost"] or 0),
            "contractor": row["contractor_name"] or "",
            "expenses": round(total, 2),
            "margin": margin,
            "margin_pct": round(margin / amount * 100, 1) if amount else "",
            "paid": paid,
            "debt": round(max(amount - paid, 0), 2),
            "payment_due": row["payment_due"] or "",
        })
    money_scope = " AND d.owner_id = %d" % int(user["id"]) if is_manager(user) else ""
    clients = conn.execute(
        f"""SELECT c.id, c.name, c.inn, c.industry, u.name AS owner_name, c.created_at,
              (SELECT COUNT(*) FROM contacts ct WHERE ct.client_id = c.id) AS contacts_count,
              (SELECT COUNT(*) FROM deals d WHERE d.client_id = c.id) AS deals_count,
              (SELECT COUNT(*) FROM deals d WHERE d.client_id = c.id AND d.stage = 'won'{money_scope}) AS won_count,
              (SELECT COALESCE(SUM(d.amount), 0) FROM deals d
                WHERE d.client_id = c.id AND d.stage = 'won'{money_scope}) AS revenue,
              (SELECT COALESCE(SUM(e.amount), 0) FROM deal_expenses e JOIN deals d ON d.id = e.deal_id
                WHERE d.client_id = c.id AND d.stage = 'won'{money_scope})
              + (SELECT COALESCE(SUM(d.contractor_cost), 0) FROM deals d
                WHERE d.client_id = c.id AND d.stage = 'won'{money_scope}) AS expenses
            FROM clients c LEFT JOIN users u ON u.id = c.owner_id
            WHERE c.workspace = ?{' AND c.owner_id = %d' % int(user['id']) if is_manager(user) else ''}
            ORDER BY c.updated_at DESC""",
        [user["workspace"]],
    ).fetchall()
    client_rows = []
    for row in clients:
        revenue = float(row["revenue"] or 0)
        expenses = float(row["expenses"] or 0)
        margin = round(revenue - expenses, 2)
        client_rows.append({
            "name": row["name"],
            "inn": row["inn"] or "",
            "industry": row["industry"] or "",
            "contacts": row["contacts_count"],
            "deals": row["deals_count"],
            "won": row["won_count"],
            "revenue": revenue,
            "expenses": round(expenses, 2),
            "margin": margin,
            "margin_pct": round(margin / revenue * 100, 1) if revenue else "",
            "owner": row["owner_name"] or "",
            "created": row["created_at"],
        })
    return deal_rows, client_rows


def csv_cell(value):
    if value is None:
        return ""
    if isinstance(value, float):
        text = ("%.2f" % value).rstrip("0").rstrip(".")
        return text.replace(".", ",")
    return str(value)


def csv_response(filename, headers, rows):
    buffer = io.StringIO()
    writer = csv.writer(buffer, delimiter=";", lineterminator="\r\n")
    writer.writerow(headers)
    for row in rows:
        writer.writerow([csv_cell(value) for value in row])
    data = ("\ufeff" + buffer.getvalue()).encode("utf-8")
    return 200, Raw(data, "text/csv; charset=utf-8"), [
        ("Content-Disposition", 'attachment; filename="%s"' % filename),
    ]


def export_deals(ctx):
    conn, user = ctx["conn"], ctx["user"]
    deny_driver(user, "Экспорт доступен только офису")
    fmt = clean(ctx["query"].get("format", "csv"), 10) or "csv"
    deals, _ = export_rows(conn, user)
    headers = ["№", "Маршрут", "Клиент", "Этап", "Ответственный", "Водитель", "Погрузка", "Доставка",
               "Расстояние, км", "Доход, ₽", "Топливо, ₽", "Платные дороги, ₽", "Ремонт, ₽", "Прочее, ₽",
               "Субподряд, ₽", "Подрядчик", "Расходы всего, ₽", "Маржа, ₽", "Маржа, %", "Оплачено, ₽",
               "Долг, ₽", "Срок оплаты"]
    rows = [[d["id"], d["title"], d["client"], d["stage"], d["owner"], d["driver"], d["pickup"], d["close"],
             d["distance"], d["amount"], d["fuel"], d["toll"], d["repair"], d["other"], d["subcontract"],
             d["contractor"], d["expenses"], d["margin"], d["margin_pct"], d["paid"], d["debt"],
             d["payment_due"]] for d in deals]
    stamp = date.today().isoformat()
    if fmt == "xlsx":
        data = excel.build_xlsx("Перевозки", headers, rows,
                                [6, 30, 22, 16, 20, 20, 12, 12, 14, 14, 12, 16, 12, 12, 14, 18, 16, 14, 10, 14, 14, 12])
        return 200, Raw(data, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"), [
            ("Content-Disposition", 'attachment; filename="deals-%s.xlsx"' % stamp),
        ]
    return csv_response("deals-%s.csv" % stamp, headers, rows)


def export_clients(ctx):
    conn, user = ctx["conn"], ctx["user"]
    deny_driver(user, "Экспорт доступен только офису")
    fmt = clean(ctx["query"].get("format", "csv"), 10) or "csv"
    _, clients = export_rows(conn, user)
    headers = ["Клиент", "ИНН", "Отрасль", "Контакты", "Перевозок", "Доставлено", "Выручка, ₽",
               "Расходы, ₽", "Маржа, ₽", "Маржа, %", "Ответственный", "В базе с"]
    rows = [[c["name"], c["inn"], c["industry"], c["contacts"], c["deals"], c["won"], c["revenue"],
             c["expenses"], c["margin"], c["margin_pct"], c["owner"], c["created"]] for c in clients]
    stamp = date.today().isoformat()
    if fmt == "xlsx":
        data = excel.build_xlsx("Клиенты", headers, rows, [28, 14, 22, 10, 12, 12, 14, 14, 14, 10, 20, 14])
        return 200, Raw(data, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"), [
            ("Content-Disposition", 'attachment; filename="clients-%s.xlsx"' % stamp),
        ]
    return csv_response("clients-%s.csv" % stamp, headers, rows)


# ---------------------------------------------------------------- print

WORD_UNITS_M = ["", "один", "два", "три", "четыре", "пять", "шесть", "семь", "восемь", "девять"]
WORD_UNITS_F = ["", "одна", "две", "три", "четыре", "пять", "шесть", "семь", "восемь", "девять"]
WORD_TEENS = ["десять", "одиннадцать", "двенадцать", "тринадцать", "четырнадцать", "пятнадцать",
              "шестнадцать", "семнадцать", "восемнадцать", "девятнадцать"]
WORD_TENS = ["", "", "двадцать", "тридцать", "сорок", "пятьдесят", "шестьдесят", "семьдесят",
             "восемьдесят", "девяносто"]
WORD_HUNDREDS = ["", "сто", "двести", "триста", "четыреста", "пятьсот", "шестьсот", "семьсот",
                 "восемьсот", "девятьсот"]


def plural_ru(n, one, few, many):
    n = abs(int(n)) % 100
    if 10 < n < 20:
        return many
    last = n % 10
    if last == 1:
        return one
    if 2 <= last <= 4:
        return few
    return many


def triad_words(value, female=False):
    units = WORD_UNITS_F if female else WORD_UNITS_M
    words = []
    hundreds = value // 100
    rest = value % 100
    if hundreds:
        words.append(WORD_HUNDREDS[hundreds])
    if 10 <= rest < 20:
        words.append(WORD_TEENS[rest - 10])
    else:
        tens = rest // 10
        if tens:
            words.append(WORD_TENS[tens])
        if rest % 10:
            words.append(units[rest % 10])
    return " ".join(words)


def rub_words(amount):
    rub = int(round(float(amount or 0)))
    kop = int(round((float(amount or 0) - rub) * 100))
    if kop == 100:
        rub += 1
        kop = 0
    if rub == 0:
        text = "ноль рублей"
    else:
        groups = []
        names = [
            ("", "", "", ""),
            ("тысяча", "тысячи", "тысяч"),
            ("миллион", "миллиона", "миллионов"),
            ("миллиард", "миллиарда", "миллиардов"),
        ]
        index = 0
        rest = rub
        while rest:
            part = rest % 1000
            if part:
                word = triad_words(part, female=index == 1)
                label = plural_ru(part, *names[index]) if index else ""
                groups.append((word + (" " + label if label else "")).strip())
            rest //= 1000
            index += 1
        text = " ".join(reversed(groups))
    text += " %s %02d %s" % (
        plural_ru(rub, "рубль", "рубля", "рублей"),
        kop,
        plural_ru(kop, "копейка", "копейки", "копеек"),
    )
    return text[:1].upper() + text[1:]


def print_shell(title, subtitle, content):
    company = COMPANY
    return f"""<!doctype html>
<html lang="ru"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{html.escape(title)} · {company['name']}</title>
<style>
  :root {{ color-scheme: light; }}
  * {{ box-sizing: border-box; }}
  body {{ margin: 0; background: #eef1f7; color: #1b2030;
    font-family: -apple-system, "Segoe UI", Roboto, Arial, sans-serif; }}
  .sheet {{ width: 210mm; min-height: 297mm; margin: 24px auto; background: #fff;
    padding: 18mm 16mm; box-shadow: 0 18px 50px rgba(21, 31, 55, .16); }}
  .brand {{ display: flex; justify-content: space-between; gap: 24px; border-bottom: 2px solid #1b2030;
    padding-bottom: 14px; }}
  .brand-name {{ font-size: 24px; font-weight: 800; letter-spacing: -.02em; }}
  .brand small {{ display: block; color: #6b7280; font-size: 11px; margin-top: 4px; line-height: 1.5; }}
  .brand-right {{ text-align: right; font-size: 11px; color: #6b7280; line-height: 1.6; }}
  h1 {{ font-size: 20px; margin: 22px 0 4px; }}
  .muted {{ color: #6b7280; font-size: 12px; }}
  table {{ width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 12px; }}
  th, td {{ border: 1px solid #d4d9e4; padding: 8px 10px; text-align: left; vertical-align: top; word-break: break-word; }}
  th {{ background: #f5f7fb; font-weight: 600; }}
  td.num, th.num {{ text-align: right; white-space: nowrap; }}
  .parties {{ margin-top: 18px; }}
  .party {{ margin-bottom: 12px; font-size: 12px; line-height: 1.65; }}
  .section-title {{ margin-top: 18px; font-weight: 700; font-size: 12px; text-transform: uppercase;
    letter-spacing: .08em; color: #4b5563; }}
  .signatures {{ display: flex; justify-content: space-between; gap: 40px; margin-top: 46px; font-size: 12px; }}
  .signature {{ flex: 1; border-top: 1px solid #9aa3b2; padding-top: 6px; color: #6b7280; }}
  .total {{ margin-top: 14px; font-size: 13px; font-weight: 700; }}
  .print-bar {{ position: sticky; top: 0; display: flex; justify-content: center; gap: 10px;
    padding: 12px; background: #1b2030; }}
  .print-bar button {{ font: inherit; padding: 9px 18px; border-radius: 8px; border: 0;
    background: #fff; color: #1b2030; font-weight: 600; cursor: pointer; }}
  .print-bar a {{ font: inherit; padding: 9px 18px; border-radius: 8px; color: #fff;
    text-decoration: none; border: 1px solid rgba(255,255,255,.35); }}
  @media print {{
    body {{ background: #fff; }}
    .print-bar {{ display: none; }}
    .sheet {{ width: auto; min-height: auto; margin: 0; padding: 0; box-shadow: none; }}
    @page {{ size: A4; margin: 16mm; }}
  }}
  @media (max-width: 820px) {{
    .sheet {{ width: auto; min-height: auto; margin: 12px; padding: 16px; }}
    .brand {{ flex-direction: column; gap: 10px; }}
    .brand-right {{ text-align: left; }}
    .brand-name {{ font-size: 20px; }}
    table {{ font-size: 11px; }}
    th, td {{ padding: 6px 7px; }}
    .signatures {{ gap: 18px; margin-top: 30px; }}
  }}
</style></head>
<body>
<div class="print-bar"><button type="button" onclick="window.print()">Печать</button>
  <a href="#/" onclick="window.close();return false;">Закрыть</a></div>
<div class="sheet">
  <div class="brand">
    <div><div class="brand-name">{company['name']}</div>
      <small>{company['legal']} · ИНН {company['inn']} · КПП {company['kpp']}<br>
      {company['address']} · {company['phone']}</small></div>
    <div class="brand-right">{company['email']}<br>ОГРН {company['ogrn']}</div>
  </div>
  <h1>{html.escape(title)}</h1>
  <div class="muted">{html.escape(subtitle)}</div>
  {content}
</div>
</body></html>"""


def print_document(ctx, kind, deal_id):
    conn, user = ctx["conn"], ctx["user"]
    deal_id = int(deal_id)
    deny_driver(user, "Печать документов доступна только офису")
    require(kind in ("contract", "invoice", "waybill", "act"), "Неизвестный документ", 404)
    row = get_deal(conn, user, deal_id)
    client = conn.execute("SELECT * FROM clients WHERE id = ?", (row["client_id"],)).fetchone()
    client_name = client["name"] if client else "Заказчик не указан"
    today = date.today()
    date_text = today.strftime("%d.%m.%Y")
    number = "%04d" % deal_id
    route = "%s → %s" % (row["route_from"], row["route_to"])
    vehicle = row["vehicle"] or "—"
    driver = row["driver"] or "—"
    cargo = row["cargo"] or "Груз по договору"
    amount = float(row["amount"] or 0)
    amount_text = f"{amount:,.2f}".replace(",", " ").replace(".", ",") + " ₽"
    distance = ("%s км" % ("%g" % float(row["distance_km"]))) if row["distance_km"] else "—"
    paid = float(conn.execute(
        "SELECT COALESCE(SUM(amount), 0) AS paid FROM payments WHERE deal_id = ?", (deal_id,)
    ).fetchone()["paid"] or 0)
    debt = max(round(amount - paid, 2), 0)
    paid_text = f"{paid:,.2f}".replace(",", " ").replace(".", ",") + " ₽"
    debt_text = f"{debt:,.2f}".replace(",", " ").replace(".", ",") + " ₽"

    if kind == "contract":
        content = f"""
        <table>
          <tr><th style="width:26%">Номер договора</th><td>ДГ-{number}</td>
              <th style="width:20%">Дата</th><td>{date_text}</td></tr>
          <tr><th>Маршрут</th><td colspan="3">{html.escape(route)}</td></tr>
          <tr><th>Груз</th><td>{html.escape(cargo)}</td>
              <th>Вес / объём</th><td>{row['weight'] or '—'} т / {row['volume'] or '—'} м³</td></tr>
          <tr><th>Транспорт</th><td>{html.escape(vehicle)}</td>
              <th>Водитель</th><td>{html.escape(driver)}</td></tr>
          <tr><th>Погрузка</th><td>{row['pickup_date'] or '—'}</td>
              <th>Доставка</th><td>{row['close_date'] or '—'}</td></tr>
        </table>
        <div class="section-title">Стороны</div>
        <div class="parties">
          <div class="party"><b>Исполнитель:</b> {COMPANY['legal']}, ИНН {COMPANY['inn']},
            адрес: {COMPANY['address']}.</div>
          <div class="party"><b>Заказчик:</b> {html.escape(client_name)}
            {('· ИНН ' + html.escape(client['inn'])) if client and client['inn'] else ''}
            {('· ' + html.escape(client['address'])) if client and client['address'] else ''}.</div>
        </div>
        <div class="section-title">Предмет договора</div>
        <p style="font-size:12px;line-height:1.7">Исполнитель обязуется организовать перевозку груза
          по маршруту {html.escape(route)} ({distance}), а Заказчик — оплатить услуги.
          Стоимость перевозки составляет <b>{html.escape(amount_text)}</b>
          ({html.escape(rub_words(amount))}), НДС не облагается.</p>
        <div class="section-title">Порядок оплаты</div>
        <p style="font-size:12px;line-height:1.7">Оплата производится в течение 5 банковских дней
          с момента получения счёта. Услуга считается оказанной после выгрузки груза и подписания
          транспортной накладной.</p>
        <div class="signatures">
          <div class="signature">Исполнитель · {COMPANY['legal']}</div>
          <div class="signature">Заказчик · {html.escape(client_name)}</div>
        </div>"""
        title, subtitle = "Договор на перевозку груза", "ДГ-%s от %s" % (number, date_text)
    elif kind == "invoice":
        content = f"""
        <table>
          <tr><th style="width:6%">№</th><th>Наименование услуги</th><th class="num" style="width:18%">Сумма</th></tr>
          <tr><td>1</td><td>Перевозка груза «{html.escape(cargo)}» по маршруту {html.escape(route)}</td>
              <td class="num">{amount_text}</td></tr>
          <tr><td colspan="2" class="num"><b>Итого</b></td><td class="num"><b>{amount_text}</b></td></tr>
          <tr><td colspan="2" class="num">Без НДС</td><td class="num">—</td></tr>
          <tr><td colspan="2" class="num"><b>Всего к оплате</b></td><td class="num"><b>{amount_text}</b></td></tr>
        </table>
        <div class="total">Сумма прописью: {html.escape(rub_words(amount))}</div>
        <div class="section-title">Реквизиты для оплаты</div>
        <table>
          <tr><th style="width:26%">Получатель</th><td>{COMPANY['legal']}</td></tr>
          <tr><th>ИНН / КПП</th><td>{COMPANY['inn']} / {COMPANY['kpp']}</td></tr>
          <tr><th>Банк</th><td>{COMPANY['bank']}, БИК {COMPANY['bik']}</td></tr>
          <tr><th>Расчётный счёт</th><td>{COMPANY['account']}</td></tr>
          <tr><th>Корр. счёт</th><td>{COMPANY['corr']}</td></tr>
        </table>
        <div class="parties">
          <div class="party"><b>Плательщик:</b> {html.escape(client_name)}
            {('· ИНН ' + html.escape(client['inn'])) if client and client['inn'] else ''}</div>
        </div>
        <div class="signatures">
          <div class="signature">Руководитель · {COMPANY['legal']}</div>
          <div class="signature">Бухгалтер</div>
        </div>"""
        title, subtitle = "Счёт на оплату", "Счёт № %s от %s" % (number, date_text)
    elif kind == "waybill":
        content = f"""
        <table>
          <tr><th style="width:24%">Организация</th><td colspan="3">{COMPANY['legal']}, ИНН {COMPANY['inn']}</td></tr>
          <tr><th>Маршрут</th><td colspan="3">{html.escape(route)}</td></tr>
          <tr><th>Транспорт</th><td>{html.escape(vehicle)}</td><th style="width:18%">Водитель</th><td>{html.escape(driver)}</td></tr>
          <tr><th>Груз</th><td>{html.escape(cargo)}</td><th>Расстояние</th><td>{distance}</td></tr>
          <tr><th>Погрузка</th><td>{row['pickup_date'] or '—'}</td><th>Доставка</th><td>{row['close_date'] or '—'}</td></tr>
        </table>
        <div class="section-title">Отметки о движении</div>
        <table>
          <tr><th>Событие</th><th>Дата и время</th><th>Показания, км</th><th>Топливо, л</th><th>Подпись</th></tr>
          <tr><td>Погрузка</td><td>{row['loaded_at'] or '—'}</td><td>—</td><td>—</td><td></td></tr>
          <tr><td>Выезд</td><td>{row['departed_at'] or '—'}</td><td>—</td><td>—</td><td></td></tr>
          <tr><td>Выгрузка</td><td>{row['delivered_at'] or '—'}</td>
              <td class="num">{row['actual_mileage'] or '—'}</td>
              <td class="num">{row['fuel_used'] or '—'}</td><td></td></tr>
        </table>
        <div class="section-title">Задание водителю</div>
        <p style="font-size:12px;line-height:1.7">Выполнить перевозку груза по указанному маршруту,
          соблюдать режим труда и отдыха, обеспечить сохранность груза и сдать документы в офис.</p>
        {('<p style="font-size:12px">Отчёт водителя: ' + html.escape(row['trip_report']) + '</p>')
          if row['trip_report'] else ''}
        <div class="signatures">
          <div class="signature">Диспетчер</div>
          <div class="signature">Водитель · {html.escape(driver)}</div>
        </div>"""
        title, subtitle = "Путевой лист", "Путевой лист № %s от %s" % (number, date_text)
    else:
        paid_rows = ""
        if paid > 0:
            paid_rows = f"""
          <tr><td colspan="2" class="num">Оплачено</td><td class="num">{paid_text}</td></tr>
          <tr><td colspan="2" class="num"><b>К оплате</b></td><td class="num"><b>{debt_text}</b></td></tr>"""
        content = f"""
        <table>
          <tr><th style="width:26%">Номер акта</th><td>АКТ-{number}</td>
              <th style="width:20%">Дата</th><td>{date_text}</td></tr>
          <tr><th>Договор</th><td colspan="3">ДГ-{number}</td></tr>
        </table>
        <div class="parties">
          <div class="party"><b>Исполнитель:</b> {COMPANY['legal']}, ИНН {COMPANY['inn']},
            адрес: {COMPANY['address']}.</div>
          <div class="party"><b>Заказчик:</b> {html.escape(client_name)}
            {('· ИНН ' + html.escape(client['inn'])) if client and client['inn'] else ''}
            {('· ' + html.escape(client['address'])) if client and client['address'] else ''}.</div>
        </div>
        <div class="section-title">Выполненные работы</div>
        <table>
          <tr><th style="width:6%">№</th><th>Наименование услуги</th><th class="num" style="width:20%">Сумма</th></tr>
          <tr><td>1</td><td>Перевозка груза «{html.escape(cargo)}» по маршруту {html.escape(route)}
              ({distance}), транспорт: {html.escape(vehicle)}, водитель: {html.escape(driver)}</td>
              <td class="num">{amount_text}</td></tr>
          <tr><td colspan="2" class="num"><b>Итого</b></td><td class="num"><b>{amount_text}</b></td></tr>
          <tr><td colspan="2" class="num">Без НДС</td><td class="num">—</td></tr>{paid_rows}
        </table>
        <div class="total">Сумма прописью: {html.escape(rub_words(amount))}</div>
        <p style="font-size:12px;line-height:1.7">Услуги оказаны полностью и в срок. Заказчик претензий
          по объёму, качеству и срокам оказания услуг не имеет.</p>
        <div class="signatures">
          <div class="signature">Исполнитель · {COMPANY['legal']}</div>
          <div class="signature">Заказчик · {html.escape(client_name)}</div>
        </div>"""
        title, subtitle = "Акт выполненных работ", "АКТ-%s от %s" % (number, date_text)

    page = print_shell(title, subtitle, content)
    return 200, Raw(page.encode("utf-8"), "text/html; charset=utf-8"), [("Content-Disposition", "inline")]


def print_registry(ctx):
    conn, user = ctx["conn"], ctx["user"]
    deny_driver(user, "Печать реестра доступна только офису")
    start, end = parse_period(ctx["query"], default_months=1)
    rows = won_finance_rows(conn, user, start, end)

    def fmt_date(value):
        if not value:
            return "—"
        try:
            return datetime.strptime(value, "%Y-%m-%d").strftime("%d.%m.%Y")
        except ValueError:
            return value

    body_rows = []
    total_amount = total_paid = 0.0
    for index, row in enumerate(rows, start=1):
        amount = float(row["amount"] or 0)
        paid = float(row["paid_total"] or 0)
        total_amount += amount
        total_paid += paid
        body_rows.append(
            "<tr><td class=\"num\">%d</td><td class=\"num\">%s</td><td>%s</td><td>%s</td><td>%s</td>"
            "<td class=\"num\">%s</td><td class=\"num\">%s</td><td class=\"num\">%s</td></tr>" % (
                index,
                fmt_date(row["close_date"]),
                html.escape(row["title"] or ""),
                html.escape(row["client_name"] or "—"),
                html.escape(row["driver"] or "—"),
                f"{amount:,.2f}".replace(",", " ").replace(".", ","),
                f"{paid:,.2f}".replace(",", " ").replace(".", ","),
                f"{max(amount - paid, 0):,.2f}".replace(",", " ").replace(".", ","),
            )
        )
    table = """
      <table>
        <tr><th style="width:5%%">№</th><th>Дата</th><th>Маршрут</th><th>Клиент</th><th>Водитель</th>
            <th class="num">Сумма, ₽</th><th class="num">Оплачено, ₽</th><th class="num">Долг, ₽</th></tr>
        %s
        <tr><td colspan="5" class="num"><b>Итого: %d перевозок</b></td>
            <td class="num"><b>%s</b></td><td class="num"><b>%s</b></td>
            <td class="num"><b>%s</b></td></tr>
      </table>""" % (
        "".join(body_rows) or '<tr><td colspan="8">За период нет доставленных перевозок</td></tr>',
        len(rows),
        f"{total_amount:,.2f}".replace(",", " ").replace(".", ","),
        f"{total_paid:,.2f}".replace(",", " ").replace(".", ","),
        f"{max(total_amount - total_paid, 0):,.2f}".replace(",", " ").replace(".", ","),
    )
    period_text = "%s — %s" % (fmt_date(start), fmt_date(end))
    content = """
      <div class="muted">Период: %s · ответственный: %s</div>
      %s
      <div class="signatures">
        <div class="signature">Руководитель · %s</div>
        <div class="signature">Бухгалтер</div>
      </div>""" % (period_text, html.escape(user["name"]), table, COMPANY["legal"])
    page = print_shell("Реестр перевозок", "Доставленные перевозки за период", content)
    return 200, Raw(page.encode("utf-8"), "text/html; charset=utf-8"), [("Content-Disposition", "inline")]


# ---------------------------------------------------------------- backup

def company_info(ctx):
    deny_driver(ctx["user"], "Реквизиты доступны офису")
    return 200, {"ok": True, "company": COMPANY}


def backup_database(ctx):
    conn, user = ctx["conn"], ctx["user"]
    require(user["role"] == "admin", "Резервная копия доступна администратору", 403)
    handle, path = tempfile.mkstemp(prefix="mslklogistic-", suffix=".db")
    os.close(handle)
    try:
        target = sqlite3.connect(path)
        try:
            conn.backup(target)
        finally:
            target.close()
        with open(path, "rb") as fh:
            data = fh.read()
    finally:
        try:
            os.unlink(path)
        except OSError:
            pass
    stamp = datetime.now().strftime("%Y-%m-%d-%H%M")
    return 200, Raw(data, "application/octet-stream"), [
        ("Content-Disposition", 'attachment; filename="mslklogistic-backup-%s.db"' % stamp),
    ]


# ---------------------------------------------------------------- routing

ROUTES = [
    ("GET", r"^/api/health$", health),
    ("POST", r"^/api/auth/login$", login),
    ("POST", r"^/api/auth/register$", register),
    ("POST", r"^/api/auth/logout$", logout),
    ("GET", r"^/api/auth/me$", me),
    ("GET", r"^/api/users$", list_users),
    ("GET", r"^/api/team$", team_roster),
    ("POST", r"^/api/users$", create_user),
    ("PATCH", r"^/api/users/(\d+)$", update_user),
    ("DELETE", r"^/api/users/(\d+)$", delete_user),
    ("GET", r"^/api/clients$", list_clients),
    ("POST", r"^/api/clients$", create_client),
    ("GET", r"^/api/clients/(\d+)$", client_detail),
    ("PATCH", r"^/api/clients/(\d+)$", update_client),
    ("DELETE", r"^/api/clients/(\d+)$", delete_client),
    ("POST", r"^/api/clients/(\d+)/contacts$", create_contact),
    ("PATCH", r"^/api/contacts/(\d+)$", update_contact),
    ("DELETE", r"^/api/contacts/(\d+)$", delete_contact),
    ("GET", r"^/api/clients/import/template$", import_clients_template),
    ("POST", r"^/api/clients/import$", import_clients),
    ("GET", r"^/api/deals$", list_deals),
    ("POST", r"^/api/deals$", create_deal),
    ("GET", r"^/api/deals/(\d+)$", deal_detail),
    ("PATCH", r"^/api/deals/(\d+)$", update_deal),
    ("DELETE", r"^/api/deals/(\d+)$", delete_deal),
    ("POST", r"^/api/deals/(\d+)/duplicate$", duplicate_deal),
    ("GET", r"^/api/deals/(\d+)/payments$", list_deal_payments),
    ("POST", r"^/api/deals/(\d+)/payments$", add_deal_payment),
    ("DELETE", r"^/api/payments/(\d+)$", delete_payment),
    ("PATCH", r"^/api/deals/(\d+)/trip$", update_trip),
    ("GET", r"^/api/deals/(\d+)/comments$", list_deal_comments),
    ("POST", r"^/api/deals/(\d+)/comments$", add_deal_comment),
    ("GET", r"^/api/deals/(\d+)/files$", list_deal_files),
    ("POST", r"^/api/deals/(\d+)/files$", upload_deal_file),
    ("DELETE", r"^/api/files/(\d+)$", delete_deal_file),
    ("GET", r"^/api/files/(\d+)/raw$", serve_deal_file),
    ("GET", r"^/api/deals/(\d+)/expenses$", list_deal_expenses),
    ("POST", r"^/api/deals/(\d+)/expenses$", add_deal_expense),
    ("DELETE", r"^/api/expenses/(\d+)$", delete_expense),
    ("GET", r"^/api/requests$", list_requests),
    ("POST", r"^/api/requests$", create_request),
    ("GET", r"^/api/requests/(\d+)$", request_detail),
    ("PATCH", r"^/api/requests/(\d+)$", update_request),
    ("DELETE", r"^/api/requests/(\d+)$", delete_request),
    ("POST", r"^/api/requests/(\d+)/convert$", convert_request),
    ("GET", r"^/api/export/deals$", export_deals),
    ("GET", r"^/api/export/clients$", export_clients),
    ("GET", r"^/api/print/(contract|invoice|waybill|act)/(\d+)$", print_document),
    ("GET", r"^/api/print/registry$", print_registry),
    ("GET", r"^/api/reports$", reports),
    ("GET", r"^/api/debtors$", debtors_report),
    ("GET", r"^/api/activity$", list_activity),
    ("GET", r"^/api/search$", global_search),
    ("GET", r"^/api/contractors$", list_contractors),
    ("POST", r"^/api/contractors$", create_contractor),
    ("PATCH", r"^/api/contractors/(\d+)$", update_contractor),
    ("DELETE", r"^/api/contractors/(\d+)$", delete_contractor),
    ("GET", r"^/api/company$", company_info),
    ("GET", r"^/api/backup$", backup_database),
    ("GET", r"^/api/vehicles$", list_vehicles),
    ("POST", r"^/api/vehicles$", create_vehicle),
    ("GET", r"^/api/vehicles/(\d+)$", vehicle_detail),
    ("PATCH", r"^/api/vehicles/(\d+)$", update_vehicle),
    ("DELETE", r"^/api/vehicles/(\d+)$", delete_vehicle),
    ("GET", r"^/api/drivers$", list_drivers),
    ("GET", r"^/api/repairs$", list_repairs),
    ("POST", r"^/api/repairs$", create_repair),
    ("GET", r"^/api/repairs/(\d+)$", repair_detail),
    ("PATCH", r"^/api/repairs/(\d+)$", update_repair),
    ("GET", r"^/api/repairs/(\d+)/files$", list_repair_files),
    ("POST", r"^/api/repairs/(\d+)/files$", upload_repair_file),
    ("GET", r"^/api/repair-files/(\d+)/raw$", serve_repair_file),
    ("GET", r"^/api/repairs/(\d+)/comments$", list_repair_comments),
    ("POST", r"^/api/repairs/(\d+)/comments$", add_repair_comment),
    ("GET", r"^/api/reminders$", reminders),
    ("GET", r"^/api/tasks$", list_tasks),
    ("POST", r"^/api/tasks$", create_task),
    ("PATCH", r"^/api/tasks/(\d+)$", update_task),
    ("DELETE", r"^/api/tasks/(\d+)$", delete_task),
    ("GET", r"^/api/dashboard$", dashboard),
]


def handle(method, path, query, body, token, lang="ru"):
    """Execute an API call. Returns (status, payload, headers)."""
    i18n.set_lang(lang)
    conn = db.connect()
    try:
        user = current_user(conn, token)
        ctx = {"conn": conn, "user": user, "body": body or {}, "query": query, "token": token}
        key = "%s %s" % (method, path)
        for route_method, pattern, fn in ROUTES:
            match = re.match(pattern, path)
            if not match or route_method != method:
                continue
            if key not in PUBLIC_ROUTES and path not in ("/api/auth/me", "/api/auth/logout") and user is None:
                raise ApiError(401, "Требуется вход в систему")
            if user is not None and is_driver(user) and key not in PUBLIC_ROUTES and not any(
                method == allowed_method and re.match(pattern, path)
                for allowed_method, pattern in DRIVER_ROUTES
            ):
                if re.match(r"^/api/(deals/\d+/files|files/\d+(/raw)?)$", path):
                    raise ApiError(403, "Водитель может только загружать документы — просмотр недоступен")
                raise ApiError(403, "Водителю доступны только его рейсы, заявки на ремонт и загрузка документов")
            if user is not None and is_mechanic(user) and key not in PUBLIC_ROUTES and not any(
                method == allowed_method and re.match(pattern, path)
                for allowed_method, pattern in MECHANIC_ROUTES
            ):
                raise ApiError(403, "Механику доступны автопарк и заявки на ремонт")
            result = fn(ctx, *match.groups())
            if len(result) == 2:
                status, payload = result
                headers = []
            else:
                status, payload, headers = result
            return status, payload, headers or []
        raise ApiError(404, "Метод API не найден")
    except ApiError as err:
        raise ApiError(err.status, i18n.error_text(err.message))
    finally:
        conn.close()

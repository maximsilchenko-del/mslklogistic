"""SQLite storage: schema, connection helpers, password hashing, demo seed."""

import hashlib
import hmac
import os
import secrets
import sqlite3
from datetime import date, datetime, timedelta

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BASE_DIR, "data")
DB_PATH = os.path.join(DATA_DIR, "crm.db")

STAGES = ["lead", "qualified", "proposal", "negotiation", "won", "lost"]
ROLES = ["admin", "head", "manager", "driver", "mechanic"]
FIELD_ROLES = ("driver", "mechanic")
PRIORITIES = ["low", "normal", "high"]
TRANSPORT_TYPES = ["ftl", "ltl", "ref", "container"]

REPAIR_STATUSES = {
    "new": "Новая",
    "in_progress": "В работе",
    "done": "Выполнена",
}

REPAIR_URGENCIES = {
    "low": "Не срочно",
    "normal": "Обычная",
    "high": "Срочно",
}

STAGE_TITLES = {
    "lead": "Новые заявки",
    "qualified": "Расчёт",
    "proposal": "Подтверждено",
    "negotiation": "В пути",
    "won": "Доставлено",
    "lost": "Отменено",
}

DOC_KINDS = {
    "contract": "Договор на перевозку",
    "waybill": "Путевой лист",
    "shipping": "Товаросопроводительные документы",
    "certificate": "Свидетельства и удостоверения",
    "invoice": "Счета на оплату",
    "other": "Другие документы",
}

DOC_UPLOAD_DIR = os.path.join(DATA_DIR, "uploads")

OWNER_WORKSPACE = "owner"
DEMO_WORKSPACE = "demo"

DEMO_DRIVER_NAME = "Сергей Иванов"
DEMO_DRIVER_EMAIL = "driver@mslklogistic.local"
DEMO_DRIVER_PASSWORD = "driver123"

DEMO_MECHANIC_NAME = "Виктор Кузнецов"
DEMO_MECHANIC_EMAIL = "mechanic@mslklogistic.local"
DEMO_MECHANIC_PASSWORD = "mechanic123"

TRANSPORT_TITLES = {
    "ftl": "FTL",
    "ltl": "LTL",
    "ref": "Реф",
    "container": "Контейнер",
}

TRANSPORT_LABELS = {
    "ftl": "Отдельная машина",
    "ltl": "Сборный груз",
    "ref": "Рефрижератор",
    "container": "Контейнер",
}


class ApiError(Exception):
    def __init__(self, status, message):
        super().__init__(message)
        self.status = status
        self.message = message


def now_iso():
    return datetime.now().replace(microsecond=0).isoformat()


def connect():
    """Open a fresh connection (one per request keeps threading simple)."""
    os.makedirs(DATA_DIR, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def hash_password(password):
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 150_000)
    return "%s$%s" % (salt, digest.hex())


def verify_password(password, stored):
    try:
        salt, expected = stored.split("$", 1)
    except (ValueError, AttributeError):
        return False
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 150_000)
    return hmac.compare_digest(digest.hex(), expected)


SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('admin', 'head', 'manager', 'driver', 'mechanic')),
    active INTEGER NOT NULL DEFAULT 1,
    workspace TEXT NOT NULL DEFAULT 'demo',
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS clients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    workspace TEXT NOT NULL DEFAULT 'demo',
    name TEXT NOT NULL,
    industry TEXT NOT NULL DEFAULT '',
    inn TEXT NOT NULL DEFAULT '',
    website TEXT NOT NULL DEFAULT '',
    phone TEXT NOT NULL DEFAULT '',
    email TEXT NOT NULL DEFAULT '',
    address TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS contacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    position TEXT NOT NULL DEFAULT '',
    phone TEXT NOT NULL DEFAULT '',
    email TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS deals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    workspace TEXT NOT NULL DEFAULT 'demo',
    title TEXT NOT NULL,
    client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL,
    amount REAL NOT NULL DEFAULT 0,
    currency TEXT NOT NULL DEFAULT 'RUB',
    stage TEXT NOT NULL DEFAULT 'lead',
    owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    route_from TEXT NOT NULL DEFAULT '',
    route_to TEXT NOT NULL DEFAULT '',
    cargo TEXT NOT NULL DEFAULT '',
    weight REAL NOT NULL DEFAULT 0,
    volume REAL NOT NULL DEFAULT 0,
    transport_type TEXT NOT NULL DEFAULT 'ftl',
    pickup_date TEXT NOT NULL DEFAULT '',
    close_date TEXT NOT NULL DEFAULT '',
    driver TEXT NOT NULL DEFAULT '',
    driver_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    vehicle TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    loaded_at TEXT NOT NULL DEFAULT '',
    departed_at TEXT NOT NULL DEFAULT '',
    delivered_at TEXT NOT NULL DEFAULT '',
    actual_mileage INTEGER NOT NULL DEFAULT 0,
    fuel_used REAL NOT NULL DEFAULT 0,
    trip_report TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    workspace TEXT NOT NULL DEFAULT 'demo',
    title TEXT NOT NULL,
    notes TEXT NOT NULL DEFAULT '',
    due_date TEXT NOT NULL DEFAULT '',
    priority TEXT NOT NULL DEFAULT 'normal',
    done INTEGER NOT NULL DEFAULT 0,
    assignee_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    deal_id INTEGER REFERENCES deals(id) ON DELETE SET NULL,
    client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL,
    completed_at TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS activities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    workspace TEXT NOT NULL DEFAULT 'demo',
    actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    kind TEXT NOT NULL,
    text TEXT NOT NULL,
    entity TEXT NOT NULL DEFAULT '',
    entity_id INTEGER,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS deal_files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    deal_id INTEGER NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
    kind TEXT NOT NULL DEFAULT 'other',
    filename TEXT NOT NULL,
    stored_name TEXT NOT NULL,
    mime TEXT NOT NULL,
    size INTEGER NOT NULL DEFAULT 0,
    uploaded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS vehicles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    workspace TEXT NOT NULL DEFAULT 'demo',
    name TEXT NOT NULL,
    plate TEXT NOT NULL DEFAULT '',
    kind TEXT NOT NULL DEFAULT '',
    vin TEXT NOT NULL DEFAULT '',
    year INTEGER NOT NULL DEFAULT 0,
    mileage INTEGER NOT NULL DEFAULT 0,
    service_interval INTEGER NOT NULL DEFAULT 15000,
    next_service TEXT NOT NULL DEFAULT '',
    insurance_until TEXT NOT NULL DEFAULT '',
    inspection_until TEXT NOT NULL DEFAULT '',
    driver_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    notes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS repair_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    workspace TEXT NOT NULL DEFAULT 'demo',
    vehicle_id INTEGER REFERENCES vehicles(id) ON DELETE SET NULL,
    driver_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    urgency TEXT NOT NULL DEFAULT 'normal' CHECK (urgency IN ('low', 'normal', 'high')),
    status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'in_progress', 'done')),
    resolution TEXT NOT NULL DEFAULT '',
    planned_date TEXT NOT NULL DEFAULT '',
    parts TEXT NOT NULL DEFAULT '',
    cost REAL NOT NULL DEFAULT 0,
    mechanic_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    closed_at TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS repair_comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    repair_id INTEGER NOT NULL REFERENCES repair_requests(id) ON DELETE CASCADE,
    author_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    text TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS repair_files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    repair_id INTEGER NOT NULL REFERENCES repair_requests(id) ON DELETE CASCADE,
    filename TEXT NOT NULL,
    stored_name TEXT NOT NULL,
    mime TEXT NOT NULL,
    size INTEGER NOT NULL DEFAULT 0,
    uploaded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS deal_comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    deal_id INTEGER NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
    author_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    kind TEXT NOT NULL DEFAULT 'trip',
    text TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS deal_expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    deal_id INTEGER NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
    kind TEXT NOT NULL DEFAULT 'other' CHECK (kind IN ('fuel', 'toll', 'repair', 'other')),
    amount REAL NOT NULL DEFAULT 0,
    note TEXT NOT NULL DEFAULT '',
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS transport_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    workspace TEXT NOT NULL DEFAULT 'demo',
    client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL,
    route_from TEXT NOT NULL DEFAULT '',
    route_to TEXT NOT NULL DEFAULT '',
    cargo TEXT NOT NULL DEFAULT '',
    transport_type TEXT NOT NULL DEFAULT 'ftl',
    weight REAL NOT NULL DEFAULT 0,
    volume REAL NOT NULL DEFAULT 0,
    distance_km REAL NOT NULL DEFAULT 0,
    cost_price REAL NOT NULL DEFAULT 0,
    markup_pct REAL NOT NULL DEFAULT 0,
    amount REAL NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'new'
        CHECK (status IN ('new', 'calculating', 'sent', 'accepted', 'rejected', 'converted')),
    note TEXT NOT NULL DEFAULT '',
    owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    deal_id INTEGER REFERENCES deals(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    deal_id INTEGER NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
    amount REAL NOT NULL DEFAULT 0,
    paid_at TEXT NOT NULL DEFAULT '',
    note TEXT NOT NULL DEFAULT '',
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS contractors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    workspace TEXT NOT NULL DEFAULT 'demo',
    name TEXT NOT NULL,
    inn TEXT NOT NULL DEFAULT '',
    contact TEXT NOT NULL DEFAULT '',
    phone TEXT NOT NULL DEFAULT '',
    email TEXT NOT NULL DEFAULT '',
    rate REAL NOT NULL DEFAULT 0,
    notes TEXT NOT NULL DEFAULT '',
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_deals_owner ON deals(owner_id);
CREATE INDEX IF NOT EXISTS idx_deals_stage ON deals(stage);
CREATE INDEX IF NOT EXISTS idx_clients_owner ON clients(owner_id);
CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(assignee_id);
CREATE INDEX IF NOT EXISTS idx_activities_created ON activities(created_at);
CREATE INDEX IF NOT EXISTS idx_deal_files_deal ON deal_files(deal_id);
CREATE INDEX IF NOT EXISTS idx_deal_comments_deal ON deal_comments(deal_id);
CREATE INDEX IF NOT EXISTS idx_vehicles_workspace ON vehicles(workspace);
CREATE INDEX IF NOT EXISTS idx_vehicles_driver ON vehicles(driver_id);
CREATE INDEX IF NOT EXISTS idx_repairs_workspace ON repair_requests(workspace, status);
CREATE INDEX IF NOT EXISTS idx_repairs_driver ON repair_requests(driver_id);
CREATE INDEX IF NOT EXISTS idx_repairs_vehicle ON repair_requests(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_repair_comments_repair ON repair_comments(repair_id);
CREATE INDEX IF NOT EXISTS idx_repair_files_repair ON repair_files(repair_id);
CREATE INDEX IF NOT EXISTS idx_deal_expenses_deal ON deal_expenses(deal_id);
CREATE INDEX IF NOT EXISTS idx_requests_workspace ON transport_requests(workspace, status);
CREATE INDEX IF NOT EXISTS idx_requests_owner ON transport_requests(owner_id);
CREATE INDEX IF NOT EXISTS idx_requests_client ON transport_requests(client_id);
CREATE INDEX IF NOT EXISTS idx_payments_deal ON payments(deal_id);
CREATE INDEX IF NOT EXISTS idx_contractors_workspace ON contractors(workspace);
"""


def migrate(conn):
    """Add columns introduced by later versions to existing databases."""
    wanted = {
        "users": {"workspace": "TEXT NOT NULL DEFAULT 'demo'"},
        "clients": {
            "workspace": "TEXT NOT NULL DEFAULT 'demo'",
            "inn": "TEXT NOT NULL DEFAULT ''",
        },
        "deals": {
            "workspace": "TEXT NOT NULL DEFAULT 'demo'",
            "route_from": "TEXT NOT NULL DEFAULT ''",
            "route_to": "TEXT NOT NULL DEFAULT ''",
            "cargo": "TEXT NOT NULL DEFAULT ''",
            "weight": "REAL NOT NULL DEFAULT 0",
            "volume": "REAL NOT NULL DEFAULT 0",
            "transport_type": "TEXT NOT NULL DEFAULT 'ftl'",
            "pickup_date": "TEXT NOT NULL DEFAULT ''",
            "driver": "TEXT NOT NULL DEFAULT ''",
            "driver_id": "INTEGER REFERENCES users(id) ON DELETE SET NULL",
            "vehicle": "TEXT NOT NULL DEFAULT ''",
            "loaded_at": "TEXT NOT NULL DEFAULT ''",
            "departed_at": "TEXT NOT NULL DEFAULT ''",
            "delivered_at": "TEXT NOT NULL DEFAULT ''",
            "actual_mileage": "INTEGER NOT NULL DEFAULT 0",
            "fuel_used": "REAL NOT NULL DEFAULT 0",
            "trip_report": "TEXT NOT NULL DEFAULT ''",
            "distance_km": "REAL NOT NULL DEFAULT 0",
            "request_id": "INTEGER",
            "payment_due": "TEXT NOT NULL DEFAULT ''",
            "contractor_id": "INTEGER",
            "contractor_cost": "REAL NOT NULL DEFAULT 0",
        },
        "tasks": {"workspace": "TEXT NOT NULL DEFAULT 'demo'"},
        "activities": {"workspace": "TEXT NOT NULL DEFAULT 'demo'"},
        "vehicles": {
            "vin": "TEXT NOT NULL DEFAULT ''",
            "year": "INTEGER NOT NULL DEFAULT 0",
            "service_interval": "INTEGER NOT NULL DEFAULT 15000",
            "insurance_until": "TEXT NOT NULL DEFAULT ''",
            "inspection_until": "TEXT NOT NULL DEFAULT ''",
        },
        "repair_requests": {
            "planned_date": "TEXT NOT NULL DEFAULT ''",
            "parts": "TEXT NOT NULL DEFAULT ''",
            "cost": "REAL NOT NULL DEFAULT 0",
        },
    }
    for table, columns in wanted.items():
        existing = {row["name"] for row in conn.execute("PRAGMA table_info(%s)" % table)}
        for name, ddl in columns.items():
            if name not in existing:
                conn.execute("ALTER TABLE %s ADD COLUMN %s %s" % (table, name, ddl))
    conn.execute("CREATE INDEX IF NOT EXISTS idx_deals_driver ON deals(driver_id)")
    try:
        conn.execute(
            "CREATE UNIQUE INDEX IF NOT EXISTS idx_vehicles_plate ON vehicles(workspace, plate) "
            "WHERE plate <> ''"
        )
    except sqlite3.IntegrityError:
        duplicates = conn.execute(
            """SELECT workspace, plate FROM vehicles WHERE plate <> ''
               GROUP BY workspace, plate HAVING COUNT(*) > 1"""
        ).fetchall()
        for dup in duplicates:
            rows = conn.execute(
                "SELECT id FROM vehicles WHERE workspace = ? AND plate = ? ORDER BY id",
                (dup["workspace"], dup["plate"]),
            ).fetchall()
            for row in rows[1:]:
                conn.execute(
                    "UPDATE vehicles SET plate = ? WHERE id = ?",
                    ("%s #%s" % (dup["plate"], row["id"]), row["id"]),
                )
        conn.execute(
            "CREATE UNIQUE INDEX IF NOT EXISTS idx_vehicles_plate ON vehicles(workspace, plate) "
            "WHERE plate <> ''"
        )
    ensure_roles(conn)


def ensure_roles(conn):
    """Rebuild the users table when its role CHECK lacks a newly introduced role."""
    row = conn.execute("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'users'").fetchone()
    ddl = (row["sql"] or "") if row else ""
    if row is None or all(("'" + role + "'") in ddl for role in ROLES):
        return
    conn.commit()
    conn.execute("PRAGMA foreign_keys = OFF")
    try:
        conn.executescript(
            """
            CREATE TABLE users_new (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                email TEXT NOT NULL UNIQUE,
                password TEXT NOT NULL,
                role TEXT NOT NULL CHECK (role IN ('admin', 'head', 'manager', 'driver', 'mechanic')),
                active INTEGER NOT NULL DEFAULT 1,
                workspace TEXT NOT NULL DEFAULT 'demo',
                created_at TEXT NOT NULL
            );
            INSERT INTO users_new (id, name, email, password, role, active, workspace, created_at)
                SELECT id, name, email, password, role, active, workspace, created_at FROM users;
            DROP TABLE users;
            ALTER TABLE users_new RENAME TO users;
            """
        )
        conn.commit()
    finally:
        conn.execute("PRAGMA foreign_keys = ON")


def init_db():
    conn = connect()
    try:
        conn.executescript(SCHEMA)
        migrate(conn)
        conn.commit()
        count = conn.execute("SELECT COUNT(*) AS c FROM users").fetchone()["c"]
        if count == 0:
            seed(conn)
        ensure_owner(conn)
        ensure_demo_driver(conn)
        ensure_demo_mechanic(conn)
        ensure_demo_fleet(conn)
        ensure_demo_repairs(conn)
        ensure_demo_trip_facts(conn)
        ensure_demo_finance(conn)
        ensure_demo_requests(conn)
        ensure_demo_business(conn)
        conn.commit()
    finally:
        conn.close()


def _owner_credentials():
    """Personal account settings come from the environment, never from the repo."""
    name = os.environ.get("MSLK_OWNER_NAME", "").strip()
    email = os.environ.get("MSLK_OWNER_EMAIL", "").strip()
    password = os.environ.get("MSLK_OWNER_PASSWORD", "")
    if not (name and email and password):
        return None
    return name, email, password


def ensure_owner(conn):
    """Optionally keep a personal full-access account in a clean workspace.

    The account is provisioned only when MSLK_OWNER_NAME, MSLK_OWNER_EMAIL and
    MSLK_OWNER_PASSWORD are set, so no personal credentials live in the code.
    """
    credentials = _owner_credentials()
    if credentials is None:
        return
    name, email, password = credentials
    row = conn.execute(
        "SELECT id, workspace FROM users WHERE lower(email) = ? OR name = ?",
        (email, name),
    ).fetchone()
    if row is None:
        conn.execute(
            """INSERT INTO users (name, email, password, role, active, workspace, created_at)
               VALUES (?, ?, ?, 'admin', 1, ?, ?)""",
            (name, email, hash_password(password), OWNER_WORKSPACE, now_iso()),
        )
        return
    if row["workspace"] != OWNER_WORKSPACE:
        conn.execute("UPDATE users SET workspace = ? WHERE id = ?", (OWNER_WORKSPACE, row["id"]))


def ensure_demo_driver(conn):
    """Add a demo driver account and link the seeded demo trips to it."""
    if conn.execute("SELECT 1 FROM users WHERE workspace = ? LIMIT 1", (DEMO_WORKSPACE,)).fetchone() is None:
        return
    row = conn.execute(
        "SELECT id FROM users WHERE role = 'driver' AND workspace = ? LIMIT 1",
        (DEMO_WORKSPACE,),
    ).fetchone()
    if row is not None:
        return
    existing = conn.execute(
        "SELECT id, role, workspace FROM users WHERE lower(email) = ?", (DEMO_DRIVER_EMAIL,)
    ).fetchone()
    if existing is not None:
        if existing["workspace"] != DEMO_WORKSPACE or existing["role"] != "driver":
            return
        driver_id = existing["id"]
    else:
        cur = conn.execute(
            """INSERT INTO users (name, email, password, role, active, workspace, created_at)
               VALUES (?, ?, ?, 'driver', 1, ?, ?)""",
            (DEMO_DRIVER_NAME, DEMO_DRIVER_EMAIL, hash_password(DEMO_DRIVER_PASSWORD),
             DEMO_WORKSPACE, now_iso()),
        )
        driver_id = cur.lastrowid
    conn.execute(
        "UPDATE deals SET driver_id = ?, driver = ? WHERE workspace = ? AND driver_id IS NULL AND driver = ?",
        (driver_id, DEMO_DRIVER_NAME, DEMO_WORKSPACE, DEMO_DRIVER_NAME),
    )


def ensure_demo_mechanic(conn):
    """Add a demo mechanic account that can see the fleet and driver repair requests."""
    if conn.execute("SELECT 1 FROM users WHERE workspace = ? LIMIT 1", (DEMO_WORKSPACE,)).fetchone() is None:
        return
    row = conn.execute(
        "SELECT id FROM users WHERE role = 'mechanic' AND workspace = ? LIMIT 1",
        (DEMO_WORKSPACE,),
    ).fetchone()
    if row is not None:
        return
    existing = conn.execute(
        "SELECT id, role, workspace FROM users WHERE lower(email) = ?", (DEMO_MECHANIC_EMAIL,)
    ).fetchone()
    if existing is not None:
        if existing["workspace"] != DEMO_WORKSPACE or existing["role"] != "mechanic":
            return
        return
    conn.execute(
        """INSERT INTO users (name, email, password, role, active, workspace, created_at)
           VALUES (?, ?, ?, 'mechanic', 1, ?, ?)""",
        (DEMO_MECHANIC_NAME, DEMO_MECHANIC_EMAIL, hash_password(DEMO_MECHANIC_PASSWORD),
         DEMO_WORKSPACE, now_iso()),
    )


def ensure_demo_fleet(conn):
    """Create the demo fleet once and link the main truck to the demo driver."""
    if conn.execute("SELECT 1 FROM users WHERE workspace = ? LIMIT 1", (DEMO_WORKSPACE,)).fetchone() is None:
        return
    driver = conn.execute(
        "SELECT id FROM users WHERE role = 'driver' AND workspace = ? ORDER BY id LIMIT 1",
        (DEMO_WORKSPACE,),
    ).fetchone()
    driver_id = driver["id"] if driver else None
    today = date.today()
    fleet = [
        ("Volvo FH", "А123ВС 77", "Тягач", "YV2RT40A8PB123456", 2023, 412000, 20000, 18, 20, 120, driver_id,
         "Основной тягач, закреплён за Сергеем Ивановым."),
        ("MAN TGX", "К321РТ 99", "Тягач", "WMA06XZZ9MP123457", 2021, 356000, 20000, 32, 45, 25, None,
         "Резервный тягач для дальних рейсов."),
        ("Hyundai HD", "Т222МН 36", "Рефрижератор", "KMFGA17PPNC123458", 2022, 298000, 15000, 9, 12, -4, None,
         "Температурный режим +2…+8 °C, проверять установку перед рейсом."),
        ("Scania R450", "В456ЕК 50", "Контейнеровоз", "YS2R4X20005123459", 2020, 510000, 25000, 45, 8, 60, None,
         "Контейнерные перевозки, платформа 40 футов."),
        ("Газель Next", "Е789КХ 50", "Фургон", "X96330230R0123460", 2024, 164000, 10000, -3, 90, 30, None,
         "Городские доставки, требуется плановое ТО."),
    ]
    stamp = now_iso()
    for (name, plate, kind, vin, year, mileage, interval, service_in, insurance_in,
         inspection_in, linked_driver, notes) in fleet:
        row = conn.execute(
            "SELECT * FROM vehicles WHERE workspace = ? AND plate = ?",
            (DEMO_WORKSPACE, plate),
        ).fetchone()
        next_service = (today + timedelta(days=service_in)).isoformat()
        insurance_until = (today + timedelta(days=insurance_in)).isoformat()
        inspection_until = (today + timedelta(days=inspection_in)).isoformat()
        if row is None:
            conn.execute(
                """INSERT INTO vehicles (workspace, name, plate, kind, vin, year, mileage,
                                         service_interval, next_service, insurance_until, inspection_until,
                                         driver_id, notes, created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (DEMO_WORKSPACE, name, plate, kind, vin, year, mileage, interval,
                 next_service, insurance_until, inspection_until, linked_driver, notes, stamp, stamp),
            )
        else:
            if linked_driver and not row["driver_id"]:
                conn.execute(
                    "UPDATE vehicles SET driver_id = ?, updated_at = ? WHERE id = ?",
                    (linked_driver, stamp, row["id"]),
                )
            if not row["vin"] and not row["insurance_until"] and not row["inspection_until"]:
                conn.execute(
                    """UPDATE vehicles SET vin = ?, year = ?, service_interval = ?, next_service = ?,
                           insurance_until = ?, inspection_until = ?, updated_at = ? WHERE id = ?""",
                    (vin, year, interval, next_service, insurance_until, inspection_until, stamp, row["id"]),
                )


def ensure_demo_repairs(conn):
    """Add a few driver repair requests so the mechanic workspace is not empty."""
    if conn.execute("SELECT 1 FROM repair_requests WHERE workspace = ? LIMIT 1", (DEMO_WORKSPACE,)).fetchone():
        ensure_demo_repair_details(conn)
        return
    driver = conn.execute(
        "SELECT id FROM users WHERE role = 'driver' AND workspace = ? ORDER BY id LIMIT 1",
        (DEMO_WORKSPACE,),
    ).fetchone()
    if driver is None:
        return
    mechanic = conn.execute(
        "SELECT id FROM users WHERE role = 'mechanic' AND workspace = ? ORDER BY id LIMIT 1",
        (DEMO_WORKSPACE,),
    ).fetchone()
    mechanic_id = mechanic["id"] if mechanic else None
    plates = {
        row["plate"]: row["id"]
        for row in conn.execute("SELECT id, plate FROM vehicles WHERE workspace = ?", (DEMO_WORKSPACE,))
    }
    base = datetime.now()
    today = date.today()

    def ts(days=0, hours=0):
        return (base + timedelta(days=days, hours=hours)).replace(microsecond=0).isoformat()

    requests = [
        (plates.get("А123ВС 77"), "Стук в передней подвеске",
         "На неровностях стучит передняя подвеска. Нужен осмотр до выхода на рейс.",
         "high", "in_progress", "", (today + timedelta(days=1)).isoformat(),
         "Стойки стабилизатора, втулки", 8500.0,
         mechanic_id, ts(-1, -3), ts(0, -2), ""),
        (plates.get("Т222МН 36"), "Не держит температуру",
         "Реф установка периодически отключается, температура поднимается выше +6 °C.",
         "normal", "new", "", "", "", 0.0,
         None, ts(0, -5), ts(0, -5), ""),
        (plates.get("Е789КХ 50"), "Задняя дверь не закрывается",
         "Замок задней двери не фиксируется, нужна регулировка.",
         "low", "done", "Отрегулирован замок и заменён ролик направляющей.",
         (today - timedelta(days=3)).isoformat(), "Ролик направляющей, замок", 3200.0,
         mechanic_id, ts(-4, -2), ts(-3, -4), ts(-3, -4)),
    ]
    for (vehicle_id, title, description, urgency, status, resolution, planned_date,
         parts, cost, mechanic_id_value, created, updated, closed) in requests:
        if not vehicle_id:
            continue
        cur = conn.execute(
            """INSERT INTO repair_requests (workspace, vehicle_id, driver_id, title, description,
                   urgency, status, resolution, planned_date, parts, cost, mechanic_id,
                   created_at, updated_at, closed_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (DEMO_WORKSPACE, vehicle_id, driver["id"], title, description, urgency, status,
             resolution, planned_date, parts, cost, mechanic_id_value, created, updated, closed),
        )
        if title == "Стук в передней подвеске" and mechanic_id_value:
            conn.execute(
                """INSERT INTO repair_comments (repair_id, author_id, text, created_at)
                   VALUES (?, ?, ?, ?)""",
                (cur.lastrowid, mechanic_id_value,
                 "Осмотр назначен на завтра. Проверю стойки стабилизатора и втулки.",
                 ts(0, -1)),
            )


def ensure_demo_repair_details(conn):
    """Fill service-history demo fields for databases created before they existed."""
    details = {
        "Стук в передней подвеске": (
            (date.today() + timedelta(days=1)).isoformat(),
            "Стойки стабилизатора, втулки", 8500.0,
        ),
        "Задняя дверь не закрывается": (
            (date.today() - timedelta(days=3)).isoformat(),
            "Ролик направляющей, замок", 3200.0,
        ),
    }
    mechanic = conn.execute(
        "SELECT id FROM users WHERE role = 'mechanic' AND workspace = ? ORDER BY id LIMIT 1",
        (DEMO_WORKSPACE,),
    ).fetchone()
    for title, (planned, parts, cost) in details.items():
        row = conn.execute(
            """SELECT id, cost, parts, planned_date, mechanic_id FROM repair_requests
               WHERE workspace = ? AND title = ? ORDER BY id LIMIT 1""",
            (DEMO_WORKSPACE, title),
        ).fetchone()
        if row is None or row["cost"] or row["parts"]:
            continue
        conn.execute(
            """UPDATE repair_requests SET planned_date = ?, parts = ?, cost = ?,
                   mechanic_id = COALESCE(mechanic_id, ?) WHERE id = ?""",
            (planned, parts, cost, mechanic["id"] if mechanic else None, row["id"]),
        )
    first = conn.execute(
        """SELECT r.id, r.mechanic_id FROM repair_requests r
           WHERE r.workspace = ? AND r.title = 'Стук в передней подвеске' ORDER BY r.id LIMIT 1""",
        (DEMO_WORKSPACE,),
    ).fetchone()
    if first and first["mechanic_id"]:
        has_comment = conn.execute(
            "SELECT 1 FROM repair_comments WHERE repair_id = ? LIMIT 1", (first["id"],)
        ).fetchone()
        if not has_comment:
            conn.execute(
                """INSERT INTO repair_comments (repair_id, author_id, text, created_at)
                   VALUES (?, ?, ?, ?)""",
                (first["id"], first["mechanic_id"],
                 "Осмотр назначен. Проверю стойки стабилизатора и втулки.", now_iso()),
            )


def ensure_demo_trip_facts(conn):
    """Make the demo trip cards show real driver timestamps once."""
    driver = conn.execute(
        "SELECT id FROM users WHERE role = 'driver' AND workspace = ? ORDER BY id LIMIT 1",
        (DEMO_WORKSPACE,),
    ).fetchone()
    if driver is None:
        return
    in_transit = conn.execute(
        """SELECT id, pickup_date FROM deals
           WHERE workspace = ? AND driver_id = ? AND stage = 'negotiation' AND loaded_at = ''
           ORDER BY id LIMIT 1""",
        (DEMO_WORKSPACE, driver["id"]),
    ).fetchone()
    if in_transit:
        loaded_at = ((in_transit["pickup_date"] or date.today().isoformat()) + "T09:00:00")
        conn.execute(
            "UPDATE deals SET loaded_at = ?, trip_report = ? WHERE id = ?",
            (loaded_at, "Погрузка завершена, выехал по маршруту.", in_transit["id"]),
        )
    for row in conn.execute(
        """SELECT id, close_date, departed_at, delivered_at FROM deals
           WHERE workspace = ? AND driver_id = ? AND stage = 'won'
             AND (departed_at = '' OR delivered_at = '')
           ORDER BY id""",
        (DEMO_WORKSPACE, driver["id"]),
    ).fetchall():
        close_date = row["close_date"] or date.today().isoformat()
        conn.execute(
            "UPDATE deals SET departed_at = CASE WHEN departed_at = '' THEN ? ELSE departed_at END, delivered_at = ? WHERE id = ?",
            (close_date + "T09:30:00", close_date + "T18:00:00", row["id"]),
        )


def ensure_demo_finance(conn):
    """Seed fuel, toll and repair expenses for the demo's completed trips."""
    if conn.execute("SELECT 1 FROM users WHERE workspace = ? LIMIT 1", (DEMO_WORKSPACE,)).fetchone() is None:
        return
    existing = conn.execute(
        """SELECT 1 FROM deal_expenses e JOIN deals d ON d.id = e.deal_id
           WHERE d.workspace = ? LIMIT 1""",
        (DEMO_WORKSPACE,),
    ).fetchone()
    if existing:
        return
    seeds = {
        8: [("fuel", 42000, "Дизель, 712 км"), ("toll", 2800, "Платные участки М-11"), ("other", 1500, "Стоянка на выгрузке")],
        10: [("fuel", 21000, "Дизель, 700 км"), ("toll", 1800, "Платные участки")],
        11: [("fuel", 36000, "Дизель, 820 км"), ("toll", 3200, "Платные участки М-7"), ("repair", 8500, "Замена колодок")],
        12: [("fuel", 17000, "Дизель, 690 км"), ("other", 900, "Мойка перед погрузкой")],
        13: [("fuel", 15500, "Дизель, 470 км"), ("toll", 1100, "Платные участки")],
    }
    stamp = now_iso()
    for deal_id, rows in seeds.items():
        deal = conn.execute(
            "SELECT id FROM deals WHERE id = ? AND workspace = ?", (deal_id, DEMO_WORKSPACE)
        ).fetchone()
        if deal is None:
            continue
        for kind, amount, note in rows:
            conn.execute(
                """INSERT INTO deal_expenses (deal_id, kind, amount, note, created_at)
                   VALUES (?, ?, ?, ?, ?)""",
                (deal_id, kind, amount, note, stamp),
            )


def ensure_demo_requests(conn):
    """Seed the incoming request funnel for the demo workspace."""
    if conn.execute("SELECT 1 FROM users WHERE workspace = ? LIMIT 1", (DEMO_WORKSPACE,)).fetchone() is None:
        return
    for deal_id, distance in ((8, 712), (10, 700), (11, 820), (12, 690), (13, 470)):
        conn.execute(
            "UPDATE deals SET distance_km = ? WHERE id = ? AND workspace = ? AND distance_km = 0",
            (distance, deal_id, DEMO_WORKSPACE),
        )
    if conn.execute(
        "SELECT 1 FROM transport_requests WHERE workspace = ? LIMIT 1", (DEMO_WORKSPACE,)
    ).fetchone():
        return
    managers = conn.execute(
        "SELECT id FROM users WHERE workspace = ? AND role IN ('manager', 'head') ORDER BY id",
        (DEMO_WORKSPACE,),
    ).fetchall()
    owners = [row["id"] for row in managers] or [None]

    def client_id(name):
        row = conn.execute(
            "SELECT id FROM clients WHERE workspace = ? AND name = ? LIMIT 1",
            (DEMO_WORKSPACE, name),
        ).fetchone()
        return row["id"] if row else None

    def client_owner(name):
        row = conn.execute(
            """SELECT c.owner_id FROM clients c WHERE c.workspace = ? AND c.name = ? LIMIT 1""",
            (DEMO_WORKSPACE, name),
        ).fetchone()
        return row["owner_id"] if row and row["owner_id"] else None

    stamp = now_iso()
    seeds = [
        # client, from, to, cargo, transport, weight, volume, distance, cost, markup, status, note
        ("Молочный путь", "Москва", "Липецк", "Молочная продукция", "ref", 6, 34, 455, 32000, 25,
         "new", "Нужен реф +2…+6 °C, загрузка утром."),
        ("Финтех Лаб", "Москва", "Тула", "ИТ-оборудование", "ftl", 12, 60, 185, 18000, 30,
         "calculating", "Клиент просит ставку до конца дня."),
        ("Зелёный дом", "Казань", "Самара", "Мебель в упаковке", "ftl", 9, 74, 365, 24000, 22,
         "sent", "Ставка отправлена, ждём подтверждение."),
        ("Атлас Ритейл", "Москва", "Ярославль", "Бытовая техника", "ftl", 14, 82, 270, 26000, 35,
         "accepted", "Согласовано, нужна машина на завтра."),
    ]
    for index, seed in enumerate(seeds):
        (client, route_from, route_to, cargo, transport, weight, volume, distance,
         cost, markup, status, note) = seed
        amount = round(cost * (1 + markup / 100), 2)
        conn.execute(
            """INSERT INTO transport_requests (workspace, client_id, route_from, route_to, cargo,
                   transport_type, weight, volume, distance_km, cost_price, markup_pct, amount,
                   status, note, owner_id, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (DEMO_WORKSPACE, client_id(client), route_from, route_to, cargo, transport,
             weight, volume, distance, cost, markup, amount, status, note,
             client_owner(client) or owners[index % len(owners)], stamp, stamp),
        )
    converted = conn.execute(
        "SELECT id, owner_id FROM deals WHERE id = 11 AND workspace = ?", (DEMO_WORKSPACE,)
    ).fetchone()
    if converted:
        conn.execute(
            """INSERT INTO transport_requests (workspace, client_id, route_from, route_to, cargo,
                   transport_type, weight, volume, distance_km, cost_price, markup_pct, amount,
                   status, note, owner_id, deal_id, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'converted', ?, ?, ?, ?, ?)""",
            (DEMO_WORKSPACE, client_id("СтройМост"), "Москва", "Казань", "Стройматериалы",
             "ftl", 18, 96, 820, 96000, 37.5, 132000, "Заявка преобразована в рейс.",
             converted["owner_id"], converted["id"], stamp, stamp),
        )


def ensure_demo_business(conn):
    """Seed contractors, completed-trip history, payment terms and payments for the demo."""
    if conn.execute("SELECT 1 FROM users WHERE workspace = ? LIMIT 1", (DEMO_WORKSPACE,)).fetchone() is None:
        return
    today = date.today()

    # Contractors ---------------------------------------------------------
    if conn.execute("SELECT 1 FROM contractors WHERE workspace = ? LIMIT 1", (DEMO_WORKSPACE,)).fetchone() is None:
        stamp = now_iso()
        contractor_seeds = [
            ("ТК «Вектор»", "7712345678", "Алексей Гусев", "+7 495 210-70-10", "dispatch@vector-tk.ru",
             45000, "Свои рефы и тенты, работа по заявке за 24 часа.", 1),
            ("ТрансЛайн", "5023456789", "Мария Крылова", "+7 498 555-21-40", "order@transline.ru",
             62000, "Межгород, тралы и контейнеровозы.", 1),
            ("ИП Соколов", "770512345678", "Владимир Соколов", "+7 916 880-44-20", "sokolov@mail.ru",
             38000, "Газели и средние тоннажи по Москве и области.", 1),
        ]
        for name, inn, contact, phone, email, rate, notes, active in contractor_seeds:
            conn.execute(
                """INSERT INTO contractors (workspace, name, inn, contact, phone, email, rate, notes, active, created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (DEMO_WORKSPACE, name, inn, contact, phone, email, rate, notes, active, stamp, stamp),
            )

    owner_by_client = {
        row["name"]: row["owner_id"]
        for row in conn.execute("SELECT name, owner_id FROM clients WHERE workspace = ?", (DEMO_WORKSPACE,))
    }
    client_ids = {
        row["name"]: row["id"]
        for row in conn.execute("SELECT id, name FROM clients WHERE workspace = ?", (DEMO_WORKSPACE,))
    }
    contractors = conn.execute(
        "SELECT id, name, rate FROM contractors WHERE workspace = ? ORDER BY id", (DEMO_WORKSPACE,)
    ).fetchall()
    driver = conn.execute(
        "SELECT id, name FROM users WHERE role = 'driver' AND workspace = ? ORDER BY id LIMIT 1", (DEMO_WORKSPACE,)
    ).fetchone()

    def day(offset):
        return (today + timedelta(days=offset)).isoformat()

    # Completed trips over the past six months so reports have a trend ---
    history = conn.execute(
        "SELECT 1 FROM deals WHERE workspace = ? AND created_at < ? LIMIT 1",
        (DEMO_WORKSPACE, (today - timedelta(days=35)).isoformat()),
    ).fetchone()
    if history is None:
        seeds = [
            (-20, "Москва", "Ростов-на-Дону", "Молочная продукция", 118000, 1080, "ref", "Молочный путь", 3, 46000),
            (-38, "Казань", "Москва", "Мебель в упаковке", 94000, 820, "ftl", "Зелёный дом", 1, 0),
            (-55, "Москва", "Нижний Новгород", "Бытовая техника", 76000, 410, "ftl", "Атлас Ритейл", 3, 0),
            (-70, "Санкт-Петербург", "Казань", "Электроника", 165000, 1520, "ltl", "Кибер Про", 2, 62000),
            (-85, "Москва", "Самара", "Стройматериалы", 210000, 1050, "ftl", "СтройМост", 1, 45000),
            (-100, "Екатеринбург", "Москва", "Оборудование", 240000, 1780, "container", "ТехноПарк", 2, 0),
            (-118, "Москва", "Ростов-на-Дону", "Медикаменты", 118000, 1080, "ref", "МедЛайн", 3, 0),
            (-135, "Новосибирск", "Омск", "Стройматериалы", 88000, 650, "ftl", "СтройМост", 1, 38000),
            (-150, "Москва", "Тула", "ИТ-оборудование", 52000, 185, "ftl", "Финтех Лаб", 3, 0),
            (-165, "Воронеж", "Москва", "Продукты питания", 72000, 500, "ref", "Молочный путь", 1, 0),
        ]
        vehicle_names = {
            "ftl": "Volvo FH, А123ВС 77",
            "ref": "Реф Hyundai, Т222МН 36",
            "container": "Контейнеровоз Scania R450, В456ЕК 50",
            "ltl": "Mercedes Actros, Е777КХ 50",
        }
        for offset, route_from, route_to, cargo, amount, distance, transport, client, contractor_index, cost in seeds:
            client_id = client_ids.get(client)
            if not client_id:
                continue
            close_date = day(offset)
            pickup_date = day(offset - 2)
            contractor = contractors[(contractor_index - 1) % len(contractors)] if contractors and contractor_index else None
            title = "%s → %s" % (route_from, route_to)
            cur = conn.execute(
                """INSERT INTO deals (workspace, title, client_id, amount, currency, stage, owner_id,
                       route_from, route_to, cargo, weight, volume, distance_km, transport_type,
                       pickup_date, close_date, driver, driver_id, vehicle, notes,
                       payment_due, contractor_id, contractor_cost, created_at, updated_at)
                   VALUES (?, ?, ?, ?, 'RUB', 'won', ?, ?, ?, ?, 10, 40, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (DEMO_WORKSPACE, title, client_id, amount, owner_by_client.get(client),
                 route_from, route_to, cargo, distance, transport, pickup_date, close_date,
                 driver["name"] if driver else "", driver["id"] if driver else None,
                 vehicle_names.get(transport, ""), "Перевозка выполнена, документы закрыты.",
                 day(offset + 10), contractor["id"] if contractor else None, cost,
                 close_date + "T10:00:00", close_date + "T19:00:00"),
            )
            deal_id = cur.lastrowid
            conn.execute(
                "UPDATE deals SET loaded_at = ?, departed_at = ?, delivered_at = ? WHERE id = ?",
                (pickup_date + "T08:30:00", pickup_date + "T10:00:00", close_date + "T18:00:00", deal_id),
            )
            fuel = round(amount * 0.34 / 100) * 100
            toll = round(amount * 0.02 / 100) * 100
            conn.execute(
                """INSERT INTO deal_expenses (deal_id, kind, amount, note, created_at)
                   VALUES (?, 'fuel', ?, ?, ?)""",
                (deal_id, fuel, "Дизель, %s км" % distance, close_date + "T20:00:00"),
            )
            if toll:
                conn.execute(
                    """INSERT INTO deal_expenses (deal_id, kind, amount, note, created_at)
                       VALUES (?, 'toll', ?, 'Платные участки', ?)""",
                    (deal_id, toll, close_date + "T20:00:00"),
                )

    # Payment terms and received payments for completed trips -----------
    paid_exists = conn.execute(
        "SELECT 1 FROM payments p JOIN deals d ON d.id = p.deal_id WHERE d.workspace = ? LIMIT 1",
        (DEMO_WORKSPACE,),
    ).fetchone()
    if paid_exists is None:
        won = conn.execute(
            """SELECT d.id, d.amount, d.close_date, d.payment_due, d.owner_id, c.name AS client_name
               FROM deals d LEFT JOIN clients c ON c.id = d.client_id
               WHERE d.workspace = ? AND d.stage = 'won' ORDER BY d.close_date DESC""",
            (DEMO_WORKSPACE,),
        ).fetchall()
        stamp = now_iso()
        for row in won:
            amount = float(row["amount"] or 0)
            close_date = row["close_date"] or today.isoformat()
            if not row["payment_due"]:
                due = (date.fromisoformat(close_date) + timedelta(days=10)).isoformat()
                conn.execute("UPDATE deals SET payment_due = ? WHERE id = ?", (due, row["id"]))
            if amount <= 0:
                continue
            paid_at = (date.fromisoformat(close_date) + timedelta(days=2)).isoformat()
            if row["client_name"] == "Молочный путь" and amount == 68000:
                continue  # kept unpaid on purpose: shows up in debtors
            if row["client_name"] == "СтройМост" and amount == 132000:
                conn.execute(
                    """INSERT INTO payments (deal_id, amount, paid_at, note, created_at)
                       VALUES (?, ?, ?, 'Частичная оплата по счёту', ?)""",
                    (row["id"], 60000, paid_at, stamp),
                )
                continue
            conn.execute(
                """INSERT INTO payments (deal_id, amount, paid_at, note, created_at)
                   VALUES (?, ?, ?, 'Оплата по счёту', ?)""",
                (row["id"], amount, paid_at, stamp),
            )


def add_activity(conn, actor_id, kind, text, entity="", entity_id=None, created_at=None):
    actor = conn.execute("SELECT workspace FROM users WHERE id = ?", (actor_id,)).fetchone()
    workspace = actor["workspace"] if actor else DEMO_WORKSPACE
    conn.execute(
        "INSERT INTO activities (workspace, actor_id, kind, text, entity, entity_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        (workspace, actor_id, kind, text, entity, entity_id, created_at or now_iso()),
    )


def seed(conn):
    today = date.today()
    base = datetime.now()

    def dt(days=0, hours=0, minutes=0):
        return (base + timedelta(days=days, hours=hours, minutes=minutes)).replace(microsecond=0).isoformat()

    def day(offset):
        return (today + timedelta(days=offset)).isoformat()

    users = [
        ("Анна Смирнова", "admin@mslklogistic.local", "admin123", "admin", dt(-120)),
        ("Игорь Волков", "head@mslklogistic.local", "head123", "head", dt(-110)),
        ("Ольга Ким", "manager@mslklogistic.local", "manager123", "manager", dt(-95)),
        ("Павел Орлов", "pavel@mslklogistic.local", "manager123", "manager", dt(-80)),
    ]
    user_ids = {}
    for name, email, password, role, created in users:
        cur = conn.execute(
            "INSERT INTO users (name, email, password, role, active, created_at) VALUES (?, ?, ?, ?, 1, ?)",
            (name, email, hash_password(password), role, created),
        )
        user_ids[email] = cur.lastrowid

    olga = user_ids["manager@mslklogistic.local"]
    pavel = user_ids["pavel@mslklogistic.local"]
    igor = user_ids["head@mslklogistic.local"]
    anna = user_ids["admin@mslklogistic.local"]

    clients = [
        ("ТехноПарк", "Производство техники", "7701234567", "tehnopark.ru", "+7 495 120-45-67", "sales@tehnopark.ru", "Москва, Ленинградский пр-т, 36", "Договор № 14/25, отсрочка 14 дней.", olga, dt(-70)),
        ("МедЛайн", "Фармацевтика", "7702345678", "medline.ru", "+7 495 771-02-33", "b2b@medline.ru", "Москва, ул. Профсоюзная, 42", "Реф +2…+8 °C, лицензия на перевозку медикаментов.", olga, dt(-58)),
        ("Атлас Ритейл", "Ритейл", "7703456789", "atlas-retail.ru", "+7 495 909-33-44", "crm@atlas-retail.ru", "Москва, ул. Тверская, 18", "Поставки в 12 региональных складов.", olga, dt(-39)),
        ("СтройМост", "Стройматериалы", "5404567890", "stroymost.ru", "+7 383 222-66-88", "info@stroymost.ru", "Новосибирск, Красный пр-т, 77", "Крупные партии, нужны машины с боковой загрузкой.", pavel, dt(-27)),
        ("Зелёный дом", "Строительство", "1655567890", "zelenydom.ru", "+7 843 210-55-01", "office@zelenydom.ru", "Казань, ул. Баумана, 12", "", pavel, dt(-45)),
        ("Кибер Про", "Электроника", "7806567890", "cyberpro.ru", "+7 812 555-90-12", "hello@cyberpro.ru", "Санкт-Петербург, Невский пр-т, 60", "Хрупкий груз, обязательная страховка.", olga, dt(-33)),
        ("Молочный путь", "Продукты питания", "3667567890", "molput.ru", "+7 473 210-33-90", "logistics@molput.ru", "Воронеж, ул. Кирова, 4", "Реф +2…+4 °C, ежедневные отгрузки.", pavel, dt(-22)),
        ("Гарант Страхование", "Страхование", "7708567890", "garant-ins.ru", "+7 495 140-22-56", "b2b@garant-ins.ru", "Москва, ул. Пятницкая, 24", "", olga, dt(-19)),
        ("Восток Энерго", "Энергетика", "7709567890", "vostok-energo.ru", "+7 495 880-17-90", "office@vostok-energo.ru", "Москва, ул. Арбат, 10", "Негабаритные поставки на площадки.", pavel, dt(-9)),
        ("Финтех Лаб", "ИТ-оборудование", "7710567890", "fintechlab.ru", "+7 495 660-78-90", "partners@fintechlab.ru", "Москва, Пресненская наб., 8", "", pavel, dt(-52)),
    ]
    client_ids = {}
    for name, industry, inn, site, phone, email, address, notes, owner, created in clients:
        cur = conn.execute(
            """INSERT INTO clients (name, industry, inn, website, phone, email, address, notes, owner_id, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (name, industry, inn, site, phone, email, address, notes, owner, created, created),
        )
        client_ids[name] = cur.lastrowid

    contacts = [
        ("ТехноПарк", "Дмитрий Соколов", "Директор по закупкам", "+7 916 100-20-30", "sokolov@tehnopark.ru"),
        ("ТехноПарк", "Мария Белова", "Логист", "+7 916 100-20-31", "belova@tehnopark.ru"),
        ("МедЛайн", "Елена Фомина", "Операционный директор", "+7 916 770-12-34", "fomina@medline.ru"),
        ("МедЛайн", "Светлана Юрьева", "Начальник склада", "+7 916 770-12-35", "yuryeva@medline.ru"),
        ("Атлас Ритейл", "Сергей Лебедев", "Директор по логистике", "+7 903 909-11-22", "lebedev@atlas-retail.ru"),
        ("СтройМост", "Виктор Панов", "Коммерческий директор", "+7 913 222-10-10", "panov@stroymost.ru"),
        ("Зелёный дом", "Наталья Ершова", "Руководитель отдела снабжения", "+7 917 210-44-55", "ershova@zelenydom.ru"),
        ("Кибер Про", "Ирина Ковалёва", "Менеджер по ВЭД", "+7 921 555-33-77", "kovaleva@cyberpro.ru"),
        ("Молочный путь", "Андрей Морозов", "Начальник отдела логистики", "+7 473 210-44-12", "morozov@molput.ru"),
        ("Гарант Страхование", "Алина Романова", "Директор по снабжению", "+7 915 140-78-12", "romanova@garant-ins.ru"),
        ("Восток Энерго", "Олег Тарасов", "Начальник транспортного отдела", "+7 905 880-45-60", "tarasov@vostok-energo.ru"),
        ("Финтех Лаб", "Кирилл Данилов", "CTO", "+7 926 330-80-40", "danilov@fintechlab.ru"),
    ]
    for client, name, position, phone, email in contacts:
        conn.execute(
            "INSERT INTO contacts (client_id, name, position, phone, email, created_at) VALUES (?, ?, ?, ?, ?, ?)",
            (client_ids[client], name, position, phone, email, dt(-20)),
        )

    deals = [
        ("A1", "Москва", "Казань", "Стройматериалы, 18 паллет", 18, 60, "ftl", day(5), day(7), "СтройМост", 126_000, "lead", pavel, "", "", "Заявка с сайта, уточнить габариты и адрес выгрузки.", dt(-2, -8)),
        ("A2", "Москва", "Воронеж", "Молочная продукция", 6, 24, "ref", day(3), day(4), "Молочный путь", 68_000, "lead", olga, "", "", "Нужен реф +2…+4 °C, вернуться с тарифом.", dt(-3, -9)),
        ("B1", "Москва", "Екатеринбург", "Бытовая техника", 14, 52, "ftl", day(6), day(9), "Атлас Ритейл", 205_000, "qualified", pavel, "", "", "Считаем две машины, ждём подтверждение объёма.", dt(-2, -5)),
        ("B2", "Санкт-Петербург", "Москва", "Медикаменты", 4.5, 18, "ref", day(2), day(3), "МедЛайн", 96_000, "qualified", olga, "", "", "Требуется температурный режим и пломбы.", dt(-1, -6)),
        ("C1", "Москва", "Новосибирск", "Стройматериалы", 20, 68, "ftl", day(3), day(10), "СтройМост", 310_000, "proposal", pavel, "Сергей Иванов", "Volvo FH, А123ВС 77", "Согласовали ставку, ждём заявку на погрузку.", dt(-1, -2)),
        ("C2", "Казань", "Москва", "Мебель в упаковке", 9, 48, "ftl", day(4), day(6), "Зелёный дом", 89_000, "proposal", olga, "Дмитрий Петров", "MAN TGX, К321РТ 99", "Нужна машина с боковой загрузкой.", dt(-3, -4)),
        ("C3", "Москва", "Краснодар", "Продукты питания", 11, 36, "ref", day(2), day(5), "Молочный путь", 72_000, "proposal", olga, "Алексей Соколов", "Реф Hyundai, Т222МН 36", "Договор подписан, реф +2 °C.", dt(-2, -1)),
        ("D1", "Москва", "Санкт-Петербург", "Электроника, 12 паллет", 8.4, 42, "ftl", day(-1), day(1), "Кибер Про", 185_000, "negotiation", olga, "Сергей Иванов", "Volvo FH, А123ВС 77", "Машина на маршруте, доставка завтра до 12:00.", dt(-1, -3)),
        ("D2", "Москва", "Екатеринбург", "ИТ-оборудование", 12, 44, "container", day(-2), day(2), "Финтех Лаб", 240_000, "negotiation", pavel, "Михаил Орлов", "Контейнеровоз Scania R450, В456ЕК 50", "Контейнер 40 футов, выгрузка на складе клиента.", dt(-2, -5)),
        ("E1", "Москва", "Санкт-Петербург", "Медикаменты", 4.5, 18, "ref", day(-5), day(-4), "МедЛайн", 96_000, "won", olga, "Дмитрий Петров", "Реф Hyundai, Т222МН 36", "Доставлено, документы отправлены.", dt(-4, -6)),
        ("E2", "Москва", "Казань", "Стройматериалы", 18, 60, "ftl", day(-7), day(-6), "СтройМост", 132_000, "won", pavel, "Алексей Соколов", "MAN TGX, К321РТ 99", "Выгрузка без замечаний.", dt(-6, -2)),
        ("E3", "Санкт-Петербург", "Москва", "Электроника", 7.2, 30, "ltl", day(-9), day(-8), "Кибер Про", 58_000, "won", olga, "Сергей Иванов", "Volvo FH, А123ВС 77", "Сборный груз, доставлен по графику.", dt(-8, -4)),
        ("E4", "Москва", "Воронеж", "Молочная продукция", 6, 24, "ref", day(-12), day(-11), "Молочный путь", 68_000, "won", pavel, "Дмитрий Петров", "Реф Hyundai, Т222МН 36", "Продление договора на месяц.", dt(-11, -5)),
        ("F1", "Москва", "Новосибирск", "Оборудование", 16, 55, "ftl", day(-3), day(6), "ТехноПарк", 115_000, "lost", olga, "", "", "Клиент выбрал другого перевозчика.", dt(-15, -3)),
    ]
    deal_ids = {}
    for key, route_from, route_to, cargo, weight, volume, transport, pickup, delivery, client, amount, stage, owner, driver, vehicle, notes, updated in deals:
        created = dt(-12, -4)
        title = "%s → %s" % (route_from, route_to)
        cur = conn.execute(
            """INSERT INTO deals (title, client_id, amount, currency, stage, owner_id, route_from, route_to, cargo, weight, volume,
                                  transport_type, pickup_date, close_date, driver, vehicle, notes, created_at, updated_at)
               VALUES (?, ?, ?, 'RUB', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (title, client_ids[client], amount, stage, owner, route_from, route_to, cargo, weight, volume,
             transport, pickup, delivery, driver, vehicle, notes, created, updated),
        )
        deal_ids[key] = cur.lastrowid

    tasks = [
        ("Согласовать ставку по Новосибирску", "Клиент просит скидку 3% за обратную загрузку.", day(0), "high", 0, anna, "C1", "СтройМост"),
        ("Планёрка по загрузке парка", "Разобрать рейсы на неделю и свободные машины.", day(1), "normal", 0, igor, "D1", "Кибер Про"),
        ("Подтвердить погрузку в Кибер Про", "Согласовать время подачи машины на склад.", day(0), "high", 0, olga, "D1", "Кибер Про"),
        ("Отправить тариф на Воронеж", "Посчитать реф и обратную загрузку.", day(0), "normal", 0, olga, "A2", "Молочный путь"),
        ("Проверить документы по доставке в СПб", "ТТН, пломбы и счёт по рейсу МедЛайн.", day(-1), "high", 0, olga, "E1", "МедЛайн"),
        ("Выставить счёт Молочному пути", "Закрыть рейс в Воронеж и отправить акт.", day(3), "low", 0, olga, "E4", "Молочный путь"),
        ("Позвонить в СтройМост по объёму", "Уточнить возможность второй машины.", day(0), "normal", 0, pavel, "C1", "СтройМост"),
        ("Забронировать машину на Новосибирск", "Найти трал под 20 тонн на четверг.", day(2), "normal", 0, pavel, "C1", "СтройМост"),
        ("Сверить пломбы по контейнеру", "Проверить номера перед выгрузкой в Екатеринбурге.", day(1), "high", 0, pavel, "D2", "Финтех Лаб"),
        ("Закрыть документы по рейсу в Казань", "Акт и счёт отправлены клиенту.", day(-2), "low", 1, olga, "E2", "СтройМост"),
    ]
    for title, notes, due, priority, done, assignee, deal_key, client in tasks:
        conn.execute(
            """INSERT INTO tasks (title, notes, due_date, priority, done, assignee_id, deal_id, client_id, created_at, completed_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (title, notes, due, priority, done, assignee, deal_ids[deal_key],
             client_ids[client], dt(-6), dt(-5) if done else ""),
        )

    feed = [
        (pavel, "won", "Перевозка «Санкт-Петербург → Москва» перешла на этап «Доставлено»", "deal", deal_ids["E3"], dt(0, -2)),
        (olga, "note", "Добавлен контакт Елена Фомина в «МедЛайн»", "client", client_ids["МедЛайн"], dt(-1, -3)),
        (igor, "note", "Парк загружен на 86% на этой неделе", "", None, dt(-1, -8)),
        (olga, "deal", "Перевозка «Москва → Санкт-Петербург» перешла на этап «В пути»", "deal", deal_ids["D1"], dt(-2, -3)),
        (pavel, "task", "Задача «Позвонить в СтройМост по объёму» назначена на сегодня", "task", None, dt(-2, -6)),
        (anna, "user", "Павел Орлов получил доступ менеджера", "user", pavel, dt(-4, -2)),
        (pavel, "won", "Перевозка «Москва → Казань» перешла на этап «Доставлено»", "deal", deal_ids["E2"], dt(-4, -6)),
        (olga, "client", "Добавлен клиент «Молочный путь»", "client", client_ids["Молочный путь"], dt(-9, -4)),
    ]
    for actor, kind, text, entity, entity_id, created in feed:
        add_activity(conn, actor, kind, text, entity, entity_id, created)


def user_dict(row):
    if row is None:
        return None
    return {
        "id": row["id"],
        "name": row["name"],
        "email": row["email"],
        "role": row["role"],
        "active": bool(row["active"]),
        "workspace": row["workspace"],
        "created_at": row["created_at"],
    }

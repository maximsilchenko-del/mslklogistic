"""Server-side Russian → English translations for generated strings.

The UI is Russian by default. When the client sends ``X-Lang: en`` the request
handler switches the language for the current thread and every server-generated
message (API errors, reminders, activity feed, status comments) is produced in
English.
"""

import re
from contextvars import ContextVar

_lang = ContextVar("mslk_lang", default="ru")


def set_lang(value):
    text = str(value or "").strip().lower()
    _lang.set("en" if text.startswith("en") else "ru")


def current_lang():
    return _lang.get()


def is_en():
    return _lang.get() == "en"


def pick(ru, en):
    """Return the English string in English mode, the Russian one otherwise."""
    return en if is_en() else ru


# ------------------------------------------------------------------ dictionaries

STAGE_EN = {
    "Новые заявки": "New requests",
    "Расчёт": "Quote",
    "Подтверждено": "Confirmed",
    "В пути": "In transit",
    "Доставлено": "Delivered",
    "Отменено": "Cancelled",
}

REPAIR_STATUS_EN = {
    "Новая": "New",
    "В работе": "In progress",
    "Выполнена": "Done",
}

REQUEST_STATUS_EN = {
    "Новая": "New",
    "Расчёт": "Quote",
    "Отправлено": "Sent",
    "Принято": "Accepted",
    "Отклонено": "Rejected",
    "В рейсе": "In trip",
}

EXPENSE_KIND_EN = {
    "Топливо": "Fuel",
    "Платные дороги": "Tolls",
    "Ремонт": "Repair",
    "Прочее": "Other",
}

DOC_KIND_EN = {
    "Договор на перевозку": "Transport contract",
    "Путевой лист": "Waybill",
    "Товаросопроводительные документы": "Shipping documents",
    "Свидетельства и удостоверения": "Certificates and permits",
    "Счета на оплату": "Invoices",
    "Другие документы": "Other documents",
}

ROLE_EN = {
    "Администратор": "Administrator",
    "Руководитель": "Head",
    "Менеджер": "Manager",
    "Водитель": "Driver",
    "Механик": "Mechanic",
}

EVENT_EN = {
    "Отмечена погрузка": "Loading marked",
    "Отмечен выезд с погрузки": "Departed from loading",
    "Отмечена выгрузка, рейс завершён": "Unloading marked, trip completed",
}

ERROR_EN = {
    # shared / access
    "Неизвестный этап перевозки": "Unknown trip stage",
    "Неизвестный тип перевозки": "Unknown transport type",
    "Неизвестный приоритет задачи": "Unknown task priority",
    "Клиент не найден": "Client not found",
    "Нет доступа к этому клиенту": "No access to this client",
    "Перевозка не найдена": "Trip not found",
    "Нет доступа к этой перевозке": "No access to this trip",
    "Задача не найдена": "Task not found",
    "Нет доступа к этой задаче": "No access to this task",
    "Ответственный не найден": "Assignee not found",
    "Недостаточно прав": "Insufficient permissions",
    "Требуется вход в систему": "Sign-in required",
    "Метод API не найден": "API method not found",
    "Водитель может только загружать документы — просмотр недоступен":
        "Drivers can only upload documents — viewing is unavailable",
    "Водителю доступны только его рейсы, заявки на ремонт и загрузка документов":
        "Drivers can access only their trips, repair requests and document uploads",
    "Механику доступны автопарк и заявки на ремонт":
        "The mechanic can access the fleet and repair requests",
    # auth
    "Введите логин и пароль": "Enter your login and password",
    "Неверный логин или пароль": "Incorrect login or password",
    "Укажите имя": "Enter a name",
    "Имя слишком короткое": "Name is too short",
    "Укажите корректный email": "Enter a valid email",
    "Пароль должен быть не короче 6 символов": "Password must be at least 6 characters",
    "Аккаунт с таким email уже существует": "An account with this email already exists",
    "Это имя уже занято — укажите фамилию или другой логин":
        "This name is already taken — add a surname or choose another login",
    # users
    "Только администратор может создавать пользователей": "Only an administrator can create users",
    "Неизвестная роль": "Unknown role",
    "Пользователь с таким email уже существует": "A user with this email already exists",
    "Только администратор может менять пользователей": "Only an administrator can edit users",
    "Пользователь не найден": "User not found",
    "Личный аккаунт нельзя отключить или понизить":
        "The personal account cannot be disabled or downgraded",
    "Нельзя отключить или понизить собственную учётную запись":
        "You cannot disable or downgrade your own account",
    "В системе должен остаться хотя бы один активный администратор":
        "At least one active administrator must remain",
    "Сначала передайте клиентов, перевозки и задачи другому сотруднику":
        "Reassign this employee’s clients, trips and tasks first",
    "Только администратор может удалять пользователей": "Only an administrator can delete users",
    "Нельзя удалить собственную учётную запись": "You cannot delete your own account",
    "Личный аккаунт нельзя удалить": "The personal account cannot be deleted",
    "В системе должен остаться хотя бы один администратор": "At least one administrator must remain",
    # clients and contacts
    "Укажите название клиента": "Enter the client name",
    "ИНН должен содержать 10 или 12 цифр": "INN must contain 10 or 12 digits",
    "К клиенту привязаны перевозки других менеджеров": "This client has trips owned by other managers",
    "Укажите имя контакта": "Enter the contact name",
    "Контакт не найден": "Contact not found",
    "Нет доступа к этому контакту": "No access to this contact",
    # deals
    "Укажите город отправления": "Enter the origin city",
    "Укажите город назначения": "Enter the destination city",
    "Выберите клиента": "Select a client",
    "Стоимость не может быть отрицательной": "Amount cannot be negative",
    "Вес не может быть отрицательным": "Weight cannot be negative",
    "Объём не может быть отрицательным": "Volume cannot be negative",
    "Расстояние не может быть отрицательным": "Distance cannot be negative",
    "Дата погрузки позже даты доставки": "Pickup date is later than the delivery date",
    "Водитель не найден": "Driver not found",
    "Подрядчик не найден": "Contractor not found",
    "Стоимость субподряда не может быть отрицательной": "Subcontract cost cannot be negative",
    # files
    "Файл не найден": "File not found",
    "Не удалось прочитать файл — повторите загрузку": "Could not read the file — try uploading again",
    "Файл пустой или повреждён": "The file is empty or corrupted",
    "Фото больше 8 МБ — уменьшите и повторите": "The photo exceeds 8 MB — reduce it and try again",
    "Поддерживаются фото в формате JPEG, PNG, WebP или GIF":
        "Supported photo formats: JPEG, PNG, WebP or GIF",
    "Документ не найден": "Document not found",
    "Нет доступа к этому документу": "No access to this document",
    "Неизвестная категория документа": "Unknown document category",
    "Файл не найден на диске": "File is missing on disk",
    # expenses and payments
    "Неизвестная статья расходов": "Unknown expense category",
    "Укажите сумму расхода": "Enter the expense amount",
    "Сумма расхода слишком большая": "The expense amount is too large",
    "Расход не найден": "Expense not found",
    "Укажите сумму оплаты": "Enter the payment amount",
    "Сумма оплаты слишком большая": "The payment amount is too large",
    "Сначала укажите стоимость перевозки": "Set the trip amount first",
    "Сумма оплат превышает стоимость перевозки": "Payments exceed the trip amount",
    "Оплата не найдена": "Payment not found",
    # contractors
    "Укажите название подрядчика": "Enter the contractor name",
    "ИНН подрядчика должен содержать 10 или 12 цифр": "Contractor INN must contain 10 or 12 digits",
    "Ставка не может быть отрицательной": "Rate cannot be negative",
    "Подрядчик указан в перевозках — отключите его вместо удаления":
        "This contractor is used in trips — deactivate it instead",
    # requests
    "Заявка не найдена": "Request not found",
    "Нет доступа к этой заявке": "No access to this request",
    "Заявка уже преобразована в рейс": "The request has already been converted to a trip",
    "Проверьте вес, объём и расстояние": "Check weight, volume and distance",
    "Себестоимость не может быть отрицательной": "Cost price cannot be negative",
    "Наценка должна быть от 0 до 1000%": "Markup must be between 0 and 1000%",
    "Неизвестный статус заявки": "Unknown request status",
    "Заявка уже преобразована в рейс — удалите сам рейс":
        "The request has been converted — delete the trip itself",
    "Выберите клиента в заявке перед преобразованием в рейс":
        "Select a client in the request before converting it to a trip",
    # trip execution and comments
    "Напишите комментарий": "Enter a comment",
    "Отметки о рейсе ставит водитель": "Trip checkpoints are marked by the driver",
    "Неизвестное действие рейса": "Unknown trip action",
    "Рейс отменён — отметки недоступны": "The trip is cancelled — checkpoints are unavailable",
    "Рейс уже завершён": "The trip is already completed",
    "Погрузка уже отмечена": "Loading is already marked",
    "Сначала отметьте погрузку": "Mark loading first",
    "Выезд уже отмечен": "Departure is already marked",
    "Сначала отметьте выезд": "Mark departure first",
    "Выгрузка уже отмечена": "Unloading is already marked",
    "Некорректный фактический пробег": "Invalid actual mileage",
    "Некорректный расход топлива": "Invalid fuel consumption",
    # fleet
    "Машина не найдена": "Vehicle not found",
    "Управлять автопарком может администратор, руководитель или механик":
        "Fleet management is available to the administrator, head or mechanic",
    "Укажите название или марку машины": "Enter the vehicle name or make",
    "Некорректный год выпуска": "Invalid manufacture year",
    "Некорректный пробег": "Invalid mileage",
    "Интервал ТО должен быть от 1 000 до 1 000 000 км":
        "Service interval must be between 1,000 and 1,000,000 km",
    "У машины есть история ремонтов — удаление недоступно":
        "This vehicle has repair history — deletion is unavailable",
    # repairs
    "Заявка на ремонт не найдена": "Repair request not found",
    "Нет доступа к заявкам на ремонт": "No access to repair requests",
    "Заявку на ремонт может отправить водитель": "Only a driver can submit a repair request",
    "Опишите неисправность": "Describe the problem",
    "Выберите машину из автопарка": "Select a vehicle from the fleet",
    "Неизвестная срочность заявки": "Unknown request urgency",
    "Обрабатывать заявки на ремонт может механик, руководитель или администратор":
        "Repair requests are handled by the mechanic, head or administrator",
    "Фото не найдено": "Photo not found",
    # tasks, activity, import, print
    "Укажите текст задачи": "Enter the task text",
    "Журнал действий доступен руководителю и администратору":
        "The activity log is available to the head and administrator",
    "Старый формат .xls не поддерживается — сохраните файл как .xlsx или .csv":
        "The legacy .xls format is not supported — save the file as .xlsx or .csv",
    "Не удалось прочитать текст файла — сохраните его в UTF-8":
        "Could not read the file text — save it in UTF-8",
    "Прикрепите файл CSV или Excel": "Attach a CSV or Excel file",
    "Повреждённый файл — попробуйте сохранить его заново": "The file is corrupted — try saving it again",
    "Файл больше 5 МБ": "The file exceeds 5 MB",
    "В файле нет данных": "The file contains no data",
    "За один раз можно импортировать не больше 1000 клиентов":
        "You can import no more than 1000 clients at a time",
    "Неизвестный документ": "Unknown document",
    "Резервная копия доступна администратору": "Backups are available to the administrator",
    # server-level (server.py)
    "Слишком большой запрос": "Request is too large",
    "Некорректный JSON в запросе": "Malformed JSON in the request",
    "Ожидается JSON-объект": "A JSON object is expected",
    "Метод не поддерживается": "Method not supported",
    "Внутренняя ошибка сервера": "Internal server error",
    "Доступ запрещён": "Access denied",
    "Страница не найдена": "Page not found",
}

ERROR_PATTERNS = [
    (re.compile(r"^Некорректная дата: (.+)$"), r"Invalid date: \1"),
    (re.compile(r"^Машина с номером (.+) уже есть в автопарке$"),
     r"A vehicle with plate \1 is already in the fleet"),
]


def error_text(message):
    """Translate an ApiError message for the active language."""
    if not is_en() or not message:
        return message
    direct = ERROR_EN.get(message)
    if direct:
        return direct
    for pattern, replacement in ERROR_PATTERNS:
        if pattern.match(message):
            return pattern.sub(replacement, message)
    return message


# ------------------------------------------------------------------ activity feed

ACTIVITY_RULES = [
    (re.compile(r"^Создано рабочее пространство$"), "Workspace created"),
    (re.compile(r"^Добавлен пользователь (.+)$"), r"User \1 added"),
    (re.compile(r"^Добавлен клиент «(.+)»$"), r"Client «\1» added"),
    (re.compile(r"^Удалён клиент «(.+)»$"), r"Client «\1» deleted"),
    (re.compile(r"^Создана перевозка «(.+)»$"), r"Trip «\1» created"),
    (re.compile(r"^Перевозка «(.+)» перешла на этап «(.+)»$"), r"Trip «\1» moved to stage «\2»"),
    (re.compile(r"^Удалена перевозка «(.+)»$"), r"Trip «\1» deleted"),
    (re.compile(r"^Создан повтор перевозки «(.+)» на основе рейса №(\d+)$"),
     r"Trip «\1» duplicated from trip #\2"),
    (re.compile(r"^К перевозке «(.+)» прикреплён документ «(.+)»$"),
     r"Document «\2» attached to trip «\1»"),
    (re.compile(r"^Из перевозки «(.+)» удалён документ «(.+)»$"),
     r"Document «\2» removed from trip «\1»"),
    (re.compile(r"^В рейс «(.+)» добавлен расход: (.+) на (.+) ₽$"),
     r"Expense added to trip «\1»: \2, \3 ₽"),
    (re.compile(r"^Получена оплата (.+) ₽ по рейсу «(.+)»$"),
     r"Payment of \1 ₽ received for trip «\2»"),
    (re.compile(r"^Добавлен подрядчик «(.+)»$"), r"Contractor «\1» added"),
    (re.compile(r"^Заявка (.+) → (.+) на (.+) ₽$"), r"Request \1 → \2 for \3 ₽"),
    (re.compile(r"^Заявка (.+) → (.+) преобразована в рейс$"),
     r"Request \1 → \2 converted to a trip"),
    (re.compile(r"^Водитель (.+): (.+) по рейсу «(.+)»$"), r"Driver \1: \2 on trip «\3»"),
    (re.compile(r"^В автопарк добавлена машина «(.+)»$"), r"Vehicle «\1» added to fleet"),
    (re.compile(r"^Обновлена карточка машины «(.+)»$"), r"Vehicle «\1» updated"),
    (re.compile(r"^Из автопарка удалена машина «(.+)»$"), r"Vehicle «\1» removed from fleet"),
    (re.compile(r"^Водитель (.+) отправил заявку на ремонт «(.+)»$"),
     r"Driver \1 submitted repair request «\2»"),
    (re.compile(r"^Заявка на ремонт «(.+)»: (.+)$"), r"Repair request «\1»: \2"),
    (re.compile(r"^Обновлён комментарий по заявке «(.+)»$"),
     r"Comment updated on request «\1»"),
    (re.compile(r"^К заявке «(.+)» добавлено фото$"), r"Photo added to request «\1»"),
    (re.compile(r"^Импортировано клиентов из файла: (\d+)$"), r"Clients imported from file: \1"),
]

# Values that may appear inside activity texts (stage / kind / status words).
WORD_MAPS = [
    (STAGE_EN, False),
    (EXPENSE_KIND_EN, True),
    (REPAIR_STATUS_EN, True),
    (REQUEST_STATUS_EN, True),
]


def _translate_words(value):
    for mapping, need_lower in WORD_MAPS:
        key = value.lower() if need_lower else value
        for ru, en in mapping.items():
            candidate = ru.lower() if need_lower else ru
            if key == candidate:
                return en
    low = value.lower()
    for ru, en in EVENT_EN.items():
        if low == ru.lower():
            return en
    return value


def activity_text(text):
    """Translate a stored activity record for the active language."""
    if not is_en() or not text:
        return text
    for pattern, replacement in ACTIVITY_RULES:
        match = pattern.match(text)
        if not match:
            continue
        out = pattern.sub(replacement, text)
        for group in match.groups():
            translated = _translate_words(group)
            if translated != group:
                out = out.replace(group, translated, 1)
        return out
    return text


def activity_row(row):
    """Copy an activity row with the text translated."""
    data = dict(row)
    if is_en() and "text" in data:
        data["text"] = activity_text(data["text"])
    return data


def comment_text(text):
    """Translate a status comment such as «Отмечена погрузка · Иван»."""
    if not is_en() or not text:
        return text
    for ru, en in EVENT_EN.items():
        if text.startswith(ru):
            return en + text[len(ru):]
    return text

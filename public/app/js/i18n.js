/* Interface language: Russian (default) and English.
   Russian strings are the source keys — the dictionary below maps them to English.
   Static labels are translated as whole text nodes; phrases mixed with live data
   are translated by fragment replacement. */

const STORAGE_KEY = 'mslk-lang';
const CYRILLIC = /[\u0400-\u04FF]/;

let lang = 'ru';
try {
  lang = localStorage.getItem(STORAGE_KEY) === 'en' ? 'en' : 'ru';
} catch (err) {
  lang = 'ru';
}

export function getLang() {
  return lang;
}

export function isEnglish() {
  return lang === 'en';
}

export function setLang(next) {
  lang = next === 'en' ? 'en' : 'ru';
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch (err) {
    /* storage may be unavailable — keep in memory only */
  }
  document.documentElement.lang = lang === 'en' ? 'en' : 'ru';
}

export function toggleLang() {
  setLang(lang === 'en' ? 'ru' : 'en');
}

/* ------------------------------------------------------------- dictionary */

const DICT = {
  /* ---- navigation & roles */
  'Главное меню': 'Dashboard',
  'Отчёты': 'Reports',
  'Заявки': 'Requests',
  'Перевозки': 'Trips',
  'Клиенты': 'Clients',
  'Подрядчики': 'Contractors',
  'Задачи': 'Tasks',
  'Мои рейсы': 'My trips',
  'Автопарк': 'Fleet',
  'Команда': 'Team',
  'Настройки': 'Settings',
  'Рабочее пространство': 'Workspace',
  'Доступ и роли': 'Access and roles',
  'Администратор': 'Administrator',
  'Руководитель': 'Head',
  'Менеджер': 'Manager',
  'Водитель': 'Driver',
  'Механик': 'Mechanic',

  /* ---- auth screen */
  'Загружаем рабочее пространство…': 'Loading workspace…',
  'Логистика и грузоперевозки': 'Logistics and freight',
  'Перевозки, клиенты': 'Trips, clients',
  'и маршруты в одном месте': 'and routes in one place',
  'Канбан заявок: от расчёта до доставки': 'Request board: from quote to delivery',
  'Клиенты, контакты и реквизиты': 'Clients, contacts and details',
  'Маршруты, грузы, водители и машины': 'Routes, cargo, drivers and vehicles',
  'Роли: администратор, руководитель, менеджер, водитель, механик': 'Roles: admin, head, manager, driver, mechanic',
  'Выручка за месяц': 'Monthly revenue',
  'Вход в систему': 'Sign in',
  'Введите данные, чтобы открыть рабочее пространство.': 'Enter your credentials to open the workspace.',
  'Логин': 'Login',
  'Логин или email': 'Login or email',
  'Пароль': 'Password',
  'Нет аккаунта?': 'No account?',
  'Зарегистрироваться': 'Sign up',
  'Демо-доступы': 'Demo accounts',
  'Локальная демонстрационная версия · данные хранятся на этом компьютере': 'Local demo build · data is stored on this computer',
  'Регистрация': 'Sign up',
  'Создайте своё рабочее пространство для перевозок.': 'Create your own freight workspace.',
  'Имя и фамилия': 'Full name',
  'Например, Иван Петров': 'e.g. John Smith',
  'Минимум 6 символов': 'At least 6 characters',
  'Оставьте пустым, чтобы не менять': 'Leave blank to keep unchanged',
  'Создать аккаунт': 'Create account',
  'Уже есть аккаунт?': 'Already have an account?',
  'Войти': 'Sign in',
  'Новый аккаунт получает отдельное чистое рабочее пространство': 'A new account gets its own clean workspace',
  'Входим…': 'Signing in…',
  'Создаём…': 'Creating…',
  'Не удалось войти': 'Could not sign in',
  'Не удалось создать аккаунт': 'Could not create the account',
  'Сессия истекла — войдите снова': 'Session expired — sign in again',

  /* ---- shell */
  'Меню': 'Menu',
  'Поиск': 'Search',
  'Поиск (Ctrl+K)': 'Search (Ctrl+K)',
  'Напоминания': 'Reminders',
  'Выйти': 'Sign out',
  'Выйти из системы': 'Sign out',
  'Поиск по CRM': 'Search CRM',
  'Перевозка, клиент, заявка, задача…': 'Trip, client, request, task…',
  'Ctrl+K — открыть поиск': 'Ctrl+K — open search',
  'Enter — перейти к первому результату': 'Enter — open the first result',
  'Начните вводить название клиента, маршрут или задачу — минимум 2 символа.': 'Start typing a client name, route or task — at least 2 characters.',
  'Ничего не найдено. Попробуйте другой запрос.': 'Nothing found. Try another query.',

  /* ---- common */
  'Сохранить': 'Save',
  'Отмена': 'Cancel',
  'Закрыть': 'Close',
  'Удалить': 'Delete',
  'Изменить': 'Edit',
  'Редактировать': 'Edit',
  'Добавить': 'Add',
  'Обновить': 'Refresh',
  'Показать': 'Show',
  'Открыть': 'Open',
  'Все': 'All',
  'Всего': 'Total',
  'Готово': 'Done',
  'готово': 'done',
  'Сегодня': 'Today',
  'сегодня': 'today',
  'завтра': 'tomorrow',
  'вчера': 'yesterday',
  'без срока': 'no due date',
  'Без срока': 'No due date',
  'Выполненные': 'Completed',
  'Не назначен': 'Not assigned',
  'Не закреплён': 'Unassigned',
  'не закреплён': 'unassigned',
  'без номера': 'no plate',
  '— не привязан —': '— not linked —',
  '— не привязана —': '— not linked —',
  'это вы': 'you',
  'Пользователь': 'User',
  'Система': 'System',
  'Загрузка…': 'Loading…',
  'Загружаем…': 'Loading…',
  'Сохраняем…': 'Saving…',
  'Импортируем…': 'Importing…',
  'Готовим резервную копию…': 'Preparing backup…',
  'Что-то пошло не так': 'Something went wrong',
  'Не удалось открыть раздел': 'Could not open the section',
  'Не удалось выполнить запрос': 'Request failed',
  'Не удалось выполнить поиск': 'Search failed',
  'Не удалось сохранить изменения': 'Could not save changes',
  'Не удалось прочитать файл': 'Could not read the file',
  'Ничего не найдено': 'Nothing found',
  'Попробуйте изменить запрос.': 'Try a different query.',
  'Всё под контролем': 'All under control',
  'Срок': 'Due',
  'Дата': 'Date',
  'Сумма': 'Amount',
  'Итого': 'Total',
  'Тип': 'Type',
  'Статус': 'Status',
  'Название': 'Name',
  'Роль': 'Role',
  'Детали': 'Details',
  'Подробности': 'Details',
  'Комментарий': 'Comment',
  'Без комментария': 'No comment',
  'Просрочено': 'Overdue',
  'просрочено': 'overdue',
  'только что': 'just now',

  /* ---- stages & chips */
  'Новые заявки': 'New requests',
  'Расчёт': 'Quote',
  'Подтверждено': 'Confirmed',
  'В пути': 'In transit',
  'Доставлено': 'Delivered',
  'Отменено': 'Cancelled',
  'Новая': 'New',
  'В работе': 'In progress',
  'Выполнена': 'Done',
  'Отправлено': 'Submitted',
  'Принято': 'Accepted',
  'Отклонено': 'Rejected',
  'Преобразовано': 'Converted',
  'В рейсе': 'In trip',
  'Новые': 'New',
  'Отдельная машина': 'Dedicated truck',
  'Сборный груз': 'Groupage',
  'Рефрижератор': 'Refrigerated',
  'Контейнер': 'Container',
  'Реф': 'Reefer',
  'Не срочно': 'Not urgent',
  'Обычная': 'Normal',
  'Срочно': 'Urgent',
  'Низкий': 'Low',
  'Обычный': 'Normal',
  'Высокий': 'High',

  /* ---- dashboard */
  'Выручка': 'Revenue',
  'Доход': 'Income',
  'Расходы': 'Expenses',
  'Маржа': 'Margin',
  'Маржа %': 'Margin %',
  'Маржа рейса': 'Trip margin',
  'Дебиторка': 'Receivables',
  'Долг': 'Debt',
  'Должники': 'Debtors',
  'Требует внимания': 'Needs attention',
  'Нет срочных дел': 'No urgent items',
  'Лента событий': 'Activity feed',
  'Событий пока нет': 'No events yet',
  'Мои задачи': 'My tasks',
  'Ближайшие напоминания': 'Upcoming reminders',
  'Стоимость': 'Amount',
  'Открыть канбан': 'Open pipeline',
  'Нет активных задач': 'No active tasks',
  'Добавьте задачу, чтобы не забыть про следующий шаг.': 'Add a task so you do not forget the next step.',
  'Перевозки в работе': 'Trips in progress',
  'Задачи в работе': 'Open tasks',
  'Этапы перевозок': 'Trip stages',
  'Стоимость перевозок по этапам': 'Trip value by stage',
  'Финансы доставленных перевозок': 'Delivered trip finances',
  'Доход, расходы и итоговая маржа': 'Income, expenses and margin',
  'Последние перевозки': 'Recent trips',
  'Все перевозки': 'All trips',
  'Перевозок пока нет': 'No trips yet',
  'Создайте первую перевозку, чтобы увидеть её здесь.': 'Create your first trip to see it here.',
  'Пока нет закрытых рейсов': 'No closed trips yet',
  'График появится после первой доставленной перевозки.': 'The chart appears after the first delivered trip.',
  'Доставленных перевозок пока нет — маржа появится после закрытия первого рейса.': 'No delivered trips yet — margin will appear once the first trip is closed.',
  'Выручка и маржа по неделям': 'Revenue and margin by week',
  'Выручка и маржа по месяцам': 'Revenue and margin by month',
  'Выручка и маржа по периодам': 'Revenue and margin over time',
  'Выручка и маржинальность': 'Revenue and margin',
  'Просрочек, долгов и зависших заявок нет — всё под контролем.': 'No overdue items, debts or stalled requests — all under control.',
  'Просроченных задач нет': 'No overdue tasks',
  'Все сроки соблюдены.': 'All deadlines met.',
  'Выполненных задач пока нет': 'No completed tasks yet',
  'Отмечайте задачи галочкой, и они появятся здесь.': 'Tick tasks off and they will appear here.',
  'На сегодня задач нет': 'No tasks for today',
  'Отличная возможность заняться перевозками.': 'A great chance to focus on trips.',
  'Создайте задачу, чтобы держать следующий шаг под контролем.': 'Create a task to keep the next step under control.',
  'Задача выполнена': 'Task completed',
  'Задача возвращена в работу': 'Task reopened',
  'Выполнить задачу': 'Complete task',
  'Вернуть в работу': 'Reopen',
  'Просроченные': 'Overdue',
  'Предстоящие': 'Upcoming',
  'Новые клиенты': 'New clients',
  'Доставлено рейсов': 'Delivered trips',
  'Оплата рейсов учитывается отдельно': 'Trip payments are tracked separately',
  'получено за период': 'received for the period',
  'Средняя маржинальность': 'Average margin',
  'Доставленные перевозки': 'Delivered trips',
  'последние 8 недель': 'last 8 weeks',

  /* ---- deals */
  'Перетаскивайте карточки между этапами — статус перевозки сохраняется сразу': 'Drag cards between stages — the status saves instantly',
  'Перетащите перевозку сюда': 'Drag a trip here',
  'Пусто': 'Empty',
  'Добавить перевозку на этапе': 'Add a trip at stage',
  'Новая перевозка': 'New trip',
  'Перевозка': 'Trip',
  'Груз': 'Cargo',
  'Груз не указан': 'Cargo not set',
  'Откуда': 'From',
  'Куда': 'To',
  'Тип перевозки': 'Transport type',
  'Вес, т': 'Weight, t',
  'Объём, м³': 'Volume, m³',
  'Дата погрузки': 'Loading date',
  'Дата доставки': 'Delivery date',
  'Стоимость, ₽': 'Value, ₽',
  'Расстояние, км': 'Distance, km',
  'Этап': 'Stage',
  'Ответственный': 'Owner',
  'Транспорт': 'Vehicle',
  'Заметки': 'Notes',
  'Маршрут, груз и стоимость': 'Route, cargo and value',
  'Создать перевозку': 'Create trip',
  'Перевозка создана': 'Trip created',
  'Перевозка обновлена': 'Trip updated',
  'Перевозка удалена': 'Trip deleted',
  'Удалить перевозку?': 'Delete trip?',
  'Повторить рейс': 'Repeat trip',
  'Создать рейс': 'Create trip',
  'Преобразовать в рейс?': 'Convert to trip?',
  'Документы': 'Documents',
  'Договор': 'Contract',
  'Счёт': 'Invoice',
  'Акт': 'Act',
  'Путевой лист': 'Waybill',
  'Без клиента': 'No client',
  'Клиент не указан': 'Client not set',
  'Клиент не выбран': 'Client not selected',
  'Не выбран — уточним позже': 'Not selected — clarify later',
  'Сначала добавьте клиента': 'Add a client first',
  'Перевозка всегда привязана к клиенту': 'A trip is always linked to a client',
  'В базе пока нет клиентов. Создайте первого клиента — после этого можно будет добавить перевозку.': 'No clients yet. Create your first client to add a trip.',
  'Добавьте в команду пользователя с ролью «Водитель», чтобы назначить его на рейс.': 'Add a team member with the Driver role to assign them to a trip.',
  'Документы перевозки': 'Trip documents',
  'Добавить документы': 'Add documents',
  'Пока нет прикреплённых документов': 'No documents attached yet',
  'Пока нет документов. Прикрепите фото договора, путевого листа, ТТН или счёта.': 'No documents yet. Attach photos of the contract, waybill, delivery note or invoice.',
  'Категория документа': 'Document category',
  'Договор на перевозку': 'Transport contract',
  'Товаросопроводительные документы': 'Shipping documents',
  'Свидетельства и удостоверения': 'Certificates and permits',
  'Счета на оплату': 'Invoices',
  'Другие документы': 'Other documents',
  'Прикрепить фото': 'Attach photo',
  'Добавить фото': 'Add photo',
  'Открыть фото': 'Open photo',
  'Удалить документ': 'Delete document',
  'Удалить документ?': 'Delete document?',
  'Документ добавлен': 'Document added',
  'Документ удалён': 'Document deleted',
  'Документ отправлен в офис': 'Document sent to the office',
  'Не удалось загрузить документы': 'Could not load documents',
  'Фото сразу поступят в офис. Просматривать загруженные документы водитель не может.': 'Photos go straight to the office. Drivers cannot view uploaded documents.',
  'Выберите категорию и прикрепите фото документа — с телефона можно сразу из камеры.': 'Pick a category and attach a document photo — on a phone you can use the camera.',
  'Выберите категорию и снимите фото документа': 'Pick a category and take a document photo',

  /* ---- payments & finance */
  'Оплата': 'Payment',
  'Оплачено': 'Paid',
  'оплачено': 'paid',
  'Не оплачено': 'Unpaid',
  'не оплачено': 'unpaid',
  'частично': 'partial',
  'Частично': 'Partially',
  'долг': 'debt',
  '2,84 млн ₽': '2.84M ₽',
  'Частично оплачено': 'Partially paid',
  'Платёж': 'Payment',
  'Дата платежа': 'Payment date',
  'Сумма, ₽': 'Amount, ₽',
  'Срок оплаты': 'Payment due',
  'Срок оплаты клиентом': 'Client payment due',
  'Удалить платёж': 'Delete payment',
  'Удалить платёж?': 'Delete payment?',
  'Платёж добавлен': 'Payment added',
  'Платёж удалён': 'Payment deleted',
  'Укажите сумму платежа': 'Enter the payment amount',
  'Платежей пока нет — добавьте первый, когда клиент оплатит счёт.': 'No payments yet — add the first one when the client pays the invoice.',
  'Сумма исчезнет из расчёта оплаты и долга по этому рейсу.': 'The amount will be removed from this trip paid and debt totals.',
  'Финансы рейса': 'Trip finances',
  'Финансы по клиенту': 'Client finances',
  'Считаются только доставленные перевозки клиента.': 'Only the client delivered trips are counted.',
  'Топливо': 'Fuel',
  'Платные дороги': 'Tolls',
  'Ремонт': 'Repair',
  'Прочее': 'Other',
  'Вид расхода': 'Expense type',
  'Расход': 'Expense',
  'Расход добавлен': 'Expense added',
  'Расход удалён': 'Expense deleted',
  'Удалить расход': 'Delete expense',
  'Удалить расход?': 'Delete expense?',
  'Укажите сумму расхода': 'Enter the expense amount',
  'Сумма исчезнет из расчёта маржи по этому рейсу.': 'The amount will be removed from this trip margin.',
  'Расходов пока нет — добавьте топливо, платные дороги или ремонт.': 'No expenses yet — add fuel, tolls or repairs.',
  'Расходы на ремонт': 'Repair costs',
  'Субподрядчик': 'Subcontractor',
  'Своими силами': 'In-house',
  'Стоимость подряда, ₽': 'Subcontract cost, ₽',
  'Перевозчик, которому отдаём рейс. Его ставка идёт в расходы.': 'The carrier we hand the trip to. Its rate goes to expenses.',

  /* ---- trip progress & driver */
  'Факт выполнения рейса': 'Trip completion',
  'Погрузка': 'Loading',
  'Выезд': 'Departure',
  'Выгрузка': 'Unloading',
  'Выгрузки': 'Unloadings',
  'Доставка': 'Delivery',
  'Отметить погрузку': 'Mark loading',
  'Отметить выезд': 'Mark departure',
  'Отметить выгрузку': 'Mark unloading',
  'Отметить погрузку?': 'Mark loading?',
  'Отметить выезд?': 'Mark departure?',
  'Завершить рейс?': 'Complete trip?',
  'Отметить': 'Mark',
  'следующий шаг': 'next step',
  'Фактический пробег': 'Actual mileage',
  'Комментариев': 'Comments',
  'Комментарии': 'Comments',
  'Комментарии к рейсу': 'Trip comments',
  'Пока нет комментариев — напишите первым.': 'No comments yet — write the first one.',
  'Комментарий добавлен': 'Comment added',
  'Отметка сохранена': 'Mark saved',
  'Факт по рейсу сохранён': 'Trip record saved',
  'Сохранить факт': 'Save record',
  'Зафиксируем время загрузки': 'We will record the loading time',
  'Зафиксируем время погрузки и переведём рейс в статус «В пути».': 'We will record the loading time and move the trip to In transit.',
  'Машина выехала с погрузки': 'The vehicle has left the loading point',
  'Машина выехала с погрузки. Теперь можно отметить выгрузку.': 'The vehicle has left the loading point. You can mark unloading now.',
  'Завершим рейс и передадим факт в офис': 'We will close the trip and send the record to the office',
  'Отметим выгрузку, рейс перейдёт в «Доставлено», а факт увидит офис.': 'We will mark unloading, the trip moves to Delivered and the office sees the record.',
  'Рейс · маршрут, отметки, факт и документы': 'Trip · route, marks, record and documents',
  'Пока нет назначенных рейсов': 'No assigned trips yet',
  'Когда менеджер назначит вас водителем перевозки, она появится здесь.': 'When a manager assigns you as the trip driver, it will appear here.',
  'Не удалось загрузить рейсы': 'Could not load trips',
  'Задержки, состояние груза, фактическое время выгрузки': 'Delays, cargo condition, actual unloading time',
  'Например, прибыл на выгрузку, жду оформления': 'e.g. arrived for unloading, waiting for paperwork',
  'Комментарий или уточнение по заявке': 'Comment or clarification on the request',
  'Заявка на ремонт отправлена механику': 'Repair request sent to the mechanic',
  'Механик увидит обращение и возьмёт машину в работу': 'The mechanic will see the request and take the vehicle in',
  'Стук в подвеске, не работает реф…': 'Knocking in suspension, reefer not working…',
  'Когда появилась неисправность, что уже проверили, можно ли ехать': 'When it started, what has been checked, whether it is safe to drive',
  'Отправить механику': 'Send to mechanic',
  'Можно приложить до 5 фото — механику будет проще оценить поломку.': 'Up to 5 photos help the mechanic assess the issue.',
  'Фото неисправности': 'Breakdown photos',
  'Фото неисправности пока нет.': 'No breakdown photos yet.',
  'Фото добавлено': 'Photo added',
  'Что нужно заменить': 'What needs replacing',
  'Осмотр, ремонт, какие детали заменили': 'Inspection, repair, parts replaced',
  'Заявка на ремонт обновлена': 'Repair request updated',
  'Сообщите механику о неисправности машины.': 'Report a vehicle breakdown to the mechanic.',
  'Если машина требует ремонта, отправьте заявку — механик увидит её сразу.': 'If a vehicle needs repair, send a request — the mechanic sees it immediately.',
  'Обратитесь в офис: в автопарке ещё нет машин, поэтому заявку на ремонт сейчас создать нельзя.': 'Contact the office: there are no vehicles in the fleet yet, so a repair request cannot be created now.',
  'Обращения водителей': 'Driver requests',
  'Без открытых заявок': 'No open requests',
  'Неисправность': 'Breakdown',
  'Что случилось': 'What happened',
  'Срочность': 'Urgency',
  'Не удалось загрузить автопарк': 'Could not load the fleet',
  'Не удалось загрузить команду': 'Could not load the team',
  'Не удалось загрузить настройки': 'Could not load settings',
  'Не удалось загрузить отчёты': 'Could not load reports',
  'Не удалось загрузить перевозки': 'Could not load trips',
  'Не удалось загрузить подрядчиков': 'Could not load contractors',
  'Не удалось загрузить клиентов': 'Could not load clients',
  'Не удалось загрузить задачи': 'Could not load tasks',
  'Не удалось загрузить заявки': 'Could not load requests',
  'Не удалось загрузить главное меню': 'Could not load the dashboard',

  /* ---- clients */
  'Клиент': 'Client',
  'доставлено': 'delivered',
  'Отрасль': 'Industry',
  'Отрасль не указана': 'Industry not set',
  'ИНН': 'INN',
  'ИНН / КПП': 'INN / KPP',
  'ИНН не указан': 'INN not set',
  '10 или 12 цифр': '10 or 12 digits',
  'Телефон': 'Phone',
  'Сайт': 'Website',
  'Адрес': 'Address',
  'Контакты': 'Contacts',
  'Контактное лицо': 'Contact person',
  'Должность': 'Position',
  'Директор': 'Director',
  'В базе с': 'Client since',
  'В системе с': 'In system since',
  'Новый клиент': 'New client',
  'Клиент создан': 'Client created',
  'Клиент обновлён': 'Client updated',
  'Клиент удалён': 'Client deleted',
  'Удалить клиента?': 'Delete client?',
  'Компания или организация': 'Company or organization',
  'Производство, ритейл, фармацевтика…': 'Manufacturing, retail, pharma…',
  'Город, улица, дом': 'City, street, building',
  'Особенности, история, договорённости': 'Notes, history, agreements',
  'Создать клиента': 'Create client',
  'Добавьте первого контактного представителя': 'Add the first contact person',
  'Контактное лицо будет удалено из карточки клиента.': 'The contact will be removed from the client card.',
  'Контакт удалён': 'Contact deleted',
  'Контакт добавлен': 'Contact added',
  'Укажите имя контакта': 'Enter the contact name',
  'Удалить контакт?': 'Delete contact?',
  'Удалить контакт': 'Delete contact',
  'Добавить контакт': 'Add contact',
  'Имя': 'Name',
  'Клиенты не найдены': 'No clients found',
  'Попробуйте изменить запрос или добавьте нового клиента.': 'Try a different query or add a new client.',
  'Поиск: название, отрасль, ИНН': 'Search: name, industry, INN',
  'Все ответственные': 'All owners',
  'Импорт': 'Import',
  'Шаблон': 'Template',
  'Скачать шаблон CSV': 'Download CSV template',
  'Файл больше 5 МБ': 'File is larger than 5 MB',
  'Для импорта нужен CSV или XLSX': 'A CSV or XLSX file is required',
  'Клиенты CSV': 'Clients CSV',
  'Клиенты Excel': 'Clients Excel',
  'Перевозки CSV': 'Trips CSV',
  'Перевозки Excel': 'Trips Excel',

  /* ---- requests */
  'Заявка на перевозку': 'Transport request',
  'Новая заявка': 'New request',
  'Заявка': 'Request',
  'Маршрут, расстояние и расчёт ставки': 'Route, distance and rate',
  'Пожелания клиента, сроки, условия': 'Client preferences, deadlines, terms',
  'Создать заявку': 'Create request',
  'Заявка создана': 'Request created',
  'Заявка обновлена': 'Request updated',
  'Заявка удалена': 'Request deleted',
  'Удалить заявку?': 'Delete request?',
  'Заявок пока нет': 'No requests yet',
  'Воронка входящих заявок: расчёт ставки, наценка и преобразование в рейс': 'Incoming request funnel: rate calculation, markup and conversion to a trip',
  'Для преобразования заявки в рейс клиент обязателен.': 'A client is required to convert a request into a trip.',
  'Ставка клиенту, ₽': 'Client rate, ₽',
  'Себестоимость': 'Cost',
  'Себестоимость, ₽': 'Cost, ₽',
  'Наценка': 'Markup',
  'Наценка, %': 'Markup, %',
  'Всего заявок': 'Total requests',
  'Конверсия заявок': 'Request conversion',
  'Поиск по маршруту, грузу или клиенту': 'Search by route, cargo or client',
  'Заявка на ремонт': 'Repair request',
  'Заявки на ремонт': 'Repair requests',
  'Мои заявки на ремонт': 'My repair requests',

  /* ---- tasks */
  'Задача': 'Task',
  'Новая задача': 'New task',
  'Что и когда нужно сделать': 'What to do and when',
  'Позвонить клиенту, отправить КП…': 'Call the client, send a quote…',
  'Что нужно сделать, договорённости': 'What to do, agreements',
  'Создать задачу': 'Create task',
  'Задача создана': 'Task created',
  'Задача обновлена': 'Task updated',
  'Задача удалена': 'Task deleted',
  'Удалить задачу?': 'Delete task?',
  'Задач пока нет': 'No tasks yet',
  'Приоритет': 'Priority',

  /* ---- team */
  'Новый пользователь': 'New user',
  'Права доступа и данные учётной записи': 'Access rights and account details',
  'Добавьте участника команды': 'Add a team member',
  'Менеджер — видит только своих клиентов и перевозки': 'Manager — sees only their clients and trips',
  'Руководитель — видит всю команду и данные': 'Head — sees the whole team and data',
  'Администратор — полный доступ и управление пользователями': 'Administrator — full access and user management',
  'Водитель — видит только свой рейс без сумм, может добавлять документы': 'Driver — sees only their trip without amounts, can add documents',
  'Механик — видит автопарк и заявки водителей на ремонт': 'Mechanic — sees the fleet and driver repair requests',
  'Добавить пользователя': 'Add user',
  'Пользователь добавлен': 'User added',
  'Пользователь обновлён': 'User updated',
  'Пользователь удалён': 'User deleted',
  'Удалить пользователя?': 'Delete user?',
  'Нет пользователей': 'No users',
  'Активен': 'Active',
  'Отключён': 'Disabled',

  /* ---- fleet */
  'Машины автопарка': 'Fleet vehicles',
  'Все машины, закреплённые водители и состояние ремонта.': 'All vehicles, assigned drivers and repair status.',
  'В автопарке пока нет машин': 'No vehicles in the fleet yet',
  'Машины появятся здесь, когда автопарк будет заполнен.': 'Vehicles will appear here once the fleet is set up.',
  'Новая машина': 'New vehicle',
  'Карточка машины': 'Vehicle card',
  'Основные данные, обслуживание и документы': 'Details, maintenance and documents',
  'Марка и модель': 'Make and model',
  'Тягач, рефрижератор…': 'Tractor, reefer…',
  'Госномер': 'Plate',
  'Год выпуска': 'Model year',
  'Пробег': 'Mileage',
  'Пробег, км': 'Mileage, km',
  'Тип машины': 'Vehicle type',
  'Следующее ТО': 'Next maintenance',
  'Интервал ТО': 'Maintenance interval',
  'Интервал ТО, км': 'Maintenance interval, km',
  'Страховка до': 'Insurance until',
  'Техосмотр до': 'Inspection until',
  'Закреплённый водитель': 'Assigned driver',
  'История обслуживания': 'Service history',
  'Особенности машины, температурный режим, документы': 'Vehicle features, temperature mode, documents',
  'Добавить машину': 'Add vehicle',
  'Машина добавлена в автопарк': 'Vehicle added to the fleet',
  'Карточка машины обновлена': 'Vehicle card updated',
  'Машина удалена из автопарка': 'Vehicle removed from the fleet',
  'Удалить машину?': 'Delete vehicle?',
  'ТО просрочено': 'Maintenance overdue',
  'Скоро ТО': 'Maintenance due soon',
  'ТО по плану': 'Maintenance on schedule',
  'ТО не запланировано': 'Maintenance not scheduled',
  'не запланировано': 'not scheduled',
  'Машина': 'Vehicle',
  'Активен': 'Active',

  /* ---- driver */
  'Погрузка отмечена · отметьте выезд': 'Loading marked · mark departure',
  'В пути · можно отметить выгрузку': 'In transit · you can mark unloading',
  'Рейс завершён · факт передан в офис': 'Trip completed · actuals sent to the office',
  'Отметьте погрузку, чтобы начать рейс': 'Mark loading to start the trip',
  'Вес': 'Weight',
  'Объём': 'Volume',
  'Факт по рейсу': 'Trip actuals',
  'Фактический пробег, км': 'Actual mileage, km',
  'Топливо, л': 'Fuel, L',
  'Что важно знать офису': 'What the office should know',

  /* ---- forms */
  'Отправлена': 'Submitted',
  'Закрыта': 'Closed',
  'Плановая дата': 'Planned date',
  'Запчасти': 'Parts',
  'Что сделано': 'Work done',
  'Отправить': 'Submit',
  'Описание': 'Description',
  'Статус заявки': 'Request status',
  'FTL — Отдельная машина': 'FTL — Dedicated truck',
  'LTL — Сборный груз': 'LTL — Groupage',
  'Реф — Рефрижератор': 'Reefer — Refrigerated',
  'Контейнер — Контейнер': 'Container — Container',
  'Фото договора, путевого листа и других документов можно прикрепить сразу после сохранения перевозки.': 'Photos of the contract, waybill and other documents can be attached right after saving the trip.',
  'Адреса, температурный режим, договорённости': 'Addresses, temperature mode, agreements',

  /* ---- reports */
  'Топ клиентов': 'Top clients',
  'Топ по выручке за период': 'Top by revenue for the period',
  'По менеджерам': 'By manager',
  'Кто сколько закрыл за период': 'Who closed how much for the period',
  'Рентабельность направлений': 'Route profitability',
  'Просроченной дебиторки нет': 'No overdue receivables',
  'Все счета оплачены': 'All invoices paid',
  'Дебиторская задолженность отсутствует.': 'There are no outstanding invoices.',
  'Печать документов': 'Print documents',
  'Реестр': 'Registry',
  'Направление': 'Route',
  'Этот месяц': 'This month',
  'Год': 'Year',
  'Пока нет доставленных рейсов': 'No delivered trips yet',
  'График появится, когда за период будут закрытые перевозки.': 'The chart appears when there are closed trips for the period.',
  'За период нет направлений': 'No routes for the period',
  'За период нет клиентов': 'No clients for the period',
  'Нет данных по менеджерам': 'No manager data',
  'Укажите начало и конец периода': 'Specify the period start and end',
  'Начало периода позже окончания': 'The period start is after the end',
  'Период': 'Period',
  'Период:': 'Period:',
  'счёт': 'invoice',
  'счёта': 'invoices',
  'счетов': 'invoices',
  'все счета в срок': 'all invoices on time',
  'в срок': 'on time',

  /* ---- settings */
  'Организация': 'Company',
  'Реквизиты компании': 'Company details',
  'Реквизиты для документов, выгрузки и резервная копия базы': 'Details for documents, exports and database backup',
  'Название компании': 'Company name',
  'ОГРН': 'OGRN',
  'Банк': 'Bank',
  'Расчётный счёт': 'Account number',
  'Корр. счёт': 'Correspondent account',
  'БИК': 'BIK',
  'Подставляются в договор, счёт и путевой лист': 'Used in contracts, invoices and waybills',
  'Резервная копия': 'Backup',
  'Полная копия базы одной кнопкой': 'Full database copy in one click',
  'CSV открывается в Excel и «МойОфис», XLSX — с готовым форматированием': 'CSV opens in Excel and MyOffice; XLSX comes preformatted',
  'В выгрузку попадают доход, топливо, платные дороги, ремонт, прочие расходы и маржа по каждому рейсу.': 'The export includes income, fuel, tolls, repairs, other costs and margin for each trip.',
  'Откройте перевозку — в карточке есть кнопки «Договор», «Счёт» и «Путевой лист». Документ откроется в новой вкладке с готовой формой А4 и кнопкой печати.': 'Open a trip — the card has Contract, Invoice and Waybill buttons. The document opens in a new tab as a print-ready A4 form.',

  /* ---- contractors */
  'Новый подрядчик': 'New contractor',
  'Подрядчик': 'Contractor',
  'Перевозчик на субподряде': 'Subcontracted carrier',
  'Кому передаём рейсы': 'Who we hand trips to',
  'Типы машин, регионы работы, условия': 'Vehicle types, regions, terms',
  'Добавить подрядчика': 'Add contractor',
  'Подрядчик добавлен': 'Contractor added',
  'Подрядчик обновлён': 'Contractor updated',
  'Подрядчик удалён': 'Contractor deleted',
  'Удалить подрядчика?': 'Delete contractor?',
  'Поиск по названию, ИНН или контакту': 'Search by name, INN or contact',
  'Подрядчиков пока нет': 'No contractors yet',
  'Добавьте перевозчика, которому передаёте рейсы.': 'Add a carrier you hand trips to.',
  'Перевозчики на субподряде: ставки, контакты и расходы по рейсам': 'Subcontracted carriers: rates, contacts and trip costs',
  'Ставка': 'Rate',
  'Ставка по умолчанию, ₽': 'Default rate, ₽',
  'активен': 'active',
  'активны': 'active',
  'активных': 'active',
  'активный': 'active',
  'отключён': 'disabled',

  /* ---- settings */
  'Файл': 'The file',
  'содержит всех пользователей, клиентов, перевозки, расходы, заявки и документы. Сохраните его в надёжном месте — копию можно открыть этим же приложением.': 'contains all users, clients, trips, expenses, requests and documents. Keep it somewhere safe — the copy can be opened with this same app.',
  'Скачать резервную копию': 'Download backup',
  'Резервную копию может скачать только администратор.': 'Only an administrator can download a backup.',
  'Печать документов': 'Document printing',
  'Реквизиты для документов, выгрузки и резервная копия базы': 'Company details for documents, exports and database backups',

  /* ---- reports */
  'Заявки на перевозку': 'Trip requests',
  'В рейс': 'To trip',
  'в расчёте': 'in quote',
  'Заявки, созданные за период': 'Requests created in the period',
  'включая субподряд и топливо': 'including subcontracting and fuel',
  'в рейс': 'into trips',
  'с': 'from',
  'по': 'to',
  '3 мес.': '3 mo.',
  '6 мес.': '6 mo.',

  /* ---- empty states */
  'Иван Петров': 'John Smith',
};

/* Fragments used inside mixed sentences (label + live data). Sorted by length at startup. */
const FRAGMENTS = [
  ['нажмите на строку, чтобы открыть карточку', 'click a row to open the card'],
  ['вот что происходит в перевозках', "here's what's happening with your trips"],
  ['долг', 'debt'],
  ['Долг', 'Debt'],
  ['Добавить перевозку на этапе', 'Add a trip at stage'],
  ['Добавить перевозку', 'Add trip'],
  ['Новые заявки', 'New requests'],
  ['Подтверждено', 'Confirmed'],
  ['В пути', 'In transit'],
  ['Доставлено', 'Delivered'],
  ['Отменено', 'Cancelled'],
  ['Расчёт', 'Quote'],
  ['на этапе', 'at stage'],
  ['Доставленные перевозки', 'Delivered trips'],
  ['доставленные перевозки', 'delivered trips'],
  ['доставленная перевозка', 'delivered trip'],
  ['доставленных перевозок', 'delivered trips'],
  ['доставленный рейс', 'delivered trip'],
  ['доставленных рейса', 'delivered trips'],
  ['доставленных рейсов', 'delivered trips'],
  ['последние 8 недель', 'last 8 weeks'],
  ['Средняя маржинальность', 'Average margin'],
  ['Оплата рейсов учитывается отдельно', 'Trip payments are tracked separately'],
  ['получено за период', 'received for the period'],
  ['в клиентской базе', 'in your client base'],
  ['заявок ещё в работе', 'requests in progress'],
  ['заявки ещё в работе', 'requests in progress'],
  ['заявка ещё в работе', 'request in progress'],
  ['открытых заявок', 'open requests'],
  ['открытые заявки', 'open requests'],
  ['открытая заявка', 'open request'],
  ['открытых', 'open'],
  ['открытые', 'open'],
  ['открытая', 'open'],
  ['выполненных', 'completed'],
  ['выполненные', 'completed'],
  ['выполненная', 'completed'],
  ['Просрочено', 'Overdue'],
  ['просрочено на', 'overdue by'],
  ['просрочено', 'overdue'],
  ['только что', 'just now'],
  ['мин назад', 'min ago'],
  ['ч назад', 'h ago'],
  ['дн назад', 'd ago'],
  ['Открыть карточку', 'Open vehicle card'],
  ['Открыть заявку', 'Open request'],
  ['Обращения водителей', 'Driver reports'],
  ['страховка до', 'insurance until'],
  ['техосмотр до', 'inspection until'],
  ['на ремонт', 'for repair'],
  ['мес. назад', 'mo ago'],
  ['мес.', 'mo.'],
  ['средний чек', 'avg check'],
  ['маржинальность', 'margin'],
  ['просрочка', 'overdue'],
  ['г. назад', 'y ago'],
  ['без движения', 'stalled'],
  ['на сегодня', 'today'],
  ['за 30 дней', 'in 30 days'],
  ['все счета в срок', 'all invoices on time'],
  ['требуют внимания', 'need attention'],
  ['требует внимания', 'needs attention'],
  ['назначено вам. Откройте рейс, чтобы посмотреть маршрут и добавить документы.', 'assigned to you. Open a trip to see the route and add documents.'],
  ['Открыть рейс', 'Open trip'],
  ['Период:', 'Period:'],
  ['доставлено', 'delivered'],
  ['доставка', 'delivery'],
  ['погрузка', 'loading'],
  ['план', 'planned'],
  ['обновлено', 'updated'],
  ['обновлена', 'updated'],
  ['в расчёте', 'in quote'],
  ['в работе', 'in progress'],
  ['в базе', 'added'],
  ['в срок', 'on time'],
  ['Доставленные перевозки', 'Delivered trips'],
  ['рейсов', 'trips'],
  ['рейса', 'trips'],
  ['рейс', 'trip'],
  ['перевозок', 'trips'],
  ['перевозки', 'trips'],
  ['перевозка', 'trip'],
  ['заявок', 'requests'],
  ['заявки', 'requests'],
  ['заявка', 'request'],
  ['компаний', 'companies'],
  ['компании', 'companies'],
  ['компания', 'company'],
  ['контактов', 'contacts'],
  ['контакта', 'contacts'],
  ['контакт', 'contact'],
  ['документов', 'documents'],
  ['документа', 'documents'],
  ['документ', 'document'],
  ['счетов', 'invoices'],
  ['счёта', 'invoices'],
  ['счёт', 'invoice'],
  ['участников', 'members'],
  ['участника', 'members'],
  ['участник', 'member'],
  ['руководитель', 'head'],
  ['водитель', 'driver'],
  ['механик', 'mechanic'],
  ['менеджер', 'manager'],
  ['водителей', 'drivers'],
  ['водителя', 'drivers'],
  ['менеджеров', 'managers'],
  ['менеджера', 'managers'],
  ['руководителей', 'heads'],
  ['руководителя', 'heads'],
  ['механиков', 'mechanics'],
  ['механика', 'mechanics'],
  ['машин', 'vehicles'],
  ['машины', 'vehicles'],
  ['машина', 'vehicle'],
  ['единиц', 'vehicles'],
  ['единицы', 'vehicles'],
  ['единица', 'vehicle'],
  ['категорий', 'categories'],
  ['категории', 'categories'],
  ['категория', 'category'],
  ['дней', 'days'],
  ['дня', 'days'],
  ['день', 'day'],
  ['сигналов', 'alerts'],
  ['сигнала', 'alerts'],
  ['сигнал', 'alert'],
  ['активных', 'active'],
  ['активны', 'active'],
  ['активен', 'active'],
  ['техники', 'vehicles'],
  ['каждые', 'every'],
  ['требует', 'needs'],
  ['требуют', 'need'],
  ['фото', 'photos'],
  ['срок', 'due'],
  ['из', 'of'],
  ['км', 'km'],
  ['м³', 'm³'],
  ['л', 'L'],
  ['т', 't'],
  ['выручка', 'revenue'],
  ['маржа', 'margin'],
  ['расходы', 'expenses'],
  ['Перевозки', 'Trips'],
  ['Рейсы', 'Trips'],
  ['Рейсов', 'Trips'],
  ['Контакты', 'Contacts'],
  ['Перевозок', 'Trips'],
  ['Ремонтов', 'Repairs'],
  ['Погрузка', 'Loading'],
  ['Выгрузка', 'Unloading'],
];

FRAGMENTS.sort((a, b) => b[0].length - a[0].length);

const FRAGMENT_RULES = FRAGMENTS.map(([ru, en]) => {
  const escaped = ru.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return {
    re: new RegExp('(^|[^\\p{L}\\p{N}_])(' + escaped + ')(?=$|[^\\p{L}\\p{N}_])', 'gu'),
    en,
  };
});

const ATTRIBUTES = ['placeholder', 'title', 'aria-label'];

/* ------------------------------------------------------------- translation */

function whitespace(source) {
  const lead = (source.match(/^\s*/) || [''])[0];
  const trail = (source.match(/\s*$/) || [''])[0];
  return [lead, trail];
}

function translateText(source) {
  if (!source || !CYRILLIC.test(source)) return source;
  const [lead, trail] = whitespace(source);
  const core = source.trim().replace(/\s+/g, ' ');
  const direct = DICT[core];
  if (direct) return lead + direct + trail;

  let out = source;
  for (const rule of FRAGMENT_RULES) {
    out = out.replace(rule.re, (match, before) => before + rule.en);
    if (!CYRILLIC.test(out)) break;
  }
  return out;
}

/** Translates a string produced in code (titles, dynamic labels). */
export function tr(text) {
  return lang === 'en' ? translateText(String(text ?? '')) : String(text ?? '');
}

function translateAttributes(el) {
  if (el.closest && el.closest('[data-raw]')) return;
  for (const name of ATTRIBUTES) {
    if (!el.hasAttribute(name)) continue;
    const original = el.getAttribute(name);
    if (!original || !CYRILLIC.test(original)) continue;
    const next = translateText(original);
    if (next !== original) el.setAttribute(name, next);
  }
}

function translateSubtree(root) {
  if (!root || lang !== 'en') return;
  if (root.nodeType === Node.TEXT_NODE) {
    const next = translateText(root.nodeValue || '');
    if (next !== root.nodeValue) root.nodeValue = next;
    return;
  }
  if (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_FRAGMENT_NODE) return;

  if (root.nodeType === Node.ELEMENT_NODE) translateAttributes(root);
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    if (!node.parentElement || !node.parentElement.closest('[data-raw], textarea')) {
      const next = translateText(node.nodeValue || '');
      if (next !== node.nodeValue) node.nodeValue = next;
    }
    node = walker.nextNode();
  }
  if (root.nodeType === Node.ELEMENT_NODE) {
    root.querySelectorAll('[placeholder],[title],[aria-label]').forEach(translateAttributes);
  }
}

export function applyTranslations(root = document.body) {
  translateSubtree(root);
}

let observer = null;
let started = false;

export function initI18n() {
  document.documentElement.lang = lang === 'en' ? 'en' : 'ru';
  if (lang !== 'en') return;
  applyTranslations(document.body);
  if (started) return;
  started = true;
  observer = new MutationObserver((mutations) => {
    if (lang !== 'en') return;
    for (const mutation of mutations) {
      if (mutation.type === 'characterData') {
        const node = mutation.target;
        if (node.parentElement && node.parentElement.closest('[data-raw], textarea')) continue;
        const next = translateText(node.nodeValue || '');
        if (next !== node.nodeValue) node.nodeValue = next;
      } else if (mutation.type === 'attributes') {
        translateAttributes(mutation.target);
      } else {
        mutation.addedNodes.forEach((node) => translateSubtree(node));
      }
    }
  });
  observer.observe(document.body, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: ATTRIBUTES,
  });
}

/** Wires the RU/EN switch. Reload keeps every render path consistent. */
export function bindLangToggle() {
  document.querySelectorAll('[data-lang-toggle]').forEach((button) => {
    button.textContent = lang === 'en' ? 'РУ' : 'EN';
    button.title = lang === 'en' ? 'Switch to Russian' : 'Переключить на английский';
    button.setAttribute('aria-label', button.title);
    button.addEventListener('click', () => {
      setLang(lang === 'en' ? 'ru' : 'en');
      window.location.reload();
    });
  });
}

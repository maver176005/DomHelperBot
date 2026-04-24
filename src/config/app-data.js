const PROVIDER_AVAILABILITY = {
  READY_NOW: 'ready_now',
  LATER: 'later',
  OFFLINE: 'offline',
};

const URGENCY_OPTIONS = [
  { key: 'within_hour', label: '⏰ Срочно: в течение часа' },
  { key: 'today', label: '🕖 Сегодня' },
  { key: 'flexible', label: '🌿 Без спешки' },
];

const PAYMENT_OPTIONS = [
  '💵 Наличные',
  '💳 Перевод',
  '🤝 Договоримся',
];

const SERVICE_TEMPLATES = [
  {
    key: 'trash_removal',
    title: '🗑 Вынести мусор',
    description: 'Быстро вынести пакеты от двери',
    supported: true,
    baseScore: 100,
  },
  {
    key: 'pharmacy_run',
    title: '💊 Сходить в аптеку',
    description: 'Купить лекарства или забрать заказ',
    supported: true,
    baseScore: 70,
  },
  {
    key: 'groceries',
    title: '🛒 Купить продукты',
    description: 'Зайти в магазин по соседству',
    supported: true,
    baseScore: 65,
  },
  {
    key: 'football_meetup',
    title: '⚽ Собраться поиграть',
    description: 'Найти соседей для совместной игры',
    supported: true,
    baseScore: 55,
  },
  {
    key: 'other_help',
    title: '🤝 Другая помощь',
    description: 'Любой соседский запрос внутри дома',
    supported: true,
    baseScore: 50,
  },
];

const STATUS_LABELS = {
  created: 'Создан',
  assigned: 'В работе',
  completed: 'Ожидает подтверждения клиента',
  confirmed: 'Подтвержден',
  cancelled: 'Отменен',
};

module.exports = {
  PAYMENT_OPTIONS,
  PROVIDER_AVAILABILITY,
  SERVICE_TEMPLATES,
  STATUS_LABELS,
  URGENCY_OPTIONS,
};

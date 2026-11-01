/**
 * NEKRONIUM SYSTEM CONFIGURATION
 * Файл конфигурации цен, товаров и системных настроек.
 * Вы можете редактировать цены и названия прямо в этом файле,
 * либо менять их через секретную Админ-Панель на сайте с мгновенным сохранением!
 */

const NEKRONIUM_DEFAULT_CONFIG = {
  system: {
    brandName: "NEKRONIUM",
    loaderName: "NekroniumLoader.exe",
    loaderVersion: "V3.4.1 LIVE",
    currency: "₽"
  },
  products: [
    {
      id: "nekronium-sif",
      name: "Nekronium SIF",
      game: "Sky In Flames",
      status: "Undetected",
      features: [
        "Visuals: Box ESP, Icon ESP, WallHack",
        "Обход сигнатурных проверок и античитов"
      ],
      tiers: [
        { key: "7", label: "7 дней", price: 399, days: 7 },
        { key: "30", label: "30 дней", price: 890, days: 30 },
        { key: "lifetime", label: "Навсегда (Lifetime)", price: 1490, days: 36500 }
      ]
    },
    {
      id: "spoofer-hwid",
      name: "👻 SPOOFER",
      game: "HWID UNBAN & PROTECTION",
      status: "Undetected",
      features: [
        "Полный обход блокировок по железу (HWID)",
        "Смена серийных номеров SSD / HDD, BIOS, Motherboard, MAC",
        "Работает без переустановки Windows"
      ],
      tiers: [
        { key: "lifetime", label: "Навсегда (Lifetime)", price: 499, days: 36500 }
      ]
    },
    {
      id: "guide-bypass",
      name: "ГАЙД НА ОБХОД БАНА (БЕЗ ПОКУПКИ ИГРЫ)",
      game: "EXCLUSIVE MANUAL",
      status: "Working",
      features: [
        "Пошаговая методика 100% снятия банов",
        "Обход без необходимости повторно покупать игру",
        "Пожизненный доступ к гайду и обновлениям"
      ],
      tiers: [
        { key: "lifetime", label: "Полный доступ (Навсегда)", price: 990, days: 36500 }
      ]
    }
  ]
};

// Экспорт в глобальный объект window для браузера
if (typeof window !== "undefined") {
  window.NEKRONIUM_DEFAULT_CONFIG = NEKRONIUM_DEFAULT_CONFIG;
}

// Экспорт для Node.js если потребуется
if (typeof module !== "undefined" && module.exports) {
  module.exports = NEKRONIUM_DEFAULT_CONFIG;
}

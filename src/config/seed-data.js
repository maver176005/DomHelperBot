const DEFAULT_HOUSES = [
  {
    id: 'house_1',
    title: 'ЖК Северный, дом 1',
    city: 'Москва',
    address: 'ул. Примерная, 1',
    isActive: true,
  },
  {
    id: 'house_2',
    title: 'ЖК Северный, дом 2',
    city: 'Москва',
    address: 'ул. Примерная, 2',
    isActive: true,
  },
];

const DEFAULT_DB = {
  houses: DEFAULT_HOUSES,
  users: [],
  orders: [],
  listings: [],
};

module.exports = {
  DEFAULT_DB,
  DEFAULT_HOUSES,
};

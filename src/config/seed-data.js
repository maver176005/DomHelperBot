const DEFAULT_HOUSES = [
  {
    id: 'house_1',
    title: 'Обнинск, ул. Ленина, 1',
    city: 'Обнинск',
    street: 'Ленина',
    houseNumber: '1',
    address: 'ул. Ленина, 1',
    normalizedAddress: 'обнинск|ленина|1',
    isActive: true,
    status: 'active',
    source: 'seed',
  },
  {
    id: 'house_2',
    title: 'Обнинск, ул. Курчатова, 10',
    city: 'Обнинск',
    street: 'Курчатова',
    houseNumber: '10',
    address: 'ул. Курчатова, 10',
    normalizedAddress: 'обнинск|курчатова|10',
    isActive: true,
    status: 'active',
    source: 'seed',
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

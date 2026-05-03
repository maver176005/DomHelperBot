function isValidName(value) {
  const trimmed = value.trim();
  return trimmed.length >= 2 && trimmed.length <= 80 && /[a-zа-яё]/i.test(trimmed) && !/\d/.test(trimmed);
}

function normalizePhone(value) {
  const trimmed = value.trim();
  if (/[a-zа-яё]/i.test(trimmed)) {
    return '';
  }

  const digits = trimmed.replace(/\D/g, '');

  if (digits.length === 10) {
    return `+7${digits}`;
  }

  if (digits.length === 11 && digits.startsWith('8')) {
    return `+7${digits.slice(1)}`;
  }

  if (digits.length === 11 && digits.startsWith('7')) {
    return `+${digits}`;
  }

  return '';
}

function isValidPhone(value) {
  return /^\+7\d{10}$/.test(value);
}

function isValidShortAddressPart(value) {
  const trimmed = value.trim();
  return trimmed.length >= 1 && trimmed.length <= 20;
}

function isValidFloor(value) {
  const floor = Number(value);
  return Number.isInteger(floor) && floor >= -5 && floor <= 100;
}

module.exports = {
  isValidFloor,
  isValidName,
  isValidPhone,
  isValidShortAddressPart,
  normalizePhone,
};

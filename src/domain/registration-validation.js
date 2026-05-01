function isValidName(value) {
  const trimmed = value.trim();
  return trimmed.length >= 2 && trimmed.length <= 80;
}

function normalizePhone(value) {
  const trimmed = value.trim();
  const hasPlus = trimmed.startsWith('+');
  const digits = trimmed.replace(/\D/g, '');
  return hasPlus ? `+${digits}` : digits;
}

function isValidPhone(value) {
  const digits = value.replace(/\D/g, '');
  return digits.length >= 10 && digits.length <= 15;
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

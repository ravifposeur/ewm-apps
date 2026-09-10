// service/src/business/engine.js

function calculateDeviation(recordedTotal, actualTotal) {
  if (recordedTotal === 0) return 0;
  return Math.abs((recordedTotal - actualTotal) / recordedTotal) * 100;
}

function calculatePoints(weight, wasteType, multiplier) {
  if (wasteType === 'HAZMAT' || wasteType === 'RESIDU') return 0;
  return Math.floor(weight * multiplier);
}

function calculateTotalPoints(breakdown, multiplier) {
  return breakdown.reduce((total, item) => {
    return total + calculatePoints(item.weight, item.wasteType, multiplier);
  }, 0);
}

function determineGrade(points) {
  if (points < 10000) return 'BRONZE';
  if (points <= 50000) return 'SILVER';
  return 'GOLD';
}

function calculateTotalWeight(breakdown) {
  return breakdown.reduce((sum, item) => sum + item.weight, 0);
}

module.exports = {
  calculateDeviation,
  calculatePoints,
  calculateTotalPoints,
  determineGrade,
  calculateTotalWeight,
};

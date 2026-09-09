// test-business.js
const {
  calculateDeviation,
  calculatePoints,
  calculateTotalPoints,
  determineGrade,
  calculateTotalWeight
} = require('./src/business/engine');

console.log('=== Test calculateDeviation ===');
console.log('Deviation 88 vs 85:', calculateDeviation(88, 85).toFixed(2) + '%'); // ~3.41%
console.log('Deviation 100 vs 90:', calculateDeviation(100, 90).toFixed(2) + '%'); // 10%
console.log('Deviation 0 vs 100:', calculateDeviation(0, 100)); // 0

console.log('\n=== Test calculatePoints ===');
console.log('PLASTIK 5000 * 0.5:', calculatePoints(5000, 'PLASTIK', 0.5)); // 2500
console.log('HAZMAT 5000 * 0.5:', calculatePoints(5000, 'HAZMAT', 0.5)); // 0
console.log('RESIDU 5000 * 0.5:', calculatePoints(5000, 'RESIDU', 0.5)); // 0

console.log('\n=== Test calculateTotalPoints ===');
const breakdown = [
  { wasteType: 'PLASTIK', weight: 30000 },
  { wasteType: 'ORGANIK', weight: 20000 },
  { wasteType: 'HAZMAT', weight: 5000 },
  { wasteType: 'RESIDU', weight: 10000 },
];
console.log('Breakdown points (multiplier 0.5):', calculateTotalPoints(breakdown, 0.5));
// Expected: (30000+20000)*0.5 = 25000 (HAZMAT & RESIDU = 0)

console.log('\n=== Test determineGrade ===');
console.log('0 points:', determineGrade(0)); // BRONZE
console.log('9999 points:', determineGrade(9999)); // BRONZE
console.log('10000 points:', determineGrade(10000)); // SILVER
console.log('50000 points:', determineGrade(50000)); // SILVER
console.log('50001 points:', determineGrade(50001)); // GOLD

console.log('\n=== Test calculateTotalWeight ===');
console.log('Total weight from breakdown:', calculateTotalWeight(breakdown)); // 65000

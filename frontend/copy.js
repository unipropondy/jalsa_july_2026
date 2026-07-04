const fs = require('fs');
const content = fs.readFileSync('e:/Club_Demo/frontend/app/sales-report.tsx', 'utf8');
const newContent = content
  .replace(/Dayend/g, 'Settlement')
  .replace(/dayend/g, 'settlement')
  .replace(/DAYEND/g, 'SETTLEMENT')
  .replace(/DayEnd/g, 'Settlement')
  .replace(/SalesReport/g, 'SettlementReport');
fs.writeFileSync('e:/Club_Demo/frontend/app/settlement-report.tsx', newContent);
console.log('Successfully copied and updated sales-report.tsx to settlement-report.tsx');

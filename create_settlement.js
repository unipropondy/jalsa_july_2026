const fs = require('fs');
const path = require('path');

const sourcePath = path.join(__dirname, 'frontend', 'app', 'sales-report.tsx');
const destPath = path.join(__dirname, 'frontend', 'app', 'settlement-report.tsx');

try {
  let content = fs.readFileSync(sourcePath, 'utf8');

  // Replace text
  content = content
    .replace(/Dayend/g, 'Settlement')
    .replace(/dayend/g, 'settlement')
    .replace(/DAYEND/g, 'SETTLEMENT')
    .replace(/DayEnd/g, 'Settlement')
    .replace(/SalesReport/g, 'SettlementReport');

  fs.writeFileSync(destPath, content);
  console.log('Successfully created settlement-report.tsx based on sales-report.tsx');
} catch (error) {
  console.error('Error creating settlement page:', error);
}

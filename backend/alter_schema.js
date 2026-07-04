const sql = require('mssql');
require('dotenv').config({path: '../frontend/.env'});
const config = { 
  user: process.env.DB_USER || 'sa', 
  password: process.env.DB_PASSWORD || 'Oviya123!@#', 
  server: 'localhost', 
  database: 'Club_Demo', 
  options: { encrypt: false, trustServerCertificate: true } 
};
sql.connect(config)
  .then(pool => pool.request().query(`
    ALTER TABLE dateentry ALTER COLUMN username VARCHAR(100);
    ALTER TABLE dateentry ALTER COLUMN Createdby VARCHAR(100);
    ALTER TABLE dateentry ALTER COLUMN updateby VARCHAR(100);
  `))
  .then(() => {
     console.log("Table altered successfully");
  })
  .catch(console.error)
  .finally(() => process.exit(0));

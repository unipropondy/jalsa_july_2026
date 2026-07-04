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
  .then(pool => pool.request().query('EXEC sp_help dateentry'))
  .then(result => {
     console.dir(result.recordsets[1]);
  })
  .catch(console.error)
  .finally(() => process.exit(0));

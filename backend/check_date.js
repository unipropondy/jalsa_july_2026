const sql = require("mssql");
const { poolPromise } = require("./config/db");

async function checkDateEntry() {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query("SELECT * FROM dateentry");
    console.log("DateEntry Table Contents:", result.recordset);
  } catch (err) {
    console.error(err);
  } finally {
    process.exit(0);
  }
}

checkDateEntry();

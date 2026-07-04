const { poolPromise } = require('./config/db');

async function test() {
  try {
    const pool = await poolPromise;
    const res = await pool.request().query("SELECT TOP 1 * FROM RestaurantInvoiceCur");
    console.log(res.recordset);
  } catch (err) {
    console.error(err);
  } finally {
    process.exit();
  }
}

test();

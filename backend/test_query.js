const { getPool, sql } = require('./config/db');
(async () => {
    try {
        const pool = await getPool();
        const fDate = '2026-06-24T00:00:00.000Z';
        const tDate = '2026-06-24T23:59:59.000Z';
        const dateFilter = `CAST(start_date AS DATE) BETWEEN CAST('${fDate}' AS DATE) AND CAST('${tDate}' AS DATE)`;
        const query = `SELECT * FROM CashOutEntry WHERE ${dateFilter}`;
        console.log('Query:', query);
        const result = await pool.request().query(query);
        console.log('Result:', result.recordset);
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
})();

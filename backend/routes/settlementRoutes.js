const express = require('express');
const router = express.Router();
const { getPool, sql } = require('../config/db');
const { authenticateToken } = require('../middleware/auth');

// ============================================
// 1️⃣ CHECK IF DAY IS SETTLED
// ============================================
router.get('/check', authenticateToken, async (req, res) => {
  try {
    let { outletId, date } = req.query;

    // ✅ FIX: Convert to integer
    outletId = parseInt(outletId);
    if (isNaN(outletId)) {
      return res.status(400).json({ error: 'Invalid outletId' });
    }

    console.log('📡 Check settlement:', { outletId, date });

    const pool = getPool();
    const result = await pool.request()
      .input('outletId', sql.Int, outletId)
      .input('settlementDate', sql.Date, date)
      .query(`SELECT Id, Status FROM settlement WHERE OutletId = @outletId AND SettlementDate = @settlementDate`);

    res.json({
      success: true,
      settled: result.recordset.length > 0 && result.recordset[0]?.Status === 'COMPLETED',
      settlementId: result.recordset[0]?.Id || null
    });
  } catch (err) {
    console.error('Check error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// 2️⃣ GET OPENING CASH
// ============================================
router.get('/opening-cash', authenticateToken, async (req, res) => {
  try {
    let { outletId, date } = req.query;

    // ✅ FIX: Convert to integer
    outletId = parseInt(outletId);
    if (isNaN(outletId)) {
      return res.status(400).json({ error: 'Invalid outletId' });
    }

    const pool = getPool();
    const result = await pool.request()
      .input('outletId', sql.Int, outletId)
      .input('settlementDate', sql.Date, date)
      .query(`SELECT OpeningCashJSON, OpeningCashTotal FROM settlement WHERE OutletId = @outletId AND SettlementDate = @settlementDate`);

    if (result.recordset.length === 0) {
      return res.json({ success: true, data: null });
    }

    if (!result.recordset[0]?.OpeningCashJSON) {
      return res.json({ success: true, data: { total: result.recordset[0].OpeningCashTotal || 0 } });
    }

    const data = JSON.parse(result.recordset[0].OpeningCashJSON);
    res.json({
      success: true,
      data: {
        notes: data.notes || {},
        coins: data.coins || {},
        total: result.recordset[0].OpeningCashTotal || 0
      }
    });
  } catch (err) {
    console.error('Get opening cash error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// 3️⃣ SAVE OPENING CASH
// ============================================
router.post('/opening-cash', authenticateToken, async (req, res) => {
  try {
    let { outletId, settlementDate, notes, coins, total, cashierName } = req.body;

    // ✅ FIX: Convert to integer
    outletId = parseInt(outletId);
    if (isNaN(outletId)) {
      return res.status(400).json({ error: 'Invalid outletId' });
    }

    const openingCashJSON = JSON.stringify({ notes, coins });
    const pool = getPool();

    await pool.request()
      .input('outletId', sql.Int, outletId)
      .input('settlementDate', sql.Date, settlementDate)
      .input('openingCashJSON', sql.NVarChar, openingCashJSON)
      .input('openingCashTotal', sql.Decimal(10, 2), total || 0)
      .input('cashierName', sql.NVarChar, cashierName || '')
      .query(`
        MERGE settlement AS target
        USING (SELECT @outletId as OutletId, @settlementDate as SettlementDate) AS source
        ON (target.OutletId = source.OutletId AND target.SettlementDate = source.SettlementDate)
        WHEN MATCHED THEN
          UPDATE SET OpeningCashJSON = @openingCashJSON, OpeningCashTotal = @openingCashTotal, CashierName = @cashierName, UpdatedAt = GETDATE()
        WHEN NOT MATCHED THEN
          INSERT (OutletId, SettlementDate, CashierName, OpeningCashJSON, OpeningCashTotal, CreatedAt)
          VALUES (@outletId, @settlementDate, @cashierName, @openingCashJSON, @openingCashTotal, GETDATE());
      `);

    res.json({ success: true, message: 'Opening cash saved' });
  } catch (err) {
    console.error('Save opening cash error:', err);
    res.status(500).json({ error: err.message });
  }
});


// ============================================
// 7️⃣ GET PHYSICAL CASH
// ============================================
router.get('/physical-cash', authenticateToken, async (req, res) => {
  try {
    let { outletId, date } = req.query;

    // ✅ FIX: Convert to integer
    outletId = parseInt(outletId);
    if (isNaN(outletId)) {
      return res.status(400).json({ error: 'Invalid outletId' });
    }

    const pool = getPool();
    const result = await pool.request()
      .input('outletId', sql.Int, outletId)
      .input('settlementDate', sql.Date, date)
      .query(`SELECT PhysicalCashJSON, PhysicalCashTotal FROM settlement WHERE OutletId = @outletId AND SettlementDate = @settlementDate`);

    if (result.recordset.length === 0 || !result.recordset[0]?.PhysicalCashJSON) {
      return res.json({ success: true, data: null });
    }

    const data = JSON.parse(result.recordset[0].PhysicalCashJSON);
    res.json({
      success: true,
      data: {
        notes: data.notes || {},
        coins: data.coins || {},
        total: result.recordset[0].PhysicalCashTotal || 0
      }
    });
  } catch (err) {
    console.error('Get physical cash error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// 8️⃣ SAVE PHYSICAL CASH
// ============================================
router.post('/physical-cash', authenticateToken, async (req, res) => {
  try {
    let { outletId, settlementDate, notes, coins, total } = req.body;

    // ✅ FIX: Convert to integer
    outletId = parseInt(outletId);
    if (isNaN(outletId)) {
      return res.status(400).json({ error: 'Invalid outletId' });
    }

    const physicalCashJSON = JSON.stringify({ notes, coins });
    const pool = getPool();

    await pool.request()
      .input('outletId', sql.Int, outletId)
      .input('settlementDate', sql.Date, settlementDate)
      .input('physicalCashJSON', sql.NVarChar, physicalCashJSON)
      .input('physicalCashTotal', sql.Decimal(10, 2), total || 0)
      .query(`
        MERGE settlement AS target
        USING (SELECT @outletId as OutletId, @settlementDate as SettlementDate) AS source
        ON (target.OutletId = source.OutletId AND target.SettlementDate = source.SettlementDate)
        WHEN MATCHED THEN
          UPDATE SET PhysicalCashJSON = @physicalCashJSON, PhysicalCashTotal = @physicalCashTotal, UpdatedAt = GETDATE()
        WHEN NOT MATCHED THEN
          INSERT (OutletId, SettlementDate, PhysicalCashJSON, PhysicalCashTotal, CreatedAt)
          VALUES (@outletId, @settlementDate, @physicalCashJSON, @physicalCashTotal, GETDATE());
      `);

    res.json({ success: true });
  } catch (err) {
    console.error('Save physical cash error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// 9️⃣ FINALIZE SETTLEMENT
// ============================================
router.post('/finalize', authenticateToken, async (req, res) => {
  try {
    let { outletId, settlementDate, cashierName, totalSales, totalDiscount, voidAmount, netSales,
      cashReceived, openingCash, manualCashOutTotal, expectedClosing, physicalCash,
      variance, varianceStatus, cashAmount, cardAmount, upiAmount, paynowAmount, valueCardAmount } = req.body;

    // ✅ FIX: Convert to integer
    outletId = parseInt(outletId);
    if (isNaN(outletId)) {
      return res.status(400).json({ error: 'Invalid outletId' });
    }

    const paymentBreakdownJSON = JSON.stringify({
      cash: cashAmount || 0, card: cardAmount || 0, upi: upiAmount || 0,
      paynow: paynowAmount || 0, valuecard: valueCardAmount || 0
    });

    const pool = getPool();

    // Check if already settled
    const checkResult = await pool.request()
      .input('outletId', sql.Int, outletId)
      .input('settlementDate', sql.Date, settlementDate)
      .query(`SELECT Id FROM settlement WHERE OutletId = @outletId AND SettlementDate = @settlementDate AND Status = 'COMPLETED'`);

    if (checkResult.recordset.length > 0) {
      return res.status(400).json({ error: 'Day already settled' });
    }

    await pool.request()
      .input('outletId', sql.Int, outletId)
      .input('settlementDate', sql.Date, settlementDate)
      .input('cashierName', sql.NVarChar, cashierName || '')
      .input('totalSales', sql.Decimal(10, 2), totalSales || 0)
      .input('totalDiscount', sql.Decimal(10, 2), totalDiscount || 0)
      .input('voidAmount', sql.Decimal(10, 2), voidAmount || 0)
      .input('netSales', sql.Decimal(10, 2), netSales || 0)
      .input('cashReceived', sql.Decimal(10, 2), cashReceived || 0)
      .input('expectedClosing', sql.Decimal(10, 2), expectedClosing || 0)
      .input('cashVariance', sql.Decimal(10, 2), variance || 0)
      .input('varianceStatus', sql.NVarChar, varianceStatus || 'BALANCED')
      .input('paymentBreakdownJSON', sql.NVarChar, paymentBreakdownJSON)
      .input('status', sql.NVarChar, 'COMPLETED')
      .input('settledBy', sql.NVarChar, req.user.id || '')
      .query(`
        MERGE settlement AS target
        USING (SELECT @outletId as OutletId, @settlementDate as SettlementDate) AS source
        ON (target.OutletId = source.OutletId AND target.SettlementDate = source.SettlementDate)
        WHEN MATCHED THEN
          UPDATE SET 
            TotalSales = @totalSales,
            TotalDiscount = @totalDiscount,
            VoidAmount = @voidAmount,
            NetSales = @netSales,
            CashReceived = @cashReceived,
            ExpectedClosingCash = @expectedClosing,
            CashVariance = @cashVariance,
            VarianceStatus = @varianceStatus,
            PaymentBreakdownJSON = @paymentBreakdownJSON,
            Status = @status,
            SettledBy = @settledBy,
            SettledAt = GETDATE(),
            UpdatedAt = GETDATE()
        WHEN NOT MATCHED THEN
          INSERT (
            OutletId, SettlementDate, CashierName, TotalSales, TotalDiscount, 
            VoidAmount, NetSales, CashReceived, ExpectedClosingCash, CashVariance, 
            VarianceStatus, PaymentBreakdownJSON, Status, SettledBy, SettledAt, 
            CreatedAt, UpdatedAt
          )
          VALUES (
            @outletId, @settlementDate, @cashierName, @totalSales, @totalDiscount, 
            @voidAmount, @netSales, @cashReceived, @expectedClosing, @cashVariance, 
            @varianceStatus, @paymentBreakdownJSON, @status, @settledBy, GETDATE(), 
            GETDATE(), GETDATE()
          );
      `);

    res.json({ success: true });
  } catch (err) {
    console.error('Error finalizing:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// 10️⃣ GET DENOMINATIONS
// ============================================
router.get('/denominations', authenticateToken, async (req, res) => {
  try {
    const type = req.query.type === 'CLOSE' ? 'CLOSE' : 'OPEN';
    const { date, screenType } = req.query;
    const pool = getPool();
    const request = pool.request();

    let query = `
      SELECT CurrencyValue, NoteCount 
      FROM OpeningCashDenomination 
      WHERE Type = @type
    `;
    request.input('type', sql.VarChar, type);

    const targetScreenType = screenType || 'CB';
    request.input('screenType', sql.VarChar, targetScreenType);
    query += ` AND (ScreenType = @screenType OR (ScreenType IS NULL AND @screenType = 'CB'))`;

    if (date) {
      request.input('date', sql.Date, date);
      query += ` AND CAST(start_date as DATE) = @date`;
    } else {
      query += ` AND CAST(start_date as DATE) = CAST(GETDATE() as DATE)`;
    }

    const result = await request.query(query);
    res.json({ success: true, data: result.recordset });
  } catch (err) {
    console.error('Error getting denominations:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// 11️⃣ SAVE DENOMINATIONS
// ============================================
router.post('/save-denominations', authenticateToken, async (req, res) => {
  try {
    const { denominations, type, date, outletId, screenType } = req.body;
    const recordType = type === 'CLOSE' ? 'CLOSE' : 'OPEN';
    const targetScreenType = screenType || 'CB';

    if (!denominations || !Array.isArray(denominations)) {
      return res.status(400).json({ error: 'Invalid denominations data' });
    }

    const pool = getPool();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      const request = new sql.Request(transaction);
      const createdBy = req.user?.userName || req.user?.username || 'Admin';

      const targetDate = date ? new Date(date) : new Date();

      const startDateResult = await transaction.request().query(`
        SELECT TOP 1 StartDate
        FROM DateEntry
        ORDER BY CreatedDate DESC
      `);
      const startDate = startDateResult.recordset[0]?.StartDate || null;

      // Delete existing records for targetDate and targetScreenType to allow "update"
      request.input('targetDate', sql.Date, targetDate);
      request.input('screenType', sql.VarChar, targetScreenType);
      await request.query(`
        DELETE FROM OpeningCashDenomination 
        WHERE CAST(CreatedOn as DATE) = @targetDate
        AND Type = '${recordType}'
        AND (ScreenType = @screenType OR (ScreenType IS NULL AND @screenType = 'CB'))
      `);

      // Loop through and insert each denomination that has a count > 0
      for (const item of denominations) {
        if (item.count > 0) {
          const insertReq = new sql.Request(transaction);
          insertReq.input('value', sql.Decimal(10, 2), item.value);
          insertReq.input('count', sql.Int, item.count);
          insertReq.input('recordType', sql.VarChar, recordType);
          insertReq.input('createdBy', sql.VarChar, createdBy);
          insertReq.input('targetDate', sql.Date, targetDate);
          insertReq.input('screenType', sql.VarChar, targetScreenType);
          insertReq.input('startDate', sql.DateTime, startDate);

          const dateValue = date ? '@targetDate' : 'GETDATE()';
          await insertReq.query(`
            INSERT INTO OpeningCashDenomination (CurrencyValue, NoteCount, Type, CreatedBy, CreatedOn, ScreenType, start_date)
            VALUES (@value, @count, @recordType, @createdBy, ${dateValue}, @screenType, @startDate)
          `);
        }
      }

      // Sync to settlement table
      const notes = {};
      const coins = {};
      let totalAmount = 0;
      for (const item of denominations) {
        if (item.count > 0) {
          totalAmount += item.value * item.count;
          const key = item.value.toFixed(2);
          if (item.value >= 1) {
            notes[key] = item.count;
          } else {
            coins[key] = item.count;
          }
        }
      }
      const jsonStr = JSON.stringify({ notes, coins });

      const parsedOutletId = parseInt(outletId) || 1;

      if (recordType === 'OPEN') {
        const setRequest = new sql.Request(transaction);
        setRequest.input('outletId', sql.Int, parsedOutletId);
        setRequest.input('settlementDate', sql.Date, targetDate);
        setRequest.input('openingCashJSON', sql.NVarChar, jsonStr);
        setRequest.input('openingCashTotal', sql.Decimal(10, 2), totalAmount);
        setRequest.input('cashierName', sql.NVarChar, createdBy || '');
        await setRequest.query(`
          MERGE settlement AS target
          USING (SELECT @outletId as OutletId, @settlementDate as SettlementDate) AS source
          ON (target.OutletId = source.OutletId AND target.SettlementDate = source.SettlementDate)
          WHEN MATCHED THEN
            UPDATE SET OpeningCashJSON = @openingCashJSON, OpeningCashTotal = @openingCashTotal, CashierName = @cashierName, UpdatedAt = GETDATE()
          WHEN NOT MATCHED THEN
            INSERT (OutletId, SettlementDate, CashierName, OpeningCashJSON, OpeningCashTotal, CreatedAt)
            VALUES (@outletId, @settlementDate, @cashierName, @openingCashJSON, @openingCashTotal, GETDATE());
        `);
      } else if (recordType === 'CLOSE') {
        const setRequest = new sql.Request(transaction);
        setRequest.input('outletId', sql.Int, parsedOutletId);
        setRequest.input('settlementDate', sql.Date, targetDate);
        setRequest.input('physicalCashJSON', sql.NVarChar, jsonStr);
        setRequest.input('physicalCashTotal', sql.Decimal(10, 2), totalAmount);
        await setRequest.query(`
          MERGE settlement AS target
          USING (SELECT @outletId as OutletId, @settlementDate as SettlementDate) AS source
          ON (target.OutletId = source.OutletId AND target.SettlementDate = source.SettlementDate)
          WHEN MATCHED THEN
            UPDATE SET PhysicalCashJSON = @physicalCashJSON, PhysicalCashTotal = @physicalCashTotal, UpdatedAt = GETDATE()
          WHEN NOT MATCHED THEN
            INSERT (OutletId, SettlementDate, PhysicalCashJSON, PhysicalCashTotal, CreatedAt)
            VALUES (@outletId, @settlementDate, @physicalCashJSON, @physicalCashTotal, GETDATE());
        `);
      }

      await transaction.commit();
      res.json({ success: true, message: 'Denominations saved successfully' });
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  } catch (err) {
    console.error('Error saving denominations:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// 12️⃣ CASH OUT CRUD OPERATIONS
// ============================================

// GET Cash Out entries for a specific terminal (or ALL) for today
router.get('/cash-out/:terminal', authenticateToken, async (req, res) => {
  try {
    const { terminal } = req.params;
    const { fromDate, toDate } = req.query;
    const pool = getPool();
    const request = pool.request();

    let dateFilter = "CAST(start_date as DATE) = CAST(GETDATE() as DATE)";
    if (fromDate && toDate) {
      const fDate = fromDate.replace(/[^0-9T:.-]/g, '');
      const tDate = toDate.replace(/[^0-9T:.-]/g, '');
      dateFilter = `CAST(start_date AS DATE) BETWEEN CAST('${fDate}' AS DATE) AND CAST('${tDate}' AS DATE)`;
    }

    let query = `
      SELECT CashOutId, CashOutNo, CashOutDate, Amount, Reason, Remarks, PaymentMode, ReferenceNo, TerminalCode, CreatedBy, CreatedOn 
      FROM CashOutEntry 
      WHERE ${dateFilter}
    `;

    if (terminal !== 'ALL') {
      query += ` AND TerminalCode = @TerminalCode`;
      request.input('TerminalCode', sql.VarChar, terminal);
    }

    query += ` ORDER BY CreatedOn DESC`;

    const result = await request.query(query);
    res.json({ success: true, data: result.recordset });
  } catch (err) {
    console.error('Error fetching cash out entries:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST new Cash Out entry
router.post('/cash-out', authenticateToken, async (req, res) => {
  try {
    const { amount, reason, remarks, paymentMode, referenceNo, terminalCode, date } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Valid amount is required' });
    }

    const createdBy = req.user?.userName || req.user?.username || 'Admin';
    const pool = getPool();

    const startDateResult = await pool.request().query(`
      SELECT TOP 1 StartDate
      FROM DateEntry
      ORDER BY CreatedDate DESC
    `);
    const start_date = startDateResult.recordset[0]?.StartDate || null;

    // Generate simple auto-incrementing/timestamp-based CashOutNo
    const targetDate = date ? new Date(date) : new Date();
    const dateStr = targetDate.toISOString().slice(0, 10).replace(/-/g, '');
    const randId = Math.floor(1000 + Math.random() * 9000);
    const cashOutNo = `CO-${dateStr}-${randId}`;

    const result = await pool.request()
      .input('CashOutNo', sql.VarChar, cashOutNo)
      .input('Amount', sql.Decimal(18, 2), amount)
      .input('Reason', sql.VarChar, reason || '')
      .input('Remarks', sql.VarChar, remarks || '')
      .input('PaymentMode', sql.VarChar, paymentMode || 'Cash')
      .input('ReferenceNo', sql.VarChar, referenceNo || '')
      .input('TerminalCode', sql.VarChar, terminalCode || '')
      .input('CreatedBy', sql.VarChar, createdBy)
      .input('targetDate', sql.Date, targetDate)
      .input('start_date', sql.Date, start_date)
      .query(`
        INSERT INTO CashOutEntry (CashOutNo, CashOutDate, Amount, Reason, Remarks, PaymentMode, ReferenceNo, TerminalCode, CreatedBy, CreatedOn,start_date)
        OUTPUT inserted.*
        VALUES (@CashOutNo, @targetDate, @Amount, @Reason, @Remarks, @PaymentMode, @ReferenceNo, @TerminalCode, @CreatedBy, GETDATE(), @start_date)
      `);

    res.json({ success: true, data: result.recordset[0] });
  } catch (err) {
    console.error('Error creating cash out entry:', err);
    res.status(500).json({ error: err.message });
  }
});

// PUT update Cash Out entry
router.put('/cash-out/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { amount, reason, remarks, paymentMode, referenceNo, terminalCode } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Valid amount is required' });
    }

    const pool = getPool();
    const result = await pool.request()
      .input('CashOutId', sql.UniqueIdentifier, id)
      .input('Amount', sql.Decimal(18, 2), amount)
      .input('Reason', sql.VarChar, reason || '')
      .input('Remarks', sql.VarChar, remarks || '')
      .input('PaymentMode', sql.VarChar, paymentMode || 'Cash')
      .input('ReferenceNo', sql.VarChar, referenceNo || '')
      .input('TerminalCode', sql.VarChar, terminalCode || '')
      .query(`
        UPDATE CashOutEntry
        SET Amount = @Amount, Reason = @Reason, Remarks = @Remarks, PaymentMode = @PaymentMode, 
            ReferenceNo = @ReferenceNo, TerminalCode = @TerminalCode
        OUTPUT inserted.*
        WHERE CashOutId = @CashOutId
      `);

    if (result.recordset.length === 0) {
      return res.status(404).json({ error: 'Cash out entry not found' });
    }

    res.json({ success: true, data: result.recordset[0] });
  } catch (err) {
    console.error('Error updating cash out entry:', err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE Cash Out entry
router.delete('/cash-out/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const pool = getPool();
    const result = await pool.request()
      .input('CashOutId', sql.UniqueIdentifier, id)
      .query(`
        DELETE FROM CashOutEntry
        WHERE CashOutId = @CashOutId
      `);

    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ error: 'Cash out entry not found' });
    }

    res.json({ success: true, message: 'Cash out entry deleted successfully' });
  } catch (err) {
    console.error('Error deleting cash out entry:', err);
    res.status(500).json({ error: err.message });
  }
});


// POST Cash Box Entry
router.post('/artist-cashbox', authenticateToken, async (req, res) => {
  try {
    const { ArtistName, Amount } = req.body;

    if (!ArtistName || !Amount) {
      return res.status(400).json({
        error: 'Artist Name and Amount are required'
      });
    }

    const pool = getPool();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      const startDateResult = await transaction.request().query(`
        SELECT TOP 1 StartDate
        FROM DateEntry
        ORDER BY CreatedDate DESC
      `);
      const startDate = startDateResult.recordset[0]?.StartDate || null;

      console.log('[CASHBOX] STEP 1: Inserting ArtistCashBox...');
      // 1. Insert into ArtistCashBox
      const result = await transaction.request()
        .input('ArtistName', sql.VarChar, ArtistName)
        .input('Amount', sql.Decimal(18, 2), Amount)
        .input('startDate', sql.DateTime, startDate)
        .query(`
          INSERT INTO ArtistCashBox
          (ArtistName, Amount, SettlementDate, CreatedDate, start_date)
          OUTPUT inserted.*
          VALUES (@ArtistName, @Amount, GETDATE(), GETDATE(), @startDate)
        `);
      console.log('[CASHBOX] STEP 1 OK');

      console.log('[CASHBOX] STEP 2: Looking up DishMaster...');
      // 2. Look up DishMaster for this artist
      const dishQuery = await transaction.request()
        .input('ArtistName', sql.VarChar, ArtistName)
        .query(`
          SELECT TOP 1 d.DishId, d.DishGroupId,
                 cm.CategoryId, cm.CategoryName, 
                 dg.DishGroupName as SubCategoryName
          FROM DishMaster d
          LEFT JOIN DishGroupMaster dg ON d.DishGroupId = dg.DishGroupId
          LEFT JOIN CategoryMaster cm ON dg.CategoryId = cm.CategoryId
          WHERE d.Name = @ArtistName
        `);

      const dish = dishQuery.recordset[0] || {};
      const price = Amount; // User enters amount directly
      const qty = 1;
      console.log('[CASHBOX] STEP 2 OK - dish:', JSON.stringify(dish), '| qty:', qty, '| price:', price);

      // 2b. Insert sales record into dishOrderItemShare for the artist - REMOVED per user request
      const crypto = require('crypto');

      const settlementId = crypto.randomUUID();
      const dateStr = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Singapore' }).replace(/-/g, '');
      const billNo = `CB-${dateStr}-${Math.floor(1000 + Math.random() * 9000)}`;

      const toGuidOrNull = (id) =>
        /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(id) ? id : null;
      const userId = toGuidOrNull(req.user?.id || req.user?.userId) || '00000000-0000-0000-0000-000000000000';
      console.log('[CASHBOX] userId:', userId);

      console.log('[CASHBOX] STEP 3: Inserting SettlementHeader...');
      // 3. Insert SettlementHeader
      await transaction.request()
        .input('SettlementID', sql.UniqueIdentifier, settlementId)
        .input('Amount', sql.Decimal(18, 2), Amount)
        .input('BillNo', sql.VarChar(50), billNo)
        .input('UserId', sql.UniqueIdentifier, userId)
        .query(`
          INSERT INTO SettlementHeader (
            SettlementID, LastSettlementDate, LastDayEndDate, SubTotal, TotalTax, DiscountAmount, 
            DiscountType, BillNo, OrderType, TableNo, Section, SysAmount, ManualAmount, 
            CreatedBy, CreatedOn, VoidItemQty, VoidItemAmount, RoundedBy, ServiceCharge, IsCancelled
          ) VALUES (
            @SettlementID, GETDATE(), GETDATE(), @Amount, 0, 0, 
            'AMOUNT', @BillNo, 'CASHBOX', 'CASHBOX', 'CASHBOX', @Amount, @Amount, 
            @UserId, GETDATE(), 0, 0, 0, 0, 0
          )
        `);
      console.log('[CASHBOX] STEP 3 OK');

      console.log('[CASHBOX] STEP 4: Inserting SettlementItemDetail...');
      // 4. Insert SettlementItemDetail
      await transaction.request()
        .input('SettlementID', sql.UniqueIdentifier, settlementId)
        .input('DishId', sql.UniqueIdentifier, dish.DishId || null)
        .input('DishGroupId', sql.UniqueIdentifier, dish.DishGroupId || null)
        .input('CategoryId', sql.UniqueIdentifier, dish.CategoryId || null)
        .input('SubCategoryId', sql.UniqueIdentifier, dish.DishGroupId || null)
        .input('DishName', sql.NVarChar(255), ArtistName)
        .input('CategoryName', sql.NVarChar(255), dish.CategoryName || 'ENTERTAINMENT')
        .input('SubCategoryName', sql.NVarChar(255), dish.SubCategoryName || 'Solo')
        .input('Qty', sql.Int, qty)
        .input('Price', sql.Decimal(18, 2), price)
        .input('Status', sql.NVarChar(50), 'NORMAL')
        .query(`
          INSERT INTO SettlementItemDetail (
            SettlementID, DishId, DishGroupId, CategoryId, SubCategoryId,
            DishName, CategoryName, SubCategoryName,
            Qty, Price, OrderDateTime, Status
          ) VALUES (
            @SettlementID, @DishId, @DishGroupId, @CategoryId, @SubCategoryId,
            @DishName, @CategoryName, @SubCategoryName,
            @Qty, @Price, GETDATE(), @Status
          )
        `);
      console.log('[CASHBOX] STEP 4 OK');

      console.log('[CASHBOX] STEP 5: Inserting SettlementTotalSales/Detail/TranDetail...');
      // 5. Insert SettlementTotalSales, SettlementDetail, SettlementTranDetail
      await transaction.request()
        .input('SettlementID', sql.UniqueIdentifier, settlementId)
        .input('Amount', sql.Money, Amount)
        .query(`
          INSERT INTO SettlementTotalSales (SettlementID, PayMode, SysAmount, ManualAmount, AmountDiff, ReceiptCount)
          VALUES (@SettlementID, 'CASH', @Amount, @Amount, 0, 1);

          INSERT INTO SettlementDetail (SettlementId, Paymode, SysAmount, ManualAmount, SortageOrExces, ReceiptCount, IsCollected)
          VALUES (@SettlementID, 'CASH', @Amount, @Amount, 0, 1, 0);

          INSERT INTO SettlementTranDetail (SettlementID, PayMode, CashIn, CashOut)
          VALUES (@SettlementID, 'CASH', @Amount, 0);
        `);
      console.log('[CASHBOX] STEP 5 OK');

      console.log('[CASHBOX] STEP 6: Getting BusinessUnitId...');
      // 6. Insert PaymentDetailCur + PaymentDetail for report sync
      const paymentId = crypto.randomUUID();

      // Get default BusinessUnitId (required NOT NULL)
      const bizRes = await transaction.request().query(`SELECT TOP 1 BusinessUnitId FROM SettlementHeader WHERE IsCancelled = 0 ORDER BY CreatedOn DESC`);
      const bizId = bizRes.recordset[0]?.BusinessUnitId || 'FBFD4E31-5C91-4DEC-86EA-989D3B5639CA';
      console.log('[CASHBOX] STEP 6 bizId:', bizId);

      console.log('[CASHBOX] STEP 7: Inserting PaymentDetailCur + PaymentDetail...');
      await transaction.request()
        .input('PaymentId', sql.UniqueIdentifier, paymentId)
        .input('SettlementID', sql.UniqueIdentifier, settlementId)
        .input('Amount', sql.Decimal(18, 2), Amount)
        .input('UserId', sql.UniqueIdentifier, userId)
        .input('BizId', sql.UniqueIdentifier, bizId)
        .input('startDate', sql.DateTime, startDate)
        .query(`
          INSERT INTO PaymentDetailCur (
            PaymentId, RestaurantBillId, BilledFor, PaymentCollectedOn, 
            PaymentType, Paymode, Amount, Remarks, BusinessUnitId, CreatedBy, CreatedOn, ModifiedBy, ModifiedOn, start_date
          ) VALUES (
            @PaymentId, @SettlementID, 1, GETDATE(), 
            1, 1, @Amount, 'CASH BOX', @BizId, @UserId, GETDATE(), @UserId, GETDATE(), @startDate
          );

          INSERT INTO PaymentDetail (
            PaymentId, RestaurantBillId, SettlementId, InvoiceId, BilledFor, PaymentCollectedOn, 
            PaymentType, Paymode, Amount, Remarks, BusinessUnitId, CreatedBy, CreatedOn, ModifiedBy, ModifiedOn, isSettlement, start_date
          ) VALUES (
            @PaymentId, @SettlementID, @SettlementID, @SettlementID, 1, GETDATE(), 
            1, 1, @Amount, 'CASH BOX', @BizId, @UserId, GETDATE(), @UserId, GETDATE(), 1, @startDate
          );
        `);
      console.log('[CASHBOX] STEP 7 OK');

      await transaction.commit();
      console.log(`[CASHBOX] SUCCESS - settlement ${settlementId} for ${ArtistName} - Amount: ${Amount}`);

      res.json({
        success: true,
        data: result.recordset[0]
      });

    } catch (innerErr) {
      console.error('[CASHBOX] FAILED at step above. Error:', innerErr.message);
      try { await transaction.rollback(); } catch (e) { }
      throw innerErr;
    }

  } catch (err) {
    console.error('Cash Box Save Error:', err);
    res.status(500).json({
      error: err.message
    });
  }
});

router.get('/artist-list', authenticateToken, async (req, res) => {
  try {
    const pool = getPool();

    const result = await pool.request().query(`
      SELECT
        DishId,
        Name
      FROM DishMaster
      WHERE IsActive = 1
      and IsSplitDish = 1
      and IsGroupDish = 0
      ORDER BY Name
    `);

    res.json({
      success: true,
      data: result.recordset
    });

  } catch (err) {
    console.error('Artist List Error:', err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

router.get('/artist-sales', authenticateToken, async (req, res) => {
  try {
    const { fromDate, toDate } = req.query;
    const pool = getPool();
    const request = pool.request();

    // Set fallback date parameters if none provided
    const parsedFrom = fromDate ? new Date(fromDate) : new Date();
    if (!fromDate) parsedFrom.setHours(0, 0, 0, 0);
    const parsedTo = toDate ? new Date(toDate) : new Date();

    request.input("fromDate", sql.Date, parsedFrom);
    request.input("toDate", sql.Date, parsedTo);

    const result = await request.query(`
      SELECT 
        d.DishId,
        d.Name,
        ISNULL(targets.Amount, 0) as ActualSales,
        ISNULL(targets.TargetAmount, 0) as TargetAmount
      FROM DishMaster d
      LEFT JOIN (
        SELECT DishId, Amount, TargetAmount
        FROM dishOrderItemShare
        WHERE CAST(FromDate as DATE) = @fromDate AND CAST(ToDate as DATE) = @toDate
      ) targets ON d.DishId = targets.DishId
      WHERE d.IsActive = 1
        AND d.IsSplitDish = 1
        AND d.IsGroupDish = 0
      ORDER BY d.Name
    `);

    res.json({
      success: true,
      data: result.recordset
    });
  } catch (err) {
    console.error('Artist Sales Error:', err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

// GET live artist target dashboard — Entertainment sales exactly matching Item Sales Report
// joined with TargetAmount from dishOrderItemShare
router.get('/artist-target-live', authenticateToken, async (req, res) => {
  try {
    const pool = getPool();
    const { fromDate, toDate } = req.query;

    const parsedFrom = fromDate ? new Date(fromDate) : new Date();
    if (!fromDate) parsedFrom.setHours(0, 0, 0, 0);
    const parsedTo = toDate ? new Date(toDate) : new Date();

    const request = pool.request();
    request.input('fromDate', sql.Date, parsedFrom);
    request.input('toDate', sql.Date, parsedTo);

    const result = await request.query(`
      DECLARE @sgtStart DATETIME = CAST(@fromDate AS DATETIME);
      DECLARE @sgtEnd   DATETIME = DATEADD(DAY, 1, CAST(@toDate AS DATETIME));

      -- Live Entertainment sales (same query as Item Sales Report)
      WITH AppSales AS (
        SELECT
          ISNULL(NULLIF(LTRIM(RTRIM(sid.DishName)), ''), ISNULL(d.Name, 'Unknown')) AS ArtistName,
          SUM(CASE WHEN ISNULL(sid.Status, 'NORMAL') <> 'VOIDED'
                   THEN CAST(ISNULL(sid.Qty, 0) * ISNULL(sid.Price, 0) AS decimal(18,2))
                   ELSE 0 END) AS totalAmount
        FROM SettlementHeader sh
        INNER JOIN SettlementItemDetail sid ON sh.SettlementID = sid.SettlementID
        LEFT JOIN DishMaster d ON sid.DishId = d.DishId
        WHERE sh.LastSettlementDate >= @sgtStart
          AND sh.LastSettlementDate <  @sgtEnd
          AND ISNULL(NULLIF(LTRIM(RTRIM(sid.CategoryName)), ''), 'Unmapped') = 'Entertainment'
        GROUP BY ISNULL(NULLIF(LTRIM(RTRIM(sid.DishName)), ''), ISNULL(d.Name, 'Unknown'))
      ),
      ProfSales AS (
        SELECT
          ISNULL(d.Name, 'Unknown') AS ArtistName,
          SUM(CASE WHEN rod.StatusCode <> 0
                   THEN CAST(ISNULL(rod.TotalDetailLineAmount, 0) AS decimal(18,2))
                   ELSE 0 END) AS totalAmount
        FROM RestaurantOrderDetail rod
        INNER JOIN RestaurantOrder ro ON rod.OrderId = ro.OrderId
        LEFT JOIN DishMaster d ON rod.DishId = d.DishId
        LEFT JOIN DishGroupMaster dg ON d.DishGroupId = dg.DishGroupId
        LEFT JOIN CategoryMaster cm ON dg.CategoryId = cm.CategoryId
        WHERE ro.OrderDateTime >= @sgtStart
          AND ro.OrderDateTime <  @sgtEnd
          AND ISNULL(ro.StatusCode, 0) = 3
          AND ISNULL(cm.CategoryName, 'Unmapped') = 'Entertainment'
          AND NOT EXISTS (
            SELECT 1 FROM SettlementHeader sh_dup WHERE sh_dup.BillNo = ro.OrderNumber
          )
        GROUP BY ISNULL(d.Name, 'Unknown')
      ),
      CombinedSales AS (
        SELECT ArtistName, SUM(totalAmount) AS ActualSales
        FROM (
          SELECT ArtistName, totalAmount FROM AppSales
          UNION ALL
          SELECT ArtistName, totalAmount FROM ProfSales
        ) t
        GROUP BY ArtistName
      ),
      -- Latest TargetAmount per artist name from dishOrderItemShare
      LatestTargets AS (
        SELECT
          CustomerName,
          MAX(TargetAmount) AS TargetAmount
        FROM dishOrderItemShare
        WHERE TargetAmount > 0
        GROUP BY CustomerName
      )
      SELECT
        s.ArtistName,
        ISNULL(s.ActualSales, 0)       AS ActualSales,
        ISNULL(lt.TargetAmount, 0)     AS TargetAmount
      FROM CombinedSales s
      LEFT JOIN LatestTargets lt ON lt.CustomerName = s.ArtistName
      WHERE s.ActualSales > 0
      ORDER BY s.ActualSales DESC;
    `);

    res.json({ success: true, data: result.recordset });
  } catch (err) {
    console.error('Artist Target Live Error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST to save/upsert artist target in dishOrderItemShare
router.post('/artist-target', authenticateToken, async (req, res) => {
  try {
    const { dishId, artistName, targetAmount, fromDate, toDate } = req.body;
    if (!dishId || targetAmount === undefined || !fromDate || !toDate) {
      return res.status(400).json({ error: 'dishId, targetAmount, fromDate, and toDate are required' });
    }

    const pool = getPool();
    const parsedFrom = new Date(fromDate);
    const parsedTo = new Date(toDate);

    // Check if target already exists for this dishId and exact date range
    const checkResult = await pool.request()
      .input('dishId', sql.UniqueIdentifier, dishId)
      .input('fromDate', sql.Date, parsedFrom)
      .input('toDate', sql.Date, parsedTo)
      .query(`
        SELECT Id FROM dishOrderItemShare 
        WHERE DishId = @dishId 
          AND CAST(FromDate as DATE) = @fromDate 
          AND CAST(ToDate as DATE) = @toDate
      `);

    if (checkResult.recordset.length > 0) {
      // Update TargetAmount on existing record
      await pool.request()
        .input('dishId', sql.UniqueIdentifier, dishId)
        .input('fromDate', sql.Date, parsedFrom)
        .input('toDate', sql.Date, parsedTo)
        .input('targetAmount', sql.Decimal(18, 2), targetAmount)
        .query(`
          UPDATE dishOrderItemShare 
          SET TargetAmount = @targetAmount 
          WHERE DishId = @dishId 
            AND CAST(FromDate as DATE) = @fromDate 
            AND CAST(ToDate as DATE) = @toDate
        `);
    } else {
      // Insert new record with TargetAmount set
      const crypto = require('crypto');
      const newId = crypto.randomUUID();
      await pool.request()
        .input('id', sql.UniqueIdentifier, newId)
        .input('artistName', sql.VarChar(255), artistName)
        .input('fromDate', sql.Date, parsedFrom)
        .input('toDate', sql.Date, parsedTo)
        .input('dishId', sql.UniqueIdentifier, dishId)
        .input('targetAmount', sql.Decimal(18, 2), targetAmount)
        .query(`
          INSERT INTO dishOrderItemShare (Id, CustomerName, IsSelected, CreatedDate, Amount, FromDate, ToDate, DishId, OrderDishId, TargetAmount)
          VALUES (@id, @artistName, 1, GETDATE(), 0, @fromDate, @toDate, @dishId, NULL, @targetAmount)
        `);
    }

    res.json({ success: true, message: 'Target saved successfully' });
  } catch (err) {
    console.error('Error saving artist target:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

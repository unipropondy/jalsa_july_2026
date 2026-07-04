const express = require("express");
const router = express.Router();
const sql = require("mssql");
const { poolPromise } = require("../config/db");
const { runInTransaction } = require("../utils/transactionHelper");
const { processSplitPayments } = require("../services/payment.service");
const { computeThreshold, sendBalanceNotification } = require("../utils/whatsappService");


const toGuidOrNull = (value) => {
  const text = String(value || "").trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(text)
    ? text
    : null;
};

router.get("/", async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query("SELECT * FROM MemberMaster ORDER BY Name");
    res.json(result.recordset);
  } catch (err) {
    console.error("[MEMBERS GET ERROR]", err);
    res.status(500).json({ error: err.message });
  }
});

router.post("/add", async (req, res) => {
  try {
    const pool = await poolPromise;
    const { name, phone, email, creditLimit, currentBalance, balance, address, isActive, userId } = req.body;
    const result = await pool.request()
      .input("Name", sql.NVarChar, name)
      .input("Phone", sql.NVarChar, phone)
      .input("Email", sql.NVarChar, email || null)
      .input("Address", sql.NVarChar, address || null)
      .input("IsActive", sql.Bit, isActive !== undefined ? isActive : 1)
      .input("CreditLimit", sql.Decimal(18, 2), parseFloat(creditLimit) || 0)
      .input("CurrentBalance", sql.Decimal(18, 2), parseFloat(currentBalance) || 0)
      .input("Balance", sql.Decimal(18, 2), parseFloat(balance) || 0)
      .input("CreatedBy", sql.UniqueIdentifier, userId || null)
      .query(`
        DECLARE @newId UNIQUEIDENTIFIER = NEWID();
        INSERT INTO MemberMaster (MemberId, Name, Phone, Email, Address, IsActive, CreditLimit, CurrentBalance, Balance, CreatedBy)
        VALUES (@newId, @Name, @Phone, @Email, @Address, @IsActive, @CreditLimit, @CurrentBalance, @Balance, @CreatedBy);
        SELECT @newId AS MemberId;
      `);
    
    const memberId = result.recordset[0].MemberId;
    res.json({
      success: true,
      member: {
        MemberId: memberId,
        Name: name,
        Phone: phone,
        CreditLimit: parseFloat(creditLimit) || 0,
        CurrentBalance: parseFloat(currentBalance) || 0,
        IsActive: isActive !== undefined ? isActive : 1
      }
    });
  } catch (err) {
    console.error("[MEMBERS ADD ERROR]", err);
    res.status(500).json({ error: err.message });
  }
});

router.post("/update", async (req, res) => {
  try {
    const pool = await poolPromise;
    const { memberId, name, phone, email, creditLimit, currentBalance, balance, address, isActive, userId } = req.body;
    await pool.request()
      .input("Id", sql.UniqueIdentifier, memberId)
      .input("Name", sql.NVarChar, name)
      .input("Phone", sql.NVarChar, phone)
      .input("Email", sql.NVarChar, email)
      .input("Address", sql.NVarChar, address || null)
      .input("IsActive", sql.Bit, isActive !== undefined ? isActive : 1)
      .input("CreditLimit", sql.Decimal(18, 2), parseFloat(creditLimit) || 0)
      .input("CurrentBalance", sql.Decimal(18, 2), parseFloat(currentBalance) || 0)
      .input("Balance", sql.Decimal(18, 2), parseFloat(balance) || 0)
      .input("ModifiedBy", sql.UniqueIdentifier, userId || null)
      .query(`
        UPDATE MemberMaster SET 
          Name = @Name, Phone = @Phone, Email = @Email, Address = @Address, IsActive = @IsActive,
          CreditLimit = @CreditLimit, CurrentBalance = @CurrentBalance, Balance = @Balance,
          ModifiedBy = @ModifiedBy, ModifiedDate = GETDATE()
        WHERE MemberId = @Id
      `);
    res.json({ success: true });
  } catch (err) {
    console.error("[MEMBERS UPDATE ERROR]", err);
    res.status(500).json({ error: err.message });
  }
});

router.post("/delete", async (req, res) => {
  try {
    const { memberId } = req.body;
    if (!memberId) return res.status(400).json({ error: "Missing memberId" });

    await runInTransaction(async (transaction) => {
      const request = new sql.Request(transaction);
      request.input("Id", sql.UniqueIdentifier, memberId);

      await request.query("IF OBJECT_ID('MemberTimeLog', 'U') IS NOT NULL DELETE FROM MemberTimeLog WHERE MemberId = @Id");
      await request.query("IF COL_LENGTH('SettlementHeader', 'MemberId') IS NOT NULL UPDATE SettlementHeader SET MemberId = NULL WHERE MemberId = @Id;");
      await request.query("DELETE FROM MemberMaster WHERE MemberId = @Id");
    }, { name: "DeleteMember" });

    res.json({ success: true });
  } catch (err) {
    console.error("[MEMBERS DELETE ERROR]", err);
    res.status(500).json({ error: err.message });
  }
});

router.get("/search", async (req, res) => {
  try {
    const { query } = req.query;
    const pool = await poolPromise;
    const result = await pool.request()
      .input("query", sql.NVarChar, `%${query || ""}%`)
      .query(`
        SELECT MemberId, Name, Phone, CreditLimit, CurrentBalance, IsActive 
        FROM MemberMaster 
        WHERE (Name LIKE @query OR Phone LIKE @query)
        ORDER BY Name
      `);
    res.json(result.recordset);
  } catch (err) {
    console.error("[MEMBERS SEARCH ERROR]", err);
    res.status(500).json({ error: err.message });
  }
});

// Member Dashboard Stats — recharges this month, today, active members, total balance
router.get("/stats", async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query(`
      SELECT
        -- Active members count
        (SELECT COUNT(*) FROM MemberMaster WHERE IsActive = 1) AS totalActiveMembers,
        -- Total available balance across all active members
        (SELECT ISNULL(SUM(CurrentBalance), 0) FROM MemberMaster WHERE IsActive = 1) AS totalAvailableBalance,
        -- Recharges added this calendar month (RECHARGE transactions in CCT linked to MemberMaster)
        (
          SELECT ISNULL(SUM(cct.PaidAmount), 0)
          FROM CustomerCreditTransactions cct
          INNER JOIN MemberMaster mm ON cct.MemberId = mm.MemberId
          WHERE cct.TransactionType = 'PAYMENT'
            AND MONTH(cct.CreatedDate) = MONTH(GETDATE())
            AND YEAR(cct.CreatedDate) = YEAR(GETDATE())
        ) AS rechargesThisMonth,
        -- Recharges added today
        (
          SELECT ISNULL(SUM(cct.PaidAmount), 0)
          FROM CustomerCreditTransactions cct
          INNER JOIN MemberMaster mm ON cct.MemberId = mm.MemberId
          WHERE cct.TransactionType = 'PAYMENT'
            AND CAST(cct.CreatedDate AS DATE) = CAST(GETDATE() AS DATE)
        ) AS rechargesToday
    `);

    const row = result.recordset[0] || {};
    res.json({
      success: true,
      stats: {
        totalActiveMembers: Number(row.totalActiveMembers || 0),
        totalAvailableBalance: Number(row.totalAvailableBalance || 0),
        rechargesThisMonth: Number(row.rechargesThisMonth || 0),
        rechargesToday: Number(row.rechargesToday || 0),
      }
    });
  } catch (err) {
    console.error("[MEMBER STATS ERROR]", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get("/validate/:memberId", async (req, res) => {
  try {
    const { memberId } = req.params;
    const { amount } = req.query;
    const pool = await poolPromise;
    const result = await pool.request()
      .input("MemberId", sql.UniqueIdentifier, memberId)
      .query(`
        SELECT MemberId, Name, Phone, CreditLimit, CurrentBalance, IsActive 
        FROM MemberMaster 
        WHERE MemberId = @MemberId
      `);
    
    if (result.recordset.length === 0) {
      return res.status(404).json({ success: false, error: "Member not found" });
    }
    
    const member = result.recordset[0];
    if (!member.IsActive) {
      return res.status(400).json({ success: false, error: "Member is inactive" });
    }
    
    const billAmount = parseFloat(amount) || 0;
    const currentBalance = parseFloat(member.CurrentBalance) || 0;
    const creditLimit = parseFloat(member.CreditLimit) || 0;
    const remainingCredit = creditLimit - currentBalance;
    
    if (currentBalance + billAmount > creditLimit) {
      return res.status(400).json({ 
        success: false, 
        error: "Credit Limit Exceeded",
        member: {
          ...member,
          RemainingCredit: remainingCredit
        }
      });
    }
    
    res.json({
      success: true,
      member: {
        ...member,
        RemainingCredit: remainingCredit
      }
    });
  } catch (err) {
    console.error("[MEMBERS VALIDATE ERROR]", err);
    res.status(500).json({ error: err.message });
  }
});

router.get("/usage/:memberId", async (req, res) => {
  try {
    const { memberId } = req.params;
    const pool = await poolPromise;

    // 1. Summary
    const summaryRes = await pool.request()
      .input("MemberId", sql.UniqueIdentifier, memberId)
      .query(`
        SELECT 
          ISNULL(SUM(SysAmount), 0) as TotalSpent, 
          COUNT(*) as TotalOrders 
        FROM SettlementHeader 
        WHERE MemberId = @MemberId 
          AND LastSettlementDate >= DATEADD(month, DATEDIFF(month, 0, GETDATE()), 0) 
          AND IsCancelled = 0
      `);

    // 2. Items Consumed
    const itemsRes = await pool.request()
      .input("MemberId", sql.UniqueIdentifier, memberId)
      .query(`
        SELECT 
          sid.DishName, 
          SUM(sid.Qty) as TotalQty, 
          SUM(sid.Price * sid.Qty) as TotalAmount 
        FROM SettlementHeader sh 
        INNER JOIN SettlementItemDetail sid ON sh.SettlementID = sid.SettlementID 
        WHERE sh.MemberId = @MemberId 
          AND sh.LastSettlementDate >= DATEADD(month, DATEDIFF(month, 0, GETDATE()), 0) 
          AND sh.IsCancelled = 0 
        GROUP BY sid.DishName 
        ORDER BY TotalQty DESC
      `);

    // 3. Transactions
    const txsRes = await pool.request()
      .input("MemberId", sql.UniqueIdentifier, memberId)
      .query(`
        SELECT 
          SettlementID, 
          BillNo, 
          CONVERT(VARCHAR, LastSettlementDate, 126) + '+08:00' AS LastSettlementDate, 
          SysAmount 
        FROM SettlementHeader 
        WHERE MemberId = @MemberId 
          AND LastSettlementDate >= DATEADD(month, DATEDIFF(month, 0, GETDATE()), 0) 
          AND IsCancelled = 0 
        ORDER BY LastSettlementDate DESC
      `);

    res.json({
      success: true,
      summary: summaryRes.recordset[0] || { TotalSpent: 0, TotalOrders: 0 },
      items: itemsRes.recordset || [],
      transactions: txsRes.recordset || []
    });
  } catch (err) {
    console.error("[MEMBERS USAGE ERROR]", err);
    res.status(500).json({ error: err.message });
  }
});

router.post("/pay", async (req, res) => {
  try {
    const pool = await poolPromise;
    const { memberId, amount, payments, userId } = req.body;

  if (!memberId) {
    return res.status(400).json({ error: "memberId is required" });
  }

  const numericAmt = parseFloat(amount);
  if (isNaN(numericAmt) || numericAmt <= 0) {
    return res.status(400).json({ error: "Amount must be a positive number" });
  }

  if (!payments || !Array.isArray(payments) || payments.length === 0) {
    return res.status(400).json({ error: "payments array is required and cannot be empty" });
  }

  // Validation
  let sum = 0;
  for (let i = 0; i < payments.length; i++) {
    const p = payments[i];
    const amt = parseFloat(p.amount);
    if (isNaN(amt) || amt <= 0) {
      return res.status(400).json({ error: `Payment row ${i + 1} has an invalid or negative amount.` });
    }
    if (!p.payModeId && !p.payMode) {
      return res.status(400).json({ error: `Payment row ${i + 1} is missing payment mode.` });
    }
    sum += amt;
  }

  const diff = Math.abs(sum - numericAmt);
  if (diff > 0.01) {
    return res.status(400).json({ error: `Sum of payments (${sum.toFixed(2)}) must equal total amount (${numericAmt.toFixed(2)})` });
  }

  let memberPaymentId;
  let paymentTransactionId;

  await runInTransaction(async (transaction) => {
    // 1. Verify member exists and is active
    const memberCheck = await transaction.request()
      .input("MemberId", sql.UniqueIdentifier, memberId)
      .query("SELECT CreditLimit, CurrentBalance, IsActive FROM MemberMaster WITH (UPDLOCK) WHERE MemberId = @MemberId");
    
    if (memberCheck.recordset.length === 0) {
      throw new Error("Member not found");
    }
    
    const member = memberCheck.recordset[0];
    if (!member.IsActive) {
      throw new Error("Member is inactive");
    }

    // 2. Generate a new MemberPaymentId
    const payIdRes = await transaction.request().query("SELECT NEWID() as id");
    memberPaymentId = payIdRes.recordset[0].id;

    // 3. Process split payments using unified service
    await processSplitPayments({
      referenceType: "MEMBER",
      referenceId: memberId,
      payments,
      transaction,
      cashierId: userId ? String(userId).trim() : null
    });

    // 3.5. Write allocation credit rows to CustomerCreditTransactions
    let remainingPayment = numericAmt;
    const payModeName = (payments && payments.length > 0) ? (payments[0].payMode || 'CASH') : 'CASH';
    const referenceNo = (payments && payments.length > 0) ? (payments[0].referenceNo || '') : '';
    const mainRemarks = req.body.remarks || `Credit payment collection (${payModeName})`;

    // 1. Write the primary PAYMENT transaction record
    const payTxResult = await transaction.request()
      .input("MemberId", sql.UniqueIdentifier, memberId)
      .input("Amount", sql.Decimal(18, 2), numericAmt)
      .input("PaymentMethod", sql.NVarChar(50), payModeName)
      .input("ReferenceNo", sql.NVarChar(100), referenceNo)
      .input("Remarks", sql.NVarChar(500), mainRemarks)
      .input("CreatedBy", sql.UniqueIdentifier, toGuidOrNull(userId))
      .query(`
        INSERT INTO CustomerCreditTransactions (MemberId, TransactionType, BillAmount, PaidAmount, OutstandingAmount, PaymentMethod, ReferenceNo, Status, Remarks, CreatedBy)
        OUTPUT INSERTED.TransactionId
        VALUES (@MemberId, 'PAYMENT', 0, @Amount, -@Amount, @PaymentMethod, @ReferenceNo, 'CLOSED', @Remarks, @CreatedBy)
      `);
    
    paymentTransactionId = payTxResult.recordset[0].TransactionId;
    
    if (req.body.allocations && Array.isArray(req.body.allocations) && req.body.allocations.length > 0) {
      // --- MANUAL ALLOCATION ---
      for (const alloc of req.body.allocations) {
        const allocAmt = parseFloat(alloc.amount);
        if (isNaN(allocAmt) || allocAmt <= 0) continue;
        
        const billCheck = await transaction.request()
          .input("MemberId", sql.UniqueIdentifier, memberId)
          .input("SettlementId", sql.UniqueIdentifier, toGuidOrNull(alloc.settlementId))
          .query(`
            SELECT TransactionId FROM CustomerCreditTransactions
            WHERE MemberId = @MemberId AND SettlementId = @SettlementId AND TransactionType IN ('CREDIT_SALE', 'ADJUSTMENT')
          `);
          
        if (billCheck.recordset.length > 0) {
          const invoiceTransactionId = billCheck.recordset[0].TransactionId;
          
          await transaction.request()
            .input("TransactionId", sql.UniqueIdentifier, invoiceTransactionId)
            .input("AllocAmt", sql.Decimal(18, 2), allocAmt)
            .query(`
              UPDATE CustomerCreditTransactions
              SET 
                PaidAmount = PaidAmount + @AllocAmt,
                OutstandingAmount = OutstandingAmount - @AllocAmt,
                Status = CASE WHEN (OutstandingAmount - @AllocAmt) <= 0.01 THEN 'CLOSED' ELSE 'PARTIAL' END,
                UpdatedDate = GETDATE()
              WHERE TransactionId = @TransactionId
            `);

          // Insert allocation record
          await transaction.request()
            .input("PaymentTransactionId", sql.UniqueIdentifier, paymentTransactionId)
            .input("InvoiceTransactionId", sql.UniqueIdentifier, invoiceTransactionId)
            .input("AllocAmt", sql.Decimal(18, 2), allocAmt)
            .query(`
              INSERT INTO CustomerCreditAllocations (PaymentTransactionId, InvoiceTransactionId, Amount)
              VALUES (@PaymentTransactionId, @InvoiceTransactionId, @AllocAmt)
            `);
        }
      }
    } else {
      // --- AUTO ALLOCATION (FIFO) ---
      // Fetch outstanding bills ordered by date
      const outstandingRes = await transaction.request()
        .input("MemberId", sql.UniqueIdentifier, memberId)
        .query(`
          SELECT 
            TransactionId,
            SettlementId,
            BillNo,
            OutstandingAmount
          FROM CustomerCreditTransactions
          WHERE MemberId = @MemberId
            AND TransactionType IN ('CREDIT_SALE', 'ADJUSTMENT')
            AND Status IN ('OPEN', 'PARTIAL')
          ORDER BY CreatedDate ASC
        `);
      
      const outstandingBills = outstandingRes.recordset;
      
      for (const bill of outstandingBills) {
        if (remainingPayment <= 0.005) break;
        
        const billDue = parseFloat(bill.OutstandingAmount) || 0;
        const allocAmt = Math.min(remainingPayment, billDue);
        
        await transaction.request()
          .input("TransactionId", sql.UniqueIdentifier, bill.TransactionId)
          .input("AllocAmt", sql.Decimal(18, 2), allocAmt)
          .query(`
            UPDATE CustomerCreditTransactions
            SET 
              PaidAmount = PaidAmount + @AllocAmt,
              OutstandingAmount = OutstandingAmount - @AllocAmt,
              Status = CASE WHEN (OutstandingAmount - @AllocAmt) <= 0.01 THEN 'CLOSED' ELSE 'PARTIAL' END,
              UpdatedDate = GETDATE()
            WHERE TransactionId = @TransactionId
          `);

        // Insert allocation record
        await transaction.request()
          .input("PaymentTransactionId", sql.UniqueIdentifier, paymentTransactionId)
          .input("InvoiceTransactionId", sql.UniqueIdentifier, bill.TransactionId)
          .input("AllocAmt", sql.Decimal(18, 2), allocAmt)
          .query(`
            INSERT INTO CustomerCreditAllocations (PaymentTransactionId, InvoiceTransactionId, Amount)
            VALUES (@PaymentTransactionId, @InvoiceTransactionId, @AllocAmt)
          `);
          
        remainingPayment -= allocAmt;
      }
    }

    // 4. Update member balance (subtract paid amount to clear/reduce credit balance)
    await transaction.request()
      .input("MemberId", sql.UniqueIdentifier, memberId)
      .input("Amount", sql.Decimal(18, 2), numericAmt)
      .query("UPDATE MemberMaster SET CurrentBalance = CurrentBalance - @Amount WHERE MemberId = @MemberId");
  }, { name: "MemberPayment", timeoutMs: 60000 });

  setImmediate(async () => {
    try {
      await sendBalanceNotification(memberId, pool);
    } catch (err) {
      console.error("[WhatsApp] sendBalanceNotification error in pay setImmediate:", err.message);
    }
  });

  res.json({ success: true, memberPaymentId, paymentTransactionId });

  } catch (err) {
    console.error("[MEMBER PAYMENT ERROR]", err);
    res.status(500).json({ error: err.message });
  }
});


// ─── POST /api/members/recharge ──────────────────────────────────────────────
// Top-up a member's prepaid balance. Resets the low-balance alert flag so
// another alert can fire the next time the balance drops below the threshold.
// Does NOT write to CustomerCreditTransactions (members are not credit accounts).
router.post("/recharge", async (req, res) => {
  try {
    const { memberId, amount } = req.body;

    if (!memberId) return res.status(400).json({ error: "memberId is required" });
    const numericAmt = parseFloat(amount);
    if (isNaN(numericAmt) || numericAmt <= 0) {
      return res.status(400).json({ error: "Amount must be a positive number" });
    }

    let updated;
    await runInTransaction(async (transaction) => {
      // Lock row to prevent concurrent updates
      const check = await transaction.request()
        .input("MemberId", sql.UniqueIdentifier, memberId)
        .query("SELECT MemberId, Name, Balance, CurrentBalance, IsActive FROM MemberMaster WITH (UPDLOCK) WHERE MemberId = @MemberId");

      if (check.recordset.length === 0) throw new Error("Member not found");
      if (!check.recordset[0].IsActive) throw new Error("Member is inactive");

      const result = await transaction.request()
        .input("MemberId", sql.UniqueIdentifier, memberId)
        .input("Amount", sql.Decimal(18, 2), numericAmt)
        .query(`
          UPDATE MemberMaster
          SET
            Balance            = Balance + @Amount,
            CurrentBalance     = CurrentBalance + @Amount,
            LowBalanceAlertSent = 0
          OUTPUT
            INSERTED.Balance,
            INSERTED.CurrentBalance,
            INSERTED.LowBalanceAlertSent
          WHERE MemberId = @MemberId
        `);

      updated = result.recordset[0];
    }, { name: "MemberRecharge", timeoutMs: 30000 });

    setImmediate(async () => {
      try {
        const pool = await poolPromise;
        await sendBalanceNotification(memberId, pool);
      } catch (err) {
        console.error("[WhatsApp] sendBalanceNotification error in recharge setImmediate:", err.message);
      }
    });

    res.json({
      success: true,
      Balance: updated.Balance,
      CurrentBalance: updated.CurrentBalance,
      LowBalanceAlertSent: updated.LowBalanceAlertSent,
    });
  } catch (err) {
    console.error("[MEMBER RECHARGE ERROR]", err);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/members/deductSale ────────────────────────────────────────────
// Internal endpoint called by the sale/checkout flow when CustomerType = MEMBER.
// Deducts saleAmount from CurrentBalance. If the resulting balance drops below
// the configured threshold AND no alert has been sent yet, fires a single
// WhatsApp low-balance notification and sets LowBalanceAlertSent = 1.
router.post("/deductSale", async (req, res) => {
  try {
    const { memberId, saleAmount } = req.body;

    if (!memberId) return res.status(400).json({ error: "memberId is required" });
    const numericAmt = parseFloat(saleAmount);
    if (isNaN(numericAmt) || numericAmt <= 0) {
      return res.status(400).json({ error: "saleAmount must be a positive number" });
    }

    let updatedBalance, alertFired = false;

    const pool = await poolPromise;

    await runInTransaction(async (transaction) => {
      // Lock and fetch member
      const check = await transaction.request()
        .input("MemberId", sql.UniqueIdentifier, memberId)
        .query("SELECT MemberId, CurrentBalance, CreditLimit, IsActive, LowBalanceAlertSent FROM MemberMaster WITH (UPDLOCK) WHERE MemberId = @MemberId");

      if (check.recordset.length === 0) throw new Error("Member not found");
      const member = check.recordset[0];
      if (!member.IsActive) throw new Error("Member is inactive");

      const currentBal = parseFloat(member.CurrentBalance) || 0;
      if (currentBal < numericAmt) {
        throw new Error(`Insufficient balance. Available: RM ${currentBal.toFixed(2)}, Required: RM ${numericAmt.toFixed(2)}`);
      }

      // Deduct balance
      const result = await transaction.request()
        .input("MemberId", sql.UniqueIdentifier, memberId)
        .input("Amount", sql.Decimal(18, 2), numericAmt)
        .query(`
          UPDATE MemberMaster
          SET CurrentBalance = CurrentBalance - @Amount
          OUTPUT INSERTED.CurrentBalance, INSERTED.CreditLimit, INSERTED.LowBalanceAlertSent
          WHERE MemberId = @MemberId
        `);

      const updated = result.recordset[0];
      updatedBalance = parseFloat(updated.CurrentBalance);
      const threshold = computeThreshold(parseFloat(updated.CreditLimit) || 0);

      // Fire alert only once per low-balance event
      if (updatedBalance < threshold && updated.LowBalanceAlertSent === false) {
        await transaction.request()
          .input("MemberId", sql.UniqueIdentifier, memberId)
          .query("UPDATE MemberMaster SET LowBalanceAlertSent = 1 WHERE MemberId = @MemberId");
        alertFired = true;
      }
    }, { name: "MemberDeductSale", timeoutMs: 30000 });

    // Send WhatsApp outside the transaction (non-fatal)
    setImmediate(async () => {
      try {
        await sendBalanceNotification(memberId, pool);
      } catch (err) {
        console.error("[WhatsApp] sendBalanceNotification error in deductSale setImmediate:", err.message);
      }
    });

    res.json({
      success: true,
      newBalance: updatedBalance,
      alertFired,
    });
  } catch (err) {
    console.error("[MEMBER DEDUCT SALE ERROR]", err);
    const status = err.message.startsWith("Insufficient") ? 400 : 500;
    res.status(status).json({ error: err.message });
  }

});

// Unused credit customer/receivables endpoints removed

module.exports = router;


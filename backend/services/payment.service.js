const sql = require("mssql");

/**
 * Reusable split payment processing engine.
 * Supports BILL and MEMBER payments.
 */
async function processSplitPayments({
  referenceType, // 'BILL' or 'MEMBER'
  referenceId,   // SettlementID or MemberId / MemberPaymentId
  payments,      // Array of { payModeId (Position), amount, referenceNo }
  transaction,   // MSSQL Transaction object
  businessUnitId = null,
  cashierId = null,
  orderId = null,
  now = new Date(),
  receiptCount = 0
}) {
  if (!payments || !Array.isArray(payments) || payments.length === 0) {
    throw new Error("Payments array is required and cannot be empty.");
  }

  // 1. Fetch all active Paymodes to resolve names/positions
  const paymodeRequest = new sql.Request(transaction);
  const paymodesRes = await paymodeRequest.query(`
    SELECT Position, PayMode, Description FROM [dbo].[Paymode] WHERE Active = 1
  `);
  const activePaymodes = paymodesRes.recordset;

  // 2. Process each payment row
  for (const payment of payments) {
    const amount = parseFloat(payment.amount);
    if (isNaN(amount) || amount <= 0) {
      throw new Error("Payment amount must be greater than zero.");
    }

    // Resolve paymode info
    let dbPaymode = activePaymodes.find(pm => 
      pm.Position === Number(payment.payModeId) || 
      String(pm.PayMode).trim().toUpperCase() === String(payment.payModeId || payment.payMode || "").trim().toUpperCase()
    );

    if (!dbPaymode) {
      throw new Error(`Invalid or inactive payment mode specified: ${payment.payModeId || payment.payMode}`);
    }

    const payModeId = dbPaymode.Position;
    const payModeName = dbPaymode.PayMode;
    const referenceNo = payment.referenceNo || payment.referenceNumber || null;

    // A. Write to Generic PaymentTransactionDetails table
    const detailReq = new sql.Request(transaction);
    detailReq
      .input("ReferenceType", sql.NVarChar(50), referenceType)
      .input("ReferenceId", sql.UniqueIdentifier, referenceId)
      .input("PayModeId", sql.Int, payModeId)
      .input("Amount", sql.Decimal(18, 2), amount)
      .input("ReferenceNo", sql.NVarChar(100), referenceNo)
      .input("CreatedBy", sql.UniqueIdentifier, cashierId);

    await detailReq.query(`
      INSERT INTO [dbo].[PaymentTransactionDetails] (
        PaymentTransactionId, ReferenceType, ReferenceId, PayModeId, Amount, ReferenceNo, CreatedDate, CreatedBy
      ) VALUES (
        NEWID(), @ReferenceType, @ReferenceId, @PayModeId, @Amount, @ReferenceNo, GETDATE(), @CreatedBy
      )
    `);

    // B. If reference type is 'BILL', also write to legacy tables for backoffice reports
    if (referenceType === 'BILL') {
      const legacyReq = new sql.Request(transaction);
      
      await legacyReq
        .input("RestaurantBillId", sql.UniqueIdentifier, referenceId)
        .input("OrderId", sql.UniqueIdentifier, orderId)
        .input("BilledFor", sql.Int, 1)
        .input("PaymentType", sql.Int, 1)
        .input("Paymode", sql.Int, payModeId)
        .input("Amount", sql.Decimal(18, 2), amount)
        .input("ReferenceNumber", sql.VarChar(100), referenceNo)
        .input("Remarks", sql.VarChar(500), payModeName)
        .input("BusinessUnitId", sql.UniqueIdentifier, businessUnitId)
        .input("CreatedBy", sql.UniqueIdentifier, cashierId)
        .query(`
          DECLARE @PayId UNIQUEIDENTIFIER = NEWID();
          
          -- 1. Current Table (for POS views)
          INSERT INTO [dbo].[PaymentDetailCur] (PaymentId, RestaurantBillId, BilledFor, PaymentCollectedOn, PaymentType, Paymode, Amount, ReferenceNumber, Remarks, BusinessUnitId, CreatedBy, CreatedOn, ModifiedBy, ModifiedOn)
          VALUES (@PayId, @RestaurantBillId, @BilledFor, GETDATE(), @PaymentType, @Paymode, @Amount, @ReferenceNumber, @Remarks, @BusinessUnitId, @CreatedBy, GETDATE(), @CreatedBy, GETDATE());

          -- 2. Master Table (CRITICAL for Backoffice Reports)
          INSERT INTO [dbo].[PaymentDetail] (
            PaymentId, RestaurantBillId, SettlementId, InvoiceId, OrderId, BilledFor, PaymentCollectedOn, 
            PaymentType, Paymode, Amount, ReferenceNumber, Remarks, BusinessUnitId, 
            CreatedBy, CreatedOn, ModifiedBy, ModifiedOn, isSettlement
          ) VALUES (
            @PayId, @RestaurantBillId, @RestaurantBillId, @RestaurantBillId, @OrderId, @BilledFor, GETDATE(), 
            @PaymentType, @Paymode, @Amount, @ReferenceNumber, @Remarks, @BusinessUnitId, 
            @CreatedBy, GETDATE(), @CreatedBy, GETDATE(), 1
          );
        `);

      // C. Update Settlement tables for each payment
      const settReq = new sql.Request(transaction);
      settReq
        .input("SettlementID", sql.UniqueIdentifier, referenceId)
        .input("PayMode", sql.VarChar(50), payModeName)
        .input("SysAmount", sql.Money, amount)
        .input("ManualAmount", sql.Money, amount)
        .input("AmountDiff", sql.Money, 0)
        .input("ReceiptCount", sql.Numeric(18, 0), receiptCount);

      let settlementSql = `
        INSERT INTO SettlementTotalSales (SettlementID, PayMode, SysAmount, ManualAmount, AmountDiff, ReceiptCount)
        VALUES (@SettlementID, @PayMode, @SysAmount, @ManualAmount, @AmountDiff, @ReceiptCount);

        INSERT INTO [dbo].[SettlementDetail] (SettlementId, Paymode, SysAmount, ManualAmount, SortageOrExces, ReceiptCount, IsCollected)
        VALUES (@SettlementID, @PayMode, @SysAmount, @ManualAmount, @AmountDiff, @ReceiptCount, 0);

        INSERT INTO SettlementTranDetail (SettlementID, PayMode, CashIn, CashOut)
        VALUES (@SettlementID, @PayMode, @SysAmount, 0);
      `;

      if (payModeName.toUpperCase().trim() === 'CREDIT' || payModeName.toUpperCase().trim() === 'MEMBER') {
        settlementSql += `
          INSERT INTO SettlementCreditSales (SettlementID, PayMode, SysAmount, ManualAmount, AmountDiff)
          VALUES (@SettlementID, @PayMode, @SysAmount, @ManualAmount, @AmountDiff);
        `;
      }

      await settReq.query(settlementSql);
    }
  }
}

module.exports = {
  processSplitPayments
};

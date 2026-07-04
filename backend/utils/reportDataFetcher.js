const sql = require('mssql');
const { getCompanySettings } = require('./settingsCache');

/**
 * Normalizes payment modes to match frontend categories
 */
const normalizePayMode = (paymentMethod = "CASH") => {
  const raw = String(paymentMethod || "CASH").toUpperCase().trim();
  if (raw.includes("CASH") || raw === "CAS") return "CASH";
  if (raw.includes("CARD") || raw.includes("VISA") || raw.includes("MASTER") || raw.includes("AMEX") || raw.includes("DINERS")) return "CARD";
  if (raw.includes("PAYNOW") || raw.includes("GRAB") || raw.includes("FOODPANDA") || raw === "3" || raw.includes("PAY NOW")) return "PAYNOW";
  if (raw.includes("UPI") || raw === "4" || raw.includes("GPAY") || raw.includes("PHONE") || raw.includes("PAYTM")) return "UPI";
  if (raw.includes("NETS") || raw === "2") return "NETS";
  if (raw.includes("MEMBER") || raw === "5") return "MEMBER";
  if (raw.includes("CREDIT") || raw === "6") return "CREDIT";
  return raw;
};

/**
 * Fetch and compute full sales report data for a given date range
 */
async function fetchFullReportData(startDateStr, endDateStr, pool) {
  const companySettings = await getCompanySettings();

  const isDateTime = (str) => typeof str === "string" && (str.includes(" ") || str.includes("T") || str.includes(":"));

  let shWhere, cctWhere, roWhere;
  let sgtStart, sgtEnd;

  if (isDateTime(startDateStr) || isDateTime(endDateStr)) {
    sgtStart = `CAST('${startDateStr}' AS DATETIME)`;
    sgtEnd = `CAST('${endDateStr}' AS DATETIME)`;
    shWhere = `ISNULL(sh.Start_Date, sh.LastSettlementDate) >= ${sgtStart} AND ISNULL(sh.Start_Date, sh.LastSettlementDate) <= ${sgtEnd}`;
    cctWhere = `ISNULL(cct.CreatedDate, cct.CreatedDate) >= ${sgtStart} AND ISNULL(cct.CreatedDate, cct.CreatedDate) <= ${sgtEnd}`;
    roWhere = `ISNULL(ro.Start_Date, ro.OrderDateTime) >= ${sgtStart} AND ISNULL(ro.Start_Date, ro.OrderDateTime) <= ${sgtEnd}`;
  } else {
    sgtStart = `CAST('${startDateStr}' AS DATETIME)`;
    sgtEnd = `DATEADD(DAY, 1, CAST('${endDateStr}' AS DATETIME))`;
    shWhere = `ISNULL(sh.Start_Date, sh.LastSettlementDate) >= ${sgtStart} AND ISNULL(sh.Start_Date, sh.LastSettlementDate) < ${sgtEnd}`;
    cctWhere = `ISNULL(cct.CreatedDate, cct.CreatedDate) >= ${sgtStart} AND ISNULL(cct.CreatedDate, cct.CreatedDate) < ${sgtEnd}`;
    roWhere = `ISNULL(ro.Start_Date, ro.OrderDateTime) >= ${sgtStart} AND ISNULL(ro.Start_Date, ro.OrderDateTime) < ${sgtEnd}`;
  }

  const salesQuery = `
    SELECT 
      sh.SettlementID, 
      sh.LastSettlementDate AS SettlementDate, 
      sh.BillNo AS OrderId, 
      sh.OrderType,
      sh.TableNo, 
      sh.Section, 
      sh.CashierId, 
      sh.BillNo, 
      sh.SER_NAME,
      sts.PayMode as RawPayMode,
      ISNULL(sts.SysAmount, sh.SysAmount) as SysAmount,
      sh.SubTotal as SubTotal,
      ISNULL(sh.DiscountAmount, 0) as DiscountAmount,
      sh.DiscountType as DiscountType,
      ISNULL(sh.ServiceCharge, 0) as ServiceCharge,
      ISNULL(sh.TotalTax, 0) as TotalTax,
      ISNULL(sts.ReceiptCount, 0) as ReceiptCount,
      ISNULL(sh.VoidItemQty, 0) as VoidQty,
      ISNULL(sh.VoidItemAmount, 0) as VoidAmount,
      sh.IsCancelled,
      sh.CancellationReason,
      sh.RoundedBy as RoundedBy,
      ISNULL(cct_sale.OutstandingAmount, 0) AS OutstandingAmount
    FROM SettlementHeader sh
    LEFT JOIN SettlementTotalSales sts ON sh.SettlementID = sts.SettlementID
    LEFT JOIN CustomerCreditTransactions cct_sale ON sh.SettlementID = cct_sale.SettlementId AND cct_sale.TransactionType = 'CREDIT_SALE'
    WHERE ${shWhere}

    UNION ALL

    SELECT 
      cct.TransactionId AS SettlementID,
      cct.CreatedDate AS SettlementDate,
      CASE WHEN mm.MemberId IS NOT NULL THEN 'Member Payment Collected' ELSE 'Credit Payment Collected' END AS OrderId,
      'LEDGER' AS OrderType,
      'LEDGER' AS TableNo,
      COALESCE(mm.Name, m.Name, 'Customer') AS Section,
      CAST(cct.CreatedBy AS VARCHAR(50)) AS CashierId,
      cct.Remarks AS BillNo,
      'Cashier' AS SER_NAME,
      cct.PaymentMethod AS RawPayMode,
      cct.PaidAmount AS SysAmount,
      cct.PaidAmount AS SubTotal,
      0 AS DiscountAmount,
      NULL AS DiscountType,
      0 AS ServiceCharge,
      0 AS TotalTax,
      1 AS ReceiptCount,
      0 AS VoidQty,
      0 AS VoidAmount,
      0 AS IsCancelled,
      NULL AS CancellationReason,
      0 AS RoundedBy,
      0 AS OutstandingAmount
    FROM CustomerCreditTransactions cct
    LEFT JOIN CreditCustomerMaster m ON cct.MemberId = m.CustomerId
    LEFT JOIN MemberMaster mm ON cct.MemberId = mm.MemberId
    WHERE cct.TransactionType = 'PAYMENT' AND ${cctWhere}
  `;

  const salesResult = await pool.request().query(salesQuery);
  const salesList = salesResult.recordset || [];

  // 2. Compute Metrics matching frontend sales-report.tsx
  let totalSales = 0;
  let totalTax = 0;
  let totalTransactions = 0;
  let totalItems = 0;
  let totalVoids = 0;
  let totalVoidAmount = 0;
  let cancelledCount = 0;
  let cancelledAmount = 0;
  let memberPaymentsCollected = 0;
  let creditPaymentsCollected = 0;

  let cash = 0;
  let card = 0;
  let nets = 0;
  let paynow = 0;
  let member = 0;
  let credit = 0;
  let creditOutstanding = 0;

  let dineInCount = 0;
  let takeawayCount = 0;

  // Deduplicate sales by SettlementID + PayMode (or combined) to count transactions properly
  const uniqueTransactions = new Map();
  salesList.forEach(s => {
    if (s.OrderType !== 'LEDGER' && !s.IsCancelled) {
      const isSubsequentSplit = s.SettlementID && String(s.SettlementID).includes("-") && String(s.SettlementID).split("-").pop().match(/^\d+$/);
      if (!isSubsequentSplit) {
        uniqueTransactions.set(s.SettlementID, s);
      }
    }
  });

  salesList.forEach(s => {
    const isSubsequentSplit = s.SettlementID && String(s.SettlementID).includes("-") && String(s.SettlementID).split("-").pop().match(/^\d+$/);

    if (s.IsCancelled) {
      if (!isSubsequentSplit) {
        cancelledCount += 1;
        cancelledAmount += s.VoidAmount || 0;
      }
      return;
    }

    if (s.OrderType === 'LEDGER') {
      const isCredit = s.OrderId === 'Credit Payment Collected';
      if (isCredit) {
        creditPaymentsCollected += s.SysAmount || 0;
      } else {
        memberPaymentsCollected += s.SysAmount || 0;
      }
      // Add ledger payments to payment breakdown methods!
      const mode = normalizePayMode(s.RawPayMode);
      if (mode === "CASH") cash += s.SysAmount || 0;
      else if (mode === "CARD") card += s.SysAmount || 0;
      else if (mode === "NETS") nets += s.SysAmount || 0;
      else if (mode === "PAYNOW" || mode === "UPI") paynow += s.SysAmount || 0;
      else if (mode === "MEMBER") member += s.SysAmount || 0;
      return;
    }

    totalSales += s.SysAmount || 0;
    if (!isSubsequentSplit) {
      totalItems += (s.ReceiptCount || 0);
      totalVoids += s.VoidQty || 0;
      totalVoidAmount += s.VoidAmount || 0;
      totalTax += s.TotalTax || 0;
    }

    const mode = normalizePayMode(s.RawPayMode);
    if (mode === "CASH") cash += s.SysAmount || 0;
    else if (mode === "CARD") card += s.SysAmount || 0;
    else if (mode === "NETS") nets += s.SysAmount || 0;
    else if (mode === "PAYNOW" || mode === "UPI") paynow += s.SysAmount || 0; // Sales Analytics page groups UPI under PAYNOW
    else if (mode === "MEMBER") member += s.SysAmount || 0;
    else if (mode === "CREDIT") {
      credit += s.SysAmount || 0;
      creditOutstanding += Number(s.OutstandingAmount) || 0;
    }

    const isTakeaway = s.OrderType === "TAKEAWAY" || s.Section === "TAKEAWAY" || (!s.OrderType && s.TableNo && String(s.TableNo).startsWith("TW-"));
    if (isTakeaway) {
      takeawayCount += 1;
    } else {
      dineInCount += 1;
    }
  });

  totalTransactions = uniqueTransactions.size;
  const totalOrders = totalTransactions;

  const paymentBreakdownTotal = cash + card + nets + paynow + member + credit;
  const totalCollections = (paymentBreakdownTotal - credit);

  const avgCheck = totalTransactions > 0 ? totalSales / totalTransactions : 0;
  const avgItems = totalTransactions > 0 ? totalItems / totalTransactions : 0;
  const perItem = totalItems > 0 ? totalSales / totalItems : 0;

  const orderTypesTotal = dineInCount + takeawayCount;
  const dineInPct = orderTypesTotal > 0 ? (dineInCount / orderTypesTotal) * 100 : 0;
  const takeawayPct = orderTypesTotal > 0 ? (takeawayCount / orderTypesTotal) * 100 : 0;

  // 3. Fetch category report (AppReport + ProfessionalReport union)
  const categoryQuery = `
    WITH AppReport AS (
      SELECT
        ISNULL(NULLIF(LTRIM(RTRIM(sid.CategoryName)), ''), ISNULL(cm.CategoryName, 'Unmapped')) AS categoryName,
        SUM(CASE WHEN ISNULL(sid.Status, 'NORMAL') <> 'VOIDED' THEN CAST(ISNULL(sid.Qty, 0) AS decimal(18, 3)) ELSE 0 END) AS totalQty,
        SUM(CASE WHEN ISNULL(sid.Status, 'NORMAL') = 'VOIDED' THEN CAST(ISNULL(sid.Qty, 0) AS decimal(18, 3)) ELSE 0 END) AS voidQty,
        SUM(CASE WHEN ISNULL(sid.Status, 'NORMAL') <> 'VOIDED' THEN CAST(ISNULL(sid.Qty, 0) * ISNULL(sid.Price, 0) AS decimal(18, 2)) ELSE 0 END) AS totalAmount
      FROM SettlementHeader sh
      INNER JOIN SettlementItemDetail sid ON sh.SettlementID = sid.SettlementID
      LEFT JOIN DishMaster d ON sid.DishId = d.DishId
      LEFT JOIN DishGroupMaster dg ON COALESCE(sid.DishGroupId, d.DishGroupId) = dg.DishGroupId
      LEFT JOIN CategoryMaster cm ON COALESCE(sid.CategoryId, dg.CategoryId) = cm.CategoryId
      WHERE ${shWhere} AND ISNULL(sid.Qty, 0) > 0
      GROUP BY ISNULL(NULLIF(LTRIM(RTRIM(sid.CategoryName)), ''), ISNULL(cm.CategoryName, 'Unmapped'))
    ),
    ProfessionalReport AS (
      SELECT
        ISNULL(cm.CategoryName, 'Unmapped') AS categoryName,
        SUM(CASE WHEN rod.StatusCode <> 0 THEN CAST(ISNULL(rod.Quantity, 0) AS decimal(18, 3)) ELSE 0 END) AS totalQty,
        SUM(CASE WHEN rod.StatusCode = 0 THEN CAST(ISNULL(rod.Quantity, 0) AS decimal(18, 3)) ELSE 0 END) AS voidQty,
        SUM(CASE WHEN rod.StatusCode <> 0 THEN CAST(ISNULL(rod.TotalDetailLineAmount, 0) AS decimal(18, 2)) ELSE 0 END) AS totalAmount
      FROM RestaurantOrderDetail rod
      INNER JOIN RestaurantOrder ro ON rod.OrderId = ro.OrderId
      LEFT JOIN DishMaster d ON rod.DishId = d.DishId
      LEFT JOIN DishGroupMaster dg ON d.DishGroupId = dg.DishGroupId
      LEFT JOIN CategoryMaster cm ON dg.CategoryId = cm.CategoryId
      WHERE ${roWhere}
        AND ISNULL(ro.StatusCode, 0) = 3
        AND NOT EXISTS (
          SELECT 1 FROM SettlementHeader sh_dup 
          WHERE sh_dup.BillNo = ro.OrderNumber
        )
      GROUP BY ISNULL(cm.CategoryName, 'Unmapped')
    )
    SELECT categoryName AS Category, SUM(totalQty) AS Qty, SUM(totalAmount) AS Sales
    FROM (
      SELECT CAST(categoryName AS NVARCHAR(255)) AS categoryName, CAST(totalQty AS decimal(18,3)) AS totalQty, CAST(totalAmount AS decimal(18,2)) AS totalAmount FROM AppReport
      UNION ALL
      SELECT CAST(categoryName AS NVARCHAR(255)) AS categoryName, CAST(totalQty AS decimal(18,3)) AS totalQty, CAST(totalAmount AS decimal(18,2)) AS totalAmount FROM ProfessionalReport
    ) ReportRows
    GROUP BY categoryName
    HAVING SUM(totalQty) > 0 OR SUM(totalAmount) > 0
    ORDER BY Sales DESC, Qty DESC, categoryName ASC
  `;

  const categoryResult = await pool.request().query(categoryQuery);
  const categoriesList = categoryResult.recordset || [];

  // 4. Fetch dish/item wise report
  const dishQuery = `
    WITH AppReport AS (
      SELECT
        ISNULL(NULLIF(LTRIM(RTRIM(sid.DishName)), ''), ISNULL(d.Name, 'Unknown')) AS dishName,
        ISNULL(NULLIF(LTRIM(RTRIM(sid.CategoryName)), ''), ISNULL(cm.CategoryName, 'Unmapped')) AS categoryName,
        SUM(CASE WHEN ISNULL(sid.Status, 'NORMAL') <> 'VOIDED' THEN CAST(ISNULL(sid.Qty, 0) AS decimal(18, 3)) ELSE 0 END) AS totalQty,
        SUM(CASE WHEN ISNULL(sid.Status, 'NORMAL') <> 'VOIDED' THEN CAST(ISNULL(sid.Qty, 0) * ISNULL(sid.Price, 0) AS decimal(18, 2)) ELSE 0 END) AS totalAmount
      FROM SettlementHeader sh
      INNER JOIN SettlementItemDetail sid ON sh.SettlementID = sid.SettlementID
      LEFT JOIN DishMaster d ON sid.DishId = d.DishId
      LEFT JOIN DishGroupMaster dg ON COALESCE(sid.DishGroupId, d.DishGroupId) = dg.DishGroupId
      LEFT JOIN CategoryMaster cm ON COALESCE(sid.CategoryId, dg.CategoryId) = cm.CategoryId
      WHERE ${shWhere}
      GROUP BY 
        ISNULL(NULLIF(LTRIM(RTRIM(sid.DishName)), ''), ISNULL(d.Name, 'Unknown')), 
        ISNULL(NULLIF(LTRIM(RTRIM(sid.CategoryName)), ''), ISNULL(cm.CategoryName, 'Unmapped'))
    ),
    ProfessionalReport AS (
      SELECT
        ISNULL(d.Name, 'Unknown') AS dishName,
        ISNULL(cm.CategoryName, 'Unmapped') AS categoryName,
        SUM(CASE WHEN rod.StatusCode <> 0 THEN CAST(ISNULL(rod.Quantity, 0) AS decimal(18, 3)) ELSE 0 END) AS totalQty,
        SUM(CASE WHEN rod.StatusCode <> 0 THEN CAST(ISNULL(rod.TotalDetailLineAmount, 0) AS decimal(18, 2)) ELSE 0 END) AS totalAmount
      FROM RestaurantOrderDetail rod
      INNER JOIN RestaurantOrder ro ON rod.OrderId = ro.OrderId
      LEFT JOIN DishMaster d ON rod.DishId = d.DishId
      LEFT JOIN DishGroupMaster dg ON d.DishGroupId = dg.DishGroupId
      LEFT JOIN CategoryMaster cm ON dg.CategoryId = cm.CategoryId
      WHERE ${roWhere}
        AND ISNULL(ro.StatusCode, 0) = 3
        AND NOT EXISTS (
          SELECT 1 FROM SettlementHeader sh_dup 
          WHERE sh_dup.BillNo = ro.OrderNumber
        )
      GROUP BY ISNULL(d.Name, 'Unknown'), ISNULL(cm.CategoryName, 'Unmapped')
    )
    SELECT dishName AS Item, categoryName AS Category, SUM(totalQty) AS Qty, SUM(totalAmount) AS Sales
    FROM (
      SELECT CAST(dishName AS NVARCHAR(255)) AS dishName, CAST(categoryName AS NVARCHAR(255)) AS categoryName, CAST(totalQty AS decimal(18,3)) AS totalQty, CAST(totalAmount AS decimal(18,2)) AS totalAmount FROM AppReport
      UNION ALL
      SELECT CAST(dishName AS NVARCHAR(255)) AS dishName, CAST(categoryName AS NVARCHAR(255)) AS categoryName, CAST(totalQty AS decimal(18,3)) AS totalQty, CAST(totalAmount AS decimal(18,2)) AS totalAmount FROM ProfessionalReport
    ) ReportRows
    GROUP BY dishName, categoryName
    HAVING SUM(totalQty) > 0 OR SUM(totalAmount) > 0
    ORDER BY Sales DESC, Qty DESC, dishName ASC
  `;

  const dishResult = await pool.request().query(dishQuery);
  const itemsList = dishResult.recordset || [];

  const artistQuery = `
    SELECT 
      a.CustomerName AS Name,
      COALESCE(a.TargetAmount, a.Amount, 0) AS TargetAmount,
      ISNULL(sales.Achieved, 0) AS ActualSales
    FROM dishOrderItemShare a
    OUTER APPLY (
      SELECT SUM(CAST(ISNULL(b.Qty, 0) * ISNULL(b.Price, 0) AS decimal(18,2))) AS Achieved
      FROM settlementitemdetail b
      INNER JOIN SettlementHeader sh ON b.SettlementID = sh.SettlementID
      WHERE (b.DishId = a.DishId OR (a.DishId IS NULL AND b.DishName = a.CustomerName))
        AND sh.IsCancelled = 0
        AND ISNULL(b.Status, 'NORMAL') <> 'VOIDED'
        AND b.OrderDateTime >= CAST(a.FromDate AS DATETIME)
        AND b.OrderDateTime < DATEADD(DAY, 1, CAST(a.ToDate AS DATETIME))
    ) sales
    ORDER BY a.CustomerName ASC;
  `;

  const artistResult = await pool.request().query(artistQuery);
  const artistSalesList = artistResult.recordset || [];

  // 6. Format SGT time period string
  const formatSgtDate = (dateStr) => {
    const d = new Date(dateStr);
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  };

  const periodStr = (startDateStr === endDateStr) ? startDateStr : `${startDateStr} to ${endDateStr}`;

  return {
    companyName: companySettings?.CompanyName || 'JALSA',
    companyAddress: companySettings?.Address || '1 ROCHOR CANAL ROAD, #B1-29 SIM LIM SQUARE, SINGAPORE 188504',
    companyPhone: companySettings?.Phone || '',
    period: periodStr,
    printedOn: new Date().toLocaleString("en-SG", { timeZone: "Asia/Singapore", hour12: false }),

    // Summary Metrics
    totalSales,
    totalTax,
    totalCollections,
    creditPaymentsCollected,
    memberPaymentsCollected,
    totalOrders,
    totalItems,
    voidQty: totalVoids,
    voidAmount: totalVoidAmount,
    cancelledCount,
    cancelledAmount,

    // Payment Breakdown
    paymentBreakdown: {
      Cash: cash,
      Card: card,
      Nets: nets,
      PayNow: paynow,
      Member: member,
      Credit: credit,
      CreditOutstanding: creditOutstanding
    },

    // Reconciliation Summary
    reconciliation: {
      totalSalesVolume: totalSales,
      memberSales: member,
      creditCollected: creditPaymentsCollected,
      creditOutstanding: creditOutstanding,
      totalCollectionsVolume: totalCollections
    },

    // Key Metrics
    keyMetrics: {
      avgCheck,
      conversion: totalTransactions,
      avgItems,
      perItem
    },

    // Order Types
    orderTypes: {
      dineInCount,
      takeawayCount,
      dineInPct,
      takeawayPct
    },

    // Reports lists
    categories: categoriesList,
    items: itemsList,
    artistSales: artistSalesList
  };
}

module.exports = {
  fetchFullReportData
};

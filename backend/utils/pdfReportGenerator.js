/**
 * Professional PDF Report Generator for Jalsa Sales Analytics
 * Generates premium Power BI / Tableau-style executive dashboards for restaurant owners and managers.
 */

const PdfPrinter = require('pdfmake');

const fonts = {
  Roboto: {
    normal: 'Helvetica',
    bold: 'Helvetica-Bold',
    italics: 'Helvetica-Oblique',
    bolditalics: 'Helvetica-BoldOblique'
  }
};

const printer = new PdfPrinter(fonts);

/**
 * Format currency to $XX.XX
 */
const formatVal = (val, isCurrency = true) => {
  const num = Number(val) || 0;
  return isCurrency ? `$${num.toFixed(2)}` : num.toString();
};

/**
 * Generates a visual progress bar component using pdfmake canvas
 */
const makeProgressBar = (percentage, color) => {
  const barWidth = 120;
  const filledWidth = Math.max(0, Math.min(barWidth, (percentage / 100) * barWidth));
  return {
    canvas: [
      {
        type: 'rect',
        x: 0,
        y: 3,
        w: barWidth,
        h: 6,
        color: '#f1f5f9', // Light background bar
        r: 3
      },
      filledWidth > 0 ? {
        type: 'rect',
        x: 0,
        y: 3,
        w: filledWidth,
        h: 6,
        color: color,
        r: 3
      } : null
    ].filter(Boolean)
  };
};

/**
 * Generates a vector branding emblem / logo for the dashboard header
 */
const makeLogoEmblem = () => {
  return {
    canvas: [
      {
        type: 'rect',
        x: 0,
        y: 0,
        w: 32,
        h: 32,
        r: 8,
        color: '#1e3a8a' // Deep Navy Blue
      },
      {
        type: 'rect',
        x: 6,
        y: 6,
        w: 20,
        h: 20,
        r: 5,
        color: '#f97316' // Orange highlight
      }
    ],
    width: 38,
    height: 38,
    margin: [0, 0, 10, 0]
  };
};

/**
 * Generates a dynamic Sales Trend vector bar chart using pdfmake canvas
 */
const makeSalesTrendChart = (categories) => {
  const chartHeight = 65;
  const chartWidth = 515;
  const maxBars = 6;
  const data = (categories && categories.length > 0)
    ? categories.slice(0, maxBars)
    : [
      { Category: 'Dine-In', Sales: 1200 },
      { Category: 'Takeaway', Sales: 800 },
      { Category: 'Delivery', Sales: 600 },
      { Category: 'Beverages', Sales: 400 },
      { Category: 'Desserts', Sales: 250 }
    ];

  const maxVal = Math.max(...data.map(c => c.Sales || 1));

  const shapes = [];

  // Background grid lines (horizontal ticks)
  for (let i = 0; i <= 3; i++) {
    const y = 8 + i * 16;
    shapes.push({
      type: 'line',
      x1: 15,
      y1: y,
      x2: chartWidth - 15,
      y2: y,
      lineWidth: 0.5,
      lineColor: '#f1f5f9'
    });
  }

  // Draw columns (bars) & trend dots
  const numBars = data.length;
  const barSpacing = (chartWidth - 40) / numBars;
  const barWidth = 22;
  const linePoints = [];

  data.forEach((c, idx) => {
    const val = c.Sales || 0;
    const barHeight = maxVal > 0 ? (val / maxVal) * 45 : 0;
    const x = 30 + idx * barSpacing + barSpacing / 2;
    const y = 56 - barHeight;

    // The primary blue column
    shapes.push({
      type: 'rect',
      x: x - barWidth / 2,
      y: y,
      w: barWidth,
      h: barHeight,
      color: '#3b82f6', // Premium Blue
      r: 3
    });

    // Save points for custom trend line running above the columns
    linePoints.push({ x: x, y: y - 5 });
  });

  // Connect trend line points
  for (let i = 0; i < linePoints.length - 1; i++) {
    shapes.push({
      type: 'line',
      x1: linePoints[i].x,
      y1: linePoints[i].y,
      x2: linePoints[i + 1].x,
      y2: linePoints[i + 1].y,
      lineWidth: 1.8,
      lineColor: '#10b981' // Green positive trend line
    });
    shapes.push({
      type: 'rect',
      x: linePoints[i].x - 2,
      y: linePoints[i].y - 2,
      w: 4,
      h: 4,
      color: '#10b981'
    });
  }
  if (linePoints.length > 0) {
    const last = linePoints[linePoints.length - 1];
    shapes.push({
      type: 'rect',
      x: last.x - 2,
      y: last.y - 2,
      w: 4,
      h: 4,
      color: '#10b981'
    });
  }

  // Axis baseline
  shapes.push({
    type: 'line',
    x1: 15,
    y1: 56,
    x2: chartWidth - 15,
    y2: 56,
    lineWidth: 1,
    lineColor: '#cbd5e1'
  });

  return {
    stack: [
      {
        canvas: shapes,
        height: chartHeight
      },
      {
        columns: data.map(c => ({
          text: String(c.Category || 'Other').toUpperCase().substring(0, 15),
          fontSize: 7,
          color: '#475569',
          alignment: 'center',
          bold: true
        })),
        margin: [15, 2, 15, 0]
      }
    ],
    margin: [0, 8, 0, 15]
  };
};

/**
 * Generates a comprehensive sales report PDF definition
 */
const generateSalesReportPdf = (reportData) => {
  const {
    companyName = 'JALSA',
    companyAddress = '1 ROCHOR CANAL ROAD, #B1-29 SIM LIM SQUARE, SINGAPORE 188504',
    companyPhone = '',
    period = '09/06/2026',
    printedOn = '',
    totalSales = 0,
    totalTax = 0,
    totalCollections = 0,
    creditPaymentsCollected = 0,
    memberPaymentsCollected = 0,
    totalOrders = 0,
    totalItems = 0,
    voidQty = 0,
    voidAmount = 0,
    cancelledCount = 0,
    cancelledAmount = 0,
    paymentBreakdown = {},
    reconciliation = {},
    keyMetrics = {},
    orderTypes = {},
    categories = [],
    items = [],
    artistSales = []
  } = reportData || {};

  const topItem = items.length > 0 ? [...items].sort((a, b) => b.Sales - a.Sales)[0] : null;
  const topCategory = categories.length > 0 ? [...categories].sort((a, b) => b.Sales - a.Sales)[0] : null;
  const topStaff = artistSales.length > 0 ? [...artistSales].sort((a, b) => b.ActualSales - a.ActualSales)[0] : null;

  const topItemText = topItem ? String(topItem.Item).toUpperCase() : 'NONE';
  const topItemSub = topItem ? `${Number(topItem.Qty).toFixed(0)} units · ${formatVal(topItem.Sales)}` : '0 units · $0.00';

  const topCatText = topCategory ? String(topCategory.Category).toUpperCase() : 'NONE';
  const topCatSub = topCategory ? `${formatVal(topCategory.Sales)} revenue` : '$0.00 revenue';

  const topStaffText = topStaff ? String(topStaff.Name).toUpperCase() : 'NONE';
  const topStaffSub = topStaff ? `${formatVal(topStaff.ActualSales)} achieved` : '$0.00 achieved';

  // Premium Dashboard Theme Palette
  const BLUE_PRIMARY = '#1e3a8a';  // Power BI Dark Blue
  const TEAL_SUCCESS = '#10b981';  // Modern Green
  const ORANGE_HIGHLIGHT = '#f97316'; // Vivid Orange
  const RED_ALERT = '#ef4444'; // Red for Voids/Cancellations
  const SLATE_DARK = '#334155';
  const SLATE_MUTED = '#64748b';
  const BG_LIGHT = '#f8fafc';

  const content = [];

  const makeSectionHeader = (title) => {
    return {
      columns: [
        {
          canvas: [{ type: 'rect', x: 0, y: 1.5, w: 4, h: 10, color: '#f97316', r: 1 }],
          width: 8
        },
        {
          text: title.toUpperCase(),
          fontSize: 9,
          bold: true,
          color: BLUE_PRIMARY,
          margin: [0, 0, 0, 0]
        }
      ],
      margin: [0, 8, 0, 6]
    };
  };
  content.push({
    columns: [
      {
        stack: [
          { text: companyName.toUpperCase(), fontSize: 16, bold: true, color: BLUE_PRIMARY, letterSpacing: 1 },
          { text: `${companyAddress} ${companyPhone ? ' | Tel: ' + companyPhone : ''}`, fontSize: 7.5, color: SLATE_MUTED }
        ],
        width: '*',
        margin: [0, 2, 0, 0]
      },
      {
        stack: [
          { text: 'SALES ANALYTICS EXECUTIVE DASHBOARD', fontSize: 9.5, bold: true, color: ORANGE_HIGHLIGHT, alignment: 'right' },
          { text: `Report Period: ${period}`, fontSize: 8, bold: true, color: SLATE_DARK, alignment: 'right', margin: [0, 2, 0, 0] }
        ],
        width: 220
      }
    ],
    margin: [0, 0, 0, 10]
  });

  content.push({
    canvas: [{ type: 'rect', x: 0, y: 0, w: 525, h: 2, color: BLUE_PRIMARY }],
    margin: [0, 0, 0, 15]
  });

  // ================= 2. KPI SUMMARY CARDS =================
  const makeKpiCard = (title, value, subtitle, color) => {
    return {
      table: {
        widths: ['*'],
        body: [
          [{
            stack: [
              { text: title.toUpperCase(), fontSize: 6.5, bold: true, color: SLATE_MUTED, margin: [0, 0, 0, 3] },
              { text: value, fontSize: 13, bold: true, color: SLATE_DARK },
              subtitle ? { text: subtitle, fontSize: 6.5, color: color, margin: [0, 2, 0, 0], bold: true } : null
            ].filter(Boolean),
            fillColor: '#ffffff',
            margin: [8, 8, 8, 8],
            border: [true, false, false, false],
            borderColor: [color, null, null, null]
          }]
        ]
      },
      layout: {
        defaultBorder: false,
        vLineWidth: (i) => i === 0 ? 3.5 : 0
      },
      margin: [2, 2, 2, 2]
    };
  };

  const netSales = totalSales - voidAmount - cancelledAmount;

  content.push({
    table: {
      widths: ['25%', '25%', '25%', '25%'],
      body: [
        [
          makeKpiCard('Total Sales', formatVal(totalSales), 'Gross volume', BLUE_PRIMARY),
          makeKpiCard('Net Sales', formatVal(netSales), 'After voids/cancels', TEAL_SUCCESS),
          makeKpiCard('Total Orders', formatVal(totalOrders, false), 'Completed bills', BLUE_PRIMARY),
          makeKpiCard('Items Sold', formatVal(totalItems, false), 'Dishes dispatched', SLATE_DARK)
        ],
        [
          makeKpiCard('Credit Sales', formatVal(paymentBreakdown.Credit || 0), 'Pending collection', ORANGE_HIGHLIGHT),
          makeKpiCard('Member Sales', formatVal((paymentBreakdown.Member || 0) + memberPaymentsCollected), 'Wallet deductions', '#a855f7'),
          makeKpiCard('Discounts Given', formatVal(reconciliation.totalSalesVolume ? (totalSales - reconciliation.totalSalesVolume) : 0), 'Promo reduction', ORANGE_HIGHLIGHT),
          makeKpiCard('Voids & Cancels', formatVal(voidAmount + cancelledAmount), `${voidQty} items voided`, RED_ALERT)
        ]
      ]
    },
    layout: {
      defaultBorder: false,
      hLineWidth: () => 0,
      vLineWidth: () => 0,
      paddingLeft: () => 0,
      paddingRight: () => 0,
      paddingTop: () => 0,
      paddingBottom: () => 0
    },
    margin: [0, 0, 0, 18]
  });

  // ================= 3. CHARTS & TREND SECTION =================
  content.push({
    stack: [
      makeSectionHeader('Category Sales Trend & Breakdown'),
      makeSalesTrendChart(categories)
    ],
    margin: [0, 0, 0, 12]
  });

  // ================= 4. OPERATIONAL PERFORMANCE CARDS =================
  const makeOpsCard = (title, value, subtitle, color) => {
    return {
      table: {
        widths: ['*'],
        body: [
          [{
            stack: [
              { text: title.toUpperCase(), fontSize: 6.5, bold: true, color: SLATE_MUTED, margin: [0, 0, 0, 3] },
              { text: value, fontSize: 13, bold: true, color: SLATE_DARK },
              { text: subtitle, fontSize: 6.5, color: color, margin: [0, 2, 0, 0], bold: true }
            ],
            fillColor: '#ffffff',
            margin: [6, 6, 6, 6],
            border: [true, false, false, false],
            borderColor: ['#f97316', null, null, null]
          }]
        ]
      },
      layout: {
        defaultBorder: false,
        vLineWidth: (i) => i === 0 ? 3.5 : 0
      },
      margin: [1, 1, 1, 1]
    };
  };

  content.push({
    table: {
      widths: ['20%', '20%', '20%', '20%', '20%'],
      body: [
        [
          makeOpsCard('Avg Ticket', formatVal(keyMetrics.avgCheck || 0), 'Per bill', '#f97316'),
          makeOpsCard('Avg Item Price', formatVal(keyMetrics.perItem || 0), 'Per dish', '#f97316'),
          makeOpsCard('Avg Items/Bill', (Number(keyMetrics.avgItems) || 0).toFixed(1), 'Items', '#64748b'),
          makeOpsCard('Dine-In Share', `${(Number(orderTypes.dineInPct) || 0).toFixed(0)}%`, 'Channel', '#3b82f6'),
          makeOpsCard('Takeaway Share', `${(Number(orderTypes.takeawayPct) || 0).toFixed(0)}%`, 'Channel', '#ec4899')
        ]
      ]
    },
    layout: {
      defaultBorder: false,
      hLineWidth: () => 0,
      vLineWidth: () => 0,
      paddingLeft: () => 0,
      paddingRight: () => 0,
      paddingTop: () => 0,
      paddingBottom: () => 0
    },
    margin: [0, 0, 0, 15]
  });

  // ================= 5. PAYMENT & BUSINESS INSIGHTS =================
  const payBreakdownBody = [];
  payBreakdownBody.push([
    { text: 'PAYMODE', fontSize: 7.5, bold: true, fillColor: BLUE_PRIMARY, color: '#fff', margin: [0, 2, 0, 2] },
    { text: 'REVENUE', fontSize: 7.5, bold: true, fillColor: BLUE_PRIMARY, color: '#fff', alignment: 'right', margin: [0, 2, 0, 2] },
    { text: 'CONTRIBUTION SHARE', fontSize: 7.5, bold: true, fillColor: BLUE_PRIMARY, color: '#fff', margin: [0, 2, 0, 2] },
    { text: 'SHARE %', fontSize: 7.5, bold: true, fillColor: BLUE_PRIMARY, color: '#fff', alignment: 'right', margin: [0, 2, 0, 2] }
  ]);

  const rawTotal = (paymentBreakdown.Cash || 0) +
    (paymentBreakdown.Card || 0) +
    (paymentBreakdown.Nets || 0) +
    (paymentBreakdown.PayNow || 0) +
    (paymentBreakdown.Member || 0) +
    (paymentBreakdown.Credit || 0);

  const payModes = [
    { label: 'CASH', val: paymentBreakdown.Cash || 0, color: TEAL_SUCCESS },
    { label: 'CARD', val: paymentBreakdown.Card || 0, color: '#3b82f6' },
    { label: 'NETS', val: paymentBreakdown.Nets || 0, color: '#6366f1' },
    { label: 'PAYNOW / UPI', val: paymentBreakdown.PayNow || 0, color: ORANGE_HIGHLIGHT },
    { label: 'MEMBER WALLET', val: paymentBreakdown.Member || 0, color: '#a855f7' },
    { label: 'CREDIT', val: paymentBreakdown.Credit || 0, color: RED_ALERT }
  ];

  payModes.forEach(p => {
    const sharePct = rawTotal > 0 ? (p.val / rawTotal) * 100 : 0;
    payBreakdownBody.push([
      { text: p.label, fontSize: 7.5, bold: true, color: SLATE_DARK, margin: [0, 3, 0, 3] },
      { text: formatVal(p.val), fontSize: 7.5, bold: true, color: SLATE_DARK, alignment: 'right', margin: [0, 3, 0, 3] },
      { stack: [makeProgressBar(sharePct, p.color)], margin: [5, 3, 0, 3] },
      { text: `${sharePct.toFixed(1)}%`, fontSize: 7.5, bold: true, color: p.color, alignment: 'right', margin: [0, 3, 0, 3] }
    ]);
  });

  const sortedPayModes = [...payModes].sort((a, b) => b.val - a.val);
  const primaryPayChannel = sortedPayModes.length > 0 && sortedPayModes[0].val > 0 ? sortedPayModes[0].label : 'NONE';

  const insightsBody = [];
  insightsBody.push([
    { text: 'INSIGHTS', fontSize: 7.5, bold: true, fillColor: BLUE_PRIMARY, color: '#fff', colSpan: 2, margin: [0, 2, 0, 2] },
    {}
  ]);
  insightsBody.push([
    { text: 'Report Period', fontSize: 7.5, color: SLATE_DARK, margin: [0, 3, 0, 3] },
    { text: period, fontSize: 7.5, bold: true, color: BLUE_PRIMARY, alignment: 'right', margin: [0, 3, 0, 3] }
  ]);
  insightsBody.push([
    { text: 'Gross Revenue', fontSize: 7.5, color: SLATE_DARK, margin: [0, 3, 0, 3] },
    { text: formatVal(totalSales), fontSize: 7.5, bold: true, color: BLUE_PRIMARY, alignment: 'right', margin: [0, 3, 0, 3] }
  ]);
  insightsBody.push([
    { text: 'Net Realized Sales', fontSize: 7.5, color: SLATE_DARK, margin: [0, 3, 0, 3] },
    { text: formatVal(netSales), fontSize: 7.5, bold: true, color: TEAL_SUCCESS, alignment: 'right', margin: [0, 3, 0, 3] }
  ]);
  insightsBody.push([
    { text: 'Total Collections', fontSize: 7.5, color: SLATE_DARK, margin: [0, 3, 0, 3] },
    { text: formatVal(totalCollections), fontSize: 7.5, bold: true, color: TEAL_SUCCESS, alignment: 'right', margin: [0, 3, 0, 3] }
  ]);
  insightsBody.push([
    { text: 'Primary Pay Channel', fontSize: 7.5, color: SLATE_DARK, margin: [0, 3, 0, 3] },
    { text: primaryPayChannel, fontSize: 7.5, bold: true, color: BLUE_PRIMARY, alignment: 'right', margin: [0, 3, 0, 3] }
  ]);
  insightsBody.push([
    { text: 'Top Staff', fontSize: 7.5, color: SLATE_DARK, margin: [0, 3, 0, 3] },
    { text: topStaffText, fontSize: 7.5, bold: true, color: SLATE_DARK, alignment: 'right', margin: [0, 3, 0, 3] }
  ]);
  insightsBody.push([
    { text: 'Top Menu Item', fontSize: 7.5, color: SLATE_DARK, margin: [0, 3, 0, 3] },
    { text: topItemText, fontSize: 7.5, bold: true, color: BLUE_PRIMARY, alignment: 'right', margin: [0, 3, 0, 3] }
  ]);
  insightsBody.push([
    { text: 'Top Category', fontSize: 7.5, color: SLATE_DARK, margin: [0, 3, 0, 3] },
    { text: topCatText, fontSize: 7.5, bold: true, color: SLATE_DARK, alignment: 'right', margin: [0, 3, 0, 3] }
  ]);
  insightsBody.push([
    { text: 'Avg Ticket Value', fontSize: 7.5, color: SLATE_DARK, margin: [0, 3, 0, 3] },
    { text: formatVal(keyMetrics.avgCheck || 0), fontSize: 7.5, bold: true, color: BLUE_PRIMARY, alignment: 'right', margin: [0, 3, 0, 3] }
  ]);
  insightsBody.push([
    { text: 'Avg Items / Bill', fontSize: 7.5, color: SLATE_DARK, margin: [0, 3, 0, 3] },
    { text: (Number(keyMetrics.avgItems) || 0).toFixed(1), fontSize: 7.5, bold: true, color: SLATE_DARK, alignment: 'right', margin: [0, 3, 0, 3] }
  ]);

  content.push({
    columns: [
      {
        width: 300,
        stack: [
          makeSectionHeader('Payment Channel Contribution'),
          {
            table: {
              widths: ['*', 45, 95, 30],
              body: payBreakdownBody
            },
            layout: 'lightHorizontalLines'
          }
        ]
      },
      {
        width: 200,
        stack: [
          makeSectionHeader('Business Insights'),
          {
            table: {
              widths: ['*', 'auto'],
              body: insightsBody
            },
            layout: 'lightHorizontalLines'
          }
        ]
      }
    ],
    columnGap: 25,
    margin: [0, 0, 0, 15]
  });

  // ================= 6. TOP 10 SELLING ITEMS (RANKED WIDGET) =================
  content.push({
    stack: [
      makeSectionHeader('Top Ranked Selling Items')
    ],
    pageBreak: 'before',
    margin: [0, 5, 0, 4]
  });

  const rankedItemsBody = [];
  rankedItemsBody.push([
    { text: 'RANK', fontSize: 7.5, bold: true, fillColor: SLATE_DARK, color: '#fff', alignment: 'center', margin: [0, 2, 0, 2] },
    { text: 'ITEM DESCRIPTION', fontSize: 7.5, bold: true, fillColor: SLATE_DARK, color: '#fff', margin: [0, 2, 0, 2] },
    { text: 'CATEGORY GROUP', fontSize: 7.5, bold: true, fillColor: SLATE_DARK, color: '#fff', margin: [0, 2, 0, 2] },
    { text: 'QTY SOLD', fontSize: 7.5, bold: true, fillColor: SLATE_DARK, color: '#fff', alignment: 'center', margin: [0, 2, 0, 2] },
    { text: 'TOTAL REVENUE', fontSize: 7.5, bold: true, fillColor: SLATE_DARK, color: '#fff', alignment: 'right', margin: [0, 2, 0, 2] }
  ]);

  const sortedItems = [...items].sort((a, b) => (b.Qty || 0) - (a.Qty || 0)).slice(0, 10);

  if (sortedItems.length > 0) {
    sortedItems.forEach((i, idx) => {
      rankedItemsBody.push([
        { text: `#${idx + 1}`, fontSize: 7.5, bold: true, alignment: 'center', fillColor: idx % 2 === 0 ? '#ffffff' : BG_LIGHT, margin: [0, 2.5, 0, 2.5] },
        { text: String(i.Item || '').toUpperCase(), fontSize: 7.5, bold: true, fillColor: idx % 2 === 0 ? '#ffffff' : BG_LIGHT, margin: [0, 2.5, 0, 2.5] },
        { text: String(i.Category || 'Unmapped').toUpperCase(), fontSize: 7.5, color: SLATE_MUTED, fillColor: idx % 2 === 0 ? '#ffffff' : BG_LIGHT, margin: [0, 2.5, 0, 2.5] },
        { text: formatVal(i.Qty || 0, false), fontSize: 7.5, bold: true, alignment: 'center', fillColor: idx % 2 === 0 ? '#ffffff' : BG_LIGHT, margin: [0, 2.5, 0, 2.5] },
        { text: formatVal(i.Sales || 0), fontSize: 7.5, bold: true, alignment: 'right', color: ORANGE_HIGHLIGHT, fillColor: idx % 2 === 0 ? '#ffffff' : BG_LIGHT, margin: [0, 2.5, 0, 2.5] }
      ]);
    });
  } else {
    rankedItemsBody.push([
      { text: 'No itemized sales records found', colSpan: 5, alignment: 'center', fontSize: 8, italics: true },
      {}, {}, {}, {}
    ]);
  }

  content.push({
    table: {
      widths: [30, '*', 110, 50, 70],
      body: rankedItemsBody
    },
    layout: 'lightHorizontalLines',
    margin: [0, 0, 0, 18]
  });

  // ================= 7. CATEGORY PERFORMANCE LISTING =================
  content.push({
    stack: [
      makeSectionHeader('Sales Contribution by Category')
    ],
    margin: [0, 5, 0, 4]
  });

  const catTableBody = [];
  catTableBody.push([
    { text: 'CATEGORY GROUP', fontSize: 7.5, bold: true, fillColor: SLATE_DARK, color: '#fff', margin: [0, 2, 0, 2] },
    { text: 'QTY DISPATCHED', fontSize: 7.5, bold: true, fillColor: SLATE_DARK, color: '#fff', alignment: 'center', margin: [0, 2, 0, 2] },
    { text: 'SALES REVENUE', fontSize: 7.5, bold: true, fillColor: SLATE_DARK, color: '#fff', alignment: 'right', margin: [0, 2, 0, 2] },
    { text: 'CONTRIBUTION SHARE', fontSize: 7.5, bold: true, fillColor: SLATE_DARK, color: '#fff', margin: [0, 2, 0, 2] }
  ]);

  let totalCatQty = 0;
  let totalCatSales = 0;

  if (categories && categories.length > 0) {
    categories.forEach(c => {
      totalCatQty += Number(c.Qty) || 0;
      totalCatSales += Number(c.Sales) || 0;
    });

    categories.forEach((c, idx) => {
      const sharePct = totalCatSales > 0 ? (c.Sales / totalCatSales) * 100 : 0;
      catTableBody.push([
        { text: String(c.Category || 'Unmapped').toUpperCase(), fontSize: 7.5, bold: true, margin: [0, 2.5, 0, 2.5], fillColor: idx % 2 === 0 ? '#ffffff' : BG_LIGHT },
        { text: formatVal(c.Qty || 0, false), fontSize: 7.5, alignment: 'center', margin: [0, 2.5, 0, 2.5], fillColor: idx % 2 === 0 ? '#ffffff' : BG_LIGHT },
        { text: formatVal(c.Sales || 0), fontSize: 7.5, bold: true, alignment: 'right', color: ORANGE_HIGHLIGHT, margin: [0, 2.5, 0, 2.5], fillColor: idx % 2 === 0 ? '#ffffff' : BG_LIGHT },
        { stack: [makeProgressBar(sharePct, ORANGE_HIGHLIGHT)], alignment: 'left', margin: [5, 2.5, 0, 2.5], fillColor: idx % 2 === 0 ? '#ffffff' : BG_LIGHT }
      ]);
    });
  } else {
    catTableBody.push([
      { text: 'No category sales records', colSpan: 4, alignment: 'center', fontSize: 8, italics: true },
      {}, {}, {}
    ]);
  }

  catTableBody.push([
    { text: 'TOTAL CATEGORY SALES', fontSize: 7.5, bold: true, fillColor: BG_LIGHT, margin: [0, 3.5, 0, 3.5] },
    { text: formatVal(totalCatQty, false), fontSize: 7.5, bold: true, alignment: 'center', fillColor: BG_LIGHT, margin: [0, 3.5, 0, 3.5] },
    { text: formatVal(totalCatSales), fontSize: 7.5, bold: true, alignment: 'right', color: ORANGE_HIGHLIGHT, fillColor: BG_LIGHT, margin: [0, 3.5, 0, 3.5] },
    { text: '100.0%', fontSize: 7.5, bold: true, color: SLATE_MUTED, fillColor: BG_LIGHT, margin: [5, 3.5, 0, 3.5] }
  ]);

  content.push({
    table: {
      widths: ['*', 80, 80, 110],
      body: catTableBody
    },
    layout: 'lightHorizontalLines',
    margin: [0, 0, 0, 18]
  });

  // ================= 8. STAFF PERFORMANCE (ARTISTS PERFORMANCE / TARGETS) =================
  if (artistSales && artistSales.length > 0) {
    content.push({
      stack: [
        makeSectionHeader('Target Achievements')
      ],
      margin: [0, 5, 0, 4]
    });

    const artistTableBody = [];
    artistTableBody.push([
      { text: 'STAFF NAME', fontSize: 7.5, bold: true, fillColor: BLUE_PRIMARY, color: '#fff', margin: [0, 2.5, 0, 2.5] },
      { text: 'TARGET', fontSize: 7.5, bold: true, fillColor: BLUE_PRIMARY, color: '#fff', alignment: 'right', margin: [0, 2.5, 0, 2.5] },
      { text: 'ACHIEVED', fontSize: 7.5, bold: true, fillColor: BLUE_PRIMARY, color: '#fff', alignment: 'right', margin: [0, 2.5, 0, 2.5] },
      { text: 'PROGRESS', fontSize: 7.5, bold: true, fillColor: BLUE_PRIMARY, color: '#fff', margin: [0, 2.5, 0, 2.5] },
      { text: '%', fontSize: 7.5, bold: true, fillColor: BLUE_PRIMARY, color: '#fff', alignment: 'right', margin: [0, 2.5, 0, 2.5] },
      { text: 'STATUS', fontSize: 7.5, bold: true, fillColor: BLUE_PRIMARY, color: '#fff', alignment: 'center', margin: [0, 2.5, 0, 2.5] }
    ]);

    artistSales.forEach((a, idx) => {
      const target = Number(a.TargetAmount) || 0;
      const actual = Number(a.ActualSales) || 0;
      const pct = target > 0 ? (actual / target) * 100 : 0;
      const isTargetMet = actual >= target && target > 0;
      const statusText = isTargetMet ? 'ACHIEVED' : 'IN PROGRESS';
      const statusColor = isTargetMet ? TEAL_SUCCESS : ORANGE_HIGHLIGHT;
      artistTableBody.push([
        { text: String(a.Name || '').toUpperCase(), fontSize: 7.5, bold: true, margin: [0, 2.5, 0, 2.5], fillColor: idx % 2 === 0 ? '#ffffff' : BG_LIGHT },
        { text: formatVal(target), fontSize: 7.5, alignment: 'right', margin: [0, 2.5, 0, 2.5], fillColor: idx % 2 === 0 ? '#ffffff' : BG_LIGHT },
        { text: formatVal(actual), fontSize: 7.5, bold: true, alignment: 'right', color: isTargetMet ? TEAL_SUCCESS : SLATE_DARK, margin: [0, 2.5, 0, 2.5], fillColor: idx % 2 === 0 ? '#ffffff' : BG_LIGHT },
        { stack: [makeProgressBar(pct, statusColor)], alignment: 'left', margin: [5, 2.5, 0, 2.5], fillColor: idx % 2 === 0 ? '#ffffff' : BG_LIGHT },
        { text: `${pct.toFixed(1)}%`, fontSize: 7.5, bold: true, alignment: 'right', color: statusColor, margin: [0, 2.5, 0, 2.5], fillColor: idx % 2 === 0 ? '#ffffff' : BG_LIGHT },
        { text: statusText, fontSize: 7.5, bold: true, alignment: 'center', color: statusColor, margin: [0, 2.5, 0, 2.5], fillColor: idx % 2 === 0 ? '#ffffff' : BG_LIGHT }
      ]);
    });

    content.push({
      table: {
        widths: ['*', 70, 70, 110, 45, 65],
        body: artistTableBody
      },
      layout: 'lightHorizontalLines',
      margin: [0, 0, 0, 18]
    });
  }

  // ================= 9. FINANCIAL HEALTH LEDGER =================
  content.push({
    stack: [
      makeSectionHeader('Financial Health Ledger')
    ],
    margin: [0, 5, 0, 4]
  });

  const makeLedgerCard = (title, value, subtitle, color) => {
    return {
      table: {
        widths: ['*'],
        body: [
          [{
            stack: [
              { text: title.toUpperCase(), fontSize: 6.5, bold: true, color: SLATE_MUTED, margin: [0, 0, 0, 3] },
              { text: value, fontSize: 11, bold: true, color: SLATE_DARK },
              subtitle ? { text: subtitle, fontSize: 6.5, color: color, margin: [0, 2, 0, 0], bold: true } : null
            ].filter(Boolean),
            fillColor: '#ffffff',
            margin: [8, 8, 8, 8],
            border: [true, false, false, false],
            borderColor: [color, null, null, null]
          }]
        ]
      },
      layout: {
        defaultBorder: false,
        vLineWidth: (i) => i === 0 ? 3.5 : 0
      },
      margin: [2, 2, 2, 2]
    };
  };

  content.push({
    table: {
      widths: ['25%', '25%', '25%', '25%'],
      body: [
        [
          makeLedgerCard('GST / TAX Collected', formatVal(totalTax), 'GST tax volume', BLUE_PRIMARY),
          makeLedgerCard('Credit Outstanding', formatVal(paymentBreakdown.CreditOutstanding || reconciliation.creditOutstanding || 0), 'Unpaid ledger total', ORANGE_HIGHLIGHT),
          makeLedgerCard('Total Voids', formatVal(voidAmount), `${voidQty} items voided`, RED_ALERT),
          makeLedgerCard('Net Collections', formatVal(totalCollections), 'Actual bank/cash flow', TEAL_SUCCESS)
        ]
      ]
    },
    layout: {
      defaultBorder: false,
      hLineWidth: () => 0,
      vLineWidth: () => 0,
      paddingLeft: () => 0,
      paddingRight: () => 0,
      paddingTop: () => 0,
      paddingBottom: () => 0
    },
    margin: [0, 0, 0, 15]
  });

  // Footer Branding Info
  content.push({
    columns: [
      { text: `Generated by JALSA - Powered by Techpro Analytics - ${printedOn || new Date().toLocaleString()}`, fontSize: 7, color: SLATE_MUTED },
      { text: 'CONFIDENTIAL - FOR INTERNAL BOARD REVIEW ONLY', fontSize: 7, color: SLATE_MUTED, alignment: 'right' }
    ],
    margin: [0, 15, 0, 0]
  });

  return {
    content,
    pageSize: 'A4',
    pageMargins: [35, 35, 35, 45],
    defaultStyle: {
      font: 'Roboto',
      fontSize: 8.5,
      lineHeight: 1.35
    },
    footer: function (currentPage, pageCount) {
      return {
        columns: [
          {
            text: `Report Period: ${period} | Printed On: ${printedOn || new Date().toLocaleString()}`,
            fontSize: 7.5,
            color: SLATE_MUTED,
            margin: [35, 12, 0, 0]
          },
          {
            text: `Page ${currentPage} of ${pageCount}`,
            alignment: 'right',
            fontSize: 7.5,
            color: SLATE_MUTED,
            margin: [0, 12, 35, 0]
          }
        ]
      };
    }
  };
};

/**
 * Creates a PDF buffer from a document definition
 */
const createPdfBinary = (docDefinition) => {
  return new Promise((resolve, reject) => {
    try {
      const pdfDoc = printer.createPdfKitDocument(docDefinition);
      const chunks = [];
      pdfDoc.on('data', chunk => chunks.push(chunk));
      pdfDoc.on('end', () => resolve(Buffer.concat(chunks)));
      pdfDoc.on('error', err => reject(err));
      pdfDoc.end();
    } catch (err) {
      reject(err);
    }
  });
};

module.exports = {
  generateSalesReportPdf,
  createPdfBinary,
  printer
};

const sql = require("mssql");

async function initDB(pool) {
  if (!pool) return;
  console.log("🔄 Running schema check and initialization...");

  const runQuery = async (name, query) => {
    try {
      await pool.request().query(query);
      console.log(`✅ ${name} OK`);
    } catch (err) {
      console.error(`❌ ${name} FAILED:`, err.message);
      // We don't throw here to allow other steps to try, but in production you might want to
    }
  };

  try {
    // 1. SettlementItemDetail
    await runQuery("Create SettlementItemDetail", `
      IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[SettlementItemDetail]') AND type in (N'U'))
      BEGIN
          CREATE TABLE [dbo].[SettlementItemDetail](
              [ID] [int] IDENTITY(1,1) NOT NULL,
              [SettlementID] [uniqueidentifier] NULL,
              [DishId] [uniqueidentifier] NULL,
              [DishGroupId] [uniqueidentifier] NULL,
              [SubCategoryId] [uniqueidentifier] NULL,
              [CategoryId] [uniqueidentifier] NULL,
              [DishName] [nvarchar](255) NULL,
              [Qty] [int] NULL,
              [Price] [decimal](18, 2) NULL,
              [OrderDateTime] [datetime] NULL
          ) ON [PRIMARY]
      END
    `);

    // 2. MemberMaster
    await runQuery("Create MemberMaster", `
      IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[MemberMaster]') AND type in (N'U'))
      BEGIN
          CREATE TABLE [dbo].[MemberMaster](
              [MemberId] [uniqueidentifier] NOT NULL PRIMARY KEY DEFAULT NEWID(),
              [Name] [nvarchar](255) NOT NULL,
              [Phone] [nvarchar](50) NULL,
              [Email] [nvarchar](255) NULL,
              [Address] [nvarchar](max) NULL,
              [IsActive] [bit] DEFAULT 1,
              [Balance] [decimal](18, 2) DEFAULT 0,
              [CreditLimit] [decimal](18, 2) DEFAULT 0,
              [CurrentBalance] [decimal](18, 2) DEFAULT 0,
              [CreatedOn] [datetime] DEFAULT GETDATE()
          )
      END
    `);

    // 2.1 MemberMaster extra columns (prepaid balance alert flag)
    await runQuery("MemberMaster - LowBalanceAlertSent", "IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[MemberMaster]') AND name = 'LowBalanceAlertSent') ALTER TABLE [dbo].[MemberMaster] ADD LowBalanceAlertSent BIT NOT NULL DEFAULT 0");
    await runQuery("MemberMaster - ModifiedBy", "IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[MemberMaster]') AND name = 'ModifiedBy') ALTER TABLE [dbo].[MemberMaster] ADD ModifiedBy UNIQUEIDENTIFIER NULL");
    await runQuery("MemberMaster - ModifiedDate", "IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[MemberMaster]') AND name = 'ModifiedDate') ALTER TABLE [dbo].[MemberMaster] ADD ModifiedDate DATETIME NULL");
    await runQuery("MemberMaster - CreatedBy", "IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[MemberMaster]') AND name = 'CreatedBy') ALTER TABLE [dbo].[MemberMaster] ADD CreatedBy UNIQUEIDENTIFIER NULL");

    // 2.1 CreditCustomerMaster (Dedicated Credit Accounts table separate from Members)
    await runQuery("Create CreditCustomerMaster", `
      IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[CreditCustomerMaster]') AND type in (N'U'))
      BEGIN
          CREATE TABLE [dbo].[CreditCustomerMaster](
              [CustomerId] [uniqueidentifier] NOT NULL PRIMARY KEY DEFAULT NEWID(),
              [Name] [nvarchar](255) NOT NULL,
              [Phone] [nvarchar](50) NULL,
              [Email] [nvarchar](255) NULL,
              [Address] [nvarchar](max) NULL,
              [IsActive] [bit] DEFAULT 1,
              [Balance] [decimal](18, 2) DEFAULT 0,
              [CreditLimit] [decimal](18, 2) DEFAULT 0,
              [CurrentBalance] [decimal](18, 2) DEFAULT 0,
              [CreatedOn] [datetime] DEFAULT GETDATE()
          )
      END
    `);

    // 3. SettlementHeader Columns
    await runQuery("SettlementHeader - IsCancelled", "IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[SettlementHeader]') AND name = 'IsCancelled') ALTER TABLE [dbo].[SettlementHeader] ADD IsCancelled BIT DEFAULT 0");
    await runQuery("SettlementHeader - CancellationReason", "IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[SettlementHeader]') AND name = 'CancellationReason') ALTER TABLE [dbo].[SettlementHeader] ADD CancellationReason NVARCHAR(255)");
    await runQuery("SettlementHeader - CancelledBy", "IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[SettlementHeader]') AND name = 'CancelledBy') ALTER TABLE [dbo].[SettlementHeader] ADD CancelledBy UNIQUEIDENTIFIER NULL");
    await runQuery("SettlementHeader - CancelledDate", "IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[SettlementHeader]') AND name = 'CancelledDate') ALTER TABLE [dbo].[SettlementHeader] ADD CancelledDate DATETIME NULL");
    await runQuery("SettlementHeader - CancelledByUserName", "IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[SettlementHeader]') AND name = 'CancelledByUserName') ALTER TABLE [dbo].[SettlementHeader] ADD CancelledByUserName NVARCHAR(100) NULL");
    await runQuery("SettlementHeader - SER_NAME", "IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[SettlementHeader]') AND name = 'SER_NAME') ALTER TABLE [dbo].[SettlementHeader] ADD SER_NAME NVARCHAR(255)");
    await runQuery("SettlementHeader - VoidItemQty", "IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[SettlementHeader]') AND name = 'VoidItemQty') ALTER TABLE [dbo].[SettlementHeader] ADD VoidItemQty INT DEFAULT 0");
    await runQuery("SettlementHeader - VoidItemAmount", "IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[SettlementHeader]') AND name = 'VoidItemAmount') ALTER TABLE [dbo].[SettlementHeader] ADD VoidItemAmount DECIMAL(18, 2) DEFAULT 0");
    await runQuery("SettlementHeader - ServiceCharge", "IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[SettlementHeader]') AND name = 'ServiceCharge') ALTER TABLE [dbo].[SettlementHeader] ADD ServiceCharge DECIMAL(18, 2) DEFAULT 0");
    await runQuery("SettlementHeader - RoundedBy", "IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[SettlementHeader]') AND name = 'RoundedBy') ALTER TABLE [dbo].[SettlementHeader] ADD RoundedBy DECIMAL(18, 2) DEFAULT 0");

    // 4. SettlementItemDetail Columns
    await runQuery("SettlementItemDetail - Status", "IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[SettlementItemDetail]') AND name = 'Status') ALTER TABLE [dbo].[SettlementItemDetail] ADD Status NVARCHAR(50) NULL");
    await runQuery("SettlementItemDetail - CategoryName", "IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[SettlementItemDetail]') AND name = 'CategoryName') ALTER TABLE [dbo].[SettlementItemDetail] ADD CategoryName NVARCHAR(255) NULL");
    await runQuery("SettlementItemDetail - SubCategoryName", "IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[SettlementItemDetail]') AND name = 'SubCategoryName') ALTER TABLE [dbo].[SettlementItemDetail] ADD SubCategoryName NVARCHAR(255) NULL");
    await runQuery("SettlementItemDetail - Spicy", "IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[SettlementItemDetail]') AND name = 'Spicy') ALTER TABLE [dbo].[SettlementItemDetail] ADD Spicy NVARCHAR(50) NULL");
    await runQuery("SettlementItemDetail - Salt", "IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[SettlementItemDetail]') AND name = 'Salt') ALTER TABLE [dbo].[SettlementItemDetail] ADD Salt NVARCHAR(50) NULL");
    await runQuery("SettlementItemDetail - Oil", "IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[SettlementItemDetail]') AND name = 'Oil') ALTER TABLE [dbo].[SettlementItemDetail] ADD Oil NVARCHAR(50) NULL");
    await runQuery("SettlementItemDetail - Sugar", "IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[SettlementItemDetail]') AND name = 'Sugar') ALTER TABLE [dbo].[SettlementItemDetail] ADD Sugar NVARCHAR(50) NULL");
    await runQuery("SettlementItemDetail - OrderDetailId", "IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[SettlementItemDetail]') AND name = 'OrderDetailId') ALTER TABLE [dbo].[SettlementItemDetail] ADD OrderDetailId UNIQUEIDENTIFIER NULL");
    await runQuery("SettlementItemDetail - SongName", "IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[SettlementItemDetail]') AND name = 'SongName') ALTER TABLE [dbo].[SettlementItemDetail] ADD SongName NVARCHAR(255) NULL");

    // 5. CancelRemarksMaster
    await runQuery("Create CancelRemarksMaster", `
      IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[CancelRemarksMaster]') AND type in (N'U'))
      BEGIN
          CREATE TABLE [dbo].[CancelRemarksMaster](
              [CRCode] [int] IDENTITY(1,1) NOT NULL PRIMARY KEY,
              [CRName] [nvarchar](255) NOT NULL,
              [IsActive] [bit] DEFAULT 1
          )
      END
    `);

    await runQuery("Insert CancelRemarks", `
      IF NOT EXISTS (SELECT TOP 1 1 FROM [dbo].[CancelRemarksMaster])
      BEGIN
          INSERT INTO [dbo].[CancelRemarksMaster] (CRName, IsActive) VALUES 
          ('Customer Changed Mind', 1),
          ('Order Error', 1),
          ('Duplicate Order', 1),
          ('Long Wait Time', 1),
          ('Technical Issue', 1),
          ('Out of Stock', 1)
      END
    `);

    // 6. CartItems
    await runQuery("Create CartItems", `
      IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[CartItems]') AND type in (N'U'))
      BEGIN
          CREATE TABLE [dbo].[CartItems](
              [ItemId] [nvarchar](128) NOT NULL PRIMARY KEY,
              [CartId] [nvarchar](max) NULL,
              [ProductId] [nvarchar](128) NULL,
              [Quantity] [int] NULL,
              [Cost] [decimal](18, 2) NULL,
              [OrderNo] [nvarchar](max) NULL,
              [OrderConfirmQty] [int] NULL,
              [DateCreated] [datetime] DEFAULT GETDATE()
          )
      END
    `);

    // 7. SettlementDiscountDetail
    await runQuery("Create SettlementDiscountDetail", `
      IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[SettlementDiscountDetail]') AND type in (N'U'))
      BEGIN
          CREATE TABLE [dbo].[SettlementDiscountDetail](
              [ID] [int] IDENTITY(1,1) NOT NULL PRIMARY KEY,
              [SettlementId] [uniqueidentifier] NULL,
              [DiscountId] [uniqueidentifier] NULL,
              [Description] [nvarchar](255) NULL,
              [SysAmount] [decimal](18, 2) NULL,
              [ManualAmount] [decimal](18, 2) NULL,
              [SortageOrExces] [decimal](18, 2) NULL
          )
      END
    `);

    // 8. POS Nitro Professional Updates
    await runQuery("RestaurantOrderDetailCur - ModifiersJSON", "IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[RestaurantOrderDetailCur]') AND name = 'ModifiersJSON') ALTER TABLE [dbo].[RestaurantOrderDetailCur] ADD ModifiersJSON NVARCHAR(MAX)");
    await runQuery("RestaurantOrderDetailCur - OrderNumber", "IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[RestaurantOrderDetailCur]') AND name = 'OrderNumber') ALTER TABLE [dbo].[RestaurantOrderDetailCur] ADD OrderNumber NVARCHAR(100)");
    await runQuery("RestaurantOrderDetailCur - Remarks", "IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[RestaurantOrderDetailCur]') AND name = 'Remarks') ALTER TABLE [dbo].[RestaurantOrderDetailCur] ADD Remarks NVARCHAR(300)");
    await runQuery("RestaurantOrderDetailCur - isTakeAway", "IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[RestaurantOrderDetailCur]') AND name = 'isTakeAway') ALTER TABLE [dbo].[RestaurantOrderDetailCur] ADD isTakeAway BIT DEFAULT 0");

    await runQuery("TableMaster - CurrentOrderId", "IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[TableMaster]') AND name = 'CurrentOrderId') ALTER TABLE [dbo].[TableMaster] ADD CurrentOrderId NVARCHAR(100)");

    await runQuery("Create OrderSequences", `
      IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[OrderSequences]') AND type in (N'U'))
      BEGIN
          CREATE TABLE [dbo].[OrderSequences](
              [RestaurantId] [uniqueidentifier] NOT NULL,
              [SequenceDate] [date] NOT NULL,
              [LastNumber] [int] NOT NULL DEFAULT 0,
              PRIMARY KEY ([RestaurantId], [SequenceDate])
          )
      END
    `);

    // 9. Ensure Discount Columns in Professional Tables
    await runQuery("RestaurantOrderDetailCur - DiscountAmount", "IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[RestaurantOrderDetailCur]') AND name = 'DiscountAmount') ALTER TABLE [dbo].[RestaurantOrderDetailCur] ADD DiscountAmount DECIMAL(18, 2) DEFAULT 0");
    await runQuery("RestaurantOrderDetailCur - DiscountType", "IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[RestaurantOrderDetailCur]') AND name = 'DiscountType') ALTER TABLE [dbo].[RestaurantOrderDetailCur] ADD DiscountType NVARCHAR(50)");

    await runQuery("RestaurantOrderDetail - DiscountAmount", "IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[RestaurantOrderDetail]') AND name = 'DiscountAmount') ALTER TABLE [dbo].[RestaurantOrderDetail] ADD DiscountAmount DECIMAL(18, 2) DEFAULT 0");
    await runQuery("RestaurantOrderDetail - DiscountType", "IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[RestaurantOrderDetail]') AND name = 'DiscountType') ALTER TABLE [dbo].[RestaurantOrderDetail] ADD DiscountType NVARCHAR(50)");

    await runQuery("SettlementHeader - DiscountAmount", "IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[SettlementHeader]') AND name = 'DiscountAmount') ALTER TABLE [dbo].[SettlementHeader] ADD DiscountAmount DECIMAL(18, 2) DEFAULT 0");
    await runQuery("SettlementHeader - DiscountType", "IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[SettlementHeader]') AND name = 'DiscountType') ALTER TABLE [dbo].[SettlementHeader] ADD DiscountType NVARCHAR(50)");

    // 10. Performance Indexes
    await runQuery("Index - SettlementHeader Date", "IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_SettlementHeader_Date') CREATE INDEX IX_SettlementHeader_Date ON [dbo].[SettlementHeader] (LastSettlementDate)");
    await runQuery("Index - SettlementHeader BillNo", "IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_SettlementHeader_BillNo') CREATE INDEX IX_SettlementHeader_BillNo ON [dbo].[SettlementHeader] (BillNo)");
    await runQuery("Index - SettlementItemDetail ID", "IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_SettlementItemDetail_SID') CREATE INDEX IX_SettlementItemDetail_SID ON [dbo].[SettlementItemDetail] (SettlementID)");
    await runQuery("Index - RestaurantOrderCur Tableno", "IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_RestaurantOrderCur_Tableno') CREATE INDEX IX_RestaurantOrderCur_Tableno ON [dbo].[RestaurantOrderCur] (Tableno)");
    await runQuery("Index - RestaurantOrderCur OrderNo", "IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_RestaurantOrderCur_OrderNo') CREATE INDEX IX_RestaurantOrderCur_OrderNo ON [dbo].[RestaurantOrderCur] (OrderNumber)");
    await runQuery("Index - RestaurantOrderCur ClosedCreated", "IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_RestaurantOrderCur_ClosedCreated') CREATE INDEX IX_RestaurantOrderCur_ClosedCreated ON [dbo].[RestaurantOrderCur] (isOrderClosed, CreatedOn)");
    await runQuery("Index - RestaurantOrderDetailCur OrderId", "IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_RestaurantOrderDetailCur_OrderId') CREATE INDEX IX_RestaurantOrderDetailCur_OrderId ON [dbo].[RestaurantOrderDetailCur] (OrderId)");
    await runQuery("Index - TableMaster SortCode", "IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_TableMaster_SortCode') CREATE INDEX IX_TableMaster_SortCode ON [dbo].[TableMaster] (SortCode)");
    await runQuery("Index - TableMaster TableNumber", "IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_TableMaster_TableNumber') CREATE INDEX IX_TableMaster_TableNumber ON [dbo].[TableMaster] (TableNumber)");
    await runQuery("Index - RestaurantOrder Tableno", "IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_RestaurantOrder_Tableno') CREATE INDEX IX_RestaurantOrder_Tableno ON [dbo].[RestaurantOrder] (Tableno)");
    await runQuery("Index - CustomerCreditTransactions CreatedDate", "IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_CreditTrans_CreatedDate') CREATE INDEX IX_CreditTrans_CreatedDate ON [dbo].[CustomerCreditTransactions] (CreatedDate)");
    await runQuery("Index - RestaurantOrder OrderDateTime", "IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_RestaurantOrder_OrderDateTime') CREATE INDEX IX_RestaurantOrder_OrderDateTime ON [dbo].[RestaurantOrder] (OrderDateTime)");
    await runQuery("Index - PaymentTransactionDetails CreatedDate", "IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_PaymentTransactionDetails_CreatedDate') CREATE INDEX IX_PaymentTransactionDetails_CreatedDate ON [dbo].[PaymentTransactionDetails] (CreatedDate)");

    // 11. CompanySettings
    await runQuery("Create CompanySettings", `
      IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[CompanySettings]') AND type in (N'U'))
      BEGIN
          CREATE TABLE [dbo].[CompanySettings](
              [Id] [nvarchar](50) NOT NULL PRIMARY KEY,
              [CompanyName] [nvarchar](255) NULL,
              [Address] [nvarchar](max) NULL,
              [GSTNo] [nvarchar](50) NULL,
              [GSTPercentage] [decimal](18, 2) NULL,
              [Phone] [nvarchar](50) NULL,
              [Email] [nvarchar](255) NULL,
              [CashierName] [nvarchar](100) NULL,
              [Currency] [nvarchar](50) NULL,
              [CurrencySymbol] [nvarchar](10) NULL,
              [CompanyLogoUrl] [nvarchar](max) NULL,
              [HalalLogoUrl] [nvarchar](max) NULL,
              [PrinterIP] [nvarchar](50) NULL,
              [ShowCompanyLogo] [bit] DEFAULT 0,
              [ShowHalalLogo] [bit] DEFAULT 0,
              [TaxMode] [nvarchar](50) DEFAULT 'exclusive',
              [WaiterRequired] [bit] DEFAULT 0,
              [HoldOvertimeMinutes] [int] DEFAULT 30,
              [UpdatedOn] [datetime] DEFAULT GETDATE()
          )
      END
    `);
    await runQuery("CompanySettings - HoldOvertimeMinutes", "IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[CompanySettings]') AND name = 'HoldOvertimeMinutes') ALTER TABLE [dbo].[CompanySettings] ADD HoldOvertimeMinutes INT DEFAULT 30");
    await runQuery("CompanySettings - ServiceChargePercentage", "IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[CompanySettings]') AND name = 'ServiceChargePercentage') ALTER TABLE [dbo].[CompanySettings] ADD ServiceChargePercentage DECIMAL(18, 2) DEFAULT 0");
    await runQuery("AppSettings - EnableCheckoutFlow", "IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[AppSettings]') AND name = 'EnableCheckoutFlow') ALTER TABLE [dbo].[AppSettings] ADD EnableCheckoutFlow BIT NOT NULL DEFAULT 1");
    await runQuery("AppSettings - EnableDirectProcessToPay", "IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[AppSettings]') AND name = 'EnableDirectProcessToPay') ALTER TABLE [dbo].[AppSettings] ADD EnableDirectProcessToPay BIT NOT NULL DEFAULT 0");
    await runQuery("AppSettings - CustomerSideDisplay", "IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[AppSettings]') AND name = 'CustomerSideDisplay') ALTER TABLE [dbo].[AppSettings] ADD CustomerSideDisplay BIT NOT NULL DEFAULT 1");

    // 11. OrderMergeHistory Setup
    await runQuery("Create OrderMergeHistory", `
      IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[OrderMergeHistory]') AND type in (N'U'))
      BEGIN
        CREATE TABLE [dbo].[OrderMergeHistory] (
          [MergeId] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
          [ParentOrderId] UNIQUEIDENTIFIER NOT NULL,
          [ChildOrderId] UNIQUEIDENTIFIER NOT NULL,
          [ParentTableNo] NVARCHAR(50) NULL,
          [ChildTableNo] NVARCHAR(50) NULL,
          [MergedAt] DATETIME NOT NULL DEFAULT GETDATE(),
          [MergedBy] UNIQUEIDENTIFIER NULL,
          CONSTRAINT [PK_OrderMergeHistory] PRIMARY KEY CLUSTERED ([MergeId] ASC)
        )
      END
    `);


    await runQuery("Insert Default CompanySettings", `
      IF NOT EXISTS (SELECT TOP 1 1 FROM [dbo].[CompanySettings])
      BEGIN
          INSERT INTO [dbo].[CompanySettings] (Id, CompanyName, UpdatedOn) VALUES ('1', 'UCS POS', GETDATE())
      END
    `);

    // 12. Insert MEMBER & CREDIT Paymode if missing
    await runQuery("Insert MEMBER Paymode", `
      IF NOT EXISTS (SELECT 1 FROM [dbo].[Paymode] WHERE LTRIM(RTRIM(PayMode)) = 'MEMBER')
      BEGIN
          INSERT INTO [dbo].[Paymode] (Position, PayMode, Description, Active)
          VALUES (5, 'MEMBER', 'MEMBER', 1)
      END
    `);

    await runQuery("Insert CREDIT Paymode", `
      IF NOT EXISTS (SELECT 1 FROM [dbo].[Paymode] WHERE LTRIM(RTRIM(PayMode)) = 'CREDIT')
      BEGIN
          INSERT INTO [dbo].[Paymode] (Position, PayMode, Description, Active)
          VALUES (6, 'CREDIT', 'CREDIT', 1)
      END
    `);

    // 13. Create AIChatSessions and AIChatMessages tables
    await runQuery("Create AIChatSessions", `
      IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[AIChatSessions]') AND type in (N'U'))
      BEGIN
        CREATE TABLE [dbo].[AIChatSessions] (
          [SessionID] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
          [OrgID] INT NULL,
          [StoreID] INT NULL,
          [UserID] INT NULL,
          [Title] NVARCHAR(255) NULL,
          [CreatedAt] DATETIME NOT NULL DEFAULT GETDATE(),
          [LastActivityAt] DATETIME NOT NULL DEFAULT GETDATE()
        )
      END
    `);

    await runQuery("Create AIChatMessages", `
      IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[AIChatMessages]') AND type in (N'U'))
      BEGIN
        CREATE TABLE [dbo].[AIChatMessages] (
          [MessageID] INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
          [SessionID] UNIQUEIDENTIFIER NOT NULL,
          [Sender] NVARCHAR(50) NOT NULL,
          [ContentText] NVARCHAR(MAX) NULL,
          [StructuredPayload] NVARCHAR(MAX) NULL,
          [SQLExecuted] NVARCHAR(MAX) NULL,
          [ResponseTimeMs] INT NULL,
          [Timestamp] DATETIME NOT NULL DEFAULT GETDATE(),
          CONSTRAINT [FK_AIChatMessages_AIChatSessions] FOREIGN KEY ([SessionID]) REFERENCES [dbo].[AIChatSessions] ([SessionID]) ON DELETE CASCADE
        )
      END
    `);

    // 14. Create PaymentTransactionDetails table for unified split payments
    await runQuery("Create PaymentTransactionDetails", `
      IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[PaymentTransactionDetails]') AND type in (N'U'))
      BEGIN
          CREATE TABLE [dbo].[PaymentTransactionDetails](
              [PaymentTransactionId] [uniqueidentifier] NOT NULL PRIMARY KEY DEFAULT NEWID(),
              [ReferenceType] [nvarchar](50) NOT NULL,
              [ReferenceId] [uniqueidentifier] NOT NULL,
              [PayModeId] [int] NOT NULL,
              [Amount] [decimal](18, 2) NOT NULL,
              [ReferenceNo] [nvarchar](100) NULL,
              [CreatedDate] [datetime] NOT NULL DEFAULT GETDATE(),
              [CreatedBy] [uniqueidentifier] NULL
          )
      END
    `);

    // 15. Create CustomerCreditTransactions table for credit and payment ledger history
    // Upgrade Detector: Drop old table format if missing new 'BillAmount' column
    await runQuery("Upgrade CustomerCreditTransactions Detector", `
      IF OBJECT_ID('dbo.CustomerCreditTransactions', 'U') IS NOT NULL AND COL_LENGTH('dbo.CustomerCreditTransactions', 'BillAmount') IS NULL
      BEGIN
          DROP TABLE [dbo].[CustomerCreditTransactions]
      END
    `);

    // Upgrade: Drop the FK constraint if it exists to allow referencing CreditCustomerMaster
    await runQuery("Drop CustomerCreditTransactions FK Constraint", `
      IF EXISTS (SELECT * FROM sys.foreign_keys WHERE object_id = OBJECT_ID(N'[dbo].[FK_CreditTrans_Member]') AND parent_object_id = OBJECT_ID(N'[dbo].[CustomerCreditTransactions]'))
      BEGIN
          ALTER TABLE [dbo].[CustomerCreditTransactions] DROP CONSTRAINT [FK_CreditTrans_Member]
      END
    `);

    await runQuery("Create CustomerCreditTransactions", `
      IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[CustomerCreditTransactions]') AND type in (N'U'))
      BEGIN
          CREATE TABLE [dbo].[CustomerCreditTransactions](
              [TransactionId] UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
              [MemberId] UNIQUEIDENTIFIER NOT NULL, -- Serves as the CustomerId for CreditCustomerMaster
              [SettlementId] UNIQUEIDENTIFIER NULL,
              [BillNo] NVARCHAR(50) NULL,
              [TransactionType] NVARCHAR(20) NOT NULL, -- 'CREDIT_SALE', 'PAYMENT', 'ADJUSTMENT'
              [BillAmount] DECIMAL(18, 2) DEFAULT 0,
              [PaidAmount] DECIMAL(18, 2) DEFAULT 0,
              [OutstandingAmount] DECIMAL(18, 2) DEFAULT 0,
              [PaymentMethod] NVARCHAR(50) NULL,
              [ReferenceNo] NVARCHAR(100) NULL,
              [Status] NVARCHAR(20) DEFAULT 'OPEN', -- 'OPEN', 'PARTIAL', 'CLOSED'
              [Remarks] NVARCHAR(500) NULL,
              [CreatedBy] UNIQUEIDENTIFIER NULL,
              [CreatedDate] DATETIME2 NOT NULL DEFAULT GETDATE(),
              [UpdatedDate] DATETIME2 NULL
          )
      END
    `);

    // Upgrade: Add CustomerType column for reporting accuracy
    await runQuery("Upgrade CustomerCreditTransactions - Add CustomerType", `
      IF COL_LENGTH('dbo.CustomerCreditTransactions', 'CustomerType') IS NULL
      BEGIN
          ALTER TABLE [dbo].[CustomerCreditTransactions] ADD [CustomerType] NVARCHAR(20) NULL
      END
    `);

    await runQuery("Index - CustomerCreditTransactions MemberId", `
      IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_CreditTrans_MemberId' AND object_id = OBJECT_ID('CustomerCreditTransactions'))
      BEGIN
        CREATE NONCLUSTERED INDEX IX_CreditTrans_MemberId 
        ON CustomerCreditTransactions(MemberId) 
        INCLUDE (TransactionType, OutstandingAmount, BillNo, Status)
      END
    `);

    await runQuery("Index - CustomerCreditTransactions Settlement", `
      IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_CreditTrans_Settlement' AND object_id = OBJECT_ID('CustomerCreditTransactions'))
      BEGIN
        CREATE NONCLUSTERED INDEX IX_CreditTrans_Settlement 
        ON CustomerCreditTransactions(SettlementId) 
        INCLUDE (TransactionType, OutstandingAmount, Status)
      END
    `);

    // Backfill DISABLED — user wants fresh start, no auto-population from MemberMaster
    // await runQuery("Backfill CustomerCreditTransactions", `
    //   IF NOT EXISTS (SELECT TOP 1 1 FROM [dbo].[CustomerCreditTransactions])
    //   BEGIN
    //       INSERT INTO [dbo].[CustomerCreditTransactions] (MemberId, TransactionType, BillAmount, PaidAmount, OutstandingAmount, Status, Remarks, CreatedDate)
    //       SELECT MemberId, 'ADJUSTMENT', CurrentBalance, 0, CurrentBalance, 'OPEN', 'Balance migration from legacy profile', GETDATE()
    //       FROM MemberMaster
    //       WHERE CurrentBalance > 0
    //   END
    // `);

    await runQuery("Create CustomerCreditAllocations", `
      IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[CustomerCreditAllocations]') AND type in (N'U'))
      BEGIN
          CREATE TABLE [dbo].[CustomerCreditAllocations](
              [AllocationId] UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
              [PaymentTransactionId] UNIQUEIDENTIFIER NOT NULL,
              [InvoiceTransactionId] UNIQUEIDENTIFIER NOT NULL,
              [Amount] DECIMAL(18, 2) NOT NULL,
              [CreatedDate] DATETIME2 NOT NULL DEFAULT GETDATE()
          )
      END
    `);

    await runQuery("Index - CustomerCreditAllocations PaymentTransactionId", `
      IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_CreditAlloc_PaymentTransactionId' AND object_id = OBJECT_ID('CustomerCreditAllocations'))
      BEGIN
        CREATE NONCLUSTERED INDEX IX_CreditAlloc_PaymentTransactionId 
        ON CustomerCreditAllocations(PaymentTransactionId)
      END
    `);

    await runQuery("Index - CustomerCreditAllocations InvoiceTransactionId", `
      IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_CreditAlloc_InvoiceTransactionId' AND object_id = OBJECT_ID('CustomerCreditAllocations'))
      BEGIN
        CREATE NONCLUSTERED INDEX IX_CreditAlloc_InvoiceTransactionId 
        ON CustomerCreditAllocations(InvoiceTransactionId)
      END
    `);

    // 16. Create settlement table
    await runQuery("Create settlement table", `
      IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[settlement]') AND type in (N'U'))
      BEGIN
          CREATE TABLE [dbo].[settlement](
              [Id] [int] IDENTITY(1,1) NOT NULL PRIMARY KEY,
              [OutletId] [int] NULL,
              [SettlementDate] [date] NULL,
              [CashierName] [nvarchar](100) NULL,
              [OpeningCashJSON] [nvarchar](max) NULL,
              [OpeningCashTotal] [decimal](10, 2) NULL,
              [PhysicalCashJSON] [nvarchar](max) NULL,
              [PhysicalCashTotal] [decimal](10, 2) NULL,
              [TotalSales] [decimal](10, 2) NULL,
              [TotalDiscount] [decimal](10, 2) NULL,
              [VoidAmount] [decimal](10, 2) NULL,
              [NetSales] [decimal](10, 2) NULL,
              [CashReceived] [decimal](10, 2) NULL,
              [ExpectedClosingCash] [decimal](10, 2) NULL,
              [CashVariance] [decimal](10, 2) NULL,
              [VarianceStatus] [nvarchar](50) NULL,
              [PaymentBreakdownJSON] [nvarchar](max) NULL,
              [Status] [nvarchar](50) NULL,
              [SettledBy] [nvarchar](100) NULL,
              [SettledAt] [datetime] NULL,
              [CreatedAt] [datetime] NULL,
              [UpdatedAt] [datetime] NULL
          )
      END
    `);

    // 17. Create OpeningCashDenomination table
    await runQuery("Create OpeningCashDenomination table", `
      IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[OpeningCashDenomination]') AND type in (N'U'))
      BEGIN
          CREATE TABLE [dbo].[OpeningCashDenomination](
              [Id] [int] IDENTITY(1,1) NOT NULL PRIMARY KEY,
              [CurrencyValue] [decimal](18, 2) NULL,
              [NoteCount] [int] NULL,
              [Type] [nvarchar](50) NULL,
              [CreatedBy] [nvarchar](100) NULL,
              [CreatedOn] [datetime] NULL
          )
      END
    `);

    // 18. Create CashOutEntry table
    await runQuery("Create CashOutEntry table", `
      IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[CashOutEntry]') AND type in (N'U'))
      BEGIN
          CREATE TABLE [dbo].[CashOutEntry](
              [CashOutId] [uniqueidentifier] NOT NULL PRIMARY KEY DEFAULT NEWID(),
              [CashOutNo] [nvarchar](50) NULL,
              [CashOutDate] [date] NULL DEFAULT CAST(GETDATE() AS DATE),
              [Amount] [decimal](18, 2) NULL,
              [Reason] [nvarchar](255) NULL,
              [Remarks] [nvarchar](max) NULL,
              [PaymentMode] [nvarchar](50) NULL,
              [ReferenceNo] [nvarchar](100) NULL,
              [TerminalCode] [nvarchar](50) NULL,
              [CreatedBy] [nvarchar](100) NULL,
              [CreatedOn] [datetime] NULL
          )
      END
    `);

    console.log("✅ Database schema and performance indexes are up to date.");

    // 🔄 Auto-sync kitchens to PrintMaster on every startup
    await syncKitchensToPrintMaster(pool);

  } catch (err) {
    console.error("❌ initDB CRITICAL ERROR:", err.message);
  }
}

// ============================================================
// 🔄 AUTO-SYNC: Detect ALL active kitchens → ensure PrintMaster rows
// ============================================================
// KEY FIX: Categories with no KitchenTypeCode (like Lebanon) are now
// auto-assigned a new unique code in CategoryKitchenType, then given
// their own PrintMaster row. No kitchen is ever missed or deduplicated.
// Runs on startup + every 3 minutes via server.js.
// ============================================================
async function syncKitchensToPrintMaster(pool) {
  try {
    // --- 1. Ensure default Cashier Printer (PrinterType = 1) ---
    const cashierCheck = await pool.request()
      .query("SELECT COUNT(*) as cnt FROM PrintMaster WHERE PrinterType = 1 AND IsActive = 1");
    if (cashierCheck.recordset[0].cnt === 0) {
      let defaultIP = "192.168.0.20";
      try {
        const cs = await pool.request().query("SELECT TOP 1 PrinterIP FROM CompanySettings WHERE PrinterIP IS NOT NULL AND PrinterIP <> ''");
        if (cs.recordset[0]?.PrinterIP) defaultIP = cs.recordset[0].PrinterIP;
      } catch (_) { }
      await pool.request()
        .input("ip", sql.NVarChar, defaultIP)
        .query(`
          INSERT INTO PrintMaster (PrinterId, PrinterName, PrinterPath, PrinterIP, PrinterType, PrintSection, KitchenTypeName, KitchenTypeValue, IsActive, PrintCopy)
          VALUES (NEWID(), 'Receipt Printer', @ip, @ip, 1, 1, 'Receipt Print', 0, 1, 1)
        `);
      console.log("🛠️ [KitchenSync] Auto-created default Cashier Printer in PrintMaster.");
    }

    // --- 2. Ensure default TakeAway Printer (PrinterType = 3) ---
    const taCheck = await pool.request()
      .query("SELECT COUNT(*) as cnt FROM PrintMaster WHERE PrinterType = 3 AND IsActive = 1");
    if (taCheck.recordset[0].cnt === 0) {
      // Find a safe code for TakeAway that doesn't clash with kitchen codes
      const maxCodeRes = await pool.request().query("SELECT ISNULL(MAX(KitchenTypeValue), 0) + 1 AS nextCode FROM PrintMaster WHERE PrinterType IN (2, 3)");
      const taCode = maxCodeRes.recordset[0].nextCode;
      await pool.request()
        .input("code", sql.Int, taCode)
        .query(`
          INSERT INTO PrintMaster (PrinterId, PrinterName, PrinterPath, PrinterIP, PrinterType, PrintSection, KitchenTypeName, KitchenTypeValue, IsActive, PrintCopy)
          VALUES (NEWID(), 'TakeAway', '192.168.0.20', '192.168.0.20', 3, 1, 'TakeAway', @code, 1, 1)
        `);
      console.log("🛠️ [KitchenSync] Auto-created default TakeAway Printer in PrintMaster.");
    }

    // --- 3. Fetch ALL active categories with their current KitchenTypeCode ---
    const activeCatsResult = await pool.request().query(`
      SELECT
        cm.CategoryId,
        cm.CategoryName AS KitchenTypeName,
        ckt.KitchenTypeCode
      FROM CategoryMaster cm
      LEFT JOIN CategoryKitchenType ckt ON cm.CategoryId = ckt.CategoryId
      WHERE cm.IsActive = 1
        AND cm.CategoryName IS NOT NULL
        AND cm.CategoryName <> ''
        AND cm.CategoryName NOT LIKE '%TEST%'
    `);
    const activeCats = activeCatsResult.recordset;

    // --- 4. Get all codes currently used across ALL PrintMaster rows (any type)
    //        to avoid assigning a new code that clashes with something already there ---
    const allCodesRes = await pool.request().query("SELECT KitchenTypeValue FROM PrintMaster");
    const allUsedCodes = new Set(allCodesRes.recordset.map(r => r.KitchenTypeValue));

    // --- 5. For categories with NO KitchenTypeCode → auto-assign a fresh unique code
    //        and insert into CategoryKitchenType so routing works ---
    let nextCode = Math.max(...Array.from(allUsedCodes), 0) + 1;

    for (const cat of activeCats) {
      if (cat.KitchenTypeCode === null || cat.KitchenTypeCode === undefined || cat.KitchenTypeCode === '') {
        // Pick next available code not already in use
        while (allUsedCodes.has(nextCode)) nextCode++;

        console.log(`🔧 [KitchenSync] Assigning new code ${nextCode} to kitchen "${cat.KitchenTypeName}" (CategoryId=${cat.CategoryId})`);

        // Check if a row already exists in CategoryKitchenType for this CategoryId
        const existsCKT = await pool.request()
          .input("catId", sql.UniqueIdentifier, cat.CategoryId)
          .query("SELECT COUNT(*) as cnt FROM CategoryKitchenType WHERE CategoryId = @catId");

        if (existsCKT.recordset[0].cnt === 0) {
          // Insert new mapping row
          await pool.request()
            .input("catId", sql.UniqueIdentifier, cat.CategoryId)
            .input("code", sql.NVarChar, String(nextCode))
            .input("name", sql.NVarChar, cat.KitchenTypeName)
            .query(`
              INSERT INTO CategoryKitchenType (CategoryId, KitchenTypeCode, KitchenTypeName)
              VALUES (@catId, @code, @name)
            `);
        } else {
          // Update existing row that has null code
          await pool.request()
            .input("catId", sql.UniqueIdentifier, cat.CategoryId)
            .input("code", sql.NVarChar, String(nextCode))
            .query(`
              UPDATE CategoryKitchenType SET KitchenTypeCode = @code
              WHERE CategoryId = @catId AND (KitchenTypeCode IS NULL OR KitchenTypeCode = '')
            `);
        }

        // Mark this code as used and advance
        cat.KitchenTypeCode = String(nextCode);
        allUsedCodes.add(nextCode);
        nextCode++;
      }
    }

    // --- 6. Now build a deduplicated map of code → name from the updated category list ---
    const kitchenMap = new Map(); // code (int) → name
    for (const cat of activeCats) {
      const code = parseInt(cat.KitchenTypeCode);
      if (!isNaN(code) && !kitchenMap.has(code)) {
        kitchenMap.set(code, cat.KitchenTypeName);
      }
    }

    // --- 7. Fetch existing kitchen printers (PrinterType=2) from PrintMaster ---
    const existingResult = await pool.request().query(
      "SELECT KitchenTypeValue, IsActive FROM PrintMaster WHERE PrinterType = 2"
    );
    const existingMap = new Map(existingResult.recordset.map(r => [r.KitchenTypeValue, r.IsActive]));

    // --- 8. Insert missing / reactivate soft-deleted kitchen printers ---
    let inserted = 0;
    let reactivated = 0;
    for (const [code, name] of kitchenMap) {
      if (!existingMap.has(code)) {
        // Brand new — insert with empty IP (admin fills it in Receipt Settings)
        await pool.request()
          .input("name", sql.NVarChar, name)
          .input("code", sql.Int, code)
          .query(`
            INSERT INTO PrintMaster (
              PrinterId, PrinterName, PrinterPath, PrinterIP,
              PrinterType, PrintSection, KitchenTypeName,
              KitchenTypeValue, IsActive, PrintCopy
            ) VALUES (
              NEWID(), @name, '', '',
              2, 1, @name,
              @code, 1, 1
            )
          `);
        inserted++;
        console.log(`🍳 [KitchenSync] Auto-added "${name}" to PrintMaster (code=${code})`);
      } else if (existingMap.get(code) === false || existingMap.get(code) === 0) {
        // Soft-deleted but kitchen is still active → reactivate
        await pool.request()
          .input("code", sql.Int, code)
          .query(`
            UPDATE PrintMaster SET IsActive = 1
            WHERE PrinterType = 2 AND KitchenTypeValue = @code AND IsActive = 0
          `);
        reactivated++;
        console.log(`♻️ [KitchenSync] Reactivated kitchen "${name}" in PrintMaster (code=${code})`);
      }
    }

    if (inserted === 0 && reactivated === 0) {
      console.log(`✅ [KitchenSync] All ${kitchenMap.size} active kitchen(s) already in PrintMaster. No changes needed.`);
    } else {
      console.log(`✅ [KitchenSync] Done. Inserted: ${inserted}, Reactivated: ${reactivated}`);
    }
  } catch (err) {
    console.error("❌ [KitchenSync] Failed:", err.message);
  }
}

module.exports = { initDB, syncKitchensToPrintMaster };

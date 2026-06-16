// Central configuration. When the data moves to SQL, only this file
// (and sheets.js) should need to change.

export const CONFIG = {
  // Primary Google Sheet that backs the MVP (members, profiles, relations).
  sheetId: "1SudlNPCrgy4rFeCWXN-sRxkNgai_IB3JSpCeijN7qA0",

  // Tabs on the primary sheet.
  tabs: {
    memberProfiles: "MemberProfiles",
    profiles: "Profiles",
    profileRelations: "dbo_ProfileRelations",
  },

  // Cross-workbook references. Each entry pins a tab on a different
  // sheet so accessors can hit it without changing the primary sheetId.
  // When the data lands in SQL these all become tables in one schema.
  external: {
    invoice: {
      sheetId: "119nKSD6I6Oz2G_3Lhh9nEH0jgqSGwWBrAJJx_3MRAbU",
      tabName: "dbo_invoice",
    },
    invoiceLineItem: {
      sheetId: "13KRq8WPMWOyNV2UyEjxIqqubXf9SXxYOlbVxjDTF43k",
      tabName: "dbo_InvoiceLineItem",
    },
    revenueItem: {
      sheetId: "1dlFTqxnRyOvQ_Ba8n35eKp4XR5pvmYCMDRfCrAdCex8",
      tabName: "db_RevenueItems",
    },
    member: {
      sheetId: "16YKktGBuKYU0LcLFXYyFTd8UY3SBN-Id8dFoFT5vCZw",
      tabName: "dbo_member",
    },
  },
};

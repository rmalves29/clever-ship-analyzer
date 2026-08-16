# Plan - Shopify Customer Sync Fix & Sidebar Refactor

The user reported that Shopify customer data is not being pulled correctly and requested moving the "Configurações" menu item out of the CRM group into its own section.

## User Requirements
- Fix Shopify customer synchronization (currently not pulling data).
- Remove "Configurações" from the CRM menu group in the sidebar and make it a standalone top-level menu item.

## Technical Details

### 1. Shopify Sync Fix
The current `syncShopifyData` function in `src/lib/crm-sync.functions.ts` uses the `orders` query to derive customers. While this captures customers who have placed orders, it might miss customers who exist in Shopify but haven't ordered yet (leads). Additionally, the current logic uses `updated_at` filter which might be too restrictive if the last sync failed or if data was updated differently.

**Proposed Changes:**
- Add a dedicated `customers` GraphQL query to `src/lib/shopify.server.ts`.
- Update `syncShopifyData` in `src/lib/crm-sync.functions.ts` to sync both `orders` and `customers` separately to ensure full coverage.
- Ensure the `shopify_customers` table is populated correctly from the dedicated customer query.

### 2. Sidebar Refactor
Update `src/components/layout/Sidebar.tsx` to move the "Configurações" item.

**Proposed Changes:**
- Modify `NAV_GROUPS` constant in `src/components/layout/Sidebar.tsx`.
- Remove "Configurações" from the "CRM" group.
- Create a new group (or standalone item) for "Configurações" at the bottom or as a new section.

## Implementation Steps

### Step 1: Update Shopify Server Helpers
Modify `src/lib/shopify.server.ts` to include a `CUSTOMERS_QUERY`.

### Step 2: Update Sync Logic
Modify `src/lib/crm-sync.functions.ts` to:
- Fetch and upsert customers directly using the new query.
- Maintain the existing order sync (which also links customers to orders).

### Step 3: Update Sidebar
Modify `src/components/layout/Sidebar.tsx` to move the settings menu.

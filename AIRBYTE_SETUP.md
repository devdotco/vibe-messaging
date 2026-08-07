# Airbyte Setup (Hetzner)

## 1. Install abctl

```bash
curl -LsfS https://get.airbyte.com | bash -
abctl local install --low-resource-mode
# Minimum: 2 CPU, 8GB RAM
# UI + API available at http://localhost:8000
```

## 2. Get API credentials

```bash
abctl local credentials
# Outputs: client_id, client_secret
# Store these as AIRBYTE_CLIENT_ID and AIRBYTE_CLIENT_SECRET in .env
```

## 3. Create destination

Airbyte UI → Destinations → New Destination → Postgres
- Use the platform's main DATABASE_URL as the target

## 4. Create sources

### FCFO Finance
- Source: Postgres → fcfo-ai DATABASE_URL
- Namespace: `fcfo_ai`
- Tables: `users, transactions, invoices, bills, accounts, reconciliations, budgets, cash_flow_forecasts, kpis`

### VDR Deals
- Source: Postgres → app-vdr-ai DATABASE_URL
- Namespace: `app_vdr_ai`
- Tables: `users, deals, documents, deal_participants, origination_targets, opportunities`

### Portal Orders
- Source: Postgres → app-dev-co DATABASE_URL
- Namespace: `app_dev_co`
- Tables: `users, clients, work_orders, services, invoices, brands, subscriptions`

## 5. Sync schedules

| Source    | Interval     | Mode                      |
|-----------|--------------|---------------------------|
| Financial | Every 1 hour | Incremental Append+Deduped |
| Deals     | Every 30 min | Incremental Append+Deduped |
| Orders    | Every 15 min | Incremental Append+Deduped |

## 6. Register connections

After creating each connection, copy the connection UUID from the Airbyte UI and insert into `airbyte_connections`:

```sql
INSERT INTO airbyte_connections (org_id, display_name, source_type, airbyte_connection_id, warehouse_schema, data_domains)
VALUES ('your-org-id', 'FCFO Finance', 'postgres', 'uuid-from-airbyte', 'fcfo_ai', ARRAY['financial.transactions','financial.reports','financial.payroll','financial.budgets','financial.invoices']);
```

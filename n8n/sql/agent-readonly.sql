-- Main application database: expose only the facts needed by the n8n finance tool.
-- Provision the login separately; never grant it access to public base tables.
CREATE SCHEMA IF NOT EXISTS agent_read;

CREATE OR REPLACE VIEW agent_read.daily_sales AS
SELECT ("completedAt" AT TIME ZONE 'Asia/Tehran')::date AS business_day,
       count(*)::integer AS completed_orders,
       sum(total)::bigint AS revenue_toman
FROM public."Order"
WHERE status = 'COMPLETED' AND "completedAt" IS NOT NULL
GROUP BY 1;

CREATE OR REPLACE VIEW agent_read.inventory_status AS
SELECT id, "nameFa" AS name_fa, unit,
       "stockQuantity" AS stock_quantity,
       "minQuantity" AS min_quantity,
       CASE WHEN "minQuantity" IS NOT NULL AND "stockQuantity" <= "minQuantity" THEN true ELSE false END AS is_low
FROM public."Ingredient"
WHERE "isActive" = true;

GRANT USAGE ON SCHEMA agent_read TO farman_agent_reader;
GRANT SELECT ON agent_read.daily_sales, agent_read.inventory_status TO farman_agent_reader;
ALTER ROLE farman_agent_reader SET default_transaction_read_only = on;
ALTER ROLE farman_agent_reader SET statement_timeout = '5s';

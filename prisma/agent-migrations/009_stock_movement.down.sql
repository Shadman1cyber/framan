-- 009_stock_movement.down.sql — removes the append-only stock movement ledger.
-- Ingredient.stockQuantity (the mutable snapshot) is left untouched.

DROP TRIGGER IF EXISTS "StockMovement_no_update";
DROP TRIGGER IF EXISTS "StockMovement_no_delete";
DROP TABLE IF EXISTS "StockMovement";

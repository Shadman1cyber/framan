"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

export type CartLine = {
  productId: string;
  name: string;
  price: number;
  basePrice?: number;
  image?: string;
  quantity: number;
  coffeeLineId?: string | null;
  coffeeLineName?: string | null;
};

type CartContextValue = {
  items: CartLine[];
  count: number;
  total: number;
  hydrated: boolean;
  add: (item: Omit<CartLine, "quantity"> & { quantity?: number }) => void;
  increase: (productId: string, coffeeLineId?: string | null) => void;
  decrease: (productId: string, coffeeLineId?: string | null) => void;
  remove: (productId: string, coffeeLineId?: string | null) => void;
  clear: () => void;
  setQrContext: (qrId: string | null, tableLabel?: string | null) => void;
  qrId: string | null;
  tableLabel: string | null;
  lastAddedAt: number | null;
};

const CartContext = createContext<CartContextValue | null>(null);

const STORAGE_KEY = "farmans.cart.v2";
const QR_KEY = "farmans.qr.v1";

/** Cart lines are keyed by productId + selected coffee line. */
function lineKey(productId: string, coffeeLineId?: string | null): string {
  return coffeeLineId ? `${productId}::${coffeeLineId}` : productId;
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartLine[]>([]);
  const [qrId, setQrId] = useState<string | null>(null);
  const [tableLabel, setTableLabel] = useState<string | null>(null);
  const [lastAddedAt, setLastAddedAt] = useState<number | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setItems(JSON.parse(raw) as CartLine[]);
      const qr = localStorage.getItem(QR_KEY);
      if (qr) {
        const parsed = JSON.parse(qr) as { qrId: string | null; tableLabel: string | null };
        setQrId(parsed.qrId);
        setTableLabel(parsed.tableLabel);
      }
    } catch {}
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }, [items, hydrated]);

  const setQrContext = useCallback((id: string | null, label: string | null = null) => {
    setQrId(id);
    setTableLabel(label);
    try {
      localStorage.setItem(QR_KEY, JSON.stringify({ qrId: id, tableLabel: label }));
    } catch {}
  }, []);

  const add = useCallback((incoming: Omit<CartLine, "quantity"> & { quantity?: number }) => {
    setItems((prev) => {
      const key = lineKey(incoming.productId, incoming.coffeeLineId);
      const existing = prev.find((p) => lineKey(p.productId, p.coffeeLineId) === key);
      if (existing) {
        return prev.map((p) =>
          lineKey(p.productId, p.coffeeLineId) === key
            ? { ...p, quantity: p.quantity + (incoming.quantity ?? 1) }
            : p,
        );
      }
      return [...prev, { ...incoming, quantity: incoming.quantity ?? 1 }];
    });
    setLastAddedAt(Date.now());
  }, []);

  const increase = useCallback((productId: string, coffeeLineId?: string | null) => {
    setItems((prev) =>
      prev.map((p) =>
        lineKey(p.productId, p.coffeeLineId) === lineKey(productId, coffeeLineId)
          ? { ...p, quantity: p.quantity + 1 }
          : p,
      ),
    );
  }, []);

  const decrease = useCallback((productId: string, coffeeLineId?: string | null) => {
    setItems((prev) =>
      prev
        .map((p) =>
          lineKey(p.productId, p.coffeeLineId) === lineKey(productId, coffeeLineId)
            ? { ...p, quantity: p.quantity - 1 }
            : p,
        )
        .filter((p) => p.quantity > 0),
    );
  }, []);

  const remove = useCallback((productId: string, coffeeLineId?: string | null) => {
    setItems((prev) =>
      prev.filter((p) => lineKey(p.productId, p.coffeeLineId) !== lineKey(productId, coffeeLineId)),
    );
  }, []);

  const clear = useCallback(() => setItems([]), []);

  const count = useMemo(() => items.reduce((s, i) => s + i.quantity, 0), [items]);
  const total = useMemo(
    () => items.reduce((s, i) => s + i.price * i.quantity, 0),
    [items],
  );

  const value: CartContextValue = {
    items,
    count,
    total,
    hydrated,
    add,
    increase,
    decrease,
    remove,
    clear,
    setQrContext,
    qrId,
    tableLabel,
    lastAddedAt,
  };

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used inside CartProvider");
  return ctx;
}

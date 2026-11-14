/**
 * Functional economy layer (PART V §23) — businesses, wallets, salaries,
 * purchases, restocking and civic grants, ALL as idempotent events.
 *
 * Design (v1, all constants deterministic — no RNG):
 * - Every workshop building runs an ATELIER (sells "wares" wholesale, pays
 *   worker salaries, produces +4 wares per paid worker-day).
 * - Every food building runs a KITCHEN (sells "meal" to residents; restocks
 *   provisions from an atelier when stock drops below threshold).
 * - Every shop building runs a STORE (sells "supplies" to residents; restocks
 *   from an atelier).
 * - The civic hall runs an INSTITUTION (daily civic grant — an exogenous
 *   municipal flow, documented: no taxation modelled in v1; pays civic
 *   workers' salaries).
 * - Residents carry WALLETS (entity state via resident.acted events, atomic
 *   with the economy events in the same applyBatch).
 * - JARVIS buys meals/supplies like any resident but draws no salary
 *   (operator, not payroll — documented).
 *
 * Real negative outcomes are recorded, never hidden: unpaid salaries
 * (economy.salary_missed), skipped purchases (economy.purchase_skipped,
 * insufficient funds / out of stock), failed restocks.
 */
import { h } from "./hash";
import type { EventStore } from "./store";
import type { ResidentState, Action } from "./engine";

// ---------------------------------------------------------------- types
export interface BusinessProduct {
  sku: string;
  name: string;
  price: number;
  stock: number;
}

export interface Business {
  business_id: string;
  building_id: string;
  building_name: string;
  kind: "atelier" | "kitchen" | "store" | "institution";
  owner_id: string;
  owner_name: string;
  products: BusinessProduct[];
  wholesale: { sku: string; price: number } | null;
  restock_threshold: number;
  restock_qty: number;
  cash: number;
  revenue: number;
  expenses: number;
  grants: number;
  transactions: number;
  restocks: number;
  missed_payrolls: number;
  created_tick: number;
}

export type EconomyEventSpec = { tick: number; type: string; payload: Record<string, unknown> };
export type RememberFn = (rid: string, t: number, kind: string, text: string, importance?: number) => void;

/** Interface the resident engine calls (pluggable layer, like Cognition). */
export interface EconomyHooks {
  onTick(tick: number, events: EconomyEventSpec[]): void;
  onActionStart(
    r: ResidentState,
    action: Action,
    tick: number,
    events: EconomyEventSpec[],
    remember: RememberFn
  ): void;
}

// ------------------------------------------------------- v1 constants
export const ECONOMY_CONSTANTS = {
  wallet_start: [30, 70] as [number, number], // 30 + h%40
  jarvis_wallet: 120,
  salary_atelier: 12,
  salary_civic: 10,
  civic_grant: 50,
  meal_price: 6,
  supplies_price: 5,
  wholesale_price: 4,
  atelier_wares_start: 40,
  atelier_production_per_worker_day: 4,
  kitchen_meal_start: 10,
  kitchen_cash: 120,
  kitchen_restock_threshold: 4,
  kitchen_restock_qty: 8,
  store_supplies_start: 12,
  store_cash: 120,
  store_restock_threshold: 5,
  store_restock_qty: 10,
  atelier_cash: 200,
  institution_cash: 150,
} as const;

const SCHEMA_VERSION = 1;

// ---------------------------------------------------------------- engine
export class EconomyEngine implements EconomyHooks {
  private businesses = new Map<string, Business>();
  private byBuilding = new Map<string, Business>();
  private mpt = 10;
  /** Idempotency keys already present in the event log (salary/grant/purchase
   *  dedup across ticks — NOT just the current batch). */
  private doneKeys = new Set<string>();

  constructor(private store: EventStore, private seed: number) {}

  async init(): Promise<this> {
    const mpt = await this.store.meta("minutes_per_tick");
    this.mpt = mpt ? parseInt(mpt, 10) : 10;
    for (const e of await this.store.entitiesOfType("business")) {
      const b = e.data as unknown as Business;
      this.businesses.set(b.business_id, b);
      this.byBuilding.set(b.building_id, b);
    }
    // build log-aware dedup set from prior salary/grant/purchase events
    for (const type of ["economy.salary_paid", "economy.salary_missed", "economy.civic_grant"]) {
      for (const e of await this.store.eventsOfType(type)) {
        const k = (e.payload as Record<string, unknown>).idempotency_key;
        if (typeof k === "string") this.doneKeys.add(k);
      }
    }
    return this;
  }

  businessAt(buildingId: string): Business | null {
    return this.byBuilding.get(buildingId) ?? null;
  }

  all(): Business[] {
    return [...this.businesses.values()].sort((a, b) => (a.business_id < b.business_id ? -1 : 1));
  }

  private day(tick: number): number {
    return Math.floor((tick * this.mpt) / 1440);
  }

  /** Per-tick pass: daily civic grants (idempotent per business-day). */
  onTick(tick: number, events: EconomyEventSpec[]): void {
    const day = this.day(tick);
    for (const b of this.all()) {
      if (b.kind !== "institution") continue;
      const key = `grant-${b.business_id}-${day}`;
      if (this.doneKeys.has(key)) continue;
      this.doneKeys.add(key);
      b.cash += ECONOMY_CONSTANTS.civic_grant;
      b.revenue += ECONOMY_CONSTANTS.civic_grant;
      b.grants += 1;
      events.push({
        tick,
        type: "economy.civic_grant",
        payload: {
          idempotency_key: key,
          schema_version: SCHEMA_VERSION,
          day,
          amount: ECONOMY_CONSTANTS.civic_grant,
          business_after: { ...b, products: [...b.products] },
        },
      });
    }
  }

  /** Called by the resident engine at every action start (arrivals). */
  onActionStart(
    r: ResidentState,
    action: Action,
    tick: number,
    events: EconomyEventSpec[],
    remember: RememberFn
  ): void {
    if (action === "working") this.paySalary(r, tick, events, remember);
    else if (action === "eating") this.purchase(r, tick, "meal", events, remember);
    else if (action === "socializing") {
      const venueKind = this.buildingKind(r.at_building);
      if (venueKind === "shop") this.purchase(r, tick, "supplies", events, remember);
      else if (venueKind === "food") this.purchase(r, tick, "meal", events, remember, "refreshment");
    }
  }

  private buildingKind(buildingId: string): string | null {
    return this.byBuilding.has(buildingId)
      ? this.byBuilding.get(buildingId)!.kind === "kitchen"
        ? "food"
        : this.byBuilding.get(buildingId)!.kind === "store"
          ? "shop"
          : this.byBuilding.get(buildingId)!.kind === "atelier"
            ? "workshop"
            : "civic"
      : null;
  }

  // ------------------------------------------------------------ salary
  private paySalary(r: ResidentState, tick: number, events: EconomyEventSpec[], remember: RememberFn) {
    if (r.is_jarvis) return; // operator draws no salary (documented)
    const b = this.byBuilding.get(r.at_building);
    if (!b || (b.kind !== "atelier" && b.kind !== "institution")) return;
    const day = this.day(tick);
    const amount = b.kind === "atelier" ? ECONOMY_CONSTANTS.salary_atelier : ECONOMY_CONSTANTS.salary_civic;
    const key = `salary-${r.resident_id}-${day}`;
    if (this.doneKeys.has(key)) return;
    this.doneKeys.add(key);

    if (b.cash >= amount) {
      b.cash -= amount;
      b.expenses += amount;
      if (b.kind === "atelier") {
        // production: paid worker-days produce wares
        const wares = b.products.find((p) => p.sku === "wares");
        if (wares) wares.stock += ECONOMY_CONSTANTS.atelier_production_per_worker_day;
      }
      b.transactions += 1;
      r.wallet = (r.wallet ?? 0) + amount; // rides the same tick's resident.acted
      events.push({
        tick,
        type: "economy.salary_paid",
        payload: {
          idempotency_key: key,
          schema_version: SCHEMA_VERSION,
          day,
          worker_id: r.resident_id,
          worker_name: r.name,
          amount,
          business_after: { ...b, products: b.products.map((p) => ({ ...p })) },
        },
      });
      remember(r.resident_id, tick, "work", `Was paid ${amount} for the day's work at ${b.building_name}.`, 3);
    } else {
      b.missed_payrolls += 1;
      events.push({
        tick,
        type: "economy.salary_missed",
        payload: {
          idempotency_key: key,
          schema_version: SCHEMA_VERSION,
          day,
          worker_id: r.resident_id,
          worker_name: r.name,
          amount,
          reason: "insufficient_cash",
          business_after: { ...b, products: b.products.map((p) => ({ ...p })) },
        },
      });
      remember(r.resident_id, tick, "hardship", `Went unpaid at ${b.building_name} (day ${day}) — the till was empty.`, 4);
    }
  }

  // --------------------------------------------------------- purchases
  private purchase(
    r: ResidentState,
    tick: number,
    sku: "meal" | "supplies",
    events: EconomyEventSpec[],
    remember: RememberFn,
    purpose: "meal" | "refreshment" | "supplies" = "supplies"
  ) {
    const b = this.byBuilding.get(r.at_building);
    if (!b || (b.kind !== "kitchen" && b.kind !== "store")) return;
    const product = b.products.find((p) => p.sku === sku);
    if (!product) return;
    const price = product.price;
    const key = `buy-${r.resident_id}-${tick}`;
    if (this.doneKeys.has(key)) return;
    this.doneKeys.add(key);

    if ((r.wallet ?? 0) < price) {
      events.push({
        tick,
        type: "economy.purchase_skipped",
        payload: {
          idempotency_key: key,
          schema_version: SCHEMA_VERSION,
          buyer: { type: "resident", id: r.resident_id, name: r.name },
          business_id: b.business_id,
          product_sku: sku,
          price,
          reason: "insufficient_funds",
        },
      });
      remember(r.resident_id, tick, "hardship", `Couldn't afford ${sku === "meal" ? "a meal" : "supplies"} at ${b.building_name} (${price}, had ${Math.floor(r.wallet ?? 0)}).`, 3);
      return;
    }
    if (product.stock < 1) {
      events.push({
        tick,
        type: "economy.purchase_skipped",
        payload: {
          idempotency_key: key,
          schema_version: SCHEMA_VERSION,
          buyer: { type: "resident", id: r.resident_id, name: r.name },
          business_id: b.business_id,
          product_sku: sku,
          price,
          reason: "out_of_stock",
        },
      });
      remember(r.resident_id, tick, "hardship", `${b.building_name} had nothing left to sell.`, 3);
      return;
    }

    product.stock -= 1;
    b.cash += price;
    b.revenue += price;
    b.transactions += 1;
    r.wallet = (r.wallet ?? 0) - price;
    events.push({
      tick,
      type: "economy.transaction_completed",
      payload: {
        idempotency_key: key,
        schema_version: SCHEMA_VERSION,
        day: this.day(tick),
        buyer: { type: "resident", id: r.resident_id, name: r.name, wallet_after: r.wallet },
        seller_business_id: b.business_id,
        product_sku: sku,
        product_name: product.name,
        qty: 1,
        unit_price: price,
        total: price,
        purpose,
        seller_after: { ...b, products: b.products.map((p) => ({ ...p })) },
      },
    });
    this.restockCheck(b, tick, events);
  }

  // --------------------------------------------------------- restocking
  private restockCheck(b: Business, tick: number, events: EconomyEventSpec[]) {
    if (b.kind !== "kitchen" && b.kind !== "store") return;
    const threshold = b.kind === "kitchen" ? ECONOMY_CONSTANTS.kitchen_restock_threshold : ECONOMY_CONSTANTS.store_restock_threshold;
    const qty = b.kind === "kitchen" ? ECONOMY_CONSTANTS.kitchen_restock_qty : ECONOMY_CONSTANTS.store_restock_qty;
    const product = b.products[0];
    if (!product || product.stock >= threshold) return;

    const day = this.day(tick);
    const ateliers = this.all().filter((x) => x.kind === "atelier" && x.products.some((p) => p.sku === "wares"));
    if (ateliers.length === 0) return;
    const seller = ateliers[h(this.seed, b.business_id, day) % ateliers.length];
    const sellerWares = seller.products.find((p) => p.sku === "wares")!;
    const cost = qty * ECONOMY_CONSTANTS.wholesale_price;
    const key = `restock-${b.business_id}-${day}-${product.stock}`;
    if (this.doneKeys.has(key)) return;
    this.doneKeys.add(key);

    if (sellerWares.stock < qty || b.cash < cost) {
      events.push({
        tick,
        type: "economy.purchase_skipped",
        payload: {
          idempotency_key: key,
          schema_version: SCHEMA_VERSION,
          buyer: { type: "business", id: b.business_id, name: b.building_name },
          business_id: seller.business_id,
          product_sku: "wares",
          price: cost,
          reason: sellerWares.stock < qty ? "seller_out_of_stock" : "insufficient_funds",
        },
      });
      return;
    }

    // business-to-business wholesale transaction
    b.cash -= cost;
    b.expenses += cost;
    b.restocks += 1;
    b.transactions += 1;
    product.stock += qty; // provisions become meals / wares become supplies
    seller.cash += cost;
    seller.revenue += cost;
    seller.transactions += 1;
    sellerWares.stock -= qty;
    events.push({
      tick,
      type: "economy.transaction_completed",
      payload: {
        idempotency_key: key,
        schema_version: SCHEMA_VERSION,
        day,
        buyer: { type: "business", id: b.business_id, name: b.building_name },
        seller_business_id: seller.business_id,
        product_sku: "wares",
        product_name: "Wholesale wares",
        qty,
        unit_price: ECONOMY_CONSTANTS.wholesale_price,
        total: cost,
        purpose: "restock",
        buyer_after: { ...b, products: b.products.map((p) => ({ ...p })) },
        seller_after: { ...seller, products: seller.products.map((p) => ({ ...p })) },
      },
    });
  }
}

// ----------------------------------------------------------- bootstrap
export interface EnsureEconomyResult {
  businesses: number;
  wallets_initialized: number;
}

/**
 * Idempotent: creates businesses (entity.registered events) and initialises
 * resident wallets (resident.acted events). Safe on every boot; no-ops when
 * already present.
 */
export async function ensureEconomy(
  db: import("@prisma/client").PrismaClient,
  store: EventStore,
  seed: number,
  tick: number
): Promise<EnsureEconomyResult> {
  const { CityLayout } = await import("./layout");
  const { IdAllocator } = await import("./store");
  const existingBusinesses = await store.entitiesOfType("business");
  const residents = (await store.entitiesOfType("resident")).map(
    (e) => ({ resident_id: e.entity_id, ...(e.data as object) }) as ResidentState
  );
  const needsWallets = residents.some((r) => typeof r.wallet !== "number");
  if (existingBusinesses.length > 0 && !needsWallets) {
    return { businesses: existingBusinesses.length, wallets_initialized: 0 };
  }

  const nodes = (await store.geoNodes()) as unknown as import("./layout").GeoNodeRow[];
  const layout = new CityLayout(seed, nodes);
  const buildings = layout.buildings();
  const ids = new IdAllocator(db);
  for (const prefix of ["res", "geo-buil"]) {
    const row = await db.idCounter.findUnique({ where: { prefix } });
    if (row) ids.warm(prefix, row.nextVal - 1);
  }

  const events: EconomyEventSpec[] = [];

  // ---- wallets (once, idempotent per resident id)
  let wallets = 0;
  for (const r of residents) {
    if (typeof r.wallet === "number") continue;
    const wallet = r.is_jarvis
      ? ECONOMY_CONSTANTS.jarvis_wallet
      : ECONOMY_CONSTANTS.wallet_start[0] + (h(seed, r.resident_id, "wallet") % (ECONOMY_CONSTANTS.wallet_start[1] - ECONOMY_CONSTANTS.wallet_start[0]));
    const { resident_id, ...data } = r;
    void resident_id;
    events.push({
      tick,
      type: "resident.acted",
      payload: { idempotency_key: `wallet-init-${r.resident_id}`, resident_id: r.resident_id, data: { ...data, wallet } },
    });
    wallets += 1;
  }

  // ---- businesses (once, idempotent per business id)
  if (existingBusinesses.length === 0) {
    const civicHall = buildings.find((b) => b.kind === "civic" && !b.special) ?? null;
    const byIdSorted = [...residents].sort((a, b) => (a.resident_id < b.resident_id ? -1 : 1));
    const jarvis = byIdSorted.find((r) => r.is_jarvis) ?? null;

    const mk = (
      building: (typeof buildings)[number],
      kind: Business["kind"],
      owner: ResidentState | null
    ): Business => ({
      business_id: ids.next("biz"),
      building_id: building.id,
      building_name: building.name,
      kind,
      owner_id: owner?.resident_id ?? "—",
      owner_name: owner?.name ?? "—",
      products:
        kind === "atelier"
          ? [{ sku: "wares", name: "Workshop wares", price: ECONOMY_CONSTANTS.wholesale_price, stock: ECONOMY_CONSTANTS.atelier_wares_start }]
          : kind === "kitchen"
            ? [{ sku: "meal", name: "Hot meal", price: ECONOMY_CONSTANTS.meal_price, stock: ECONOMY_CONSTANTS.kitchen_meal_start }]
            : kind === "store"
              ? [{ sku: "supplies", name: "Supplies", price: ECONOMY_CONSTANTS.supplies_price, stock: ECONOMY_CONSTANTS.store_supplies_start }]
              : [],
      wholesale: kind === "atelier" ? { sku: "wares", price: ECONOMY_CONSTANTS.wholesale_price } : null,
      restock_threshold: kind === "kitchen" ? ECONOMY_CONSTANTS.kitchen_restock_threshold : kind === "store" ? ECONOMY_CONSTANTS.store_restock_threshold : 0,
      restock_qty: kind === "kitchen" ? ECONOMY_CONSTANTS.kitchen_restock_qty : kind === "store" ? ECONOMY_CONSTANTS.store_restock_qty : 0,
      cash:
        kind === "atelier" ? ECONOMY_CONSTANTS.atelier_cash :
        kind === "kitchen" ? ECONOMY_CONSTANTS.kitchen_cash :
        kind === "store" ? ECONOMY_CONSTANTS.store_cash :
        ECONOMY_CONSTANTS.institution_cash,
      revenue: 0,
      expenses: 0,
      grants: 0,
      transactions: 0,
      restocks: 0,
      missed_payrolls: 0,
      created_tick: tick,
    });

    const ownerFor = (buildingId: string, kind: Business["kind"]): ResidentState | null => {
      if (kind === "institution") return jarvis; // JARVIS operates the civic hall
      const workers = byIdSorted.filter((r) => r.work_id === buildingId && !r.is_jarvis);
      if (workers.length > 0) return workers[0];
      // fall back to nearest-home resident (deterministic)
      const b = buildings.find((x) => x.id === buildingId);
      if (!b) return byIdSorted[0] ?? null;
      const homes = byIdSorted
        .map((r) => {
          const hb = buildings.find((x) => x.id === r.home_id);
          return { r, d: hb ? Math.abs(hb.center[0] - b.center[0]) + Math.abs(hb.center[1] - b.center[1]) : 1e9 };
        })
        .sort((a, x) => a.d - x.d || (a.r.resident_id < x.r.resident_id ? -1 : 1));
      return homes[0]?.r ?? null;
    };

    let created = 0;
    for (const b of buildings) {
      let kind: Business["kind"] | null = null;
      if (b.kind === "workshop") kind = "atelier";
      else if (b.kind === "food") kind = "kitchen";
      else if (b.kind === "shop") kind = "store";
      else if (civicHall && b.id === civicHall.id) kind = "institution";
      if (!kind) continue;
      const owner = ownerFor(b.id, kind);
      const business = mk(b, kind, owner);
      events.push({
        tick,
        type: "entity.registered",
        payload: {
          idempotency_key: `biz-${business.business_id}`,
          entity_id: business.business_id,
          entity_type: "business",
          data: business,
        },
      });
      created += 1;
    }
    if (events.length) {
      await store.applyBatch(events);
      await ids.flush();
    }
    return { businesses: created, wallets_initialized: wallets };
  }

  // businesses already exist — only (possibly) wallets to initialise
  if (events.length) {
    await store.applyBatch(events);
    await ids.flush();
  }
  return { businesses: existingBusinesses.length, wallets_initialized: wallets };
}

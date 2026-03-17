/**
 * InventoryService — Pure inventory manipulation functions
 * 
 * All functions are pure: they accept data and return new data.
 * No mutations. No side effects. No database.
 * 
 * Inventory shape: [{ itemId: string, quantity: number }]
 * Currency shape: { cp: number, sp: number, gp: number, pp: number }
 */

const VALID_CURRENCIES = new Set(['cp', 'sp', 'gp', 'pp']);

/** Map loot table currency names to our short form */
const CURRENCY_MAP = {
  copper: 'cp',
  silver: 'sp',
  gold: 'gp',
  platinum: 'pp',
  cp: 'cp',
  sp: 'sp',
  gp: 'gp',
  pp: 'pp',
};

/**
 * Add an item to inventory. Returns new inventory array.
 * @param {Array} inventory
 * @param {string} itemId
 * @param {number} [quantity=1]
 * @returns {Array} New inventory
 */
export function addItem(inventory, itemId, quantity = 1) {
  const existing = inventory.find(e => e.itemId === itemId);
  if (existing) {
    return inventory.map(e =>
      e.itemId === itemId ? { ...e, quantity: e.quantity + quantity } : { ...e }
    );
  }
  return [...inventory.map(e => ({ ...e })), { itemId, quantity }];
}

/**
 * Remove an item (or quantity) from inventory. Returns new inventory array.
 * @throws if item not found or insufficient quantity
 */
export function removeItem(inventory, itemId, quantity = 1) {
  const existing = inventory.find(e => e.itemId === itemId);
  if (!existing) {
    throw new Error(`Item not found: ${itemId}`);
  }
  if (existing.quantity < quantity) {
    throw new Error(`Insufficient quantity of ${itemId}: have ${existing.quantity}, need ${quantity}`);
  }
  const newQty = existing.quantity - quantity;
  if (newQty === 0) {
    return inventory.filter(e => e.itemId !== itemId).map(e => ({ ...e }));
  }
  return inventory.map(e =>
    e.itemId === itemId ? { ...e, quantity: newQty } : { ...e }
  );
}

/**
 * Check if inventory has an item with at least the given quantity.
 */
export function hasItem(inventory, itemId, minQuantity = 1) {
  const entry = inventory.find(e => e.itemId === itemId);
  return entry ? entry.quantity >= minQuantity : false;
}

/**
 * Get the count of an item in inventory.
 */
export function getItemCount(inventory, itemId) {
  const entry = inventory.find(e => e.itemId === itemId);
  return entry ? entry.quantity : 0;
}

/**
 * Add currency. Returns new currency object.
 * @throws for invalid currency type
 */
export function addCurrency(currency, type, amount) {
  const key = CURRENCY_MAP[type];
  if (!key || !VALID_CURRENCIES.has(key)) {
    throw new Error(`Invalid currency type: ${type}`);
  }
  return { ...currency, [key]: currency[key] + amount };
}

/**
 * Remove currency. Returns new currency object.
 * @throws if insufficient funds or invalid type
 */
export function removeCurrency(currency, type, amount) {
  const key = CURRENCY_MAP[type];
  if (!key || !VALID_CURRENCIES.has(key)) {
    throw new Error(`Invalid currency type: ${type}`);
  }
  if (currency[key] < amount) {
    throw new Error(`Insufficient ${type}: have ${currency[key]}, need ${amount}`);
  }
  return { ...currency, [key]: currency[key] - amount };
}

/**
 * Check if there's enough of a currency type.
 */
export function hasCurrency(currency, type, amount) {
  const key = CURRENCY_MAP[type] || type;
  return (currency[key] || 0) >= amount;
}

/**
 * Apply a loot drop to inventory and currency.
 * Uses rollFn for dice (deterministic in tests).
 * Uses Math.random for chance checks (or a supplied chanceFn).
 * 
 * @param {Array} inventory - Current inventory
 * @param {Object} currency - Current currency
 * @param {Array} lootEntries - Loot table entries
 * @param {Function} rollFn - Dice roll function (diceExpr) => number
 * @param {Function} [chanceFn] - Returns 0-1 random. Defaults to Math.random
 * @returns {{ inventory: Array, currency: Object }}
 */
export function applyLootDrop(inventory, currency, lootEntries, rollFn, chanceFn = Math.random) {
  let newInventory = inventory.map(e => ({ ...e }));
  let newCurrency = { ...currency };

  for (const entry of lootEntries) {
    const roll = chanceFn();
    if (roll >= entry.chance) continue; // chance check failed

    if (entry.type === 'item') {
      const qty = typeof entry.quantity === 'string' ? rollFn(entry.quantity) : (entry.quantity || 1);
      newInventory = addItem(newInventory, entry.itemId, qty);
    } else if (entry.type === 'currency') {
      const amount = typeof entry.amount === 'string' ? rollFn(entry.amount) : entry.amount;
      const key = CURRENCY_MAP[entry.currency];
      if (key) {
        newCurrency = addCurrency(newCurrency, key, amount);
      }
    }
  }

  return { inventory: newInventory, currency: newCurrency };
}

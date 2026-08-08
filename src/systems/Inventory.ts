import { ITEM_BY_ID } from '../data/items';

export type InventorySlot = {
  itemId: string;
  quantity: number;
};

export class Inventory {
  readonly slots: Array<InventorySlot | null>;

  constructor(readonly capacity = 8) {
    this.slots = Array.from({ length: capacity }, () => null);
  }

  add(itemId: string, quantity = 1): boolean {
    const definition = ITEM_BY_ID[itemId];
    if (!definition || quantity < 1) return false;

    let remaining = quantity;
    for (const slot of this.slots) {
      if (!slot || slot.itemId !== itemId || slot.quantity >= definition.maxStack) continue;
      const accepted = Math.min(remaining, definition.maxStack - slot.quantity);
      slot.quantity += accepted;
      remaining -= accepted;
      if (remaining === 0) return true;
    }

    while (remaining > 0) {
      const emptyIndex = this.slots.findIndex((slot) => slot === null);
      if (emptyIndex === -1) return false;
      const accepted = Math.min(remaining, definition.maxStack);
      this.slots[emptyIndex] = { itemId, quantity: accepted };
      remaining -= accepted;
    }
    return true;
  }

  get(index: number) {
    return this.slots[index] ?? null;
  }

  remove(index: number, quantity = 1): InventorySlot | null {
    const slot = this.get(index);
    if (!slot || quantity < 1) return null;
    const removed = { itemId: slot.itemId, quantity: Math.min(quantity, slot.quantity) };
    slot.quantity -= removed.quantity;
    if (slot.quantity <= 0) this.slots[index] = null;
    return removed;
  }

  removeAll(index: number): InventorySlot | null {
    const slot = this.get(index);
    if (!slot) return null;
    this.slots[index] = null;
    return { ...slot };
  }
}

/**
 * BinarySorter class for sorting items using a binary search approach.
 * It allows for interactive sorting where the user can choose between two items
 * at a time, and the class maintains the sorted order based on user input.
 *
 * @class
 * @param {Array} items - The initial array of items to be sorted.
 * @property {Array} sorted - The array that will hold the sorted items.
 * @property {number} i - The index of the current item being compared.
 * @property {number} lo - The lower bound index for the current comparison.
 * @property {number} hi - The upper bound index for the current comparison.
 * @property {number} mid - The middle index for the current comparison.
 */
export class BinarySorter {
    constructor(items) {
      this.items  = items;
      this.sorted = [];
      this.i      = 0;
      this.lo     = 0;
      this.hi     = 0;
      this.mid    = 0;
    }

    // Start the sorting process
    start() {
      this.sorted.push(this.items[0]);
      this.i  = 1;
      return this.nextPair();
    }

    // Get the next pair of items to compare
    nextPair() {
      if (this.i >= this.items.length) return null;
      this.lo = 0;
      this.hi = this.sorted.length;
      return this.step();
    }

    // Return [A, B] to compare
    step() {
      if (this.lo >= this.hi) {
        // Insert and advance
        this.sorted.splice(this.lo, 0, this.items[this.i]);
        this.i++;
        return this.nextPair();
      }
      this.mid = Math.floor((this.lo + this.hi)/2);
      return [ this.items[this.i], this.sorted[this.mid] ];
    }

    // Call after user picks 'winner' (url string)
    record(winner) {
      const current = this.items[this.i];
      if (winner === current) {
        this.hi = this.mid;
      } else {
        this.lo = this.mid + 1;
      }
      return this.step();
    }
  }
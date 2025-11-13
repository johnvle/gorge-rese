const fs = require('fs');
const path = require('path');

/**
 * Manages state between scraper runs
 * Tracks previous availabilities to detect new slots
 */
class StateManager {
  constructor(stateFile = 'last_check.json') {
    this.stateFile = path.join(process.cwd(), stateFile);
    this.state = this.loadState();
  }

  /**
   * Load previous state from file
   */
  loadState() {
    try {
      if (fs.existsSync(this.stateFile)) {
        const data = fs.readFileSync(this.stateFile, 'utf8');
        return JSON.parse(data);
      }
    } catch (error) {
      console.warn('Could not load previous state:', error.message);
    }

    return {
      lastCheck: null,
      previousSlots: [],
      notifiedSlots: []
    };
  }

  /**
   * Save current state to file
   */
  saveState() {
    try {
      fs.writeFileSync(
        this.stateFile,
        JSON.stringify(this.state, null, 2),
        'utf8'
      );
    } catch (error) {
      console.error('Failed to save state:', error.message);
    }
  }

  /**
   * Update state with new check results
   */
  updateState(currentSlots) {
    this.state.lastCheck = new Date().toISOString();
    this.state.previousSlots = currentSlots;
    this.saveState();
  }

  /**
   * Generate unique key for a slot
   */
  getSlotKey(slot) {
    return `${slot.date}_${slot.startTime}_${slot.endTime}`;
  }

  /**
   * Compare current slots with previous to find new availabilities
   */
  findNewAvailabilities(currentSlots) {
    const previousKeys = new Set(
      this.state.previousSlots.map(slot => this.getSlotKey(slot))
    );

    const newSlots = currentSlots.filter(slot => {
      const key = this.getSlotKey(slot);
      return !previousKeys.has(key);
    });

    return newSlots;
  }

  /**
   * Filter out slots we've already notified about
   */
  filterNotifiedSlots(newSlots) {
    const notifiedKeys = new Set(this.state.notifiedSlots || []);

    const unnotifiedSlots = newSlots.filter(slot => {
      const key = this.getSlotKey(slot);
      return !notifiedKeys.has(key);
    });

    return unnotifiedSlots;
  }

  /**
   * Mark slots as notified
   */
  markAsNotified(slots) {
    if (!this.state.notifiedSlots) {
      this.state.notifiedSlots = [];
    }

    const newKeys = slots.map(slot => this.getSlotKey(slot));
    this.state.notifiedSlots.push(...newKeys);

    // Keep only last 1000 notified slots to prevent file bloat
    if (this.state.notifiedSlots.length > 1000) {
      this.state.notifiedSlots = this.state.notifiedSlots.slice(-1000);
    }

    this.saveState();
  }

  /**
   * Clear notified slots (useful for testing or reset)
   */
  clearNotifiedSlots() {
    this.state.notifiedSlots = [];
    this.saveState();
  }

  /**
   * Get summary of current state
   */
  getSummary() {
    return {
      lastCheck: this.state.lastCheck,
      previousSlotsCount: this.state.previousSlots.length,
      notifiedSlotsCount: this.state.notifiedSlots?.length || 0
    };
  }

  /**
   * Check if this is the first run
   */
  isFirstRun() {
    return this.state.lastCheck === null;
  }
}

module.exports = StateManager;

const CalendarScraper = require('./index.js');
const StateManager = require('./stateManager.js');
const Notifier = require('./notifier.js');

/**
 * Main orchestration script for checking reservations
 * Runs the scraper, compares with previous state, and sends notifications
 */
async function checkReservations() {
  console.log('='.repeat(60));
  console.log('Starting reservation check:', new Date().toISOString());
  console.log('='.repeat(60));

  // Initialize components
  const stateManager = new StateManager();
  const notifier = new Notifier();

  // Configuration
  const targetURL = process.env.TARGET_URL || 'https://eipro.jp/takachiho1/eventCalendars/index';

  // Dates to check (customize based on your needs)
  const datesToCheck = generateDatesToCheck(14); // Check next 14 days

  console.log(`\nTarget URL: ${targetURL}`);
  console.log(`Checking ${datesToCheck.length} dates: ${datesToCheck[0]} to ${datesToCheck[datesToCheck.length - 1]}`);

  // Display previous state
  if (!stateManager.isFirstRun()) {
    const summary = stateManager.getSummary();
    console.log(`\nLast check: ${summary.lastCheck}`);
    console.log(`Previous available slots: ${summary.previousSlotsCount}`);
    console.log(`Total notified slots: ${summary.notifiedSlotsCount}`);
  } else {
    console.log('\nFirst run - will establish baseline');
  }

  try {
    // Run the scraper
    const scraper = new CalendarScraper(targetURL, {
      headless: true,
      waitTimeout: 5000,
      quiet: false,
      debugScreenshots: false
    });

    const allSlots = await scraper.scrape(datesToCheck);
    const availableSlots = scraper.getAvailableSlots();

    console.log(`\n✓ Scraping completed`);
    console.log(`  Total slots: ${allSlots.length}`);
    console.log(`  Available: ${availableSlots.length}`);
    console.log(`  Unavailable: ${allSlots.length - availableSlots.length}`);

    // Save results
    scraper.saveToJSON('calendar_availabilities.json');

    // Check for new availabilities
    if (stateManager.isFirstRun()) {
      console.log('\n📊 First run - establishing baseline');
      console.log('   No notifications will be sent');
      stateManager.updateState(availableSlots);
    } else {
      console.log('\n🔍 Comparing with previous check...');
      const newSlots = stateManager.findNewAvailabilities(availableSlots);

      if (newSlots.length > 0) {
        console.log(`   Found ${newSlots.length} new slots!`);

        // Filter out already notified slots
        const unnotifiedSlots = stateManager.filterNotifiedSlots(newSlots);

        if (unnotifiedSlots.length > 0) {
          console.log(`   ${unnotifiedSlots.length} new slots (not yet notified)`);

          // Send notification
          await notifier.notify(
            '🎉 New Reservation Slots Available!',
            `Found ${unnotifiedSlots.length} new available slot(s)`,
            unnotifiedSlots
          );

          // Mark as notified
          stateManager.markAsNotified(unnotifiedSlots);
          console.log('   ✓ Notification sent');
        } else {
          console.log('   All new slots already notified');
        }
      } else {
        console.log('   No new availabilities');
      }

      // Update state
      stateManager.updateState(availableSlots);
    }

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('Check completed successfully');
    console.log('='.repeat(60));

    return {
      success: true,
      totalSlots: allSlots.length,
      availableSlots: availableSlots.length
    };

  } catch (error) {
    console.error('\n❌ Error during check:', error.message);

    // Send error notification (optional)
    try {
      await notifier.notify(
        '⚠️ Reservation Check Failed',
        `Error: ${error.message}`,
        []
      );
    } catch (notifyError) {
      console.error('Failed to send error notification:', notifyError.message);
    }

    throw error;
  }
}

/**
 * Generate array of dates to check (YYYY/MM/DD format)
 */
function generateDatesToCheck(daysAhead = 14) {
  const dates = [];
  const today = new Date();

  for (let i = 0; i < daysAhead; i++) {
    const date = new Date(today);
    date.setDate(today.getDate() + i);

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    dates.push(`${year}/${month}/${day}`);
  }

  return dates;
}

/**
 * For local testing with polling
 */
async function startPolling(intervalMinutes = 5) {
  console.log(`Starting polling mode: checking every ${intervalMinutes} minute(s)`);
  console.log('Press Ctrl+C to stop\n');

  // Run immediately
  await checkReservations();

  // Then run on interval
  setInterval(async () => {
    try {
      await checkReservations();
    } catch (error) {
      console.error('Polling check failed:', error.message);
    }
  }, intervalMinutes * 60 * 1000);
}

// Main execution
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.includes('--poll')) {
    // Local polling mode
    const intervalIndex = args.indexOf('--interval');
    const interval = intervalIndex >= 0 ? parseInt(args[intervalIndex + 1]) : 5;
    startPolling(interval);
  } else {
    // Single check mode (for GitHub Actions)
    checkReservations()
      .then(result => {
        console.log('\nResult:', result);
        process.exit(0);
      })
      .catch(error => {
        console.error('\nFatal error:', error);
        process.exit(1);
      });
  }
}

module.exports = { checkReservations, generateDatesToCheck };

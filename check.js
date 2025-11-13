// Load environment variables from .env file (for local development)
require('dotenv').config();

const CalendarScraper = require('./index.js');
const Notifier = require('./notifier.js');
const fs = require('fs');
const path = require('path');

const LAST_NOTIFICATION_FILE = path.join(__dirname, 'last_notification.json');
const NON_AVAILABLE_COOLDOWN_MINUTES = 30;

/**
 * Check if we should send a non-available notification based on cooldown
 * Only applies to LOCAL runs, not GitHub Actions
 */
function shouldSendNonAvailableNotification() {
  try {
    if (!fs.existsSync(LAST_NOTIFICATION_FILE)) {
      return true; // No previous notification, send it
    }

    const lastNotification = JSON.parse(fs.readFileSync(LAST_NOTIFICATION_FILE, 'utf8'));

    // If last notification had availability, always send the non-available one
    if (lastNotification.hadAvailability) {
      return true;
    }

    // Check if enough time has passed since last non-available notification
    const lastTime = new Date(lastNotification.timestamp);
    const now = new Date();
    const minutesSince = (now - lastTime) / (1000 * 60);

    if (minutesSince >= NON_AVAILABLE_COOLDOWN_MINUTES) {
      return true;
    }

    console.log(`   ⏳ Skipping notification (last non-available alert was ${Math.floor(minutesSince)} minutes ago)`);
    return false;

  } catch (error) {
    console.error('Error reading last notification file:', error.message);
    return true; // On error, send the notification
  }
}

/**
 * Update the last notification tracking file
 */
function updateLastNotification(hadAvailability) {
  try {
    const data = {
      timestamp: new Date().toISOString(),
      hadAvailability
    };
    fs.writeFileSync(LAST_NOTIFICATION_FILE, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('Error writing last notification file:', error.message);
  }
}

/**
 * Main orchestration script for checking reservations
 * Runs the scraper and sends notifications for ANY available slots
 */
async function checkReservations() {
  console.log('='.repeat(60));
  console.log('Starting reservation check:', new Date().toISOString());
  console.log('='.repeat(60));

  // Initialize notifier
  const notifier = new Notifier();

  // Detect source (GitHub Actions or Local)
  const source = process.env.GITHUB_ACTIONS === 'true' ? 'GitHub Actions' : 'Local';

  // Configuration
  const targetURL = process.env.TARGET_URL || 'https://eipro.jp/takachiho1/eventCalendars/index';

  // Dates to check - HARDCODED specific dates
  const datesToCheck = [
    '2025/11/20',
    '2025/11/21'
  ];

  console.log(`\nTarget URL: ${targetURL}`);
  console.log(`Checking ${datesToCheck.length} dates: ${datesToCheck[0]} to ${datesToCheck[datesToCheck.length - 1]}`);

  // Display timestamp
  console.log(`\nCheck timestamp: ${new Date().toISOString()}`);

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

    // Send notification if ANY slots are available
    if (availableSlots.length > 0) {
      console.log(`\n🔔 Found ${availableSlots.length} available slot(s) - sending notification!`);

      // Send notification with all available slots (always, no cooldown)
      await notifier.notify(
        '🎉 Reservation Slots Available!',
        `Found ${availableSlots.length} available slot(s) for ${datesToCheck.join(', ')}`,
        availableSlots,
        source
      );

      console.log('   ✓ Notification sent');

      // Track notification for local cooldown
      if (source === 'Local') {
        updateLastNotification(true);
      }
    } else {
      console.log('\n❌ No available slots found');

      // Apply cooldown logic ONLY for local runs
      const shouldNotify = source === 'GitHub Actions' || shouldSendNonAvailableNotification();

      if (shouldNotify) {
        await notifier.notify(
          '✅ Check Complete - No Availability',
          `Checked ${datesToCheck.join(', ')} - no available slots found at this time.`,
          [],
          source
        );

        console.log('   ✓ Notification sent');

        // Track notification for local cooldown
        if (source === 'Local') {
          updateLastNotification(false);
        }
      }
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
      const source = process.env.GITHUB_ACTIONS === 'true' ? 'GitHub Actions' : 'Local';
      await notifier.notify(
        '⚠️ Reservation Check Failed',
        `Error: ${error.message}`,
        [],
        source
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

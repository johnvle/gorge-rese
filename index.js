const puppeteer = require('puppeteer');
const fs = require('fs');

// Constants
const SELECTORS = {
  DAY_BUTTON: '.fc-day-button',
  DROPDOWN_ARROW: '.select2-selection__arrow',
  DROPDOWN_CONTAINER_OPEN: '.select2-container--open',
  DROPDOWN_OPTION: '.select2-results__option',
  NEXT_DAY_BUTTON: '.fullcalendar_control_date_next_btn',
  CALENDAR_UNIT: '.service_unit_calendar_view',
  ICON_UNAVAILABLE: '.fa-times',
  ICON_HOURGLASS: '.fa-hourglass',
  ICON_CHECK: '.fa-check',
  INPUT_START_TIME: '.service_unit_service_start_datetime',
  INPUT_END_TIME: '.service_unit_service_end_datetime',
  INPUT_SERVICE_CD: '.service_unit_service_cd',
  INPUT_SESSION_CD: '.service_unit_service_session_cd'
};

const WAIT_TIMES = {
  PAGE_LOAD: 2000,
  DAY_BUTTON: 2000,
  DROPDOWN_OPEN: 1500,
  DROPDOWN_LOAD: 500,
  DATE_SELECT: 4000,
  NEXT_DAY: 3000,
  CALENDAR_RENDER: 5000
};

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Web scraper for parsing calendar availabilities from a dynamic website
 * Uses Puppeteer to handle JavaScript-rendered content and interactive elements
 */
class CalendarScraper {
  constructor(url, options = {}) {
    this.url = url;
    this.availabilities = [];
    this.browser = null;
    this.page = null;
    this.options = {
      headless: true,
      waitTimeout: 5000,
      quiet: false,
      debugScreenshots: false,
      ...options
    };
  }

  log(message) {
    if (!this.options.quiet) {
      console.log(message);
    }
  }

  async init() {
    this.log('Launching browser...');
    this.browser = await puppeteer.launch({
      headless: this.options.headless,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    this.page = await this.browser.newPage();
    await this.page.setViewport({ width: 1920, height: 1080 });
  }

  async navigateToPage() {
    this.log(`Navigating to: ${this.url}`);
    await this.page.goto(this.url, { waitUntil: 'networkidle2' });
    await sleep(WAIT_TIMES.PAGE_LOAD);
  }

  async clickDayButton() {
    this.log('Switching to day view...');
    try {
      await this.page.waitForSelector(SELECTORS.DAY_BUTTON, { timeout: this.options.waitTimeout });
      await this.page.click(SELECTORS.DAY_BUTTON);
      await sleep(WAIT_TIMES.DAY_BUTTON);
    } catch (error) {
      this.log('Day view already active or button not found');
    }
  }

  async selectDate(targetDate) {
    this.log(`Selecting date: ${targetDate}`);
    try {
      const dropdownOpen = await this.page.evaluate((sel) => {
        return document.querySelector(sel) !== null;
      }, SELECTORS.DROPDOWN_CONTAINER_OPEN);

      if (!dropdownOpen) {
        await this.page.waitForSelector(SELECTORS.DROPDOWN_ARROW, { timeout: this.options.waitTimeout });
        await this.page.click(SELECTORS.DROPDOWN_ARROW);
        await sleep(WAIT_TIMES.DROPDOWN_OPEN);
      }

      await this.page.waitForSelector(SELECTORS.DROPDOWN_OPTION, { timeout: this.options.waitTimeout });
      await sleep(WAIT_TIMES.DROPDOWN_LOAD);

      const dateInfo = await this.page.evaluate((date, selector) => {
        const options = document.querySelectorAll(selector);
        for (let option of options) {
          if (option.textContent.trim() === date) {
            return { success: true, id: option.id };
          }
        }
        return { success: false, id: null };
      }, targetDate, SELECTORS.DROPDOWN_OPTION);

      if (!dateInfo.success) {
        throw new Error(`Date ${targetDate} not found in dropdown`);
      }

      const selector = `[id="${dateInfo.id}"]`;
      await this.page.click(selector);
      await sleep(WAIT_TIMES.DATE_SELECT);

      this.log(`Date ${targetDate} loaded`);
    } catch (error) {
      console.error('Error selecting date:', error.message);
      if (this.options.debugScreenshots) {
        await this.page.screenshot({ path: `error_${targetDate.replace(/\//g, '-')}.png` });
      }
      throw error;
    }
  }

  async parseAvailabilities() {
    await sleep(WAIT_TIMES.CALENDAR_RENDER);

    if (this.options.debugScreenshots) {
      await this.page.screenshot({ path: 'debug_screenshot.png' });
    }

    const availabilities = await this.page.evaluate((selectors) => {
      const units = document.querySelectorAll(selectors.CALENDAR_UNIT);
      const results = [];

      units.forEach((unit) => {
        const hasUnavailableIcon = unit.querySelector(selectors.ICON_UNAVAILABLE) !== null;
        const hasHourglassIcon = unit.querySelector(selectors.ICON_HOURGLASS) !== null;
        const hasCheckIcon = unit.querySelector(selectors.ICON_CHECK) !== null;

        const startDatetimeInput = unit.querySelector(selectors.INPUT_START_TIME);
        const endDatetimeInput = unit.querySelector(selectors.INPUT_END_TIME);
        const serviceCdInput = unit.querySelector(selectors.INPUT_SERVICE_CD);
        const sessionCdInput = unit.querySelector(selectors.INPUT_SESSION_CD);

        if (startDatetimeInput && endDatetimeInput) {
          const startDatetime = startDatetimeInput.value;
          const endDatetime = endDatetimeInput.value;
          const serviceCd = serviceCdInput ? serviceCdInput.value : null;
          const sessionCd = sessionCdInput ? sessionCdInput.value : null;

          const startTime = startDatetime.split(' ')[1]?.substring(0, 5);
          const endTime = endDatetime.split(' ')[1]?.substring(0, 5);
          const date = startDatetime.split(' ')[0];

          results.push({
            date,
            startTime,
            endTime,
            startDatetime,
            endDatetime,
            available: !hasUnavailableIcon,
            hasHourglass: hasHourglassIcon,
            hasCheck: hasCheckIcon,
            serviceCd,
            sessionCd
          });
        }
      });

      return results;
    }, SELECTORS);

    return availabilities;
  }

  async clickNextDay() {
    this.log('Navigating to next day...');
    await this.page.waitForSelector(SELECTORS.NEXT_DAY_BUTTON, { timeout: this.options.waitTimeout });
    await this.page.click(SELECTORS.NEXT_DAY_BUTTON);
    await sleep(WAIT_TIMES.NEXT_DAY);
  }

  async scrape(dates = []) {
    try {
      await this.init();
      await this.navigateToPage();
      await this.clickDayButton();

      const allAvailabilities = [];

      if (dates.length === 0) {
        this.log('No dates specified, parsing current view...');
        const availabilities = await this.parseAvailabilities();
        allAvailabilities.push(...availabilities);
      } else {
        for (let i = 0; i < dates.length; i++) {
          const date = dates[i];

          if (i === 0) {
            await this.selectDate(date);
          } else {
            await this.clickNextDay();
          }

          const availabilities = await this.parseAvailabilities();
          allAvailabilities.push(...availabilities);
          this.log(`Found ${availabilities.length} time slots for ${date}`);
        }
      }

      this.availabilities = allAvailabilities;
      this.log(`\nTotal slots: ${allAvailabilities.length}`);
      this.log(`Available: ${this.getAvailableSlots().length}`);

      return this.availabilities;
    } catch (error) {
      console.error('Scraping failed:', error.message);
      throw error;
    } finally {
      await this.close();
    }
  }

  getAvailableSlots() {
    return this.availabilities.filter(slot => slot.available);
  }

  getUnavailableSlots() {
    return this.availabilities.filter(slot => !slot.available);
  }

  saveToJSON(filename = 'availabilities.json') {
    fs.writeFileSync(filename, JSON.stringify(this.availabilities, null, 2));
    this.log(`Results saved to ${filename}`);
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
      this.log('Browser closed');
    }
  }
}

// Example usage
async function main() {
  const targetURL = 'https://eipro.jp/takachiho1/eventCalendars/index';

  const datesToCheck = [
    '2025/11/27',
    '2025/11/28'
  ];

  const scraper = new CalendarScraper(targetURL, {
    headless: true,
    waitTimeout: 5000,
    quiet: false,
    debugScreenshots: false
  });

  try {
    await scraper.scrape(datesToCheck);

    console.log('\n=== AVAILABLE SLOTS ===');
    const available = scraper.getAvailableSlots();
    available.forEach(slot => {
      console.log(`${slot.date} ${slot.startTime}-${slot.endTime}`);
    });

    console.log('\n=== UNAVAILABLE SLOTS ===');
    const unavailable = scraper.getUnavailableSlots();
    unavailable.forEach(slot => {
      console.log(`${slot.date} ${slot.startTime}-${slot.endTime}`);
    });

    scraper.saveToJSON('calendar_availabilities.json');

    fs.writeFileSync(
      'available_slots.json',
      JSON.stringify(available, null, 2)
    );
    console.log('Available slots saved to available_slots.json');

  } catch (error) {
    console.error('Error in main:', error);
  }
}

if (require.main === module) {
  main();
}

module.exports = CalendarScraper;

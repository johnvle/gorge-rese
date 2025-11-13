# Reservation Calendar Scraper with Notifications

Automated system for monitoring reservation calendar availabilities and sending notifications when new slots become available.

## Features

- 🤖 Automated scraping of calendar availability
- 🔔 Multi-platform notifications (Discord, Slack, Email)
- 📊 State tracking to detect new availabilities
- ⏱️ Local polling mode for testing
- 🚀 GitHub Actions deployment for scheduled checks
- 💾 JSON export of all results

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

For email notifications, also install:
```bash
npm install nodemailer
```

### 2. Local Testing

Run a single check:
```bash
npm run check
```

Run with 1-minute polling (for testing):
```bash
npm run poll:1min
```

Run with 5-minute polling:
```bash
npm run poll:5min
```

## Configuration

### Notification Methods

Set the `NOTIFICATION_METHOD` environment variable to choose your notification platform:

- `discord` - Discord webhook
- `slack` - Slack webhook
- `email` - Email via SMTP
- `console` - Console output only (for testing)

### Discord Setup

1. Create a Discord webhook:
   - Go to Server Settings → Integrations → Webhooks
   - Click "New Webhook"
   - Copy the webhook URL

2. Set environment variable:
   ```bash
   export DISCORD_WEBHOOK_URL="your_webhook_url_here"
   export NOTIFICATION_METHOD="discord"
   ```

### Slack Setup

1. Create a Slack webhook:
   - Go to https://api.slack.com/messaging/webhooks
   - Create a new app and add incoming webhook
   - Copy the webhook URL

2. Set environment variable:
   ```bash
   export SLACK_WEBHOOK_URL="your_webhook_url_here"
   export NOTIFICATION_METHOD="slack"
   ```

### Email Setup

1. Set environment variables:
   ```bash
   export EMAIL_SERVICE="gmail"
   export EMAIL_USER="your-email@gmail.com"
   export EMAIL_PASS="your-app-password"
   export EMAIL_TO="recipient@example.com"
   export NOTIFICATION_METHOD="email"
   ```

**Note:** For Gmail, you'll need to use an [App Password](https://support.google.com/accounts/answer/185833) instead of your regular password.

## GitHub Actions Deployment

### Setup Steps

1. **Push your code to GitHub**
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/yourusername/your-repo.git
   git push -u origin main
   ```

2. **Configure GitHub Secrets**

   Go to your repository → Settings → Secrets and variables → Actions → New repository secret

   Add the following secrets based on your notification method:

   **For Discord:**
   - `DISCORD_WEBHOOK_URL` - Your Discord webhook URL
   - `NOTIFICATION_METHOD` - Set to `discord`

   **For Slack:**
   - `SLACK_WEBHOOK_URL` - Your Slack webhook URL
   - `NOTIFICATION_METHOD` - Set to `slack`

   **For Email:**
   - `EMAIL_SERVICE` - Email service (e.g., `gmail`)
   - `EMAIL_USER` - Your email address
   - `EMAIL_PASS` - Your email password or app password
   - `EMAIL_TO` - Recipient email address
   - `NOTIFICATION_METHOD` - Set to `email`

3. **Configure Schedule**

   Edit `.github/workflows/check-reservations.yml` and adjust the cron schedule:

   ```yaml
   schedule:
     - cron: "*/5 * * * *"  # Every 5 minutes (GitHub minimum)
   ```

   **Important:** GitHub Actions has a minimum cron interval of 5 minutes, not 1 minute.

4. **Enable GitHub Actions**

   Go to your repository → Actions tab → Enable workflows

5. **Manual Testing**

   You can manually trigger the workflow:
   - Go to Actions tab
   - Select "Check Reservations" workflow
   - Click "Run workflow"

### Polling Frequency Options

| Platform | Minimum Interval | Recommendation |
|----------|-----------------|----------------|
| GitHub Actions | 5 minutes | Every 5-15 minutes |
| Local Machine | 1 minute | Every 1-5 minutes |
| Cloud Server (VPS) | Any | Every 1-5 minutes |

For true 1-minute polling, consider:
- Running locally with `npm run poll:1min`
- Deploying to a VPS/cloud server
- Using a service like Railway, Render, or Fly.io

## Project Structure

```
gorge-rese/
├── .github/
│   └── workflows/
│       └── check-reservations.yml  # GitHub Actions workflow
├── index.js                        # Calendar scraper class
├── check.js                        # Main orchestration script
├── notifier.js                     # Notification service
├── stateManager.js                 # State tracking
├── package.json
└── README.md
```

## How It Works

1. **Scraping**: Uses Puppeteer to navigate the calendar and extract availability data
2. **State Tracking**: Compares current availabilities with previous check
3. **Change Detection**: Identifies new slots that weren't available before
4. **Notifications**: Sends alerts only for genuinely new availabilities (avoids spam)
5. **Persistence**: Saves state between runs to maintain history

## Customization

### Change Target URL

Edit `check.js` line 18:
```javascript
const targetURL = process.env.TARGET_URL || 'your-calendar-url';
```

Or set environment variable:
```bash
export TARGET_URL="your-calendar-url"
```

### Change Date Range

Edit `check.js` line 21 to check more or fewer days:
```javascript
const datesToCheck = generateDatesToCheck(14); // Check next 14 days
```

### Adjust Scraper Settings

Modify the scraper options in `check.js` lines 28-33:
```javascript
const scraper = new CalendarScraper(targetURL, {
  headless: true,           // Set to false to see browser
  waitTimeout: 5000,        // Selector wait timeout
  quiet: false,             // Set to true for less output
  debugScreenshots: false   // Set to true to save screenshots
});
```

## Troubleshooting

### No notifications received

1. Check your notification method is configured:
   ```bash
   echo $NOTIFICATION_METHOD
   ```

2. Test with console output first:
   ```bash
   export NOTIFICATION_METHOD="console"
   npm run check
   ```

3. Verify webhook URLs are correct
4. Check GitHub Actions logs for errors

### Scraper fails

1. Enable debug screenshots:
   - Edit `check.js` and set `debugScreenshots: true`
   - Screenshots will be saved on errors

2. Run in non-headless mode locally:
   - Edit `check.js` and set `headless: false`
   - Watch the browser to see what's happening

3. Check selector timeouts:
   - Increase `waitTimeout` if site is slow

### GitHub Actions not running

1. Ensure workflows are enabled in your repository settings
2. Check the Actions tab for error messages
3. Verify cron syntax is correct
4. GitHub Actions may have delays (up to 10-15 minutes)

## Output Files

The scraper generates these files:

- `calendar_availabilities.json` - All slots (available and unavailable)
- `available_slots.json` - Only available slots
- `last_check.json` - State file (previous check data)

These files are saved as GitHub Actions artifacts (available for 7 days).

## Advanced Usage

### Custom Notification Logic

Edit `check.js` to customize when notifications are sent:

```javascript
// Only notify for specific time slots
const morningSlots = unnotifiedSlots.filter(slot =>
  slot.startTime >= '09:00' && slot.startTime <= '12:00'
);

if (morningSlots.length > 0) {
  await notifier.notify(
    '🌅 Morning Slots Available!',
    `Found ${morningSlots.length} morning slot(s)`,
    morningSlots
  );
}
```

### Multiple Target URLs

Create multiple workflow files or modify `check.js` to loop through multiple URLs.

### Custom Notification Platforms

Add your own notification method in `notifier.js`:

```javascript
async sendCustom(title, message, slots) {
  // Your custom notification logic
}
```

## Cost Considerations

- **GitHub Actions**: Free for public repos, 2,000 minutes/month for private
- **Discord/Slack**: Free webhooks
- **Email**: Free with most providers (watch rate limits)
- **Puppeteer**: Free, runs in GitHub Actions

Estimated GitHub Actions usage:
- 1 minute per check
- 288 checks per day (every 5 minutes)
- ~8,640 minutes per month
- Exceeds free tier for private repos (consider running locally or using 15-min interval)

## License

ISC

## Support

For issues or questions, check:
- GitHub Actions logs
- Local console output with `debugScreenshots: true`
- Notification service status pages

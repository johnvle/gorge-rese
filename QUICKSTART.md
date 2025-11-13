# Quick Start Guide

Get up and running in 5 minutes!

## 1. Install Dependencies

```bash
npm install
```

## 2. Choose Your Notification Method

### Option A: Discord (Easiest)

1. Create a Discord webhook:
   - Right-click your Discord channel → Edit Channel
   - Integrations → Webhooks → New Webhook
   - Copy the webhook URL

2. Create `.env` file:
   ```bash
   cp .env.example .env
   ```

3. Edit `.env` and add your webhook:
   ```
   NOTIFICATION_METHOD=discord
   DISCORD_WEBHOOK_URL=your_webhook_url_here
   ```

### Option B: Console (Testing)

Just run without any configuration - notifications will print to console.

## 3. Test Locally

```bash
# Single check
npm run check

# Or with 1-minute polling
npm run poll:1min
```

You should see:
- Scraper running
- Available slots detected
- Notification sent (or printed to console)

## 4. Deploy to GitHub Actions

### A. Push to GitHub

```bash
git init
git add .
git commit -m "Setup reservation checker"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git push -u origin main
```

### B. Add Secrets

Go to: `https://github.com/YOUR_USERNAME/YOUR_REPO/settings/secrets/actions`

Click "New repository secret" and add:

| Name | Value |
|------|-------|
| `NOTIFICATION_METHOD` | `discord` |
| `DISCORD_WEBHOOK_URL` | Your Discord webhook URL |

### C. Enable Actions

1. Go to the "Actions" tab in your repo
2. Click "I understand my workflows, go ahead and enable them"

### D. Test It

1. Go to Actions tab
2. Click "Check Reservations"
3. Click "Run workflow" → "Run workflow"
4. Watch it run!

## 5. Done! 🎉

Your checker will now run automatically every 5 minutes (GitHub's minimum).

## Next Steps

- Edit dates to check in `check.js` (line 21)
- Adjust check frequency in `.github/workflows/check-reservations.yml`
- Try Slack or Email notifications (see README.md)
- Run locally for 1-minute polling: `npm run poll:1min`

## Troubleshooting

**Not receiving notifications?**
```bash
# Test with console output
export NOTIFICATION_METHOD=console
npm run check
```

**Want to check different dates?**
Edit `check.js` line 21:
```javascript
const datesToCheck = generateDatesToCheck(14); // Change 14 to number of days
```

**Need help?**
Check `README.md` for full documentation!

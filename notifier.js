const https = require('https');
const http = require('http');

/**
 * Discord notification service for reservation alerts
 */
class Notifier {
  constructor(options = {}) {
    this.method = options.method || process.env.NOTIFICATION_METHOD || 'discord';
    this.discordWebhook = options.discordWebhook || process.env.DISCORD_WEBHOOK_URL;
  }

  /**
   * Send notification using configured method
   */
  async notify(title, message, availableSlots = []) {
    try {
      switch (this.method) {
        case 'discord':
          return await this.sendDiscord(title, message, availableSlots);
        case 'console':
          return this.sendConsole(title, message, availableSlots);
        default:
          console.warn(`Unknown notification method: ${this.method}, falling back to console`);
          return this.sendConsole(title, message, availableSlots);
      }
    } catch (error) {
      console.error('Failed to send notification:', error.message);
      // Fallback to console
      this.sendConsole(title, message, availableSlots);
    }
  }

  /**
   * Format slots into readable text
   */
  formatSlots(slots) {
    if (!slots || slots.length === 0) return 'No slots available';

    return slots.map(slot =>
      `${slot.date} ${slot.startTime}-${slot.endTime}`
    ).join('\n');
  }

  /**
   * Send Discord webhook notification
   */
  async sendDiscord(title, message, availableSlots) {
    if (!this.discordWebhook) {
      throw new Error('Discord webhook URL not configured');
    }

    const embed = {
      title: title,
      description: message,
      color: availableSlots.length > 0 ? 0x00ff00 : 0xff9900,
      fields: [],
      timestamp: new Date().toISOString()
    };

    if (availableSlots.length > 0) {
      // Group slots by date
      const slotsByDate = {};
      availableSlots.forEach(slot => {
        if (!slotsByDate[slot.date]) {
          slotsByDate[slot.date] = [];
        }
        slotsByDate[slot.date].push(`${slot.startTime}-${slot.endTime}`);
      });

      for (const [date, times] of Object.entries(slotsByDate)) {
        embed.fields.push({
          name: date,
          value: times.join('\n'),
          inline: false
        });
      }
    }

    const payload = {
      username: 'Reservation Bot',
      embeds: [embed]
    };

    // Add @here mention when slots are available
    if (availableSlots.length > 0) {
      payload.content = '@here';
      payload.allowed_mentions = {
        parse: ['everyone']
      };
    }

    return this.sendWebhook(this.discordWebhook, payload);
  }

  /**
   * Console output (for local testing)
   */
  sendConsole(title, message, availableSlots) {
    console.log('\n=== NOTIFICATION ===');
    console.log(`Title: ${title}`);
    console.log(`Message: ${message}`);
    if (availableSlots.length > 0) {
      console.log('\nAvailable Slots:');
      console.log(this.formatSlots(availableSlots));
    }
    console.log('===================\n');
    return Promise.resolve(true);
  }

  /**
   * Generic webhook sender
   */
  sendWebhook(webhookUrl, payload) {
    return new Promise((resolve, reject) => {
      const url = new URL(webhookUrl);
      const data = JSON.stringify(payload);

      const options = {
        hostname: url.hostname,
        path: url.pathname + url.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data)
        }
      };

      const protocol = url.protocol === 'https:' ? https : http;
      const req = protocol.request(options, (res) => {
        let responseData = '';

        res.on('data', (chunk) => {
          responseData += chunk;
        });

        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            console.log('Notification sent successfully');
            resolve(true);
          } else {
            reject(new Error(`Webhook returned status ${res.statusCode}: ${responseData}`));
          }
        });
      });

      req.on('error', (error) => {
        reject(error);
      });

      req.write(data);
      req.end();
    });
  }
}

module.exports = Notifier;

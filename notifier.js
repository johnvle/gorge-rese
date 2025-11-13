const https = require('https');
const http = require('http');

/**
 * Multi-platform notification service
 * Supports Discord, Slack, and Email notifications
 */
class Notifier {
  constructor(options = {}) {
    this.method = options.method || process.env.NOTIFICATION_METHOD || 'discord';
    this.discordWebhook = options.discordWebhook || process.env.DISCORD_WEBHOOK_URL;
    this.slackWebhook = options.slackWebhook || process.env.SLACK_WEBHOOK_URL;
    this.emailConfig = options.emailConfig || {
      service: process.env.EMAIL_SERVICE,
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
      to: process.env.EMAIL_TO
    };
  }

  /**
   * Send notification using configured method
   */
  async notify(title, message, availableSlots = []) {
    try {
      switch (this.method) {
        case 'discord':
          return await this.sendDiscord(title, message, availableSlots);
        case 'slack':
          return await this.sendSlack(title, message, availableSlots);
        case 'email':
          return await this.sendEmail(title, message, availableSlots);
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
   * Send Slack webhook notification
   */
  async sendSlack(title, message, availableSlots) {
    if (!this.slackWebhook) {
      throw new Error('Slack webhook URL not configured');
    }

    const blocks = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: title
        }
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: message
        }
      }
    ];

    if (availableSlots.length > 0) {
      blocks.push({
        type: 'divider'
      });
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '*Available Slots:*\n```\n' + this.formatSlots(availableSlots) + '\n```'
        }
      });
    }

    const payload = { blocks };

    return this.sendWebhook(this.slackWebhook, payload);
  }

  /**
   * Send email notification (requires nodemailer)
   */
  async sendEmail(title, message, availableSlots) {
    try {
      const nodemailer = require('nodemailer');

      if (!this.emailConfig.user || !this.emailConfig.pass) {
        throw new Error('Email credentials not configured');
      }

      const transporter = nodemailer.createTransport({
        service: this.emailConfig.service || 'gmail',
        auth: {
          user: this.emailConfig.user,
          pass: this.emailConfig.pass
        }
      });

      let htmlContent = `
        <h2>${title}</h2>
        <p>${message}</p>
      `;

      if (availableSlots.length > 0) {
        htmlContent += '<h3>Available Slots:</h3><ul>';
        availableSlots.forEach(slot => {
          htmlContent += `<li>${slot.date} ${slot.startTime}-${slot.endTime}</li>`;
        });
        htmlContent += '</ul>';
      }

      await transporter.sendMail({
        from: this.emailConfig.user,
        to: this.emailConfig.to,
        subject: title,
        html: htmlContent
      });

      console.log('Email notification sent successfully');
      return true;
    } catch (error) {
      if (error.code === 'MODULE_NOT_FOUND') {
        console.error('nodemailer not installed. Run: npm install nodemailer');
      }
      throw error;
    }
  }

  /**
   * Console output (for testing)
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

      // Debug logging
      console.log('Sending webhook payload:', JSON.stringify(payload, null, 2));

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

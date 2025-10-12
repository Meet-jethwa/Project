const { Resend } = require('resend');
const resend = new Resend(process.env.RESEND_API_KEY);

async function sendEmail(to, subject, html) {
  try {
    const response = await resend.emails.send({
      from: process.env.SENDER_EMAIL,
      to,
      subject,
      html,
    });
    console.log(`✅ Email sent to ${to}`);
    return response;
  } catch (err) {
    console.error(`❌ Failed to send email to ${to}:`, err.message);
    throw err; // Re-throw to handle in route
  }
}

module.exports = sendEmail;

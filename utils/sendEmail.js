const nodemailer = require('nodemailer');

const sendEmail = async ({ to, subject, html }) => {
  try {
    let transporter;

    if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
      // Use your real Gmail account
      transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASS,
        },
      });
    } else {
      // Use Ethereal (fake test email — no setup needed)
      // The email won't actually arrive but you'll get a preview link in the terminal
      const testAccount = await nodemailer.createTestAccount();
      transporter = nodemailer.createTransport({
        host: 'smtp.ethereal.email',
        port: 587,
        auth: {
          user: testAccount.user,
          pass: testAccount.pass,
        },
      });
    }

    const info = await transporter.sendMail({
      from: `"Cloud Laundry" <${process.env.EMAIL_USER || 'noreply@cloudlaundry.lk'}>`,
      to,
      subject,
      html,
    });

    console.log('📧 Email sent:', info.messageId);

    // If using Ethereal, print the preview link so you can see the email
    if (!process.env.EMAIL_USER) {
      console.log('👉 Preview the email here:', nodemailer.getTestMessageUrl(info));
    }

    return true;
  } catch (error) {
    console.error('❌ Email error:', error.message);
    return false;
  }
};

module.exports = sendEmail;

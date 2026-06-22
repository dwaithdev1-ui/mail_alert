// Minimal email utility used by ticket routes.
// In a real app replace with proper nodemailer implementation.
export async function sendTicketEmail(to: string, subject: string, html: string): Promise<void> {
  console.log(`[email] To: ${to} | Subject: ${subject}`);
  console.log(`[email] Body: ${html}`);
  // Simulate async send
  return Promise.resolve();
}

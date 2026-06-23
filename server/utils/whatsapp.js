// Sends a WhatsApp message via Meta Cloud API if credentials are set,
// otherwise silently logs. Used for fee-verified and result-uploaded notifications.
async function sendWhatsApp(phone, message) {
  if (!phone) return;
  const token = process.env.WA_TOKEN;
  const phoneId = process.env.WA_PHONE_ID;
  const cleaned = phone.replace(/[^0-9]/g, '');
  const intl = cleaned.startsWith('0') ? '92' + cleaned.slice(1) : cleaned;

  if (!token || !phoneId) {
    console.log(`[WA-LOG] To: ${intl} | ${message}`);
    return;
  }
  try {
    const res = await fetch(`https://graph.facebook.com/v19.0/${phoneId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({
        messaging_product: 'whatsapp', to: intl, type: 'text',
        text: { body: message }
      })
    });
    if (!res.ok) console.error('[WA] Send failed:', await res.text());
  } catch(e) { console.error('[WA] Error:', e.message); }
}

module.exports = { sendWhatsApp };

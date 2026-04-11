const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

const PROMPTS = {
  bridgeai: `You are the AI assistant for Bridge AI, a company that builds custom AI agents for trade businesses and local service companies. Founded by Mark Spaeder.

ABOUT BRIDGE AI:
- Phone: 754-444-7550
- Email: leads@mybridgeai.com
- Website: mybridgeai.com
- Serving South Florida and Western Pennsylvania

SERVICES:
- Custom AI chat assistants for any business website
- Lead capture to email and Google Sheets
- Appointment booking integration
- Voice mode, mobile responsive
- Works on WordPress, Squarespace, Wix, any platform
- Monthly maintenance included

PRICING:
- Starter: $350 setup + $100/month
- Professional: $500 setup + $150/month
- Premium: $750 setup + $200/month

RULES:
- Be enthusiastic but not pushy
- Answer questions about AI and how it helps businesses
- Collect name, phone, and business type from interested prospects
- When you have name and phone include [LEAD:collected] at end of message
- Keep responses concise and conversational`,

  caletri: `You are the AI assistant for Caletri Excavating, a professional excavation company in Greensburg, Pennsylvania with 30 years experience. Owner: Tony Caletri. Phone: 724-454-9522. Email: tcaletri@gmail.com. Services: excavation, site prep, land clearing, utility installation, septic systems, foundations, French drains, retaining walls, concrete, driveways, hauling, hydroseeding, food plots. Free estimates. Never quote prices. Collect name and phone. When collected include [LEAD:collected]. Keep responses short and friendly.`,

  hvac: `You are the AI assistant for Fire & Ice HVAC serving Broward and Miami-Dade counties. Services: AC repair, installation, heating, maintenance plans, duct cleaning, emergency service. Same-day emergency available. Free estimates on new systems. Collect name and phone. When collected include [LEAD:collected]. Keep responses short.`,

  pool: `You are the AI assistant for Crystal Clear Pools serving South Florida. Services: weekly/bi-weekly/monthly cleaning, chemical balancing, equipment repair, algae treatment. Competitive rates. Collect name and phone. When collected include [LEAD:collected]. Keep responses friendly and brief.`
};

app.post('/chat', async (req, res) => {
  try {
    const { messages, client } = req.body;
    const apiKey = (process.env.ANTHROPIC_API_KEY || '').trim();
    const systemPrompt = PROMPTS[client] || PROMPTS.bridgeai;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        system: systemPrompt,
        messages: messages
      })
    });

    const data = await response.json();
    if (data.error) return res.status(500).json({ error: data.error.message });

    const text = data.content[0].text;
    if (text.includes('[LEAD:collected]')) captureLeadAsync(messages, text, client);
    res.json({ text: text.replace('[LEAD:collected]', '').trim() });

  } catch (err) {
    console.error('Chat error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

function captureLeadAsync(messages, lastResponse, client) {
  const userText = messages.filter(m => m.role === 'user').map(m => m.content).join('\n');
  const assistantText = messages.filter(m => m.role === 'assistant').map(m => m.content).join('\n') + '\n' + lastResponse;
  const phoneMatch = userText.match(/(\(?\d{3}\)?[\s\-.]?\d{3}[\s\-.]?\d{4})/);
  let name = 'Not captured';
  const skipWords = /^(there|you|me|sir|mam|friend|sure|yes|no|ok)$/i;
  const confirmed = assistantText.match(/(?:thanks|thank you|got it|great|perfect)[,!]?\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)[,!\.]/i);
  if (confirmed && !skipWords.test(confirmed[1])) name = confirmed[1];
  const projectMatch = lastResponse.match(/(?:project|need|looking for|interested in)[:\s]+([^.\n]{10,80})/i);
  const lead = {
    name, phone: phoneMatch ? phoneMatch[0] : 'Not captured',
    project: projectMatch ? projectMatch[1].trim() : 'See conversation',
    timestamp: new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }),
    snippet: messages.slice(-8).map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n\n'),
    client
  };
  console.log(`Lead [${client}]:`, lead.name, lead.phone);
  sendEmail(lead).catch(e => console.error('Email failed:', e.message));
  appendSheet(lead).catch(e => console.error('Sheet failed:', e.message));
}

async function sendEmail(lead) {
  const resendKey = (process.env.RESEND_API_KEY || '').trim();
  const clientEmail = lead.client === 'caletri' ? process.env.CALETRI_EMAIL : process.env.GMAIL_USER;
  const recipients = [clientEmail, process.env.GMAIL_USER].filter(Boolean).map(e => e.trim());
  const names = { bridgeai:'Bridge AI', caletri:'Caletri Excavating', hvac:'Fire & Ice HVAC', pool:'Crystal Clear Pools' };
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + resendKey },
    body: JSON.stringify({
      from: 'Bridge AI <leads@mybridgeai.com>',
      to: recipients,
      subject: `New Lead — ${names[lead.client]||'Bridge AI'}: ${lead.name} | ${lead.phone}`,
      html: `<div style="font-family:Arial,sans-serif;max-width:600px;"><div style="background:#1A1A3E;padding:20px;border-radius:8px 8px 0 0;"><h2 style="color:#6B8FFF;margin:0;">New Lead — ${names[lead.client]||'Bridge AI'}</h2></div><div style="background:#f9f9f9;padding:24px;border:1px solid #e0e0e0;"><p><b>Name:</b> ${lead.name}</p><p><b>Phone:</b> ${lead.phone}</p><p><b>Project:</b> ${lead.project}</p><p><b>Time:</b> ${lead.timestamp}</p><hr/><pre style="font-size:12px;white-space:pre-wrap;">${lead.snippet}</pre></div><div style="background:#1A1A3E;padding:10px;text-align:center;border-radius:0 0 8px 8px;"><p style="color:#6B8FFF;font-size:11px;margin:0;">Powered by Bridge AI — mybridgeai.com</p></div></div>`
    })
  });
  const result = await r.json();
  if (!r.ok) throw new Error(JSON.stringify(result));
  console.log('Email sent to:', recipients.join(', '));
}

async function appendSheet(lead) {
  const { google } = require('googleapis');
  const creds = JSON.parse((process.env.GOOGLE_SERVICE_ACCOUNT || '{}').trim());
  const sheetId = (lead.client === 'caletri' ? process.env.CALETRI_SHEET_ID : process.env.BRIDGEAI_SHEET_ID || '').trim();
  if (!sheetId) return;
  const auth = new google.auth.GoogleAuth({ credentials: creds, scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
  const sheets = google.sheets({ version: 'v4', auth });
  await sheets.spreadsheets.values.append({
    spreadsheetId: sheetId,
    range: 'Sheet1!A:G',
    valueInputOption: 'RAW',
    requestBody: { values: [[lead.timestamp, lead.name, lead.phone, lead.project, lead.client, 'Website Chat', 'New']] }
  });
  console.log('Sheet updated:', lead.client);
}

app.get('/', (req, res) => res.json({ status: 'Bridge AI server running', timestamp: new Date().toISOString() }));
app.listen(PORT, () => console.log(`Bridge AI server running on port ${PORT}`));

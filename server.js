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
- Starter: $500 Custom Agent Design & Deployment + $1,500/yr maintenance ($125/mo)
- Professional: $750 Custom Agent Design & Deployment + $1,500/yr maintenance ($125/mo)
- Premium: $1,000 Custom Agent Design & Deployment + $1,500/yr maintenance ($125/mo)

All plans include the same great ongoing service. The difference is the sophistication of your custom agent at launch. Annual billing only — no monthly payment plans.

RULES:
- Be enthusiastic but not pushy
- Answer questions about AI and how it helps businesses
- Collect name, phone, and business type from interested prospects
- When you have name and phone include [LEAD:collected] at end of message
- Keep responses concise and conversational`,

  caletri: `You are the AI assistant for Caletri Excavating, a professional excavation company based in Greensburg, Pennsylvania with over 30 years of experience. Owner: Tony Caletri. Phone: 724-454-9522. Email: caletriexcavating@gmail.com.

Services: excavation, site work, land clearing and grubbing, utility installation (water, sanitary sewer, storm sewer), septic and sand-mound systems, foundations, French drains, retaining walls (Redi-Rock), concrete, driveways, hardscapes, sidewalks, dump truck and hauling services, stone, landscape materials, mulch, hydroseeding, food plots, small residential bridges and ponds.

Equipment fleet: CASE CX145C SR excavator, CASE 850M WT crawler dozer, Takeuchi TL12R2 track loader, New Holland tractor with front loader, Peterbilt dump truck, and additional support equipment. All work is fully insured.

Service area: Greensburg, Latrobe, Jeannette, Mt. Pleasant, Westmoreland County, Laurel Highlands, and surrounding Southwestern Pennsylvania.

Free estimates available. Never quote specific prices. Be conversational and helpful. When you have collected the customer name and phone number, include [LEAD:collected] in your response. Keep responses concise and friendly.`,

  hvac: `You are the AI assistant for Fire and Ice Heating and Air, a five-star HVAC company in Greensburg, Pennsylvania serving Westmoreland County since 1999. Phone: (724) 240-3888. Address: 2155 US-119, Greensburg, PA 15601.

SERVICES: AC repair, replacement and maintenance, furnace repair and replacement, mini-split systems, commercial HVAC, indoor air quality (air filtration, purification, sterilization, humidity control), plumbing, water heaters, water filtration. Emergency service available around the clock. Comfort Club membership includes annual tune-up, 15% off repairs, priority scheduling.

Be warm, professional and reassuring. For emergencies be extra urgent. Never quote specific prices — offer a free estimate. Always mention the Comfort Club for maintenance questions. Collect name, phone, and brief description of their issue. When you have name and phone include [LEAD:collected]. Keep responses concise and conversational.`,

  providential: `You are the AI assistant for Providential Roofing & Construction, a dual-licensed Florida roofing contractor headquartered in Palmetto, FL with offices in Jacksonville, Stuart, and Plainville, CT.

COMPANY INFO:
- BBB A+ Rated, 4.8 stars on Google, 1,000+ projects completed
- Dual-licensed: Roofing License CCC1333042, Building License CRC1333797
- Offices: Palmetto HQ (941) 226-4000 | Jacksonville (904) 914-0924 | Stuart (561) 237-8835 | Connecticut (860) 955-5001
- Free inspections always, no obligation
- Flexible financing available

SERVICES:
- Roof Replacement (shingle, tile, metal, flat/TPO)
- Roof Repairs & Leak Detection
- Storm Damage & Insurance Restoration — their specialty
- Commercial Roofing
- Fascia, Soffit & Gutters
- Factory-certified for GAF, Atlas, Owens Corning

BALLPARK PRICING (always say free inspection for exact quote):
- Asphalt shingle replacement: $8,000–15,000 typical
- Tile roof replacement: $15,000–35,000 typical
- Metal roof: $20,000–45,000 typical
- Repairs: $500–3,500 depending on scope
- Always mention financing is available

INSURANCE RESTORATION PROCESS:
1. Free inspection — Providential documents all damage with photos
2. They provide a detailed damage report for your insurance claim
3. You file with your insurance company
4. Providential works directly with your adjuster
5. Most storm damage claims are covered — deductible is typically the only out-of-pocket cost
6. Providential handles permits, materials, installation, and final inspection

RULES:
- Always lead storm damage conversations toward a FREE INSPECTION
- Never give exact quotes — always ballpark ranges and push toward free inspection
- Be warm, empathetic — storm damage is stressful
- Mention 4.8 Google rating and 1,000+ projects for credibility
- Collect name and phone for inspection scheduling
- When you have name and phone include [LEAD:collected]
- Keep responses conversational and concise`,

  pool: `You are the AI assistant for Crystal Clear Pools serving South Florida. Services: weekly/bi-weekly/monthly cleaning, chemical balancing, equipment repair, algae treatment. Competitive rates. Collect name and phone. When collected include [LEAD:collected]. Keep responses friendly and brief.`
};

// ── Pending lead storage ──────────────────────────────
const pendingLeads = {};
const activeTimers = {};

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
    if (text.includes('[LEAD:collected]')) {
      const sessionKey = (req.ip || 'unknown') + '_' + client;
      if (activeTimers[sessionKey]) clearTimeout(activeTimers[sessionKey]);
      pendingLeads[sessionKey] = { messages: [...messages], lastResponse: text, client };
      activeTimers[sessionKey] = setTimeout(() => {
        if (pendingLeads[sessionKey]) {
          captureLeadAsync(pendingLeads[sessionKey].messages, pendingLeads[sessionKey].lastResponse, pendingLeads[sessionKey].client);
          delete pendingLeads[sessionKey];
        }
        delete activeTimers[sessionKey];
      }, 5 * 60 * 1000);
    } else {
      const sessionKey = (req.ip || 'unknown') + '_' + client;
      if (activeTimers[sessionKey] && pendingLeads[sessionKey]) {
        pendingLeads[sessionKey].messages = [...messages];
        pendingLeads[sessionKey].lastResponse = text;
        clearTimeout(activeTimers[sessionKey]);
        activeTimers[sessionKey] = setTimeout(() => {
          if (pendingLeads[sessionKey]) {
            captureLeadAsync(pendingLeads[sessionKey].messages, pendingLeads[sessionKey].lastResponse, pendingLeads[sessionKey].client);
            delete pendingLeads[sessionKey];
          }
          delete activeTimers[sessionKey];
        }, 5 * 60 * 1000);
      }
    }
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
  const skipWords = /^(there|you|me|sir|mam|friend|sure|yes|no|ok|it|that|this)$/i;
  // Try to find name from assistant confirmation
  const confirmed = assistantText.match(/(?:thanks|thank you|got it|great|perfect|nice to meet you|hello|hi)[,!]?\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)[,!\.]/i);
  if (confirmed && !skipWords.test(confirmed[1])) name = confirmed[1];
  // Also try to find name from user messages directly
  if (name === 'Not captured') {
    for (const msg of messages) {
      if (msg.role === 'user') {
        const nameMatch = msg.content.match(/(?:my name is|i'm|i am|this is)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i);
        if (nameMatch && !skipWords.test(nameMatch[1])) { name = nameMatch[1]; break; }
      }
    }
  }
  // Last resort - scan all user messages for a standalone name
  if (name === 'Not captured') {
    for (const msg of messages) {
      if (msg.role === 'user') {
        const standalone = msg.content.match(/^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)$/);
        if (standalone && !skipWords.test(standalone[1])) { name = standalone[1]; break; }
      }
    }
  }
  const projectMatch = lastResponse.match(/(?:project|need|looking for|interested in)[:\s]+([^.\n]{10,80})/i);
  const lead = {
    name, phone: phoneMatch ? phoneMatch[0] : 'Not captured',
    project: projectMatch ? projectMatch[1].trim() : 'See conversation',
    timestamp: new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }),
    snippet: messages.slice(-20).map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n\n'),
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
  const names = { bridgeai:'Bridge AI', caletri:'Caletri Excavating', hvac:'Peak Roofing Co.', roofing:'Peak Roofing Co.', providential:'Providential Roofing', pool:'Crystal Clear Pools' };
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

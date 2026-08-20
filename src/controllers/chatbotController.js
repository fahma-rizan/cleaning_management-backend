const Anthropic = require('@anthropic-ai/sdk');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SERVICE_CATALOG_MAP = {
  1:  { name: 'House Deep Cleaning', price: 'From LKR 25/sqft', category: 'home' },
  6:  { name: 'General Cleaning', price: 'LKR 20/sqft', category: 'home' },
  5:  { name: 'Commercial Cleaning', price: 'From LKR 25/sqft', category: 'home' },
  7:  { name: 'Floor Cleaning', price: 'LKR 30/sqft', category: 'home' },
  8:  { name: 'Floor - Cut & Polish', price: 'LKR 35/sqft', category: 'home' },
  9:  { name: 'Dry Cleaning', price: 'From LKR 175/piece', category: 'laundry' },
  10: { name: 'Washing & Pressing', price: 'From LKR 170/piece', category: 'laundry' },
  11: { name: 'Pressing Only', price: 'From LKR 125/piece', category: 'laundry' },
  3:  { name: 'Sofa Cleaning', price: 'From LKR 2,900', category: 'shampoo' },
  13: { name: 'Mattress Cleaning', price: 'From LKR 5,500', category: 'shampoo' },
  14: { name: 'Carpet Cleaning', price: 'LKR 35/sqft', category: 'shampoo' },
  4:  { name: 'Curtain Cleaning', price: 'From LKR 2,500/curtain', category: 'curtain' },
};

const SERVICE_CATALOG_TEXT = `
HOME/OFFICE CLEANING:
- [ID 1] House Deep Cleaning: Normal LKR 25/sqft | Move In/Out LKR 30/sqft | After Construction LKR 35/sqft
- [ID 6] General Cleaning: LKR 20/sqft
- [ID 5] Commercial Cleaning: Normal LKR 25/sqft | Move In/Out LKR 30/sqft | After Construction LKR 35/sqft
- [ID 7] Floor Cleaning: LKR 30/sqft
- [ID 8] Floor Cut & Polish: LKR 35/sqft

LAUNDRY (Free Pickup & Delivery included):
- [ID 9] Dry Cleaning: Shirt 400, T-Shirt 350, Trouser 450, Saree 900, Blazer 700, 2pc Suit 850, 3pc Suit 1250, Bridal Dress 3500
- [ID 10] Washing & Pressing: Shirt Fold 270/Hang 370, T-Shirt 220/320, Trouser 320/420, Long Dress 420/520
- [ID 11] Pressing Only: Shirt Fold 175/Hang 275, T-Shirt 125/225, Trouser 225/325, Saree 600, Blazer 500

SHAMPOO & VACUUM:
- [ID 3] Sofa Cleaning: 2 Seater 2900, 3 Seater 3900, 4 Seater 4900, 5 Seater 5900
- [ID 13] Mattress Cleaning: King Full 11500/Top 8500, Queen 10500/7500, Double 10000/7000, Single 8000/5500
- [ID 14] Carpet Cleaning: LKR 35/sqft

CURTAIN CLEANING:
- [ID 4] Curtain Cleaning: Dry Clean & Press LKR 2500/curtain | Laundry & Press LKR 3500/curtain | Premium LKR 4500/curtain (add-ons: removal 100, install 100, delivery 500)

We serve: Colombo & suburbs, Gampaha, Kalutara, Kandy, Galle, Matara.
Payment: Cash on delivery, Card, Online payment.
Promo codes: WELCOME20 (20% off first booking, min 1000), LAUNDRY500 (LKR 500 off laundry, min 2000), CLEAN15 (15% off home cleaning, min 3000).
`;

const SYSTEM_PROMPT = `You are the friendly, conversational chat assistant for Cloud Laundry Services, a Sri Lankan cleaning and laundry company. Talk naturally, like a real support agent — not a script.

Use ONLY the pricing/services below. Never invent prices or services not listed. Each service has an [ID].

${SERVICE_CATALOG_TEXT}

Guidelines:
- Keep replies short and warm (2-4 sentences, occasional relevant emoji, don't overdo it).
- Infer the right service from problems described in plain language (e.g. "my couch smells" → Sofa Cleaning).
- Mention prices when relevant.
- If unrelated to cleaning/laundry, politely redirect.

CRITICAL FORMATTING RULE: On the very last line of your reply, add a machine-readable tag listing the IDs of every service you discussed or recommended in this reply, like this: [[SERVICES: 3,13]]
- Only include IDs of services you actually mentioned in THIS reply.
- If you didn't discuss any specific service, write [[SERVICES: ]]
- This tag must be the last line, nothing after it. It will not be shown to the user.`;

function parseReply(rawText) {
  const match = rawText.match(/\[\[SERVICES:\s*([\d,\s]*)\]\]\s*$/);
  const cleanText = rawText.replace(/\[\[SERVICES:\s*([\d,\s]*)\]\]\s*$/, '').trim();

  let serviceLinks = [];
  if (match && match[1].trim()) {
    const ids = match[1].split(',').map(s => parseInt(s.trim(), 10)).filter(Boolean);
    serviceLinks = ids
      .filter(id => SERVICE_CATALOG_MAP[id])
      .map(id => ({ id, ...SERVICE_CATALOG_MAP[id] }));
  }

  return { cleanText, serviceLinks };
}

exports.chatWithBot = async (req, res) => {
  try {
    const { message, history = [] } = req.body;
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ success: false, message: 'Message is required' });
    }

    const messages = history.slice(-10).map(h => ({
      role: h.sender === 'user' ? 'user' : 'assistant',
      content: h.text,
    }));
    messages.push({ role: 'user', content: message });

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 400,
      system: SYSTEM_PROMPT,
      messages,
    });

    const rawText = response.content
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .join('\n');

    const { cleanText, serviceLinks } = parseReply(rawText);

    res.json({ success: true, reply: cleanText, serviceLinks });
  } catch (err) {
    console.error('Chatbot error:', err);
    res.status(500).json({ success: false, message: err.message || 'Something went wrong, please try again.' });
  }
};
module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const webhookUrl = process.env.MAKE_WEBHOOK_URL;
  if (!webhookUrl) {
    console.error('MAKE_WEBHOOK_URL is not configured');
    return res.status(500).json({ error: 'Lead service is not configured' });
  }

  const body = req.body;
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return res.status(400).json({ error: 'Invalid request body' });
  }

  const limits = {
    name: 120,
    email: 254,
    company: 160,
    whatsapp: 32,
    message: 2000,
    utm_source: 200,
    utm_medium: 200,
    utm_campaign: 200,
    utm_adgroup: 200,
    utm_term: 200,
    utm_content: 200,
  };
  const requiredFields = new Set(['name', 'email']);
  const lead = {};
  for (const [field, maxLength] of Object.entries(limits)) {
    const value = body[field];
    if (value === undefined && !requiredFields.has(field)) {
      lead[field] = '';
      continue;
    }

    if (typeof value !== 'string') {
      return res.status(400).json({ error: `Invalid ${field}` });
    }

    lead[field] = value.trim();
    if (
      (requiredFields.has(field) && !lead[field]) ||
      lead[field].length > maxLength
    ) {
      return res.status(400).json({ error: `Invalid ${field}` });
    }
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lead.email)) {
    return res.status(400).json({ error: 'Invalid email' });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(lead),
      signal: controller.signal,
    });

    if (!response.ok) {
      console.error(`Make webhook returned HTTP ${response.status}`);
      return res.status(502).json({ error: 'Lead delivery failed' });
    }

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('Could not deliver lead to Make:', error.message);
    return res.status(502).json({ error: 'Lead delivery failed' });
  } finally {
    clearTimeout(timeout);
  }
};

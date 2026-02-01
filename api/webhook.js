export default async function handler(req, res) {
  // Moxo sends POST requests
  if (req.method !== 'POST') {
    return res.status(200).send('OK');
  }

  try {
    // 1. Get message from Moxo webhook payload
    const { comment, binder_id, user } = req.body;
    const messageText = comment?.content;
    
    if (!messageText) {
      return res.status(200).send('No message');
    }

    console.log(`[Joe Bot] Received: "${messageText}" from ${user?.email}`);

    // 2. Generate access token using your credentials
    const accessToken = await generateMoxoToken();
    
    // 3. Send echo reply back to Moxo
    const reply = `Hi, I'm Joe! I received: "${messageText}"`;
    await sendMessage(binder_id, accessToken, reply);

    return res.status(200).json({ success: true, bot: "Joe" });

  } catch (error) {
    console.error('[Joe Bot] Error:', error);
    return res.status(200).send('Error handled'); // Always return 200 to Moxo
  }
}

// Generate HMAC-SHA256 token (from your PDF Page 13)
async function generateMoxoToken() {
  const crypto = await import('crypto');
  
  // Get from Environment Variables (don't hardcode in production)
  const domain = process.env.MOXO_DOMAIN; // pavan-demo.moxo.com
  const orgId = process.env.MOXO_ORG_ID;
  const clientId = process.env.MOXO_CLIENT_ID;
  const clientSecret = process.env.MOXO_CLIENT_SECRET;
  
  const timestamp = Date.now().toString();
  const messageContent = clientId + orgId + timestamp;

  // Create HMAC-SHA256
  const signature = crypto
    .createHmac('sha256', clientSecret)
    .update(messageContent)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');

  // Call Moxo auth endpoint
  const tokenUrl = `https://${domain}/v1/apps/token`;
  const params = new URLSearchParams({
    client_id: clientId,
    org_id: orgId,
    timestamp: timestamp,
    signature: signature
  });

  const response = await fetch(`${tokenUrl}?${params}`);
  const data = await response.json();
  
  if (!data.access_token) {
    throw new Error('Failed to get token: ' + JSON.stringify(data));
  }
  
  return data.access_token;
}

// Send message to Moxo (from your PDF Page 12)
async function sendMessage(binderId, token, text) {
  const domain = process.env.MOXO_DOMAIN;
  const url = `https://${domain}/v1/${binderId}/messages?access_token=${token}`;
  
  const payload = {
    message: {
      text: text,
      action: "chat" // "chat", "page", or "todo" per your PDF
    }
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  return response.json();
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(200).send('OK');

  try {
    // Step 1: Read raw body (since Vercel might not parse it automatically)
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const rawBody = Buffer.concat(chunks).toString();
    
    console.log("Raw body from Moxo:", rawBody);
    
    // Step 2: Parse JSON
    const body = JSON.parse(rawBody);
    const messageText = body.comment?.content;
    const binderId = body.binder_id;
    
    console.log(`Message: "${messageText}" | Binder: ${binderId}`);

    if (!messageText || !binderId) {
      return res.status(200).json({ error: "Missing message or binder_id" });
    }

    // Step 3: Generate Moxo Token (using YOUR credentials)
    const accessToken = await generateMoxoToken();
    
    // Step 4: Send reply back to Moxo
    await sendMessageToMoxo(binderId, accessToken, `Joe received: "${messageText}"`);
    
    return res.status(200).json({ success: true, reply_sent: true });

  } catch (error) {
    console.error("Error:", error);
    return res.status(200).json({ error: error.message });
  }
}

// Generate HMAC-SHA256 token (from your PDF Page 13)
async function generateMoxoToken() {
  const crypto = await import('crypto');
  
  // ==========================================
  // REPLACE THESE WITH YOUR ACTUAL VALUES
  // ==========================================
  const DOMAIN = 'pavan-demo.moxo.com';
  const ORG_ID = 'P9b66iIxC5pFNll05eo73yH';           // Paste from Moxo
  const CLIENT_ID = 'Y2QyZTEyMWI';     // Paste from Moxo  
  const CLIENT_SECRET = 'MDE2YjQ4YmE';    // Paste from Moxo
  // ==========================================
  
  const timestamp = Date.now().toString();
  const messageContent = CLIENT_ID + ORG_ID + timestamp;

  // Create HMAC signature (exactly like your PDF says)
  const signature = crypto
    .createHmac('sha256', CLIENT_SECRET)
    .update(messageContent)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');

  // Call Moxo auth endpoint
  const tokenUrl = `https://${DOMAIN}/v1/apps/token`;
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    org_id: ORG_ID,
    timestamp: timestamp,
    signature: signature
  });

  const response = await fetch(`${tokenUrl}?${params}`);
  const data = await response.json();
  
  if (!data.access_token) {
    throw new Error('Auth failed: ' + JSON.stringify(data));
  }
  
  return data.access_token;
}

// Send message back to Moxo (from your PDF Page 12)
async function sendMessageToMoxo(binderId, token, text) {
  const url = `https://pavan-demo.moxo.com/v1/${binderId}/messages?access_token=${token}`;
  
  const payload = {
    message: {
      text: text,
      action: "chat"
    }
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error(`Failed to send message: ${response.status}`);
  }
  
  return response.json();
}

// Important: Disable body parser so we can read raw stream
export const config = {
  api: {
    bodyParser: false
  }
};

export default async function handler(req, res) {
  console.log("WEBHOOK HIT!", req.method, req.body);
  
  // Only accept POST from Moxo
  if (req.method !== 'POST') {
    return res.status(200).send('OK - Webhook is live, waiting for POST from Moxo');
  }

  try {
    // Return the full payload immediately so you can see what Moxo sent
    return res.status(200).json({ 
      status: "success",
      message: "Joe received your message",
      timestamp: new Date().toISOString(),
      received_payload: req.body,  // This shows exactly what Moxo sent
      extracted_message: req.body?.comment?.content || "No message content found",
      binder_id: req.body?.binder_id || "No binder ID",
      user_email: req.body?.user?.email || "No user email"
    });

    /* 
    // UNCOMMENT THIS AFTER YOU VERIFY THE PAYLOAD WORKS
    // Then add your environment variables (MOXO_DOMAIN, MOXO_CLIENT_ID, etc.)
    
    const { comment, binder_id, user } = req.body;
    const messageText = comment?.content;
    
    if (!messageText) {
      return res.status(200).send('No message content');
    }

    console.log(`[Joe Bot] Received: "${messageText}" from ${user?.email}`);

    // Generate access token
    const accessToken = await generateMoxoToken();
    
    // Send echo reply
    const reply = `Hi, I'm Joe! I received: "${messageText}"`;
    await sendMessage(binder_id, accessToken, reply);

    return res.status(200).json({ success: true, bot: "Joe" });
    */

  } catch (error) {
    console.error('[Joe Bot] Error:', error);
    return res.status(200).json({ 
      status: "error", 
      error: error.message,
      body_received: req.body 
    });
  }
}

/* 
// UNCOMMENT THESE FUNCTIONS AFTER YOU ADD ENVIRONMENT VARIABLES

async function generateMoxoToken() {
  const crypto = await import('crypto');
  const domain = process.env.MOXO_DOMAIN;
  const orgId = process.env.MOXO_ORG_ID;
  const clientId = process.env.MOXO_CLIENT_ID;
  const clientSecret = process.env.MOXO_CLIENT_SECRET;
  
  const timestamp = Date.now().toString();
  const messageContent = clientId + orgId + timestamp;

  const signature = crypto
    .createHmac('sha256', clientSecret)
    .update(messageContent)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');

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

async function sendMessage(binderId, token, text) {
  const domain = process.env.MOXO_DOMAIN;
  const url = `https://${domain}/v1/${binderId}/messages?access_token=${token}`;
  
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

  return response.json();
}
*/

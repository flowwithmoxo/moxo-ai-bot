export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(200).send('OK');
  
  try {
    // Extract from Moxo payload
    const message = req.body?.comment?.content;
    const binderId = req.body?.binder_id;
    
    if (!message || !binderId) {
      return res.status(200).send('Missing data');
    }

    // Generate token and reply
    const token = await getMoxoToken();
    await sendReply(binderId, token, `Joe received: "${message}"`);
    
    return res.status(200).json({ success: true });
    
  } catch (e) {
    console.error(e);
    return res.status(200).send('Error'); // Always return 200 to Moxo
  }
}

async function getMoxoToken() {
  const crypto = await import('crypto');
  
  // REPLACE THESE WITH YOUR ACTUAL VALUES
  const DOMAIN = 'pavan-demo.moxo.com';
  const ORG_ID = 'P9b66iIxC5pFNll05eo73yH';           // ← Get from Moxo
  const CLIENT_ID = 'Y2QyZTEyMWI';     // ← Get from Moxo bot settings  
  const CLIENT_SECRET = 'MDE2YjQ4YmE';    // ← Get from Moxo bot settings
  
  const timestamp = Date.now().toString();
  const msg = CLIENT_ID + ORG_ID + timestamp;
  
  const sig = crypto.createHmac('sha256', CLIENT_SECRET)
    .update(msg).digest('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    
  const res = await fetch(`https://${DOMAIN}/v1/apps/token?client_id=${CLIENT_ID}&org_id=${ORG_ID}&timestamp=${timestamp}&signature=${sig}`);
  const data = await res.json();
  return data.access_token;
}

async function sendReply(binderId, token, text) {
  await fetch(`https://pavan-demo.moxo.com/v1/${binderId}/messages?access_token=${token}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: { text, action: 'chat' } })
  });
}

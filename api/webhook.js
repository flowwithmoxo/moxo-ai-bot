import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(200).send('OK');
  
  try {
    // Connect to Supabase
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    );
    
    const { comment, binder_id, user } = req.body;
    const message = comment?.content;
    if (!message) return res.status(200).send('No message');
    
    // Block internal emails
    if (user?.email?.includes('diverseproperties.com')) {
      return res.status(200).send('Internal');
    }

    // 1. Check Memory
    const { data: memory } = await supabase
      .from('customer_memory')
      .select('*')
      .eq('binder_id', binder_id)
      .single();
    
    const mem = memory || {
      binder_id,
      greeted_until: null,
      escalation_until: null,
      form_cooldown_until: null
    };

    // 2. Detect Intent
    const msg = message.toLowerCase();
    let intent = 'support';
    if (msg.includes('hello') || msg.includes('hi') || msg === 'hey') intent = 'greeting';
    else if (msg.includes('schedule') || msg.includes('book') || msg.includes('meeting')) intent = 'meeting';
    else if (msg.includes('form') || msg.includes('apply')) intent = 'form';
    else if (msg.includes('human') || msg.includes('agent') || msg.includes('angry')) intent = 'escalate';

    // 3. Route
    let reply = "";
    const updates = {};
    const now = new Date();

    switch(intent) {
      case 'greeting':
        if (!mem.greeted_until || new Date(mem.greeted_until) < now) {
          reply = "👋 Hello! I'm your AI assistant. How can I help you today?";
          updates.greeted_until = new Date(now.getTime() + 12*60*60*1000).toISOString();
        } else {
          reply = "Hello again! What can I help you with?";
        }
        break;

      case 'meeting':
        reply = `📅 You can book a time here: ${process.env.CALENDLY_LINK}`;
        break;

      case 'form':
        if (!mem.form_cooldown_until || new Date(mem.form_cooldown_until) < now) {
          reply = `📝 Please fill out this form: ${process.env.FORM_URL}`;
          updates.form_cooldown_until = new Date(now.getTime() + 60*60*1000).toISOString();
        } else {
          reply = "I already sent you the form above! ☝️";
        }
        break;

      case 'escalate':
        reply = "Connecting you to a human agent now... 👤";
        await escalateToHuman(binder_id);
        updates.escalation_until = new Date(now.getTime() + 10*60*1000).toISOString();
        break;

      default: 
        reply = await searchKnowledgeBase(message, supabase);
    }

    // 4. Send reply
    if (reply) await sendToMoxo(binder_id, reply);

    // 5. Update Memory
    await supabase.from('customer_memory').upsert({
      binder_id,
      email: user?.email,
      ...updates,
      last_seen: now.toISOString()
    });

    return res.status(200).json({ success: true, intent });

  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error.message });
  }
}

// Search PDFs using local embeddings (384 dimensions)
async function searchKnowledgeBase(question, supabase) {
  // Use Hugging Face Inference API for embeddings (free tier)
  // Alternative: Use the same sentence-transformers model locally if you want
  
  const hfRes = await fetch('https://api-inference.huggingface.co/pipeline/feature-extraction/sentence-transformers/all-MiniLM-L6-v2', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.HF_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ 
      inputs: question,
      options: { wait_for_model: true }
    })
  });
  
  if (!hfRes.ok) {
    return "I'm having trouble searching my knowledge base. Let me connect you with a human.";
  }
  
  const embeddingData = await hfRes.json();
  const vector = Array.isArray(embeddingData[0]) ? embeddingData[0] : embeddingData;

  // Search Supabase
  const { data: docs } = await supabase.rpc('match_documents', {
    query_embedding: vector,
    match_threshold: 0.7,
    match_count: 3
  });

  if (!docs || docs.length === 0) {
    return "I don't have information about that. Would you like me to connect you with a human agent?";
  }

  // Generate answer with Groq (FREE)
  const context = docs.map(d => d.content).join('\n\n');
  
  const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'llama-3.1-8b-instant',
      messages: [
        { role: 'system', content: `Answer based on this context:\n${context}\n\nIf the answer isn't in the context, say you don't know.` },
        { role: 'user', content: question }
      ]
    })
  });
  
  const groqData = await groqRes.json();
  return groqData.choices[0].message.content;
}

// Send message to Moxo
async function sendToMoxo(binderId, text) {
  const crypto = await import('crypto');
  
  const timestamp = Date.now().toString();
  const message = process.env.MOXO_CLIENT_ID + process.env.MOXO_ORG_ID + timestamp;
  const signature = crypto.createHmac('sha256', process.env.MOXO_CLIENT_SECRET)
    .update(message).digest('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

  const tokenRes = await fetch(`https://${process.env.MOXO_DOMAIN}/v1/apps/token?client_id=${process.env.MOXO_CLIENT_ID}&org_id=${process.env.MOXO_ORG_ID}&timestamp=${timestamp}&signature=${encodeURIComponent(signature)}`);
  const tokenData = await tokenRes.json();

  await fetch(`https://${process.env.MOXO_DOMAIN}/v1/${binderId}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${tokenData.access_token}`
    },
    body: JSON.stringify({ message: { text, action: 'chat' } })
  });
}

// Escalate to human (from your PDF Page 8)
async function escalateToHuman(binderId) {
  const crypto = await import('crypto');
  const timestamp = Date.now().toString();
  const message = process.env.MOXO_CLIENT_ID + process.env.MOXO_ORG_ID + timestamp;
  const signature = crypto.createHmac('sha256', process.env.MOXO_CLIENT_SECRET)
    .update(message).digest('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    
  const tokenRes = await fetch(`https://${process.env.MOXO_DOMAIN}/v1/apps/token?client_id=${process.env.MOXO_CLIENT_ID}&org_id=${process.env.MOXO_ORG_ID}&timestamp=${timestamp}&signature=${encodeURIComponent(signature)}`);
  const tokenData = await tokenRes.json();
  
  await fetch(`https://${process.env.MOXO_DOMAIN}/v1/acd/${binderId}/bots`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${tokenData.access_token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ status: 'ROUTING_STATUS_OPEN' })
  });
}

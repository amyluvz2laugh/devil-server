const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

// ============================================
// HEALTH CHECK ROUTE
// ============================================
app.get('/', (req, res) => {
  res.json({ 
    status: 'alive', 
    message: 'Devil Muse server is breathing',
    timestamp: new Date().toISOString()
  });
});

// ============================================
// DEVIL POV ROUTE
// ============================================
app.post('/devil-pov', async (req, res) => {
  try {
    console.log("😈 Devil POV request received");
    
    const { 
      previousChapter, 
      characterContext, 
      chatHistory, 
      characterName,
      toneTags 
    } = req.body;
    
    if (!previousChapter) {
      return res.status(400).json({ error: "No chapter provided" });
    }
    
    // Get API key from environment variable
    const apiKey = process.env.OPENROUTER_API_KEY;
    
    if (!apiKey) {
      console.error("❌ No API key found in environment");
      return res.status(500).json({ error: "API key not configured" });
    }
    
    // Build system prompt
    let systemPrompt = `You are ${characterName || 'the antagonist'}, a dark and complex character. 

Write from YOUR perspective in response to what the author just wrote. Be DARK, VISCERAL, and UNAPOLOGETICALLY YOURSELF. Show your motivations, your twisted logic, your desires. Make the reader uncomfortable. Make them understand you even as they fear you.`;

    if (characterContext) {
      systemPrompt += `\n\nYOUR CORE PERSONALITY:\n${characterContext}`;
    }
    
    if (chatHistory && chatHistory.length > 0) {
      systemPrompt += `\n\nCONVERSATIONS WITH AUTHOR:\n`;
      chatHistory.forEach((chat, idx) => {
        systemPrompt += `\n[Session ${idx + 1}]\n`;
        chat.messages?.slice(-5).forEach(msg => {
          systemPrompt += `${msg.type === 'user' ? 'AUTHOR' : 'YOU'}: ${msg.text}\n`;
        });
      });
    }
    
    if (toneTags && toneTags.length > 0) {
      systemPrompt += `\n\nTone: ${toneTags.join(', ')}`;
    }
    
    systemPrompt += `\n\nWrite ONLY the chapter from your POV. No explanations, no meta-commentary. Pure character voice.`;
    
    console.log("📊 System prompt length:", systemPrompt.length, "chars");
    
    // Call OpenRouter API
    console.log("🤖 Calling AI...");
    const aiResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://your-wix-site.com',
        'X-Title': 'Devil Muse'
      },
      body: JSON.stringify({
        model: 'anthropic/claude-3-haiku', // Fast model
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Author wrote:\n\n${previousChapter}\n\nYour response:` }
        ],
        temperature: 0.9,
        max_tokens: 2000
      })
    });
    
    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error("❌ AI API error:", errorText);
      return res.status(500).json({ error: `AI API failed: ${aiResponse.status}` });
    }
    
    const data = await aiResponse.json();
    const result = data.choices[0].message.content;
    
    console.log("✅ AI responded, length:", result.length, "chars");
    
    res.json({
      status: 'success',
      result: result,
      charsGenerated: result.length
    });
    
  } catch (err) {
    console.error("❌ Devil POV error:", err);
    res.status(500).json({ 
      error: 'Devil Muse choked',
      details: err.message 
    });
  }
});

// ============================================
// START SERVER
// ============================================
const PORT = process.env.PORT || 3333;
app.listen(PORT, () => {
  console.log(`🔥 Devil Muse listening on port ${PORT}`);
  console.log(`   API Key configured: ${process.env.OPENROUTER_API_KEY ? 'YES ✅' : 'NO ❌'}`);
});


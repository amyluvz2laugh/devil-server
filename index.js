const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

// Wix API configuration
const WIX_API_KEY = process.env.WIX_API_KEY;
const WIX_ACCOUNT_ID = process.env.WIX_ACCOUNT_ID;
const WIX_SITE_ID = process.env.WIX_SITE_ID;

// Model configuration
const PRIMARY_MODEL = "deepseek/deepseek-chat-v3.1";
const BACKUP_MODEL = "deepseek/deepseek-v3.2";
const TERTIARY_MODEL = "mistralai/mistral-large";

// ============================================
// AI CALL WITH FALLBACK
// ============================================
async function callAI(messages, temperature = 0.9, maxTokens = 2500) {
  const models = [PRIMARY_MODEL, BACKUP_MODEL, TERTIARY_MODEL];
  const apiKey = process.env.OPENROUTER_API_KEY;
  
  if (!apiKey) {
    throw new Error("No API key configured");
  }
  
  for (const model of models) {
    try {
      console.log(`🤖 Trying model: ${model}`);
      
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'HTTP-Referer': 'https://your-wix-site.com',
          'X-Title': 'Devil Muse'
        },
        body: JSON.stringify({
          model: model,
          messages: messages,
          temperature: temperature,
          max_tokens: maxTokens
        })
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`❌ ${model} failed:`, errorText);
        continue;
      }
      
      const data = await response.json();
      console.log(`✅ Success with ${model}`);
      return data.choices[0].message.content;
      
    } catch (error) {
      console.error(`❌ ${model} error:`, error.message);
      continue;
    }
  }
  
  throw new Error("All models failed");
}

// ============================================
// HEALTH CHECK
// ============================================
app.get('/', (req, res) => {
  res.json({ 
    status: 'alive', 
    message: 'Devil Muse server is breathing',
    timestamp: new Date().toISOString()
  });
});

// ============================================
// DEVIL POV - FULL CONTEXT VERSION
// ============================================
app.post('/devil-pov', async (req, res) => {
  try {
    console.log("👿 Devil POV request received");
    const startTime = Date.now();
    
    const { 
      previousChapter,
      characterContext,      // Character personality from chatbot field
      chatHistory,           // Array of chat sessions
      relatedChapters,       // Array of related chapter summaries
      characterName,
      characterTags,
      storyTags,
      toneTags
    } = req.body;
    
    if (!previousChapter) {
      return res.status(400).json({ error: "No chapter provided" });
    }
    
    // ============================================
    // BUILD SYSTEM PROMPT
    // ============================================
    const characterTraits = characterTags?.length > 0 ? `Character traits: ${characterTags.join(', ')}` : '';
    const storyContext = storyTags?.length > 0 ? `Story: ${storyTags.join(', ')}` : '';
    const toneContext = toneTags?.length > 0 ? `Tone: ${toneTags.join(', ')}` : '';
    
    let systemPrompt = `You are ${characterName || 'the antagonist'}, a dark and complex character. 

Write from YOUR perspective in response to what the author just wrote. Be DARK, VISCERAL, and UNAPOLOGETICALLY YOURSELF. Show your motivations, your twisted logic, your desires. Make the reader uncomfortable. Make them understand you even as they fear you.

${characterTraits}
${storyContext}
${toneContext}`;

    // Add character personality
    if (characterContext) {
      systemPrompt += `\n\nYOUR CORE PERSONALITY:\n${characterContext}`;
    }
    
    // Add related chapters
    if (relatedChapters && relatedChapters.length > 0) {
      systemPrompt += `\n\nRELATED CHAPTERS FROM THIS STORY:\n`;
      relatedChapters.forEach(ch => {
        systemPrompt += `[${ch.title}]\n${ch.content}\n\n`;
      });
    }
    
    // Add chat history
    if (chatHistory && chatHistory.length > 0) {
      systemPrompt += `\n\nCONVERSATIONS THE AUTHOR HAS HAD WITH YOU:\n`;
      chatHistory.forEach((session, idx) => {
        systemPrompt += `\n[Session ${idx + 1}]\n`;
        session.messages?.slice(-5).forEach(msg => {
          systemPrompt += `${msg.type === 'user' ? 'AUTHOR' : 'YOU'}: ${msg.text}\n`;
        });
      });
    }
    
    systemPrompt += `\n\nWrite ONLY the chapter from your POV. No explanations, no meta-commentary. Pure character voice. This is YOUR response to what just happened.`;
    
    console.log("📊 Context length:", systemPrompt.length, "chars");
    
    // ============================================
    // CALL AI
    // ============================================
    console.log("🤖 Calling AI...");
    const aiStart = Date.now();
    
    const result = await callAI([
      { role: "system", content: systemPrompt },
      { role: "user", content: `This is what the author just wrote:\n\n${previousChapter}\n\nNow write YOUR response to these events from your twisted perspective:` }
    ], 0.9, 2500);
    
    console.log(`✅ AI responded in ${Date.now() - aiStart}ms`);
    console.log(`🎉 Total time: ${Date.now() - startTime}ms`);
    
    res.json({
      status: 'success',
      result: result,
      charsGenerated: result.length,
      processingTime: Date.now() - startTime
    });
    
  } catch (err) {
    console.error("❌ Devil POV error:", err);
    res.status(500).json({ 
      error: 'Devil POV failed',
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
  console.log(`   Models: ${PRIMARY_MODEL}, ${BACKUP_MODEL}, ${TERTIARY_MODEL}`);
  console.log(`   API Key configured: ${process.env.OPENROUTER_API_KEY ? 'YES ✅' : 'NO ❌'}`);
});


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
          'HTTP-Referer': 'https://amygonzalez305.wixsite.com/the-draft-reaper/devil-muse-server',
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
// QUERY WIX CMS
// ============================================
async function queryWixCMS(collection, filter = {}, limit = 10) {
  try {
    console.log(`🔍 Querying Wix collection: ${collection}`);
    
    const response = await fetch(`https://www.wixapis.com/wix-data/v2/items/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': WIX_API_KEY,
        'wix-site-id': WIX_SITE_ID,
        'wix-account-id': WIX_ACCOUNT_ID
      },
      body: JSON.stringify({
        dataCollectionId: collection,
        query: {
          filter: filter,
          sort: [],
          paging: { limit: limit }
        }
      })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ Wix API error for ${collection}:`, errorText);
      return { items: [] };
    }
    
    const data = await response.json();
    console.log(`✅ Found ${data.dataItems?.length || 0} items in ${collection}`);
    return { items: data.dataItems || [] };
    
  } catch (error) {
    console.error(`❌ Error querying ${collection}:`, error);
    return { items: [] };
  }
}

// ============================================
// GET CHARACTER CONTEXT FROM WIX
// ============================================
async function getCharacterContext(characterTags) {
  if (!characterTags || characterTags.length === 0) {
    return "";
  }
  
  const charTag = Array.isArray(characterTags) ? characterTags[0] : characterTags;
  console.log("👤 Fetching character:", charTag);
  
  const result = await queryWixCMS("Characters", {
    charactertags: { $eq: charTag }
  }, 1);
  
  if (result.items.length > 0) {
    const personality = result.items[0].data?.chatbot || "";
    console.log("✅ Character personality:", personality ? "YES" : "NO");
    return personality;
  }
  
  return "";
}

// ============================================
// GET CHAT HISTORY FROM WIX
// ============================================
// ============================================
// GET CHAT HISTORY FROM WIX - ONLY THIS CHARACTER (REFERENCE FIELD)
// ============================================
async function getChatHistory(characterTags) {
  if (!characterTags || characterTags.length === 0) {
    return [];
  }
  
  const charTag = Array.isArray(characterTags) ? characterTags[0] : characterTags;
  console.log("💬 Step 1: Finding Character ID for tag:", charTag);
  
  // First, get the character's _id from the Characters collection
  const characterResult = await queryWixCMS("Characters", {
    charactertags: { $eq: charTag }
  }, 1);
  
  if (characterResult.items.length === 0) {
    console.log("❌ Character not found in Characters collection");
    return [];
  }
  
  const characterId = characterResult.items[0]._id;
  console.log("✅ Found Character ID:", characterId);
  
  // Now query ChatWithCharacters using the reference ID
  console.log("💬 Step 2: Fetching chats for Character ID:", characterId);
  
  const result = await queryWixCMS("ChatWithCharacters", {
    character: { $eq: characterId }  // Use the _id, not the tag
  }, 5);
  
  if (result.items.length > 0) {
    console.log(`✅ Found ${result.items.length} chat sessions for this character`);
    
    const chatHistory = result.items.map(item => {
      try {
        const chatBox = item.data?.chatBox;
        const messages = typeof chatBox === 'string' ? JSON.parse(chatBox) : chatBox;
        return { messages: messages || [] };
      } catch (e) {
        return { messages: [] };
      }
    });
    
    return chatHistory;
  }
  
  console.log("⚠️ No chat history found for this character");
  return [];
}

// ============================================
// GET RELATED CHAPTERS FROM WIX
// ============================================
async function getRelatedChapters(storyTags) {
  if (!storyTags || storyTags.length === 0) {
    return [];
  }
  
  const storyTag = Array.isArray(storyTags) ? storyTags[0] : storyTags;
  console.log("📚 Fetching chapters with tag:", storyTag);
  
  const result = await queryWixCMS("BackupChapters", {
    storyTag: { $eq: storyTag }
  }, 3);
  
  if (result.items.length > 0) {
    console.log(`✅ Found ${result.items.length} related chapters`);
    
    const chapters = result.items.map(item => ({
      title: item.data?.title || "Untitled",
      content: (item.data?.chapterContent || "").substring(0, 1500)
    }));
    
    return chapters;
  }
  
  return [];
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
// DEVIL POV - WITH FULL CONTEXT FROM WIX
// ============================================
app.post('/devil-pov', async (req, res) => {
  try {
    console.log("👿 Devil POV - Full context mode");
    const startTime = Date.now();
    
    const {
      previousChapter,
      characterName,
      characterTags,
      storyTags,
      toneTags
    } = req.body;
    
    if (!previousChapter) {
      return res.status(400).json({ error: "No chapter provided" });
    }
    
    // ============================================
    // FETCH ALL CONTEXT FROM WIX IN PARALLEL
    // ============================================
    console.log("🔍 Fetching context from Wix CMS...");
    const contextStart = Date.now();
    
    const [characterContext, chatHistory, relatedChapters] = await Promise.all([
      getCharacterContext(characterTags),
      getChatHistory(characterTags),
      getRelatedChapters(storyTags)
    ]);
    
    console.log(`✅ Context fetched in ${Date.now() - contextStart}ms`);
    
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
    if (relatedChapters.length > 0) {
      systemPrompt += `\n\nRELATED CHAPTERS FROM THIS STORY:\n`;
      relatedChapters.forEach(ch => {
        systemPrompt += `[${ch.title}]\n${ch.content}\n\n`;
      });
    }
    
    // Add chat history
    if (chatHistory.length > 0) {
      systemPrompt += `\n\nCONVERSATIONS THE AUTHOR HAS HAD WITH YOU:\n`;
      chatHistory.forEach((session, idx) => {
        systemPrompt += `\n[Session ${idx + 1}]\n`;
        session.messages?.slice(-5).forEach(msg => {
          systemPrompt += `${msg.type === 'user' ? 'AUTHOR' : 'YOU'}: ${msg.text}\n`;
        });
      });
    }
    
    systemPrompt += `\n\nWrite ONLY the chapter from your POV. No explanations, no meta-commentary. Pure character voice. This is YOUR response to what just happened.`;
    
    console.log("📊 Context summary:");
    console.log("   Total prompt length:", systemPrompt.length, "chars");
    console.log("   Character personality:", characterContext ? "YES" : "NO");
    console.log("   Chat history:", chatHistory.length, "sessions");
    console.log("   Related chapters:", relatedChapters.length);
    
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
      processingTime: Date.now() - startTime,
      contextUsed: {
        characterPersonality: !!characterContext,
        chatSessions: chatHistory.length,
        relatedChapters: relatedChapters.length
      }
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
// INTEL SEARCH ENDPOINT - NEW!
// ============================================
app.post('/api/search', async (req, res) => {
  try {
    const { characterTags, storyTags, catalystTags } = req.body;
    
    console.log('🔍 Intel Search Request:', { characterTags, storyTags, catalystTags });
    
    const results = {
      characters: [],
      chapters: [],
      chats: [],
      catalysts: []
    };
    
    // Search Characters
    if (characterTags) {
      const charResult = await queryWixCMS("Characters", {
        charactertags: { $eq: characterTags }
      }, 100);
      results.characters.push(...charResult.items.map(item => item.data));
    }
    
    // Search Chapters
    if (storyTags) {
      const chapterResult = await queryWixCMS("BackupChapters", {
        storyTag: { $eq: storyTags }
      }, 100);
      results.chapters.push(...chapterResult.items.map(item => item.data));
    }
    
    // Search Chats
    if (characterTags) {
      const chatResult = await queryWixCMS("ChatWithCharacters", {
        character: { $eq: characterTags }
      }, 100);
      results.chats.push(...chatResult.items.map(item => item.data));
    }
    
    // Search Catalysts
    if (catalystTags) {
      const catalystResult = await queryWixCMS("Characters", {
        toneTags: { $eq: catalystTags }
      }, 100);
      results.catalysts.push(...catalystResult.items.map(item => item.data));
    }
    
    res.json(results);
    
  } catch (error) {
    console.error('❌ Search error:', error);
    res.status(500).json({ error: error.message });
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



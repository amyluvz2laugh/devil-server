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
const PRIMARY_MODEL = "meta/muse-spark-1.3";
const BACKUP_MODEL = "deepseek/deepseek-v3.2";
const TERTIARY_MODEL = "mistralai/mistral-large";

// ============================================
// AI CALL WITH FALLBACK
// ============================================
async function callAI(messages, temperature = 0.85-0.95, maxTokens = 3500) {
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
    const personality = result.items[0].data?.bloodlineOriginsghostOrigin || result.items[0].data?.chatbot || "";
    console.log("✅ Character personality:", personality ? "YES" : "NO");
    return personality;
  }
  
  return "";
}

// ============================================
// GET CHAT HISTORY FROM WIX
// ============================================
async function getChatHistory(characterTags) {
  if (!characterTags) {
    console.log("❌ No characterTags provided");
    return [];
  }
  
  const charTag = Array.isArray(characterTags) ? characterTags[0] : characterTags;
  console.log("💬 Fetching chat history for character tag:", charTag);
  
  // Query ChatWithCharacters by charactertags field (NOT the reference field)
  const result = await queryWixCMS("ChatWithCharacters", {
    charactertags: { $eq: charTag }
  }, 5);
  
  console.log(`📊 Found ${result.items.length} chat sessions for character tag: ${charTag}`);
  
  if (result.items.length > 0) {
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
  
  const result = await queryWixCMS("Chapters", {
    storyTag: { $eq: storyTag }
  }, 20);

  if (result.items.length > 0) {
    console.log(`✅ Found ${result.items.length} related chapters`);

    const chapters = result.items.map((item, i) => ({
      title: `Chapter ${i + 1}`,
      content: (item.data?.summary || "").substring(0, 800)
    }));

    return chapters;
  }
  
  return [];
}

// ============================================
// GET CATALYST INTEL FROM WIX
// ============================================
async function getCatalystIntel(catalystTags) {
  if (!catalystTags || catalystTags.length === 0) {
    return "";
  }
  
  const catalystTag = Array.isArray(catalystTags) ? catalystTags[0] : catalystTags;
  console.log("⚡ Fetching catalyst intel:", catalystTag);
  
  const result = await queryWixCMS("Catalyst", {
    title: { $contains: catalystTag }
  }, 1);
  
  if (result.items.length > 0) {
    const catalystData = result.items[0].data;
    const catalystInfo = JSON.stringify(catalystData, null, 2);
    console.log("✅ Catalyst intel:", catalystInfo ? "YES" : "NO");
    return catalystInfo;
  }
  
  console.log("⚠️ No catalyst intel found for this tag");
  return "";
}

// ============================================
// CLEAN WIX ITEM DATA (strips system fields + empties)
// ============================================
function cleanItemData(data = {}) {
  const skip = ['_id', '_owner', '_createdDate', '_updatedDate'];
  const cleaned = {};
  for (const [key, value] of Object.entries(data)) {
    if (skip.includes(key)) continue;
    if (value === undefined || value === null || value === "") continue;
    if (Array.isArray(value) && value.length === 0) continue;
    cleaned[key] = value;
  }
  return cleaned;
}

// ============================================
// GET WRAITH RECORD FROM WIX
// ============================================
async function getWraithRecordTags(wraithTags) {
  if (!wraithTags || wraithTags.length === 0) {
    return "";
  }

  const tags = (Array.isArray(wraithTags) ? wraithTags : [wraithTags]).filter(Boolean);
  console.log("👻 Fetching wraith record:", tags);

  const fields = ["locationTag", "ritualTag", "symboltag"];
  const conditions = [];
  tags.forEach(tag => {
    fields.forEach(field => {
      conditions.push({ [field]: { $contains: tag } });
    });
  });

  const result = await queryWixCMS("WraithRecords", { $or: conditions }, 3);

  if (result.items.length > 0) {
    const wraithInfo = result.items
      .map(item => JSON.stringify(cleanItemData(item.data), null, 2))
      .join("\n\n");
    console.log(`✅ Wraith record: ${result.items.length} found`);
    return wraithInfo;
  }

  console.log("⚠️ No wraith record found for these tags");
  return "";
}

// ============================================
// GET LOREBOOK FROM WIX
// ============================================
async function getLorebookTags(loreTags) {
  if (!loreTags || loreTags.length === 0) {
    return "";
  }

  const tags = (Array.isArray(loreTags) ? loreTags : [loreTags]).filter(Boolean);
  console.log("📖 Fetching lorebook entries:", tags);

  const fields = ["orgTag", "bloodlinesTag", "lawTag", "magicTag", "secretsTag", "mythTag"];
  const conditions = [];
  tags.forEach(tag => {
    fields.forEach(field => {
      conditions.push({ [field]: { $contains: tag } });
    });
  });

  const result = await queryWixCMS("Lorebook", { $or: conditions }, 5);

  if (result.items.length > 0) {
    const loreInfo = result.items
      .map(item => JSON.stringify(cleanItemData(item.data), null, 2))
      .join("\n\n");
    console.log(`✅ Lorebook: ${result.items.length} entries found`);
    return loreInfo;
  }

  console.log("⚠️ No lorebook entries found for these tags");
  return "";
}

// ============================================
// UPDATED DEVIL POV - WITH CATALYST CONTEXT
// ============================================

app.post('/devil-pov', async (req, res) => {
  try {
    console.log("👿 Devil POV - Full context mode");
    const startTime = Date.now();

    const {
      characterName,
      characterTags,
      storyTags,
      toneTags,
      catalystTags
    } = req.body;

    // Accept either casing from the frontend
    const wraithTags = req.body.wraithTags || req.body.WraithTags || [];
    const loreTags = req.body.loreTags || req.body.LoreTags || [];

    // ============================================
    // FETCH ALL CONTEXT FROM WIX IN PARALLEL
    // ============================================
    console.log("🔍 Fetching context from Wix CMS...");
    const contextStart = Date.now();

    const [characterContext, chatHistory, relatedChapters, catalystIntel, wraithRecord, loreIntel] = await Promise.all([
      getCharacterContext(characterTags),
      getChatHistory(characterTags),
      getRelatedChapters(storyTags),
      getCatalystIntel(catalystTags),
      getWraithRecordTags(wraithTags),
      getLorebookTags(loreTags)
    ]);

    console.log(`✅ Context fetched in ${Date.now() - contextStart}ms`);

    // ============================================
    // BUILD SYSTEM PROMPT
    // ============================================
    const toList = (tags) => Array.isArray(tags) ? tags.join(', ') : tags;

    const characterTraits = characterTags?.length > 0 ? `Character traits: ${toList(characterTags)}` : '';
    const storyContext = storyTags?.length > 0 ? `Story: ${toList(storyTags)}` : '';
    const toneContext = toneTags?.length > 0 ? `Tone: ${toList(toneTags)}` : '';
    const wraithContext = wraithTags?.length > 0 ? `Wraith Record: ${toList(wraithTags)}` : '';
    const loreContext = loreTags?.length > 0 ? `Lorebook: ${toList(loreTags)}` : '';

    let systemPrompt = `You are ${characterName || 'the antagonist'}, a dark and complex character.

${characterTraits}
${storyContext}
${toneContext}
${wraithContext}
${loreContext}`;

    // Add character personality
    if (characterContext) {
      systemPrompt += `\n\nYOUR CORE PERSONALITY:\n${characterContext}`;
    }

    // Add wraith record
    if (wraithRecord) {
      systemPrompt += `\n\nWRAITH RECORD (locations, rituals, symbols - treat as canon):\n${wraithRecord}`;
    }

    // Add lorebook
    if (loreIntel) {
      systemPrompt += `\n\nLOREBOOK (world canon - do not contradict):\n${loreIntel}`;
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

// ============================================
// CATALYST ENFORCEMENT - THIS IS NON-NEGOTIABLE
// ============================================
let userPrompt = `Write the next chapter from your twisted perspective, picking up from where the story left off - aiming for 1200 words maximum and dropping at a cliff hanger.

Be DARK, VISCERAL, and UNAPOLOGETICALLY YOURSELF. Show your motivations, your twisted logic, your desires. Make the reader uncomfortable. Make them understand you even as they fear you.

Write ONLY the chapter from your POV. No explanations, no meta-commentary. Pure character voice.`;

if (catalystIntel) {
  userPrompt = `MANDATORY STORY BEATS - YOU MUST FOLLOW THESE EXACTLY:
${catalystIntel}

Now write the next chapter from your twisted perspective. You MUST hit the beats specified above. Do not deviate from the catalyst structure. Do not add your own beats or skip any required beats.

Be DARK, VISCERAL, and UNAPOLOGETICALLY YOURSELF in HOW you execute these beats, but the WHAT (the beats themselves) is non-negotiable.

Write ONLY the chapter from your POV. No explanations, no meta-commentary. Pure character voice executing the required narrative beats.`;

  console.log("⚡ CATALYST ENFORCED - Beats are mandatory");
}

    console.log("📊 Context summary:");
    console.log("   Total prompt length:", systemPrompt.length, "chars");
    console.log("   Character personality:", characterContext ? "YES" : "NO");
    console.log("   Chat history:", chatHistory.length, "sessions");
    console.log("   Related chapters:", relatedChapters.length);
    console.log("   Catalyst intel:", catalystIntel ? "ENFORCED ⚡" : "NO");
    console.log("   Wraith record:", wraithRecord ? "YES" : "NO");
    console.log("   Lorebook:", loreIntel ? "YES" : "NO");

    // ============================================
    // CALL AI
    // ============================================
    console.log("🤖 Calling AI...");
    const aiStart = Date.now();

    const result = await callAI([
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ], 0.7, 2500);

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
        relatedChapters: relatedChapters.length,
        catalystIntel: !!catalystIntel,
        catalystEnforced: !!catalystIntel,
        wraithRecord: !!wraithRecord,
        loreIntel: !!loreIntel
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
// START SERVER
// ============================================
const PORT = process.env.PORT || 3333;
app.listen(PORT, () => {
  console.log(`🔥 Devil Muse listening on port ${PORT}`);
  console.log(`   Models: ${PRIMARY_MODEL}, ${BACKUP_MODEL}, ${TERTIARY_MODEL}`);
  console.log(`   API Key configured: ${process.env.OPENROUTER_API_KEY ? 'YES ✅' : 'NO ❌'}`);
});










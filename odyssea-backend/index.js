import { exec } from "child_process";
import cors from "cors";
import dotenv from "dotenv";
import say from "say";
import express from "express";
import { promises as fs } from "fs";
import ModelClient, { isUnexpected } from "@azure-rest/ai-inference";
import { AzureKeyCredential } from "@azure/core-auth";
import fetch from "node-fetch"; // ✅ Needed for ElevenLabs API calls

dotenv.config();

const azureToken = process.env.GITHUB_TOKEN;
const elevenLabsApiKey = process.env.ELEVEN_LABS_API_KEY; // ✅ Added
const azureEndpoint = "https://models.github.ai/inference";
const azureModel = "openai/gpt-4.1-mini";

const app = express();
app.use(express.json());
app.use(cors());
const port = 3000;

app.get("/", (req, res) => {
  res.send("Hello World!");
});

const execCommand = (command) => {
  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
      if (error) reject(error);
      resolve(stdout);
    });
  });
};

const lipSyncMessage = async (messageIndex) => {
  const time = new Date().getTime();
  console.log(`Starting lipsync for message ${messageIndex}`);
  await execCommand(
    `bin\\rhubarb.exe -f json -o audios\\message_${messageIndex}.json audios\\message_${messageIndex}.wav -r phonetic`
  );
  console.log(`Lip sync done in ${new Date().getTime() - time}ms`);
};

// 🟢 ElevenLabs TTS
const generateElevenLabsTTS = async (text, fileName) => {
  try {
    console.log(`Generating ElevenLabs TTS for: "${text}"`);

    const voiceId = "Rachel"; // ✅ You can change to any ElevenLabs voice name or ID
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: "POST",
      headers: {
        "xi-api-key": elevenLabsApiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text,
        model_id: "eleven_multilingual_v2", // multilingual & high quality
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.8,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`ElevenLabs API error: ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    await fs.writeFile(fileName, Buffer.from(arrayBuffer));
    console.log(`✅ ElevenLabs TTS saved to ${fileName}`);
    return true;
  } catch (error) {
    console.error(`❌ ElevenLabs TTS failed: ${error.message}`);
    return false;
  }
};

// 🟡 Fallback to system voice
const generateSystemTTS = async (text, fileName) => {
  try {
    console.log(`Using fallback system TTS for: "${text}"`);
    const femaleVoice = "Microsoft Zira Desktop";
    await new Promise((resolve, reject) => {
      say.export(text, femaleVoice, 1.0, fileName, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    console.log(`System TTS successful for: "${text}"`);
    return true;
  } catch (error) {
    console.error(`System TTS failed: ${error.message}`);
    return false;
  }
};

// 🟣 Combined TTS (prefers ElevenLabs)
const generateTTS = async (text, fileName) => {
  if (elevenLabsApiKey) {
    const success = await generateElevenLabsTTS(text, fileName);
    if (success) return true;
  }
  console.warn("⚠️ Falling back to system TTS...");
  return await generateSystemTTS(text, fileName);
};

app.post("/chat", async (req, res) => {
  const userMessage = req.body.message;

  if (!userMessage) {
    res.send({
      messages: [
        {
          text: "Hey dear... How was your day?",
          audio: await audioFileToBase64("audios/intro_0.wav"),
          lipsync: await readJsonTranscript("audios/intro_0.json"),
          facialExpression: "smile",
          animation: "Talking_1",
        },
        {
          text: "I missed you so much... Please don't go for so long!",
          audio: await audioFileToBase64("audios/intro_1.wav"),
          lipsync: await readJsonTranscript("audios/intro_1.json"),
          facialExpression: "sad",
          animation: "Crying",
        },
      ],
    });
    return;
  }

  if (!azureToken) {
    res.send({
      messages: [
        {
          text: "Please my dear, don't forget to add your API keys!",
          audio: await audioFileToBase64("audios/api_0.wav"),
          lipsync: await readJsonTranscript("audios/api_0.json"),
          facialExpression: "angry",
          animation: "Angry",
        },
        {
          text: "You don't want to ruin Wawa Sensei with a crazy ChatGPT and ElevenLabs bill, right?",
          audio: await audioFileToBase64("audios/api_1.wav"),
          lipsync: await readJsonTranscript("audios/api_1.json"),
          facialExpression: "smile",
          animation: "Laughing",
        },
      ],
    });
    return;
  }

  const client = ModelClient(azureEndpoint, new AzureKeyCredential(azureToken));

  const response = await client.path("/chat/completions").post({
    body: {
      messages: [
        {
          role: "system",
          content: `
          You name is Emma and you are the virtual assistant for Joel Tan.  
          (same system prompt as before)
          `,
        },
        {
          role: "user",
          content: userMessage || "Hello",
        },
      ],
      temperature: 0.6,
      top_p: 1,
      model: azureModel,
    },
  });

  if (isUnexpected(response)) {
    res.status(500).send({ error: response.body.error });
    return;
  }

  let messages = JSON.parse(response.body.choices[0].message.content);
  if (messages.messages) messages = messages.messages;

  // Generate TTS + lipsync
  for (let i = 0; i < messages.length; i++) {
    const message = messages[i];
    const ttsText = message.text.replace(/https?:\/\/[^\s]+/g, "");
    const fileName = `audios/message_${i}.wav`;

    const ttsSuccess = await generateTTS(ttsText, fileName);

    if (ttsSuccess) {
      await lipSyncMessage(i);
      message.audio = await audioFileToBase64(fileName);
      message.lipsync = await readJsonTranscript(`audios/message_${i}.json`);
    } else {
      message.audio = null;
      message.lipsync = null;
    }
  }

  res.send({ messages });
});

const readJsonTranscript = async (file) => {
  const data = await fs.readFile(file, "utf8");
  return JSON.parse(data);
};

const audioFileToBase64 = async (file) => {
  const data = await fs.readFile(file);
  return data.toString("base64");
};

app.listen(port, () => {
  console.log(`Virtual Girlfriend listening on port ${port}`);
  console.log(
    elevenLabsApiKey
      ? "🎙 ElevenLabs API Key: ENABLED"
      : "⚠️ ElevenLabs API Key missing — using system TTS fallback."
  );
});

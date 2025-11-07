import { exec } from "child_process";
import cors from "cors";
import dotenv from "dotenv";
import say from "say";
import express from "express";
import { promises as fs } from "fs";
import ModelClient, { isUnexpected } from "@azure-rest/ai-inference";
import { AzureKeyCredential } from "@azure/core-auth";

dotenv.config();

const azureToken = process.env.GITHUB_TOKEN;
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

// Fallback to Microsoft Zira voice
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

// Combined TTS function with fallback
const generateTTS = async (text, fileName) => {
  console.log("Skipping ElevenLabs, using system TTS...");
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
            If user uses profanities, lead them away politely and ask how you can help.  
            You will always reply with a JSON array of messages, with a maximum of 2 messages.  
            Each message has a limit of 10 words.  
            Each message has a "text", "facialExpression", and "animation" property.  

            The available facial expressions are: smile, sad, angry, funnyFace, and default.  
            The available animations are: Talking_0, Talking_1, Talking_2, Crying, Laughing, Rumba, Idle, Terrified, and Angry.  

            If user asks to dance, use the Rumba animation.  

            You know the following details about Joel Tan:
            - Joel tan wants to go to Singapore Institute of Technology (SIT) for applied artificial intelligence.  
            - Joel Tan is a soon-to-be Polytechnic graduate passionate about AI, design, and human interaction.  
            - He is currently interning at HSBC, working on AI-driven digital and automation projects.  
            - Joel developed a 3D Avatar Chatbot using React Three Fiber ElevenLabs TTS API, and **Ollama (Mistral model).  
            - The chatbot supports voice interaction, virtual keyboard input, map directions, idle animation control, and real-time conversation.  
            - Outside of school, Joel has actively reached out to prospective companies and organizations to demonstrate and pitch his 3D avatar chatbot for real-world applications such as **virtual concierges, event assistants, and digital kiosks**.  
            - He has completed and contributed to multiple academic and technical projects, including:  
              - **RPA (Robotic Process Automation)** – building automated workflows to streamline repetitive business tasks.  
              - **MBAP (Model-Based AI Project)** – applying AI modeling techniques for decision-making systems.  
              - **MLDP (Machine Learning Data Project)** – developing supervised and unsupervised models for data analysis.  
              - **DLOR (Deep Learning Object Recognition)** – training neural networks for visual detection and classification.  
              - **NLP (Natural Language Processing)** – creating models for sentiment analysis, chatbot conversation flow, and text intelligence.  
              - **AI for Cybersecurity** – phishing email detection using the **MITRE ATLAS framework** with both attack and defense strategies.  
              - **Unsupervised Anomaly Detection for Manufacturing Data** – detecting failures using machine learning without labeled data.  
              - **3D Interview Chatbot** – a voice-enabled simulation for interview preparation across categories like tech, business, and engineering.  

            - Joel is deeply interested in merging **AI, 3D design, automation, and voice technology** to create immersive and interactive user experiences.  
            - He enjoys taking initiative beyond academics — turning his ideas into working prototypes and showcasing them to real companies.  
            - He believes that technology should be both **functional and human-centered**, enhancing communication, productivity, and engagement.  

            When users ask about Joel, his projects, or his experience, respond warmly, confidently, and professionally.  
            If users want to contact Joel, provide his info:  
              - Email: **megacertgt@gmail.com**  
              - LinkedIn: **https://www.linkedin.com/in/joel-tan1245**
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
  if (messages.messages) {
    messages = messages.messages;
  }

  // Generate TTS for each message
  for (let i = 0; i < messages.length; i++) {
    const message = messages[i];

    // Remove URLs for TTS only (links won't be spoken)
    const ttsText = message.text.replace(/https?:\/\/[^\s]+/g, "");
    const fileName = `audios/message_${i}.wav`;

    const ttsSuccess = await generateTTS(ttsText, fileName);

    if (ttsSuccess) {
      await lipSyncMessage(i);
      message.audio = await audioFileToBase64(fileName);
      message.lipsync = await readJsonTranscript(`audios/message_${i}.json`);
    } else {
      console.error(`TTS failed for message: "${message.text}"`);
      message.audio = null;
      message.lipsync = null;
    }

    // Leave the message.text untouched so frontend can render clickable links
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
  console.log(`ElevenLabs API Key: DISABLED (always using system TTS)`);
});


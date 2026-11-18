
const OLLAMA_URL = (
  process.env.OLLAMA_URL || "http://127.0.0.1:11434"
).replace(/\/$/, "");

const MODEL = process.env.OLLAMA_MODEL || "qwen3:4b";

const STYLE_GUIDES = {
  realistic:
    "Realistic cinematic storytelling, lifelike human characters, natural locations, cinematic camera angles and lighting.",
  stickman:
    "2D stickman animation, expressive simple characters, clean backgrounds, educational visual storytelling.",
  motion:
    "Modern motion graphics, animated typography, infographic elements, diagrams, icons and smooth transitions.",
  cartoon:
    "Colorful 3D cartoon storytelling, expressive characters, detailed environments and cinematic animation."
};

const LANGUAGE_GUIDES = {
  hi: "Write all story narration and dialogue in natural, fluent Hindi using Devanagari script.",
  hinglish: "Write naturally in conversational Hinglish using Roman script.",
  en: "Write all story narration and dialogue in natural English."
};

function getSceneCount(duration) {
  const counts = {
    auto: 8,
    "60": 4,
    "180": 8,
    "300": 12,
    "600": 18
  };

  return counts[String(duration)] || 8;
}

function extractJSON(content) {
  if (typeof content !== "string") {
    throw new Error("AI returned an empty response.");
  }

  let cleaned = content.trim();

  cleaned = cleaned
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/, "");

  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");

  if (start === -1 || end === -1) {
    throw new Error("AI response is not valid JSON.");
  }

  return JSON.parse(cleaned.slice(start, end + 1));
}

function normalizeStory(data, style, language) {
  if (!data || typeof data !== "object") {
    throw new Error("Invalid story response.");
  }

  if (
    typeof data.title !== "string" ||
    typeof data.story !== "string" ||
    !Array.isArray(data.scenes)
  ) {
    throw new Error("AI did not return the required story structure.");
  }

  if (data.scenes.length === 0 || data.scenes.length > 30) {
    throw new Error("AI returned an invalid number of scenes.");
  }

  const scenes = data.scenes.map((scene, index) => {
    if (!scene || typeof scene !== "object") {
      throw new Error("Invalid scene at position " + (index + 1));
    }

    return {
      sceneNumber: index + 1,
      heading: String(scene.heading || `Scene ${index + 1}`),
      narration: String(scene.narration || ""),
      visualPrompt: String(scene.visualPrompt || ""),
      onScreenText: String(scene.onScreenText || ""),
      soundEffect: String(scene.soundEffect || ""),
      durationSeconds: Math.max(
        3,
        Math.min(60, Number(scene.durationSeconds) || 8)
      )
    };
  });

  if (scenes.some(scene => !scene.narration || !scene.visualPrompt)) {
    throw new Error("Some scenes are missing narration or visual prompts.");
  }

  return {
    title: data.title.trim(),
    story: data.story.trim(),
    language,
    style,
    scenes,
    createdAt: new Date().toISOString()
  };
}

export async function checkOllama() {
  try {
    const response = await fetch(`${OLLAMA_URL}/api/tags`, {
      signal: AbortSignal.timeout(10000)
    });

    if (!response.ok) {
      return {
        connected: false,
        model: MODEL
      };
    }

    const data = await response.json();

    const models = (data.models || []).map(item => item.name);

    return {
      connected: true,
      model: MODEL,
      modelAvailable: models.some(
        name => name === MODEL || name.startsWith(MODEL + ":")
      ),
      installedModels: models
    };
  } catch {
    return {
      connected: false,
      model: MODEL
    };
  }
}

export async function generateStory({
  prompt,
  language = "hi",
  duration = "auto",
  style = "realistic"
}) {
  if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
    throw new Error("Please provide a story idea.");
  }

  if (!LANGUAGE_GUIDES[language]) {
    throw new Error("Unsupported story language.");
  }

  if (!STYLE_GUIDES[style]) {
    throw new Error("Unsupported visual style.");
  }

  const sceneCount = getSceneCount(duration);

  const systemPrompt = `
You are a professional Indian screenwriter and visual storytelling director.

Create an original, engaging and emotionally satisfying story from the user's idea.

LANGUAGE:
${LANGUAGE_GUIDES[language]}

VISUAL STYLE:
${STYLE_GUIDES[style]}

STORY REQUIREMENTS:
- Create a strong opening hook.
- Give the main character a clear goal.
- Include believable conflict and emotional moments.
- Build toward a satisfying climax and ending.
- Keep character names and appearance consistent across scenes.
- Make every scene visually interesting and suitable for video.
- Avoid repeating the same scene.
- Write natural narration suitable for text-to-speech.
- Do not include markdown or explanations outside JSON.

SCENE COUNT:
Create exactly ${sceneCount} scenes.

OUTPUT:
Return valid JSON in this structure:

{
  "title": "Story title",
  "story": "Complete story narration",
  "scenes": [
    {
      "heading": "Scene heading",
      "narration": "Voice-over narration",
      "visualPrompt": "Detailed visual description for this scene",
      "onScreenText": "Short caption",
      "soundEffect": "Suggested sound effect",
      "durationSeconds": 8
    }
  ]
}

IMPORTANT:
Return JSON only. No markdown code fences.
`;

  const userPrompt = `
Create a complete video story using this idea:

${prompt.trim()}

Target duration: ${duration}
Visual style: ${style}
Language: ${language}

Make the scenes follow a continuous story.
`;

  let response;

  try {
    response = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          {
            role: "system",
            content: systemPrompt
          },
          {
            role: "user",
            content: userPrompt
          }
        ],
        format: "json",
        stream: false,
        options: {
          temperature: 0.8,
          num_predict: 7000
        }
      }),
      signal: AbortSignal.timeout(180000)
    });
  } catch (error) {
    if (error.name === "TimeoutError") {
      throw new Error("AI generation timed out. Please try again.");
    }

    throw new Error(
      "Cannot connect to Ollama. Check the AI server connection."
    );
  }

  if (!response.ok) {
    const details = await response.text();

    throw new Error(
      `Ollama error (${response.status}): ${details.slice(0, 300)}`
    );
  }

  const result = await response.json();

  if (result.error) {
    throw new Error(result.error);
  }

  const generatedData = extractJSON(result.message?.content);

  return normalizeStory(generatedData, style, language);
}

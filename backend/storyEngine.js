
const OLLAMA_URL = (
  process.env.OLLAMA_URL || "http://127.0.0.1:11434"
).replace(/\/+$/, "");

const OLLAMA_HEADERS = {
  "Content-Type": "application/json",
  ...(process.env.OLLAMA_API_KEY
    ? { Authorization: `Bearer ${process.env.OLLAMA_API_KEY}` }
    : {})
};
const MODEL = process.env.OLLAMA_MODEL || "qwen3:4b-instruct";

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
  if (typeof content !== "string" || !content.trim()) {
    throw new Error("AI returned an empty response.");
  }

  let cleaned = content.trim();

  cleaned = cleaned
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/, "");

  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");

  if (start === -1 || end === -1 || end <= start) {
    throw new Error("AI response is not valid JSON.");
  }

  const jsonText = cleaned.slice(start, end + 1);

  try {
    return JSON.parse(jsonText);
  } catch (error) {
    throw new Error(
      "AI generated invalid JSON. Please try again with a simpler prompt."
    );
  }
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
  headers: OLLAMA_HEADERS,
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
  style = "realistic",
  mode = "story"
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

  if (!["story", "prompt"].includes(mode)) {
    throw new Error("Unsupported generation mode.");
  }

  const sceneCount = getSceneCount(duration);

  const modeInstructions = mode === "prompt"
    ? `
PROMPT MODE - STRICT INSTRUCTIONS:
- Follow the user's prompt as faithfully as possible.
- Treat the user's specified characters, locations, events,
  relationships, tone and ending as important requirements.
- Do not replace the user's main idea with a different story.
- Do not introduce unnecessary characters or unrelated events.
- Do not contradict any details supplied by the user.
- You may add only small connecting details needed to create
  coherent scenes.
- If the user specifies an ending, preserve that ending.
- Divide the requested content into exactly ${sceneCount} scenes.
- Every scene must contribute to the user's requested story.
`
    : `
STORY MODE - CREATIVE INSTRUCTIONS:
- Create an original story inspired by the user's idea.
- Create a strong opening hook.
- Give the main character a clear goal.
- Include believable conflict and emotional moments.
- Build toward a satisfying climax and ending.
- Keep character names and appearance consistent.
- Make every scene visually interesting.
- Avoid repeating the same scene.
`;

  const systemPrompt = `
You are a professional Indian screenwriter and visual storytelling director.

LANGUAGE:
${LANGUAGE_GUIDES[language]}

VISUAL STYLE:
${STYLE_GUIDES[style]}

${modeInstructions}

GENERAL REQUIREMENTS:
- Return strictly valid JSON.
- Escape all double quotes inside string values.
- Do not add trailing commas.
- Do not include comments inside JSON.
- Ensure every opening bracket has a matching closing bracket.
- Write natural narration suitable for text-to-speech.
- Keep the story coherent from beginning to end.
- Make all scenes visually suitable for video.
- Keep character appearance consistent across scenes.
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
Generation mode: ${mode}

User's idea or instructions:
${prompt.trim()}

Target duration: ${duration}
Visual style: ${style}
Language: ${language}

Create a complete video story with exactly ${sceneCount} scenes.
Make the scenes follow a continuous story.
`;

  let response;

  try {
    response = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: "POST",
      headers: OLLAMA_HEADERS,
      body: JSON.stringify({
  model: MODEL,
  think: false,
  prompt: `${systemPrompt}\n\n${userPrompt}`,
  format: "json",
  stream: false,
  options: {
    temperature: mode === "prompt" ? 0.3 : 0.7,
    num_ctx: 4096,
    num_predict: 2500
  }
}),
      signal: AbortSignal.timeout(180000)
    });
} catch (error) {
  throw new Error(
    `AI generated invalid JSON: ${error.message}`
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

  const generatedData = extractJSON(result.response);
  return normalizeStory(generatedData, style, language);
}

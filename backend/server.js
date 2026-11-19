
import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import dotenv from "dotenv";

import {
  generateStory,
  checkOllama
} from "./storyEngine.js";

dotenv.config();

const app = express();
app.set("trust proxy", 1);
const PORT = process.env.PORT || 3000;

app.use(cors({
  origin: process.env.FRONTEND_URL || "*"
}));

app.use(express.json({ limit: "1mb" }));

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: "draft-7",
  legacyHeaders: false
});

app.use("/api", apiLimiter);

app.get("/", (req, res) => {
  res.json({
    success: true,
    name: "AI Story Studio",
    message: "Backend is running!"
  });
});

app.get("/health", (req, res) => {
  res.json({
    success: true,
    status: "online",
    service: "AI Story Studio Backend",
    timestamp: new Date().toISOString()
  });
});

// Check AI engine connection
app.get("/api/story/status", async (req, res) => {
  const status = await checkOllama();

  res.json({
    success: true,
    storyEngine: status.connected ? "online" : "offline",
    ...status
  });
});

// Generate complete AI story
app.post("/api/story/generate", async (req, res) => {
  try {
    const {
  prompt,
  language = "hi",
  duration = "auto",
  style = "realistic",
  mode = "story"
} = req.body || {};

    if (typeof prompt !== "string" || !prompt.trim()) {
      return res.status(400).json({
        success: false,
        error: "Please enter a story idea."
      });
    }

    if (prompt.length > 5000) {
      return res.status(400).json({
        success: false,
        error: "Maximum prompt length is 5000 characters."
      });
    }

    const allowedLanguages = ["hi", "hinglish", "en"];
    const allowedStyles = [
      "realistic",
      "stickman",
      "motion",
      "cartoon"
    ];
    const allowedDurations = [
      "auto", "60", "180", "300", "600"
    ];
    const allowedModes = ["story", "prompt"];

    if (!allowedLanguages.includes(language)) {
      return res.status(400).json({
        success: false,
        error: "Invalid language."
      });
    }
    if (!allowedModes.includes(mode)) {
  return res.status(400).json({
    success: false,
    error: "Invalid generation mode."
  });
    }
    if (!allowedStyles.includes(style)) {
      return res.status(400).json({
        success: false,
        error: "Invalid visual style."
      });
    }

    if (!allowedDurations.includes(String(duration))) {
      return res.status(400).json({
        success: false,
        error: "Invalid video duration."
      });
    }

    const story = await generateStory({
  prompt,
  language,
  duration: String(duration),
  style,
  mode
});

    return res.json({
      success: true,
      status: "story_generated",
      message: "Your AI story is ready!",
      data: story
    });

  } catch (error) {
    console.error("Story generation error:", error.message);

    const isConnectionError =
      error.message.includes("Cannot connect to Ollama");

    return res.status(isConnectionError ? 503 : 500).json({
      success: false,
      error: error.message || "Story generation failed."
    });
  }
});

// Unknown route
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: "Route not found."
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error("Server error:", err.message);

  res.status(500).json({
    success: false,
    error: "Internal server error."
  });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`AI Story Studio running on port ${PORT}`);
});

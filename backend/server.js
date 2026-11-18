
import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Basic middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || "*"
}));

app.use(express.json({ limit: "1mb" }));

// Prevent excessive requests
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: {
    success: false,
    error: "Too many requests. Please try again later."
  }
});

app.use("/api", apiLimiter);

// Home route
app.get("/", (req, res) => {
  res.json({
    success: true,
    name: "AI Story Studio",
    message: "Backend is running!"
  });
});

// Health check
app.get("/health", (req, res) => {
  res.json({
    success: true,
    status: "online",
    service: "AI Story Studio Backend",
    timestamp: new Date().toISOString()
  });
});

// Story engine status
app.get("/api/story/status", (req, res) => {
  res.json({
    success: true,
    storyEngine: "not_connected",
    message: "AI Story Engine will be connected in the next step."
  });
});

// Story generation API
app.post("/api/story/generate", async (req, res) => {
  try {
    const { prompt, language, duration, style } = req.body || {};

    if (typeof prompt !== "string" || !prompt.trim()) {
      return res.status(400).json({
        success: false,
        error: "Please enter a story idea."
      });
    }

    if (prompt.length > 5000) {
      return res.status(400).json({
        success: false,
        error: "Story idea is too long. Maximum 5000 characters."
      });
    }

    const allowedLanguages = ["hi", "hinglish", "en"];
    const allowedStyles = [
      "realistic",
      "stickman",
      "motion",
      "cartoon"
    ];

    if (!allowedLanguages.includes(language)) {
      return res.status(400).json({
        success: false,
        error: "Invalid language selected."
      });
    }

    if (!allowedStyles.includes(style)) {
      return res.status(400).json({
        success: false,
        error: "Invalid video style selected."
      });
    }

    const allowedDurations = ["auto", "60", "180", "300", "600"];

    if (!allowedDurations.includes(String(duration))) {
      return res.status(400).json({
        success: false,
        error: "Invalid video duration."
      });
    }

    return res.status(501).json({
      success: false,
      status: "engine_not_connected",
      message: "AI Story Engine is not connected yet.",
      request: {
        prompt: prompt.trim(),
        language,
        duration,
        style
      }
    });

  } catch (error) {
    console.error("Story API Error:", error);

    return res.status(500).json({
      success: false,
      error: "Internal server error."
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
  console.error("Server Error:", err.message);

  res.status(500).json({
    success: false,
    error: "Something went wrong."
  });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`AI Story Studio running on port ${PORT}`);
});

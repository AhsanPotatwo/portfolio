const express = require("express");
const fs = require("fs");
const path = require("path");
const app = express();
const PORT = 3000;

// Middleware to parse JSON
app.use(express.json());
app.use(express.static(__dirname)); // Serve static files (index.html, etc.)

// POST route to save CSV to /sessions
app.post("/save-csv", (req, res) => {
  const { filename, content } = req.body;

  const savePath = path.join(__dirname, "sessions", filename);
  fs.writeFile(savePath, content, (err) => {
    if (err) {
      console.error("Failed to save file:", err);
      return res.status(500).send("Error saving file.");
    }
    console.log(`Saved CSV as ${filename}`);
    res.sendStatus(200);
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});

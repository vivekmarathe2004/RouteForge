const express = require("express");
const path = require("path");
const apiRoutes = require("./api");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use("/api", apiRoutes);
app.use(express.static(path.join(__dirname, "..", "public")));

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "network-lab-platform" });
});

app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "index.html"));
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Network Lab Platform running on http://localhost:${PORT}`);
  });
}

module.exports = app;

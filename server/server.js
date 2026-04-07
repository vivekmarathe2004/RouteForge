const express = require("express");
const cookieParser = require("cookie-parser");
const path = require("path");
const config = require("./config");
const apiRoutes = require("./api");

const app = express();
const PORT = config.port;

app.set("trust proxy", 1);
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

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

const fs = require("fs");
const path = require("path");

const dataDir = path.join(__dirname, "..", "data");
const labsPath = path.join(dataDir, "labs.json");
const quizPath = path.join(dataDir, "quiz-bank.json");

function readJson(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  return JSON.parse(raw.replace(/^\uFEFF/, ""));
}

function normalize(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function collectDuplicates(items, signatureFn) {
  const map = new Map();
  items.forEach((item) => {
    const signature = signatureFn(item);
    if (!signature) return;
    if (!map.has(signature)) {
      map.set(signature, []);
    }
    map.get(signature).push(item);
  });
  return Array.from(map.entries()).filter(([, list]) => list.length > 1);
}

function reportDuplicates(label, duplicates, getId) {
  if (!duplicates.length) {
    console.log(`${label}: no duplicates found.`);
    return 0;
  }

  console.log(`${label}: ${duplicates.length} duplicate signatures found.`);
  duplicates.slice(0, 10).forEach(([signature, list]) => {
    const ids = list.map((item) => getId(item)).join(", ");
    console.log(`- ${signature} -> ${ids}`);
  });
  if (duplicates.length > 10) {
    console.log(`- ... ${duplicates.length - 10} more`);
  }
  return duplicates.length;
}

const labs = readJson(labsPath);
const questions = readJson(quizPath);

const labDuplicates = collectDuplicates(labs, (lab) => {
  return normalize(`${lab.title} ${lab.scenario} ${lab.topology}`);
});

const questionDuplicates = collectDuplicates(questions, (q) => normalize(q.question));

const optionDuplicates = collectDuplicates(questions, (q) => {
  const options = Array.isArray(q.options) ? q.options.map(normalize).sort().join("|") : "";
  return normalize(`${q.question}|${options}`);
});

const labDupCount = reportDuplicates("Labs", labDuplicates, (lab) => lab.id);
const questionDupCount = reportDuplicates("Questions", questionDuplicates, (q) => q.id);
const optionDupCount = reportDuplicates("Questions (options)", optionDuplicates, (q) => q.id);

const total = labDupCount + questionDupCount + optionDupCount;
if (total > 0) {
  process.exitCode = 1;
}

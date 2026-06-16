#!/usr/bin/env node
/**
 * Usage:
 *   node scripts/bump-version.js           → versionCode +1, versionName unchanged
 *   node scripts/bump-version.js 1.1       → versionCode +1, versionName = "1.1"
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const GRADLE_PATH = path.resolve(__dirname, "../android/app/build.gradle");
const CAPACITOR_CONFIG_PATH = path.resolve(__dirname, "../capacitor.config.json");

const APK_URL_BASE = "https://download.rampxtrading.org";
const APK_URL_FILES = [
  path.resolve(__dirname, "../src/App.jsx"),
  path.resolve(__dirname, "../src/admin/components/AppUpdateManagementPage.jsx"),
  path.resolve(__dirname, "../server/index.js"),
];

function buildApkUrl(versionName, versionCode) {
  return `${APK_URL_BASE}/rampxtrading_v${versionName}_build${versionCode}_debug.apk`;
}

function updateApkUrls(nextVersionName, nextVersionCode) {
  const nextUrl = buildApkUrl(nextVersionName, nextVersionCode);
  const urlPattern = /https:\/\/download\.rampxtrading\.org\/rampxtrading[^\s"']*/g;
  for (const filePath of APK_URL_FILES) {
    const content = fs.readFileSync(filePath, "utf8");
    const updated = content.replace(urlPattern, nextUrl);
    if (updated !== content) {
      fs.writeFileSync(filePath, updated, "utf8");
    }
  }
  return nextUrl;
}

function readGradleVersion(content) {
  const codeMatch = content.match(/versionCode\s+(\d+)/);
  const nameMatch = content.match(/versionName\s+"([^"]+)"/);
  if (!codeMatch || !nameMatch) {
    throw new Error("Could not find versionCode or versionName in build.gradle");
  }
  return {
    versionCode: parseInt(codeMatch[1], 10),
    versionName: nameMatch[1],
  };
}

function main() {
  const newVersionName = process.argv[2] || null;

  const gradleContent = fs.readFileSync(GRADLE_PATH, "utf8");
  const { versionCode, versionName } = readGradleVersion(gradleContent);

  const nextVersionCode = versionCode + 1;
  const nextVersionName = newVersionName || versionName;

  // Update build.gradle
  let updatedGradle = gradleContent
    .replace(/versionCode\s+\d+/, `versionCode ${nextVersionCode}`)
    .replace(/versionName\s+"[^"]+"/, `versionName "${nextVersionName}"`);

  fs.writeFileSync(GRADLE_PATH, updatedGradle, "utf8");

  // Update capacitor.config.json
  const capacitorConfig = JSON.parse(fs.readFileSync(CAPACITOR_CONFIG_PATH, "utf8"));
  capacitorConfig.appVersion = nextVersionName;
  fs.writeFileSync(CAPACITOR_CONFIG_PATH, JSON.stringify(capacitorConfig, null, 2) + "\n", "utf8");

  // Update APK download URLs in source files
  const nextUrl = updateApkUrls(nextVersionName, nextVersionCode);

  console.log("");
  console.log("✅ Version bumped successfully!");
  console.log(`   versionCode : ${versionCode}  →  ${nextVersionCode}`);
  console.log(`   versionName : "${versionName}"  →  "${nextVersionName}"`);
  console.log("");
  console.log("📦 After building, APK will be named:");
  console.log(`   rampxtrading_v${nextVersionName}_build${nextVersionCode}_debug.apk`);
  console.log("");
  console.log("🔗 APK download URL updated to:");
  console.log(`   ${nextUrl}`);
  console.log("");
  console.log("⚙️  Admin Console এ এগুলো set করো:");
  console.log(`   latestBuildCode   = ${nextVersionCode}`);
  console.log(`   latestVersionName = "${nextVersionName}"`);
  console.log(`   APK URL           = ${nextUrl}`);
  console.log("");
}

main();

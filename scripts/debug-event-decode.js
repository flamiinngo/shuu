const anchor = require("@coral-xyz/anchor");
const fs = require("fs");

const idl = JSON.parse(fs.readFileSync("target/idl/shuu.json"));

console.log("=== EVENTS IN IDL ===");
const events = idl.events || [];
console.log("count:", events.length);
for (const ev of events) {
  console.log("- name:", JSON.stringify(ev.name), "discriminator:", ev.discriminator);
}

console.log("\n=== TYPES THAT LOOK LIKE EVENTS ===");
for (const t of (idl.types || [])) {
  if (t.name && t.name.toLowerCase().includes("event")) {
    console.log("- type name:", JSON.stringify(t.name));
  }
}

console.log("\n=== TRY DECODING THE CALLBACK EVENT ===");
const eventCoder = new anchor.BorshEventCoder(idl);
const dataLines = [
  // Lines from the failing tx 3TfWGS5dLR46m...
  "m9Xun/BMpxNd0TfZnQEAABALMPBSnTDYCyuoMrHqrDfThoyQYmqL9f/A1xxsPUZv",
  "G0t13b/V/fld0TfZnQEAABALMPBSnTDYCyuoMrHqrDfThoyQYmqL9f/A1xxsPUZvAA==",
  "/LQd0KMSE+PGzuo7a8ufIbtdluaSZLfJK6UpK0Ubc7TkDj2YxW4niHbGy6f4lYow4DQkFsO6vCX23+cA1l6FGGMga9B6ZXNFDw5UVIDUn822l/P4AK9WsKDXCRp72gMzykdyXeue4ykutZ0Qf5AyRpo2tFJvEEJJ",
];

for (const line of dataLines) {
  console.log("\nTrying:", line.slice(0, 30) + "...");
  try {
    const ev = eventCoder.decode(line);
    if (ev) {
      console.log("  ✓ decoded! name =", JSON.stringify(ev.name));
      console.log("  data keys:", Object.keys(ev.data || {}));
    } else {
      console.log("  ✗ decode returned null/undefined");
    }
  } catch (e) {
    console.log("  ✗ throw:", e.message);
  }
}

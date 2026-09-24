// Turns the single-file demo build (dist-demo/index.html) into a page body
// for a Claude Artifact: the Artifact adds its own <html>/<head>/<body>, so
// we keep only the title, the inlined script and styles, and the app root.
import fs from "node:fs";

const html = fs.readFileSync("dist-demo/index.html", "utf8");
const head = html.slice(html.indexOf("<head>") + 6, html.lastIndexOf("</head>"));
const body = html.slice(html.indexOf("<body>") + 6, html.lastIndexOf("</body>"));
const assets = head.slice(head.indexOf('<script type="module"'));

const out = [
  "<title>RESQ.AI Demo</title>",
  '<meta name="description" content="RESQ.AI demo: citizens report hazards up to the disaster control room, even without network.">',
  assets.trim(),
  body.replace(/<noscript>[\s\S]*?<\/noscript>/, "").trim(),
  "",
].join("\n");

fs.writeFileSync("dist-demo/resq-demo.html", out);
console.log(`dist-demo/resq-demo.html  ${(out.length / 1024 / 1024).toFixed(2)} MB`);

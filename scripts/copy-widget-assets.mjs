// Copies the theme extension's widget bundle into public/widget/ so the app
// itself can serve it.
//
// On the Online Store the widget is loaded from the theme's asset CDN by
// chat_widget.liquid, which is why these files only ever lived under
// extensions/. A headless storefront has no theme and no asset CDN — the
// merchant embeds the widget by hand (see headless-embed.server.ts), and it
// has to come from somewhere. Copying at build time rather than checking a
// second copy into git keeps the two from drifting: there is still exactly
// one source of truth, extensions/ai-chat-widget/assets/.
import { cp, mkdir, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = resolve(root, "extensions/ai-chat-widget/assets");
const destination = resolve(root, "public/widget");

await rm(destination, { recursive: true, force: true });
await mkdir(destination, { recursive: true });

for (const file of ["ai-chat-widget.js", "ai-chat-widget.css"]) {
  await cp(resolve(source, file), resolve(destination, file));
}

console.log(`Copied widget assets to ${destination}`);

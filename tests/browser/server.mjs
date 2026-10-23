// Isolated component harness. No production auth bypass or test routes are added.
import { build } from "esbuild";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createServer } from "node:http";
import { resolve } from "node:path";
await mkdir(".tools/browser", { recursive: true });
await build({
  entryPoints: ["tests/browser/harness.tsx"],
  bundle: true,
  outfile: ".tools/browser/app.js",
  format: "esm",
  jsx: "automatic",
  alias: {
    "@": resolve("."),
    "next/navigation": resolve("tests/browser/navigation-stub.tsx"),
    "next/link": resolve("tests/browser/link-stub.tsx"),
  },
  define: {
    "process.env.NEXT_PUBLIC_SUPABASE_URL": '"https://fixture.supabase.co"',
    "process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY": '"fixture-key"',
    "process.env.NODE_ENV": '"development"',
  },
});
const css = await postcss([tailwind()]).process(
  await readFile("app/globals.css", "utf8"),
  { from: "app/globals.css" },
);
await writeFile(".tools/browser/style.css", css.css);
const server = createServer(async (req, res) => {
  if (req.url === "/app.js" || req.url === "/style.css") {
    res.setHeader(
      "Content-Type",
      req.url.endsWith(".js") ? "application/javascript" : "text/css",
    );
    res.end(await readFile(`.tools/browser${req.url}`));
    return;
  }
  res.setHeader("Content-Type", "text/html");
  res.end(
    '<!DOCTYPE html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script type="module" src="/app.js"></script></body></html>',
  );
});
server.listen(3100, "127.0.0.1", () =>
  process.stdout.write("Browser fixture ready\n"),
);

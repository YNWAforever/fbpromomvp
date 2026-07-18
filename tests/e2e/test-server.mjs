import http from "node:http";
import next from "next";

const port = Number(process.env.PORT ?? 3000);
process.env.NODE_ENV = "development";
const app = next({ dev: true, dir: process.cwd() });

async function main() {
  await app.prepare();
  const environment = process.env;
  process.env = new Proxy(environment, {
    get(target, key) { return key === "NODE_ENV" ? "test" : Reflect.get(target, key); },
    set(target, key, value) { return key === "NODE_ENV" ? true : Reflect.set(target, key, value); },
  });
  const handle = app.getRequestHandler();
  http.createServer((request, response) => handle(request, response))
    .listen(port, "localhost", () => console.log(`Test-only Next server listening on http://localhost:${port}`));
}

main().catch((error) => { console.error(error); process.exit(1); });

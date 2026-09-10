import { loadEnv } from "./env";
import { buildApp } from "./app";

const env = loadEnv();
const app = buildApp(env);

app
  .listen({ port: env.PORT, host: "0.0.0.0" })
  .then((address) => app.log.info(`@laandry/api listening on ${address}`))
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });

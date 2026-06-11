import "dotenv/config";
import { createApp } from "./app.js";

const PORT = process.env["PORT"] ? Number(process.env["PORT"]) : 3000;

const app = createApp();

app.listen(PORT, () => {
  console.log(`Backend listening on http://localhost:${PORT}`);
});

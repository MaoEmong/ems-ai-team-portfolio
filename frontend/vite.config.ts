import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  test: {
    include: ["src/**/*.test.{ts,tsx}"],
    environment: "jsdom",
    clearMocks: true,
    // Tests control fetch directly; local browser mock settings must not bypass it.
    env: { VITE_MOCK_API: "false" },
  },
});

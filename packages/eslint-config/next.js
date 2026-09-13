import { defineConfig } from "eslint/config";
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import { baseConfig } from "./base.js";

export const nextConfig = defineConfig(nextCoreWebVitals, baseConfig);

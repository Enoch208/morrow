import { defineConfig } from "eslint/config";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import { baseConfig } from "./base.js";

export const reactConfig = defineConfig(baseConfig, reactHooks.configs.flat.recommended, {
  languageOptions: {
    globals: globals.browser,
  },
});

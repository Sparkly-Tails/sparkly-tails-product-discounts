import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import { buildGuidelinesConfig } from "./eslint.guidelines.mjs";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  ...buildGuidelinesConfig({ files: ["src/**/*.{ts,tsx}", "scripts/**/*.{ts,mjs}"] }),
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts", "extensions/**"]),
]);

export default eslintConfig;

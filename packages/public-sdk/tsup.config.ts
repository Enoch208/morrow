import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "es2022",
  dts: {
    resolve: true,
    compilerOptions: {
      baseUrl: ".",
      paths: { "@morrow/protocol": ["../protocol/src/index.ts"] },
    },
  },
  noExternal: ["@morrow/protocol"],
  external: ["ethers"],
  clean: true,
  minify: true,
  sourcemap: false,
});

import typescriptPlugin, { RollupTypescriptOptions } from "@rollup/plugin-typescript";
import terserPlugin from "@rollup/plugin-terser";
import { RollupOptions } from "rollup";

const outDir = "dist";

export default {
    input: "src/index.ts",
    output: {
        dir: outDir,
        format: "es",
        sourcemap: true
    },
    plugins: [
        typescriptPlugin({
            noEmitOnError: true,
            include: ["src/**/*.ts"],
            declaration: true,
            outDir: outDir
        }),
        terserPlugin({
            keep_classnames: /^.*Error$/
        })
    ]
} as RollupOptions & RollupTypescriptOptions;

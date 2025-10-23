import typescriptPlugin, { RollupTypescriptOptions } from "@rollup/plugin-typescript";
import terserPlugin from "@rollup/plugin-terser";
import { RollupOptions } from "rollup";

export default {
    input: "src/index.ts",
    output: {
        dir: "dist",
        format: "es",
        sourcemap: true
    },
    plugins: [
        typescriptPlugin({
            noEmitOnError: true
        }),
        terserPlugin({
            keep_classnames: /^.*Error$/
        })
    ]
} as RollupOptions & RollupTypescriptOptions;

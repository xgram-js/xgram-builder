import typescriptPlugin, { RollupTypescriptOptions } from "@rollup/plugin-typescript";
import terserPlugin from "@rollup/plugin-terser";
import { RollupOptions } from "rollup";
import { dts as dtsPlugin } from "rollup-plugin-dts";

const outDir = "dist";

export default [
    {
        input: "src/index.ts",
        output: {
            dir: outDir,
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
    },
    {
        input: "src/index.ts",
        output: {
            dir: outDir,
            format: "es"
        },
        plugins: [dtsPlugin()]
    }
] as (RollupOptions & RollupTypescriptOptions)[];

import typescriptPlugin, { RollupTypescriptOptions } from "@rollup/plugin-typescript";
import terserPlugin from "@rollup/plugin-terser";
import { RollupOptions } from "rollup";
import { dts as dtsPlugin } from "rollup-plugin-dts";
import dtsMinifyPlugin from "rollup-plugin-dts-minify";

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
                keep_classnames: /^.*Error$/,
                compress: {
                    booleans_as_integers: true,
                    arguments: true,
                    ecma: 2020,
                    hoist_funs: true,
                    module: true,
                    passes: 3
                }
            })
        ]
    },
    {
        input: "src/index.ts",
        output: {
            dir: outDir,
            format: "es"
        },
        plugins: [dtsPlugin(), dtsMinifyPlugin()]
    }
] as (RollupOptions & RollupTypescriptOptions)[];

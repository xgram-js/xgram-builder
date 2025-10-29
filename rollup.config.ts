import typescriptPlugin, { RollupTypescriptOptions } from "@rollup/plugin-typescript";
import terserPlugin from "@rollup/plugin-terser";
import { RollupOptions, Plugin } from "rollup";
import { dts as dtsPlugin } from "rollup-plugin-dts";
import { createMinifier } from "dts-minify";
import ts from "typescript";

const outDir = "dist";

function dtsMinifyPlugin(): Plugin {
    return {
        name: "dts-minify",
        generateBundle: (options, bundle) => {
            const minifier = createMinifier(ts);

            for (const [fileName, file] of Object.entries(bundle)) {
                if (fileName.endsWith(".d.ts") && file.type === "chunk") {
                    file.code = minifier.minify(file.code);
                    console.log(`Minified ${fileName}`);
                }
            }
        }
    };
}

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
        plugins: [dtsPlugin(), dtsMinifyPlugin()]
    }
] as (RollupOptions & RollupTypescriptOptions)[];

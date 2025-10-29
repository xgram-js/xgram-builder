import mapProjectStructure from "./mapper";
import { Listr, ListrDefaultRendererLogLevels, ListrLogger } from "listr2";
import { exec as execCb, ExecException } from "node:child_process";
import { promisify } from "node:util";
import chalk from "chalk";
import { OutputOptions, rollup, RollupOptions } from "rollup";
import typescriptPlugin from "@rollup/plugin-typescript";
import terserPlugin from "@rollup/plugin-terser";
import path from "node:path";
import { Project } from "./types";

const exec = promisify(execCb);

class CustomLogger extends ListrLogger {}

interface RootTaskContext {
    project: Project;
}

function generateRollupConfig(project: Project): RollupOptions {
    return {
        input: {
            ...Object.fromEntries(project.commands.map((v, i) => [`command-${i}`, v])),
            ...Object.fromEntries(project.events.map((v, i) => [`event-${i}`, v])),
            ...Object.fromEntries(project.menus.map((v, i) => [`menu-${i}`, v])),
            ...Object.fromEntries(project.services.map((v, i) => [`service-${i}`, v]))
        },
        output: {
            format: "es",
            dir: path.join(project.rootDir, ".xgram", "dist")
        },
        plugins: [
            typescriptPlugin({
                noEmitOnError: true
            }),
            terserPlugin({
                keep_classnames: /^.*Error$/
            })
        ],
        logLevel: "silent"
    };
}

export async function buildProduction(cwd?: string) {
    cwd = cwd ?? process.cwd();
    const rootTask = new Listr<RootTaskContext>(
        [
            {
                title: "Mapping project structure",
                task: ctx => {
                    ctx.project = mapProjectStructure(cwd);
                }
            },
            {
                title: "Linting code and validating types",
                task: async () => {
                    let state = 0;
                    try {
                        await exec("npm run lint", { cwd });
                        state = 1;
                        await exec("tsc --noEmit", { cwd });
                    } catch (error: any) {
                        console.error((error as ExecException).stdout);
                        throw new Error(state == 0 ? "Linting failed" : "Type validation failed");
                    }
                }
            },
            {
                title: "Bundling TypeScript",
                task: async ctx => {
                    const config = generateRollupConfig(ctx.project);
                    const bundle = await rollup(config);
                    await bundle.write(<OutputOptions>config.output);
                    await bundle.close();
                }
            },
            {
                title: "Hooking in",
                task: async () => {
                    await new Promise<void>(resolve => setTimeout(resolve, 2000));
                }
            }
        ],
        {
            rendererOptions: {
                logger: new CustomLogger(),
                icon: {
                    [ListrDefaultRendererLogLevels.COMPLETED]: "V",
                    [ListrDefaultRendererLogLevels.FAILED]: "X"
                }
            }
        }
    );
    console.log(`${chalk.bold.green("Creating X-Gram.js production build\n")}`);
    try {
        await rootTask.run();
    } catch (e) {
        process.exit(1);
    }
}

export function startDev() {}

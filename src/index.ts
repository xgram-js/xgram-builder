import mapProjectStructure from "./mapper";
import { Listr, ListrDefaultRendererLogLevels, ListrTask } from "listr2";
import { exec as execCb, ExecException } from "node:child_process";
import { promisify } from "node:util";
import { OutputOptions, rollup, RollupOptions } from "rollup";
import typescriptPlugin from "@rollup/plugin-typescript";
import terserPlugin from "@rollup/plugin-terser";
import path from "node:path";
import { Project } from "./types";
import exportMaps, { assertExportsToMap } from "./exportMaps";
import chalk from "chalk";
import { CommandDeclaration, CommandConfig } from "@xgram/core";
const exec = promisify(execCb);

interface RootTaskContext {
    project: Project;
    collectedDeclarations: {
        commands: CommandDeclaration[];
    };
}

function generateRollupConfig(project: Project): RollupOptions {
    return {
        input: {
            ...Object.fromEntries(project.commands.map((v, i) => [`command-${i}`, v.filePath])),
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
                noEmitOnError: true,
                include: `**/*.ts`,
                tsconfig: path.join(project.rootDir, "tsconfig.json")
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
                task: async ctx => {
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
                    } catch (error) {
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
                title: "Postprocessing bundle",
                task: async (ctx, task) =>
                    task.newListr<RootTaskContext>([
                        {
                            title: "Validating export maps",
                            task: async (ctx, task) =>
                                task.newListr<RootTaskContext>(
                                    ctx.project.commands.map((command, i) => {
                                        return {
                                            title: command.projectRelativeFilePath,
                                            task: async ctx => {
                                                const commandFileExports = await import(
                                                    `file://${path.join(ctx.project.rootDir, ".xgram", "dist", `command-${i}.js`)}`
                                                );
                                                assertExportsToMap(
                                                    exportMaps.command,
                                                    commandFileExports,
                                                    command.projectRelativeFilePath
                                                );
                                            }
                                        } as ListrTask<RootTaskContext>;
                                    }),
                                    {
                                        concurrent: true
                                    }
                                )
                        },
                        {
                            title: "Declaring entities",
                            task: async ctx => {
                                ctx.collectedDeclarations = {
                                    commands: []
                                };
                                for (let i = 0; i < ctx.project.commands.length; i++) {
                                    const command = ctx.project.commands[i];
                                    const commandFileExports = await import(
                                        `file://${path.join(ctx.project.rootDir, ".xgram", "dist", `command-${i}.js`)}`
                                    );
                                    const config: CommandConfig = commandFileExports.commandConfig ?? {};
                                    ctx.collectedDeclarations.commands.push({
                                        trigger: command.name,
                                        prefix: config.prefix ?? "/",
                                        handlerFunction: commandFileExports.default
                                    });
                                }
                            }
                        }
                    ])
            }
        ],
        {
            rendererOptions: {
                icon: {
                    [ListrDefaultRendererLogLevels.COMPLETED]: "V",
                    [ListrDefaultRendererLogLevels.FAILED]: "X"
                }
            },
            forceUnicode: true
        }
    );
    console.log(`${chalk.bold.green("Creating X-Gram.js production build\n")}`);
    try {
        await rootTask.run();
    } catch {
        process.exit(1);
    }
}

export function startDev() {}

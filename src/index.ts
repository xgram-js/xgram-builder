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
import {
    writeFile as fsWriteFileCb,
    appendFile as fsAppendFileCb,
    rm as fsRmCb,
    readFile as fsReadFileCb
} from "node:fs";
import { fileURLToPath } from "node:url";

const exec = promisify(execCb);
const fsWriteFile = promisify(fsWriteFileCb);
const fsAppendFile = promisify(fsAppendFileCb);
const fsRm = promisify(fsRmCb);
const fsReadFile = promisify(fsReadFileCb);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface BuildProgressContext {
    project: Project;
    bundleMap: {
        commands: Record<string, { filePath: string }>;
    };
    collectedDeclarations: {
        commands: CommandDeclaration[];
    };
}

function generateRollupConfig(ctx: BuildProgressContext): RollupOptions {
    const project = ctx.project;
    ctx.bundleMap = {
        commands: {}
    };
    return {
        input: {
            ...Object.fromEntries(
                project.commands.map((v, i) => {
                    ctx.bundleMap.commands[v.name] = {
                        filePath: path.join(project.rootDir, ".xgram", "dist", `command-${i}.js`)
                    };
                    return [`command-${i}`, v.filePath];
                })
            ),
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
                include: "**/*.ts",
                tsconfig: path.join(project.rootDir, "tsconfig.json")
            }),
            terserPlugin({
                keep_classnames: /^.*Error$/
            })
        ],
        logLevel: "silent"
    };
}

function generateMergeRollupConfig(project: Project): RollupOptions {
    return {
        input: path.join(project.rootDir, ".xgram", "virtual-index.ts"),
        output: {
            format: "es",
            file: path.join(project.rootDir, ".xgram", "index.js")
        },
        plugins: [
            typescriptPlugin({
                noEmitOnError: true,
                include: ["**/*.ts", path.join(project.rootDir, ".xgram", "virtual-index.ts")],
                tsconfig: path.join(project.rootDir, "tsconfig.json")
            }),
            terserPlugin()
        ],
        logLevel: "silent"
    };
}

export async function buildProduction(cwd?: string) {
    cwd = cwd ?? process.cwd();
    const rootTask = new Listr<BuildProgressContext>(
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
                    await fsRm(path.join(ctx.project.rootDir, ".xgram"), { recursive: true, force: true });

                    const config = generateRollupConfig(ctx);
                    const bundle = await rollup(config);
                    await bundle.write(<OutputOptions>config.output);
                    await bundle.close();
                }
            },
            {
                title: "Postprocessing bundle",
                task: async (ctx, task) =>
                    task.newListr<BuildProgressContext>([
                        {
                            title: "Validating export maps",
                            task: async (ctx, task) =>
                                task.newListr<BuildProgressContext>(
                                    // TODO: use bundle map instead
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
                                        } as ListrTask<BuildProgressContext>;
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
                                for (const [name, { filePath }] of Object.entries(ctx.bundleMap.commands)) {
                                    const exports = await import(`file://${filePath}`);
                                    const config: CommandConfig | undefined = exports.commandConfig;
                                    ctx.collectedDeclarations.commands.push({
                                        handlerFunction: exports.default,
                                        trigger: name,
                                        prefix: config?.prefix ?? "/"
                                    });
                                }
                            }
                        },
                        {
                            title: "Preparing for merge",
                            task: async ctx => {
                                const virtualIndexContent = [];
                                for (let i = 0; i < ctx.project.commands.length; i++) {
                                    virtualIndexContent.push(
                                        "// @ts-ignore",
                                        `import command${i} from "./dist/command-${i}"`
                                    );
                                }

                                const commandDeclarationsLines: string[] = [];
                                ctx.collectedDeclarations.commands.forEach((command, index) => {
                                    commandDeclarationsLines.push(
                                        `{handlerFunction: command${index}, trigger: '${command.trigger}', prefix: '${command.prefix}'},`
                                    );
                                });

                                virtualIndexContent.push("", "commands = [", commandDeclarationsLines.join("\n"), "]");

                                const virtualIndexPath = path.join(ctx.project.rootDir, ".xgram", "virtual-index.ts");
                                await fsAppendFile(virtualIndexPath, "");
                                await fsWriteFile(
                                    virtualIndexPath,
                                    (await fsReadFile(path.join(__dirname, "..", "skeleton", "virtual-index.ts")))
                                        .toString()
                                        .replace("/// @inject-here", virtualIndexContent.join("\n"))
                                );
                            }
                        }
                    ])
            },
            {
                title: "Merging bundle",
                task: async ctx => {
                    const config = generateMergeRollupConfig(ctx.project);
                    const bundle = await rollup(config);
                    await bundle.write(<OutputOptions>config.output);
                    await bundle.close();
                }
            },
            {
                title: "Cleaning up",
                task: async ctx => {
                    ["virtual-index.ts", "dist"].map(
                        async v =>
                            await fsRm(path.join(ctx.project.rootDir, ".xgram", v), { force: true, recursive: true })
                    );
                }
            }
        ],
        {
            rendererOptions: {
                collapseSubtasks: false,
                collapseErrors: false,
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

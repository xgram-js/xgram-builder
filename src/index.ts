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
        ]
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
                    const config = generateRollupConfig(ctx.project);
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
            },
            {
                title: "Merging bundle",
                task: async ctx => {
                    const virtualIndexContent = [];
                    for (let i = 0; i < ctx.project.commands.length; i++) {
                        virtualIndexContent.push("// @ts-ignore", `import * as command${i} from "./dist/command-${i}"`);
                    }
                    const commandsComma = [];
                    for (let i = 0; i < ctx.project.commands.length; i++) {
                        commandsComma.push(`command${i}`);
                    }

                    virtualIndexContent.push("", `commands = [${commandsComma.join(", ")}]`);

                    const virtualIndexPath = path.join(ctx.project.rootDir, ".xgram", "virtual-index.ts");
                    await fsAppendFile(virtualIndexPath, "");
                    await fsWriteFile(
                        virtualIndexPath,
                        (await fsReadFile(path.join(__dirname, "..", "skeleton", "virtual-index.ts")))
                            .toString()
                            .replace("/// @inject-here", virtualIndexContent.join("\n"))
                    );

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

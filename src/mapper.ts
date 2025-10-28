import { readdirSync } from "node:fs";
import chalk from "chalk";
import path from "node:path";
import { Project } from "./types";

export class InvalidProjectStructureError extends Error {
    public constructor(expected: string, found?: string) {
        if (found) super(`Expected ${chalk.green(expected)}, but found ${chalk.red(found)}`);
        else super(`Expected ${chalk.green(expected)}, but nothing found`);
    }
}

function handleCommandsDir(commandsDir: string) {
    const commandsDirList = readdirSync(commandsDir);
    return commandsDirList.filter(v => v.endsWith(".ts")).map(v => path.join(commandsDir, v));
}

export default function mapProjectStructure(rootDir: string) {
    const rootDirList = readdirSync(rootDir);
    if (!rootDirList.includes("src")) throw new InvalidProjectStructureError("/src");
    const srcDirPath = path.join(rootDir, "src");
    const srcDirList = readdirSync(srcDirPath);

    const project = {
        rootDir
    } as Project;

    for (const subDir of ["commands", "events", "menus", "services"]) {
        if (!srcDirList.includes(subDir)) throw new InvalidProjectStructureError(`/src/${subDir}`);
        switch (subDir) {
            case "commands":
                project.commands = handleCommandsDir(path.join(srcDirPath, subDir));
                break;
            case "events":
                // handleCommandsDir(path.join(srcDirPath, subDir));
                break;
            case "menus":
                // handleCommandsDir(path.join(srcDirPath, subDir));
                break;
            case "services":
                // handleCommandsDir(path.join(srcDirPath, subDir));
                break;
        }
    }

    // FIXME: temporary
    project.events = [];
    project.menus = [];
    project.services = [];

    return project;
}

import { readdirSync } from "node:fs";
import chalk from "chalk";
import path from "node:path";
import { PrimitiveTypeLiteral, Project, ProjectCommand } from "./types";
import { prettifyError, ZodError } from "zod";

export class InvalidProjectStructureError extends Error {
    public constructor(message: string, options?: ErrorOptions) {
        super(message, options);
    }
}

export class ProjectStructurePathNotFoundError extends InvalidProjectStructureError {
    public constructor(expectedPath: string) {
        super(`Expected path ${chalk.green(expectedPath)} was not found`);
    }
}

export class ProjectStructureExportTypeMismatchError extends InvalidProjectStructureError {
    public constructor(
        file: string,
        expectedKey: string,
        expectedType: PrimitiveTypeLiteral,
        foundType?: PrimitiveTypeLiteral,
        required?: boolean
    );
    public constructor(file: string, exportKey: string, schemaValidationError: ZodError);

    public constructor(
        file: string,
        expectedKey: string,
        expectedTypeOrZodError: PrimitiveTypeLiteral | ZodError,
        foundType?: PrimitiveTypeLiteral,
        required: boolean = true
    ) {
        if (typeof expectedTypeOrZodError === "string") {
            super(
                `File ${chalk.gray(file)} expected to contain an ${required ? "" : chalk.yellow("optional ")}export key ${chalk.green(expectedKey)} with type ${chalk.green(expectedTypeOrZodError)}, but ${foundType ? `${chalk.red(foundType)} was found` : "it was not found"}`
            );
        } else {
            // TODO: implement custom prettifyError function
            super(
                `File ${chalk.gray(file)} contains an invalid export value for the ${chalk.green(expectedKey)} key. Validation errors:\n${prettifyError(expectedTypeOrZodError)}`
            );
        }
    }
}

function handleCommandsDir(commandsDir: string): ProjectCommand[] {
    const commandsDirList = readdirSync(commandsDir);
    const commandsFiles = commandsDirList.filter(v => v.endsWith(".ts"));

    return commandsFiles.map(v => {
        return {
            filePath: path.join(commandsDir, v),
            projectRelativeFilePath: `src/commands/${v}`,
            name: v.split(".").slice(0, -1).join(".")
        };
    });
}

export default function mapProjectStructure(rootDir: string) {
    const rootDirList = readdirSync(rootDir);
    if (!rootDirList.includes("src")) throw new ProjectStructurePathNotFoundError("/src");
    const srcDirPath = path.join(rootDir, "src");
    const srcDirList = readdirSync(srcDirPath);

    const project = {
        rootDir
    } as Project;

    for (const subDir of ["commands", "events", "menus", "services"]) {
        if (!srcDirList.includes(subDir)) throw new ProjectStructurePathNotFoundError(`/src/${subDir}`);
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

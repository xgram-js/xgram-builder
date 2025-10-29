import { PrimitiveTypeLiteral } from "./types";
import assert from "node:assert";
import { InvalidProjectStructureError } from "./mapper";
import chalk from "chalk";

export type ExportMapDeclaration = {
    type: PrimitiveTypeLiteral;
    required: boolean;
};
export type ExportMaps = Record<string, ExportMapDeclaration>;

export default {
    command: {
        default: {
            type: "function",
            required: true
        },
        commandConfig: {
            type: "object",
            required: false
        }
    }
} as Record<string, ExportMaps>;

export function assertExportsToMap(map: ExportMaps, exports: any, file: string) {
    Object.keys(map).forEach(key => {
        if (!map[key].required && typeof exports[key] === "undefined") return;
        assert(
            typeof exports[key] == map[key].type,
            new InvalidProjectStructureError(
                file,
                `to contain ${map[key].required ? "" : chalk.yellow("optional ")}export key ${chalk.green(key)} with type ${chalk.green(map[key].type)}`,
                typeof exports[key] == "undefined" ? null : typeof exports[key]
            )
        );
    });
}

import { PrimitiveTypeLiteral } from "./types";
import assert from "node:assert";
import { InvalidProjectStructureError } from "./mapper";
import chalk from "chalk";

export type ExportMaps = Record<string, PrimitiveTypeLiteral>;

export default {
    command: {
        default: "function"
    }
} as Record<string, ExportMaps>;

export function assertExportsToMap(map: ExportMaps, exports: any, file: string) {
    Object.keys(map).forEach(key => {
        assert(
            typeof exports[key] == map[key],
            new InvalidProjectStructureError(
                file,
                `to contain export key ${chalk.green(key)} with type ${chalk.green(map[key])}`,
                typeof exports[key] == "undefined" ? null : typeof exports[key]
            )
        );
    });
}

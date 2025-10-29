import { PrimitiveTypeLiteral } from "./types";
import assert from "node:assert";
import { ProjectStructureExportTypeMismatchError } from "./mapper";
import * as z from "zod";

export type ExportMapDeclaration = {
    type: PrimitiveTypeLiteral;
    required: boolean;
    zodSchema?: z.ZodType;
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
            required: false,
            zodSchema: z.strictObject({
                prefix: z.string().min(1).optional()
            })
        }
    }
} as Record<string, ExportMaps>;

export function assertExportsToMap(map: ExportMaps, exports: any, file: string) {
    Object.keys(map).forEach(key => {
        const mapDeclaration = map[key];
        const exportValue = exports[key];

        if (!mapDeclaration.required && typeof exportValue === "undefined") return;
        assert(
            typeof exportValue == mapDeclaration.type,
            new ProjectStructureExportTypeMismatchError(
                file,
                key,
                mapDeclaration.type,
                typeof exportValue === "undefined" ? undefined : typeof exportValue,
                mapDeclaration.required
            )
        );
        if (mapDeclaration.zodSchema) {
            try {
                mapDeclaration.zodSchema.parse(exportValue);
            } catch (e) {
                if (e instanceof z.ZodError) {
                    throw new ProjectStructureExportTypeMismatchError(file, key, e);
                }
            }
        }
    });
}

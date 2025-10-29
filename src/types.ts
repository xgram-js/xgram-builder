export interface ProjectCommand {
    filePath: string;
    projectRelativeFilePath: string;
}

export interface Project {
    rootDir: string;
    commands: ProjectCommand[];
    events: string[];
    menus: string[];
    services: string[];
}

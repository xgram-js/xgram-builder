import { Bot, CommandConfig } from "@xgram/core";
let commands: CommandConfig[] = [];
/// @inject-here

async function main() {
    const bot = new Bot(commands[0].prefix ?? "/");
}

void main();

import { Bot, CommandDeclaration } from "@xgram/core";
import { configDotenv } from "dotenv";
import assert from "node:assert";

let commands: CommandDeclaration[] = [];
/// @inject-here

async function main() {
    configDotenv({ quiet: true });
    assert(process.env.TOKEN, "Bot token was not found in .env");
    const bot = new Bot(process.env.TOKEN);
    commands.forEach(bot.registerCommand.bind(bot));
    bot.startPolling();
}

void main();

import chalk from "chalk";
import { CallInfo } from "ts_src/common/analyzer";

function print(call: CallInfo) {
    console.log(chalk.cyan(`${call.name}`));
    console.log(chalk.cyan(`${call.controller}`));
    console.log(
        `  Location: ${call.location.filePath}:${call.location.startLine}-${call.location.endLine}`
    );
    console.log(`  Call at: line ${call.line}, column ${call.column}`);
    if (call.type) {
        console.log(`  Type: ${chalk.gray(call.type)}`);
    }
    if (call.arguments.length > 0) {
        console.log(`  Arguments: ${chalk.gray(call.arguments.join(', '))}`);
    }
    console.log('');
}
export function printResults(calls: CallInfo[]) {
    // console.log(calls.map(m=>m.name))
    calls.forEach(print);
}

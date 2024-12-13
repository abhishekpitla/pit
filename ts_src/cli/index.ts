import chalk from 'chalk';
import path from 'path';
import { extractController } from '../route-extractor/nestjs';
import {
    analyzeFunction,
    processControllerFunctions,
    processFunctions,
    validFuncDeclarations
} from '../../ts_src/common/analyzer';
import { Project, SourceFile } from 'ts-morph';

async function main(filePath: string, functionName: string) {
    try {
        const absolutePath = path.resolve(process.cwd(), filePath);
        if (functionName) {
            const project = new Project();
            // const project = new Project({
            //     tsConfigFilePath: findTsConfig(filePath)
            // });

            project.addSourceFileAtPath(absolutePath);
            project.resolveSourceFileDependencies();
            const files: SourceFile[] = project.getSourceFiles();
            processFunctions(files, [functionName]);
        } else {
            const controllers: {
                declaration: validFuncDeclarations;
                controller: string;
                published_path: string;
            }[] = extractController(absolutePath);
            processControllerFunctions(controllers);
        }
    } catch (error) {
        console.error(chalk.red('Error analyzing function:'), error);
        process.exit(1);
    }
}

function findTsConfig(filePath: string): string {
    // Walk up directory tree to find tsconfig.json
    let currentDir = path.dirname(path.resolve(filePath));

    while (currentDir !== path.parse(currentDir).root) {
        const tsConfigPath = path.join(currentDir, 'tsconfig.json');
        if (require('fs').existsSync(tsConfigPath)) {
            return tsConfigPath;
        }
        currentDir = path.dirname(currentDir);
    }
    console.log({ filePath });
    throw new Error('No tsconfig.json found in project');
}

// function print(call: CallInfo) {
//     console.log(chalk.cyan(`${call.name}`));
//     console.log(
//         `  Location: ${call.location.filePath}:${call.location.startLine}-${call.location.endLine}`
//     );
//     console.log(`  Call at: line ${call.line}, column ${call.column}`);
//     if (call.type) {
//         console.log(`  Type: ${chalk.gray(call.type)}`);
//     }
//     if (call.arguments.length > 0) {
//         console.log(`  Arguments: ${chalk.gray(call.arguments.join(', '))}`);
//     }
//     console.log('');
// }
// export function printResults(calls: CallInfo[]) {
//     calls.forEach(print);
// }

const [, , global_filePath, global_functionName] = process.argv;

if (!global_filePath) {
    console.error(chalk.red('Please provide both file path'));
    console.error(chalk.yellow('Usage: npm start <file-path>'));
    process.exit(1);
}
main(global_filePath, global_functionName);

import { ArrowFunction, FunctionDeclaration, MethodDeclaration, Project } from 'ts-morph';
import chalk from 'chalk';
import path from 'path';
import { analyzeFunction, CallInfo, validFuncDeclarations } from '.././analyzer';
import { findTargetFunction } from '.././utils';

const [, , filePath, functionName] = process.argv;

if (!filePath || !functionName) {
    console.error(chalk.red('Please provide both file path and function name'));
    console.error(chalk.yellow('Usage: npm start <file-path> <function-name>'));
    process.exit(1);
}

async function main() {
    try {
        const project = new Project();
        // const project = new Project({
        //     tsConfigFilePath: findTsConfig(filePath)
        // });

        const absolutePath = path.resolve(process.cwd(), filePath);
        const sourceFile = project.addSourceFileAtPath(absolutePath);
        project.resolveSourceFileDependencies();
        const files = project.getSourceFiles();

        let i = 1;
        let targetFunction: validFuncDeclarations= undefined;
        files.forEach(file => {
            i++;
            const check = findTargetFunction(file, functionName);
            if (check) {
                console.log({
                    file: file.getFilePath()
                });
            }
            if (check) {
                targetFunction = check;
            }
        });
        console.log(`${i} files visited`);

        if (!targetFunction) {
            console.error(chalk.red(`Function '${functionName}' not found in ${filePath}`));
            process.exit(1);
        }

        console.log(chalk.blue(`\nAnalyzing function: ${chalk.bold(functionName)}\n`));

        const calls = analyzeFunction(targetFunction);
        printResults(calls);
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

function print(call: CallInfo) {
    console.log(chalk.cyan(`${call.name}`));
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
function printResults(calls: CallInfo[]) {
    calls.forEach(print);
}

main().catch(console.error);

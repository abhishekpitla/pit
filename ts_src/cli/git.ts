import { simpleGit, SimpleGit } from 'simple-git';
import chalk from 'chalk';
import { existsSync } from 'fs';
import { DetectFramework } from '../detectors/framework-detectors';
import { extractController } from '../route-extractor/nestjs';
import { returnFunctions } from '../common/analyzer';
import { resolve } from 'path';
import { FunctionRange } from '../helpers/pipe-pusher';
import yoctoSpinner from 'yocto-spinner';

// Framework types from the detection module
enum FrameworkType {
    Unknown = 'Unknown',
    Express = 'Express',
    NestJS = 'NestJS',
    Fastify = 'Fastify',
    Koa = 'Koa',
    Hapi = 'Hapi',
    Sails = 'Sails',
    Meteor = 'Meteor',
    Loopback = 'Loopback',
    Adonis = 'Adonis',
    Feathers = 'Feathers'
}

interface FrameworkInfo {
    mainPath: string;
    framework: FrameworkType;
}

async function findGitRoot(initialPath: string): Promise<string> {
    const git = simpleGit(initialPath);
    try {
        const result = await git.revparse(['--show-toplevel']);
        return result.trim();
    } catch (error) {
        throw new Error('Not a git repository (or any parent up to root)');
    }
}

function validatePath(inputPath: string = process.cwd()): string {
    const absPath = resolve(inputPath);
    if (!existsSync(absPath)) {
        console.error(`Path does not exist: ${absPath}`);
        process.exit(1);
    }
    return absPath;
}

async function detectProjectFramework(gitRoot: string): Promise<FrameworkInfo> {
    try {
        // Using the imported DetectFramework function
        const frameworkInfo = await DetectFramework(gitRoot);

        if (frameworkInfo.framework === FrameworkType.Unknown) {
            throw new Error('No supported framework found');
        }

        return frameworkInfo;
    } catch (error) {
        if (error instanceof Error && error.name === 'FrameworkDetectionError') {
            throw new Error(`Framework detection failed: ${error.message}`);
        }
        throw error;
    }
}

function printPaths(gitRoot: string, frameworkInfo: FrameworkInfo): void {
    console.log(chalk.white.bold('Git root: ') + chalk.cyan(gitRoot));
    console.log(chalk.white.bold('Framework: ') + chalk.blue(frameworkInfo.framework));
    console.log(chalk.white.bold('TypeScript entrypoint: ') + chalk.cyan(frameworkInfo.mainPath));
}

function findFunctionsWithOverlappingChunks(
    functions: FunctionRange[],
    chunkFilename: string,
    chunkStart: number,
    chunkEnd: number
): string[] {
    return functions
        .filter(fn => {
            if (!fn.Filename.includes(chunkFilename)) {
                return false;
            }
            return (
                (chunkStart >= fn.StartLine && chunkStart <= fn.EndLine) ||
                (chunkEnd >= fn.StartLine && chunkEnd <= fn.EndLine) ||
                (chunkStart <= fn.StartLine && chunkEnd >= fn.EndLine) ||
                (chunkStart >= fn.StartLine && chunkEnd <= fn.EndLine)
            );
        })
        .map(fn => fn.ControllerName);
}

async function analyzeGitChanges(
    repoPath: string,
    functions: FunctionRange[]
): Promise<{ additions: string[]; deletions: string[] }> {
    const git: SimpleGit = simpleGit(repoPath);
    const diff = await git.diff(['--no-ext-diff', 'HEAD^', 'HEAD']);
    const addFunctions = new Set<string>();
    const removeFunctions = new Set<string>();

    const diffLines = diff.split('\n');
    let currentFile = '';
    let currentHunkStart = 0;
    let currentLineNo = 0;
    let inHunk = false;
    let hunkLines: string[] = [];

    for (let i = 0; i < diffLines.length; i++) {
        const line = diffLines[i];

        if (line.startsWith('diff --git')) {
            // Process previous hunk if exists
            if (hunkLines.length > 0) {
                processHunk(
                    hunkLines,
                    currentFile,
                    currentHunkStart,
                    functions,
                    addFunctions,
                    removeFunctions
                );
            }

            currentFile = line.split(' b/')[1];
            hunkLines = [];
            inHunk = false;
            continue;
        }

        if (line.startsWith('@@')) {
            // Process previous hunk if exists
            if (hunkLines.length > 0) {
                processHunk(
                    hunkLines,
                    currentFile,
                    currentHunkStart,
                    functions,
                    addFunctions,
                    removeFunctions
                );
                hunkLines = [];
            }

            // Parse the hunk header
            // Format: @@ -l,s +l,s @@ optional section heading
            const match = line.match(/@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
            if (match) {
                currentHunkStart = parseInt(match[1]);
                currentLineNo = currentHunkStart;
                inHunk = true;
            }
            continue;
        }

        if (inHunk) {
            if (!line.startsWith('\\')) {
                // Ignore "\ No newline at end of file"
                hunkLines.push(line);
            }
        }
    }

    // Process the last hunk
    if (hunkLines.length > 0) {
        processHunk(
            hunkLines,
            currentFile,
            currentHunkStart,
            functions,
            addFunctions,
            removeFunctions
        );
    }

    return {
        additions: Array.from(addFunctions),
        deletions: Array.from(removeFunctions)
    };
}

function processHunk(
    hunkLines: string[],
    filename: string,
    hunkStart: number,
    functions: FunctionRange[],
    addFunctions: Set<string>,
    removeFunctions: Set<string>
): void {
    let currentLine = hunkStart;
    let additionStartLine = 0;
    let deletionStartLine = 0;

    // First pass: collect continuous blocks of additions and deletions
    for (let i = 0; i < hunkLines.length; i++) {
        const line = hunkLines[i];

        if (line.startsWith('+')) {
            if (additionStartLine === 0) {
                additionStartLine = currentLine;
            }
            currentLine++;
        } else if (line.startsWith('-')) {
            if (deletionStartLine === 0) {
                deletionStartLine = currentLine;
            }
        } else {
            // Process any accumulated additions
            if (additionStartLine > 0) {
                const affectedFunctions = findFunctionsWithOverlappingChunks(
                    functions,
                    filename,
                    additionStartLine,
                    currentLine - 1
                );
                affectedFunctions.forEach(fn => addFunctions.add(fn));
                additionStartLine = 0;
            }

            // Process any accumulated deletions
            if (deletionStartLine > 0) {
                const affectedFunctions = findFunctionsWithOverlappingChunks(
                    functions,
                    filename,
                    deletionStartLine,
                    currentLine
                );
                affectedFunctions.forEach(fn => removeFunctions.add(fn));
                deletionStartLine = 0;
            }

            currentLine++;
        }
    }

    // Process any remaining additions or deletions at the end of the hunk
    if (additionStartLine > 0) {
        const affectedFunctions = findFunctionsWithOverlappingChunks(
            functions,
            filename,
            additionStartLine,
            currentLine - 1
        );
        affectedFunctions.forEach(fn => addFunctions.add(fn));
    }

    if (deletionStartLine > 0) {
        const affectedFunctions = findFunctionsWithOverlappingChunks(
            functions,
            filename,
            deletionStartLine,
            currentLine
        );
        affectedFunctions.forEach(fn => removeFunctions.add(fn));
    }
}

function printResults(additions: string[], deletions: string[], treeType: string): void {
    const hasAdditions = additions.length > 0;
    const hasDeletions = deletions.length > 0;

    console.log();
    if (hasAdditions) {
        console.log(`Functions with additions in ${treeType}:`);
        printFunctionList(additions, true);
    }

    if (hasAdditions && hasDeletions) {
        console.log();
    }

    if (hasDeletions) {
        console.log(`Functions with deletions in ${treeType}:`);
        printFunctionList(deletions, false);
    }

    if (!hasAdditions && !hasDeletions) {
        console.log(`No functions changed in ${treeType}`);
    }
}

function printFunctionList(functions: string[], isAddition: boolean): void {
    const verbColor = isAddition ? chalk.green : chalk.red;
    const pathColor = chalk.blue;
    const separatorColor = chalk.white.bold;

    functions.forEach(func => {
        const parts = func.split(' ');
        const name = parts[0];
        const path = parts.slice(1).join(' ');

        process.stdout.write('\t');

        if (!path) {
            console.log(verbColor(name));
        } else {
            process.stdout.write(verbColor(name) + ' ');
            if (path.includes('/')) {
                const pathParts = path.split('/');
                console.log(pathParts.map(part => pathColor(part)).join(separatorColor('/')));
            } else {
                console.log(pathColor(path));
            }
        }
    });
}

async function main() {
    try {

        const inputPath = validatePath(process.argv[2]);

        // Find git root
        const gitRoot = await findGitRoot(inputPath);
        const frameworkInfo = await detectProjectFramework(gitRoot);
        printPaths(gitRoot, frameworkInfo);

        // const startTime = Date.now();
        // Call the existing extractController function directly
        const controllers = extractController(frameworkInfo.mainPath);
        // console.log(
        //     chalk.yellow(
        //         `Route extraction completed in ${((Date.now() - startTime) / 1000).toFixed(1)}s`
        //     )
        // );
        const functions = returnFunctions(controllers, frameworkInfo.mainPath);

        // const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(2); // Calculate elapsed time in seconds
        // console.log(
        //     chalk.yellow(`Parsing completed in ${((Date.now() - startTime) / 1000).toFixed(1)}s`)
        // );

        // Analyze git changes
        const { additions, deletions } = await analyzeGitChanges(gitRoot, functions);

        // Print results
        printResults(additions, deletions, 'last commit');
    } catch (error) {
        if (error instanceof Error) {
            console.error(chalk.red(`Error: ${error.message}`));
        } else {
            console.error(chalk.red('An unknown error occurred'));
        }
        process.exit(1);
    }
}

// Start the application
main();

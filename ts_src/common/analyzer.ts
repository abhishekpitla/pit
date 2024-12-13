import chalk from 'chalk';
import {
    Node,
    CallExpression,
    FunctionDeclaration,
    ArrowFunction,
    MethodDeclaration,
    ts,
    SourceFile,
    FunctionLikeDeclaration,
    Project
} from 'ts-morph';
import { findTargetFunction, findTargetFunctionFromFileString } from './utils';
import { printResults } from '../cli/print';
import { FunctionRange, writeToNamedPipe } from '../../ts_src/helpers/pipe-pusher';

export type validFuncDeclarations = FunctionDeclaration | ArrowFunction | MethodDeclaration;

export function returnFunctions(
    params: {
        published_path: string;
        function_name: string;
        file: string;
        controller: string;
    }[],
    main: string
) {
    const callsArr: FunctionRange[] = [];

    const project = new Project();
    project.addSourceFileAtPath(main);
    project.resolveSourceFileDependencies();
    params.forEach(({ file, controller, published_path, function_name }) => {
        const declaration = findTargetFunctionFromFileString(project, file, function_name);
        const callInfoArray = analyzeFunction(declaration, controller);

        const functionRanges: FunctionRange[] = callInfoArray.map(callInfo => ({
            ControllerName: published_path ?? undefined,
            FunctionName: callInfo.name.replaceAll('\n', ''),
            Filename: callInfo.location.filePath,
            StartLine: callInfo.location.startLine,
            EndLine: callInfo.location.endLine
        }));

        callsArr.push(...functionRanges);
    });
    return callsArr;
}
// export function returnFunctions(
//     params: { published_path: string; declaration: validFuncDeclarations; controller: string }[]
// ) {
//     const callsArr: FunctionRange[] = [];
//     params.forEach(({ declaration, controller, published_path }) => {
//         const callInfoArray = analyzeFunction(declaration, controller);
//
//         const functionRanges: FunctionRange[] = callInfoArray.map(callInfo => ({
//             ControllerName: published_path ?? undefined,
//             FunctionName: callInfo.name.replaceAll('\n', ''),
//             Filename: callInfo.location.filePath,
//             StartLine: callInfo.location.startLine,
//             EndLine: callInfo.location.endLine
//         }));
//         callsArr.push(...functionRanges);
//     });
//     return callsArr;
// }
export function processControllerFunctions(
    params: { published_path: string; declaration: validFuncDeclarations; controller: string }[],
    pipeName?: string
) {
    params.forEach(({ declaration, controller, published_path }) => {
        writeToNamedPipe(analyzeFunction(declaration, controller), pipeName, published_path);
    });
}
export function processFunctions(files: SourceFile[], functionNames: string[]) {
    functionNames.forEach(functionName => {
        let i = 1;
        let targetFunction: validFuncDeclarations = undefined;
        files.forEach(file => {
            i++;
            const check = findTargetFunction(file, functionName);
            if (check) {
                console.log({
                    file: file.getFilePath()
                });
            }
            if (check) {
                const tempFilePath = file.getFilePath();
                if (tempFilePath.includes('controller')) {
                    targetFunction = check;
                } else {
                    console.log(tempFilePath, 'is not a not controller');
                }
            }
        });
        console.log(`${i} files visited`);

        if (!targetFunction) {
            console.error(chalk.red(`Function '${functionName}' not found`));
            process.exit(1);
        }

        console.log(chalk.blue(`\nAnalyzing function: ${chalk.bold(functionName)}\n`));

        const calls = analyzeFunction(targetFunction, functionName);
        printResults(calls);
    });
}
export interface CallInfo {
    published_path?: string;
    name: string;
    line: number;
    column: number;
    type?: string;
    call_flag: boolean;
    node?: Node;
    arguments: string[];
    controller: string;
    location: {
        filePath: string;
        startLine: number;
        endLine: number;
    };
}

function getNodeStartPosition(node: Node): number {
    if (Node.isMethodDeclaration(node)) {
        const decorators = (node as any).getDecorators();
        if (decorators && decorators.length > 0) {
            return decorators[0].getStart();
        }
        return node.getNameNode()?.getStart() ?? node.getStart();
    } else if (Node.isFunctionDeclaration(node)) {
        return node.getNameNode()?.getStart() ?? node.getStart();
    }
    return node.getStart();
}

function getNodeLocation(node: Node) {
    const sourceFile = node.getSourceFile();
    return {
        filePath: sourceFile.getFilePath(),
        startLine: sourceFile.getLineAndColumnAtPos(getNodeStartPosition(node)).line,
        endLine: node.getEndLineNumber()
    };
}

function extractDeclarationInfo(node: Node, controller: string): CallInfo | null {
    try {
        if (!Node.isFunctionDeclaration(node) && !Node.isMethodDeclaration(node)) {
            return null;
        }

        const sourceFile = node.getSourceFile();
        const { line, column } = sourceFile.getLineAndColumnAtPos(getNodeStartPosition(node));
        const typeChecker = node.getProject().getTypeChecker();

        return {
            name: node.getName() || 'anonymous',
            line,
            column,
            type: node.getType().getText(),
            call_flag: true,
            node,
            arguments: node.getParameters().map(param => param.getText()),
            controller,
            location: getNodeLocation(node)
        };
    } catch (error) {
        console.warn(`Warning: Could not analyze declaration: ${node.getText()}`, error);
        return null;
    }
}

function extractCallInfo(node: CallExpression, controller: string): CallInfo | null {
    try {
        const expression = node.getExpression();

        // Handle only direct function calls and method calls
        if (!Node.isIdentifier(expression) && !Node.isPropertyAccessExpression(expression)) {
            return null;
        }

        const typeChecker = node.getProject().getTypeChecker();
        const symbol = typeChecker.getSymbolAtLocation(expression);
        if (!symbol) return null;

        const declaration = symbol.getDeclarations()?.[0];
        if (!declaration) return null;

        const type = node.getType().getText();
        if (type.endsWith('Decorator')) {
            return null;
        }

        const sourceFile = node.getSourceFile();
        const { line, column } = sourceFile.getLineAndColumnAtPos(node.getStart());

        return {
            name: expression.getText(),
            line,
            column,
            type,
            call_flag: Node.isFunctionLikeDeclaration(declaration),
            node: Node.isFunctionLikeDeclaration(declaration) ? declaration : undefined,
            arguments: node.getArguments().map(arg => arg.getText()),
            controller,
            location: declaration ? getNodeLocation(declaration) : getNodeLocation(node)
        };
    } catch (error) {
        console.warn(`Warning: Could not analyze call expression: ${node.getText()}`, error);
        return null;
    }
}

export function analyzeFunction(
    node: Node<ts.FunctionLikeDeclaration>,
    controller: string,
    options: { includeDeclaration?: boolean; visited?: Set<string> } = {}
): CallInfo[] {
    const { includeDeclaration = true, visited = new Set<string>() } = options;
    const calls: CallInfo[] = [];

    // Prevent infinite recursion
    const nodeKey = `${node.getSourceFile().getFilePath()}:${node.getPos()}`;
    if (visited.has(nodeKey)) return calls;
    visited.add(nodeKey);

    // Add function declaration info
    if (includeDeclaration) {
        const declarationInfo = extractDeclarationInfo(node, controller);
        if (declarationInfo) {
            calls.push(declarationInfo);
        }
    }

    // Analyze all call expressions within the function
    node.forEachDescendant(descendant => {
        if (Node.isCallExpression(descendant)) {
            const callInfo = extractCallInfo(descendant, controller);
            if (callInfo) {
                calls.push(callInfo);

                // Recursively analyze the called function if it's available
                if (
                    callInfo.call_flag &&
                    callInfo.node &&
                    Node.isFunctionLikeDeclaration(callInfo.node)
                ) {
                    const nestedCalls = analyzeFunction(callInfo.node, controller, {
                        includeDeclaration: false,
                        visited
                    });
                    calls.push(...nestedCalls);
                }
            }
        }
    });

    return calls;
}

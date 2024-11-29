// src/analyzer.ts
import chalk from 'chalk';
import {
    Node,
    SyntaxKind,
    CallExpression,
    FunctionDeclaration,
    ArrowFunction,
    MethodDeclaration,
    FunctionLikeDeclaration,
    ts
} from 'ts-morph';
import { printObject } from './print-helpers';

export type validFuncDeclarations = FunctionDeclaration | ArrowFunction | MethodDeclaration;
interface CallLocation {
    filePath: string;
    startLine: number;
    endLine: number;
}

export interface CallInfo {
    location: CallLocation;
    call_flag: Boolean;
    name: string;
    line: number;
    column: number;
    type?: string;
    arguments: string[];
    node?: Node<ts.FunctionLikeDeclaration>;
}

function extractCallInfo(node: CallExpression): CallInfo | null {
    const symbol = node.getExpression().getSymbol();
    const declarations = symbol?.getDeclarations();
    const declaration = declarations?.[0];
    try {
        const expression = node.getExpression();
        const name = expression.getText();

        // Skip if it's a complex call expression
        if (name.includes('(') || name.includes('{')) {
            return null;
        }

        const pos = node.getStart();
        const sourceFile = node.getSourceFile();
        const { line, column } = sourceFile.getLineAndColumnAtPos(pos);

        // Get type information
        const typeChecker = node.getProject().getTypeChecker();
        const signature = typeChecker.getTypeAtLocation(node);
        const type = signature ? signature.getText() : undefined;
        if (type?.slice(-9) === 'Decorator') {
            return null;
        }

        // Get argument information
        const callArguments = node.getArguments().map(arg => arg.getText());

        const symbol = node.getExpression().getSymbol();
        const declarations = symbol?.getDeclarations();
        const declaration = declarations?.[0];
        const definitionType = declaration.getKindName();
        let call_flag = false;
        // console.log({ text: node.getText(), type, definition_type: node.getKindName(), call_flag ,bind:Node.isObjectBindingPattern(node),definitionType});
        let startLine = 0;
        let endLine = 0;
        // Get location of declaration

        let body: any={}
        try {
            body = (declaration as any).getBody();
            if (declaration && body) {
                if (body) {
                    const startPos = body.getStart();
                    const endPos = body.getEnd();
                    const sourceFile = declaration.getSourceFile();
                    const startObj = sourceFile.getLineAndColumnAtPos(startPos);
                    const endObj = sourceFile.getLineAndColumnAtPos(endPos);
                    startLine = startObj.line;
                    endLine = endObj.line;
                }
            }
        } catch (e) {return}

        if (Node.isFunctionLikeDeclaration(declaration)) {
            call_flag = true;
            return {
                name,
                line,
                column,
                type,
                call_flag,
                node: declaration,
                arguments: callArguments,
                location: {
                    filePath: sourceFile.getFilePath(),
                    startLine,
                    endLine
                }
            };
        } else {
            return {
                name,
                line,
                column,
                type,
                call_flag: false,
                arguments: callArguments,
                location: {
                    filePath: sourceFile.getFilePath(),
                    startLine,
                    endLine
                }
            };
        }
    } catch (error) {
        console.warn(`Warning: Could not analyze call expression: ${node.getText()}`);
        console.warn(error)
        return null;
    }
}

export function analyzeFunction(functionNode: Node<ts.FunctionLikeDeclaration>): CallInfo[] {
    const calls: CallInfo[] = [];
    functionNode.forEachDescendant(node => {
        if (Node.isCallExpression(node)) {
            const callInfo = extractCallInfo(node);
            if (callInfo) {
                calls.push(callInfo);
                if (callInfo.call_flag === true && callInfo?.node) {
                    analyzeFunction(callInfo.node).forEach(item => calls.push(item));
                }
            }
        }
    });

    return calls;
}

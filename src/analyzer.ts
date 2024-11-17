// src/analyzer.ts
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
    node: Node<ts.FunctionLikeDeclaration>;
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
        // console.log({ text: node.getText(), type, definition_type: node.getKindName() });
        if (type.slice(-9) === 'Decorator') {
            return;
        }

        // Get argument information
        const callArguments = node.getArguments().map(arg => arg.getText());

        const symbol = node.getExpression().getSymbol();
        const declarations = symbol?.getDeclarations();
        const declaration = declarations?.[0];
        const definitionType = declaration.getKindName();
        let call_flag = false;
        if (definitionType.slice(-11) === 'Declaration') {
            call_flag = true;
        }
        let startLine = 0;
        let endLine = 0;
        // Get location of declaration
        if (declaration) {
            const startPos = declaration.getStart();
            const endPos = declaration.getEnd();
            const sourceFile = declaration.getSourceFile();
            const startObj = sourceFile.getLineAndColumnAtPos(startPos);
            const endObj = sourceFile.getLineAndColumnAtPos(endPos);
            startLine = startObj.line;
            endLine = endObj.line;
        }

        if (Node.isFunctionLikeDeclaration(declaration)) {
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
        }
    } catch (error) {
        console.warn(`Warning: Could not analyze call expression: ${node.getText()}`);
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
                if (callInfo.call_flag === true) {
                    analyzeFunction(callInfo.node).forEach(item => calls.push(item));
                }
            }
        }
    });

    return calls;
}

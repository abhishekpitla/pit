import { SourceFile, Node, SyntaxKind, FunctionDeclaration, ArrowFunction, MethodDeclaration } from "ts-morph";
import { validFuncDeclarations } from "./analyzer";

export function findTargetFunction(
    sourceFile: SourceFile,
    functionName: string
): validFuncDeclarations | undefined {
    // Look for function declaration
    let targetFunction = sourceFile.getFunction(functionName);
    if (targetFunction) {
        return targetFunction;
    }

    // Look for variable declaration with arrow function
    const variableDeclaration = sourceFile.getVariableDeclaration(functionName);
    if (variableDeclaration) {
        const initializer = variableDeclaration.getInitializer();
        if (Node.isArrowFunction(initializer)) {
            return initializer;
        }
    }

    // Look for method in classes
    const classes = sourceFile.getClasses();
    for (const classDeclaration of classes) {
        const method = classDeclaration.getMethod(functionName);
        if (method) {
            return method;
        }
    }

    // Look in exported declarations
    const exportedDeclarations = sourceFile.getExportedDeclarations();
    for (const [name, declarations] of exportedDeclarations) {
        if (name === functionName) {
            const declaration = declarations[0];
            if (Node.isFunctionDeclaration(declaration) ||
                Node.isArrowFunction(declaration) ||
                Node.isMethodDeclaration(declaration)) {
                return declaration;
            }
        }
    }

    return undefined;
}

import { SourceFile, Node, Project } from 'ts-morph';
import { validFuncDeclarations } from './analyzer';

export function findTargetFunctionFromFileString(
    project: Project,
    sourceFile: string,
    functionName: string
): validFuncDeclarations | undefined {
    return findTargetFunction(project.addSourceFileAtPath(sourceFile), functionName);
}
export function findTargetFunction(
    sourceFile: SourceFile,
    functionName: string
): validFuncDeclarations | undefined {
    // Look for function declaration
    let targetFunction = sourceFile.getFunction(functionName);
    if (targetFunction) {
        // console.log('Returning Function');
        return targetFunction;
    }

    // Look for variable declaration with arrow function
    const variableDeclaration = sourceFile.getVariableDeclaration(functionName);
    if (variableDeclaration) {
        const initializer = variableDeclaration.getInitializer();
        if (Node.isArrowFunction(initializer)) {
            // console.log('Returning Arrow Function');
            return initializer;
        }
    }

    // Look for method in classes
    const classes = sourceFile.getClasses();
    for (const classDeclaration of classes) {
        const method = classDeclaration.getMethod(functionName);
        if (method) {
            // console.log('Returning Method');
            return method;
        }
    }

    // Look in exported declarations
    const exportedDeclarations = sourceFile.getExportedDeclarations();
    for (const [name, declarations] of exportedDeclarations) {
        if (name === functionName) {
            const declaration = declarations[0];
            if (
                Node.isFunctionDeclaration(declaration) ||
                Node.isArrowFunction(declaration) ||
                Node.isMethodDeclaration(declaration)
            ) {
                return declaration;
            }
        }
    }

    return undefined;
}
